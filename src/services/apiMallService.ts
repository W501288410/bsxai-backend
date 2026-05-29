import { dbPool, redis, PAGINATION } from '../config'
import { PaymentService } from './paymentService'
import { CodeError } from '../utils/errors'
import { logger } from '../utils/logger'
import { getProvider } from '../lib/providers'

export class ApiMallService {
  /**
   * 获取 API 商品列表（支持分页、分类筛选、搜索）
   */
  static async getProducts(params: {
    page?: number; pageSize?: number; category?: string; keyword?: string; status?: number
  }) {
    const { page = PAGINATION.defaultPage, pageSize = PAGINATION.defaultPageSize, category, keyword, status = 1 } = params
    const offset = (page - 1) * pageSize

    let where = 'WHERE status = ? AND deleted_at IS NULL'
    const values: any[] = [status]
    if (category) { where += ' AND category = ?'; values.push(category) }
    if (keyword) { where += ' AND (name LIKE ? OR description LIKE ?)'; values.push(`%${keyword}%`, `%${keyword}%`) }

    const [rows]: any = await dbPool.execute(
      `SELECT id, product_no, name, description, category, api_method, pricing_model, price, monthly_price, rate_limit, total_calls, rating
       FROM api_products ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    )
    const [countResult]: any = await dbPool.execute(
      `SELECT COUNT(*) as total FROM api_products ${where}`, values
    )
    return { list: rows, total: countResult[0].total, page, pageSize }
  }

  /**
   * 获取商品详情
   */
  static async getProductDetail(productId: number) {
    const [rows]: any = await dbPool.execute(
      `SELECT * FROM api_products WHERE id = ? AND deleted_at IS NULL`, [productId]
    )
    if (rows.length === 0) throw new CodeError('商品不存在', 404)
    return rows[0]
  }

  /**
   * 创建 API 商品（管理员）
   */
  static async createProduct(data: {
    name: string; description?: string; category?: string; apiEndpoint: string;
    apiMethod?: string; pricingModel: number; price: number; monthlyPrice?: number; rateLimit?: number; channelId?: number
  }) {
    const productNo = `API${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const [result]: any = await dbPool.execute(
      `INSERT INTO api_products (product_no, name, description, category, api_endpoint, api_method, pricing_model, price, monthly_price, rate_limit, channel_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productNo, data.name, data.description, data.category, data.apiEndpoint,
       data.apiMethod || 'POST', data.pricingModel, data.price, data.monthlyPrice, data.rateLimit || 100, data.channelId || null]
    )
    logger.info('API商品创建成功', { productNo, name: data.name })
    return { id: result.insertId, productNo }
  }

  /**
   * 购买 API（核心流程：验余额 → 扣款 → 创建订单 → 记录）
   */
  static async purchaseApi(userId: number, productId: number, pricingModel: number, quantity?: number) {
    // 1. 检查商品
    const product = await this.getProductDetail(productId)
    if (product.status !== 1) throw new CodeError('商品已下架', 400)

    // 2. 计算金额
    let amount: number
    let callsPurchased: number | null = null
    let trafficPurchased: number | null = null
    let expireAt: string | null = null

    switch (pricingModel) {
      case 1: // 按次
        callsPurchased = quantity || 1000
        amount = +(product.price * callsPurchased).toFixed(2)
        break
      case 2: // 按流量
        trafficPurchased = quantity || 104857600 // 100MB
        amount = +(product.price * (trafficPurchased / 1048576)).toFixed(2)
        break
      case 3: // 包月
        amount = product.monthly_price
        expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
        break
      default:
        throw new CodeError('无效的计费模式', 400)
    }

    if (amount <= 0) throw new CodeError('金额无效', 400)

    // 3. 扣款
    const orderNo = `APO${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    await PaymentService.deduct(userId, amount, 0, 'api_order', `购买API: ${product.name}`)

    // 4. 创建订单（需要在扣款成功后，用同一事务保证一致性）
    const [result]: any = await dbPool.execute(
      `INSERT INTO api_orders (order_no, user_id, product_id, pricing_model, amount, calls_purchased, traffic_purchased, expire_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNo, userId, productId, pricingModel, amount, callsPurchased, trafficPurchased, expireAt]
    )

    // 5. 更新商品统计
    await dbPool.execute(
      `UPDATE api_products SET total_calls = total_calls + ?, total_revenue = total_revenue + ? WHERE id = ?`,
      [callsPurchased || 0, amount, productId]
    )

    logger.info('API购买成功', { userId, productId, orderNo, amount })
    return { orderNo, amount, callsPurchased, trafficPurchased, expireAt }
  }

  /**
   * 调用 API（核心：验证订单 + 限流 + 记录日志）
   */
  static async callApi(userId: number, productId: number, requestBody?: any) {
    // 1. 检查用户是否有有效订单
    const [orders]: any = await dbPool.execute(
      `SELECT * FROM api_orders WHERE user_id = ? AND product_id = ? AND status = 1
       ORDER BY created_at DESC LIMIT 1`, [userId, productId]
    )
    if (orders.length === 0) throw new CodeError('无有效订单，请先购买', 400)

    const order = orders[0]

    // 2. 检查使用配额
    if (order.pricing_model === 1 && order.calls_purchased) {
      if (order.calls_used >= order.calls_purchased) throw new CodeError('调用次数已用完', 400)
    }
    if (order.pricing_model === 2 && order.traffic_purchased) {
      if (order.traffic_used >= order.traffic_purchased) throw new CodeError('流量已用完', 400)
    }
    if (order.pricing_model === 3 && order.expire_at) {
      if (new Date(order.expire_at) < new Date()) {
        await dbPool.execute('UPDATE api_orders SET status = 2 WHERE id = ?', [order.id])
        throw new CodeError('订单已过期', 400)
      }
    }

    // 3. Redis 限流
    const rateLimitKey = `rate_limit:${userId}:${productId}`
    const currentCalls = await redis.incr(rateLimitKey)
    if (currentCalls === 1) await redis.expire(rateLimitKey, 60) // 1分钟窗口
    const product = await this.getProductDetail(productId)
    if (currentCalls > product.rate_limit) {
      throw new CodeError(`超过限流，每分钟最多${product.rate_limit}次`, 429)
    }

    // 4. 更新使用量
    if (order.pricing_model === 1) {
      await dbPool.execute('UPDATE api_orders SET calls_used = calls_used + 1 WHERE id = ?', [order.id])
    } else if (order.pricing_model === 2) {
      const trafficDelta = requestBody ? JSON.stringify(requestBody).length : 1024
      await dbPool.execute('UPDATE api_orders SET traffic_used = traffic_used + ? WHERE id = ?', [trafficDelta, order.id])
    }

    // 5. 更新商品统计
    await dbPool.execute('UPDATE api_products SET total_calls = total_calls + 1 WHERE id = ?', [productId])

    // 6. 实际调用上游 Provider
    const requestId = `REQ${Date.now()}${Math.random().toString(36).slice(2, 8)}`
    let responseBody: any = null
    let responseStatus = 200
    let providerKey = ''

    try {
      // 根据 product 的渠道配置获取 Provider
      const channelId = (product as any).channel_id
      if (channelId) {
        const [channels]: any = await dbPool.execute(
          'SELECT * FROM provider_channels WHERE id = ? AND status = 1', [channelId]
        )
        if (channels.length > 0) {
          providerKey = channels[0].provider_key
          const provider = getProvider(providerKey)
          if (provider) {
            const chatResp = await provider.chat({
              model: channels[0].model_name || provider.defaultModel,
              messages: requestBody?.messages || [{ role: 'user', content: typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody) }],
              maxTokens: requestBody?.max_tokens,
              temperature: requestBody?.temperature,
            })
            responseBody = {
              content: chatResp.content,
              model: chatResp.model,
              usage: chatResp.usage,
              finish_reason: chatResp.finishReason,
            }
          }
        }
      }
    } catch (err: any) {
      responseStatus = 502
      responseBody = { error: err.message }
      logger.error('上游 Provider 调用失败', { productId, providerKey, error: err.message })
    }

    // 7. 记录调用日志
    await dbPool.execute(
      `INSERT INTO api_call_logs (user_id, product_id, order_id, request_id, request_method, request_url, request_body, response_status, response_body, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, productId, order.id, requestId, product.api_method, product.api_endpoint || '',
       requestBody ? JSON.stringify(requestBody).slice(0, 2000) : null,
       responseStatus, responseBody ? JSON.stringify(responseBody).slice(0, 4000) : null,
       '127.0.0.1']
    )

    logger.info('API调用完成', { userId, productId, requestId, status: responseStatus })
    return {
      requestId,
      response: responseBody,
      endpoint: product.api_endpoint,
    }
  }

  /**
   * 获取用户订单列表
   */
  static async getOrders(userId: number, page: number = 1, pageSize: number = 20) {
    const offset = (page - 1) * pageSize
    const [rows]: any = await dbPool.execute(
      `SELECT o.*, p.name as product_name FROM api_orders o
       LEFT JOIN api_products p ON o.product_id = p.id
       WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    )
    const [countResult]: any = await dbPool.execute(
      'SELECT COUNT(*) as total FROM api_orders WHERE user_id = ?', [userId]
    )
    return { list: rows, total: countResult[0].total, page, pageSize }
  }

  /**
   * 敏感词检测
   */
  static async checkSensitiveWords(content: string): Promise<{ hasSensitive: boolean; words: string[] }> {
    const [rows]: any = await dbPool.execute(
      'SELECT word, level FROM sensitive_words WHERE level = 2'
    )
    const found: string[] = []
    for (const row of rows) {
      if (content.includes(row.word)) found.push(row.word)
    }
    return { hasSensitive: found.length > 0, words: found }
  }
}