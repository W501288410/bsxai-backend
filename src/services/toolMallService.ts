import { dbPool, redis, PAGINATION } from '../config'
import { PaymentService } from './paymentService'
import { CodeError } from '../utils/errors'
import { logger } from '../utils/logger'

export class ToolMallService {
  /**
   * 获取 AI 工具列表
   */
  static async getTools(params: {
    page?: number; pageSize?: number; category?: string; keyword?: string; sortBy?: string
  }) {
    const { page = PAGINATION.defaultPage, pageSize = PAGINATION.defaultPageSize, category, keyword, sortBy } = params
    const offset = (page - 1) * pageSize

    let where = 'WHERE status = 1 AND deleted_at IS NULL'
    const values: any[] = []
    if (category) { where += ' AND category = ?'; values.push(category) }
    if (keyword) { where += ' AND (name LIKE ? OR description LIKE ?)'; values.push(`%${keyword}%`, `%${keyword}%`) }

    let orderBy = 'ORDER BY created_at DESC'
    if (sortBy === 'rating') orderBy = 'ORDER BY rating DESC'
    if (sortBy === 'users') orderBy = 'ORDER BY total_users DESC'

    const [rows]: any = await dbPool.execute(
      `SELECT id, tool_no, name, description, category, icon, pricing_model, price, subscription_price,
              total_users, rating, rating_count, status
       FROM ai_tools ${where} ${orderBy} LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    )
    const [countResult]: any = await dbPool.execute(`SELECT COUNT(*) as total FROM ai_tools ${where}`, values)
    return { list: rows, total: countResult[0].total, page, pageSize }
  }

  /**
   * 获取工具详情
   */
  static async getToolDetail(toolId: number) {
    const [rows]: any = await dbPool.execute(
      `SELECT t.*, u.nickname as developer_name FROM ai_tools t
       LEFT JOIN users u ON t.developer_id = u.id
       WHERE t.id = ? AND t.deleted_at IS NULL`, [toolId]
    )
    if (rows.length === 0) throw new CodeError('工具不存在', 404)
    return rows[0]
  }

  /**
   * 开发者上架工具
   */
  static async createTool(developerId: number, data: {
    name: string; description?: string; category?: string;
    icon?: string; screenshots?: string[]; webUrl?: string; apiEndpoint?: string;
    pricingModel: number; price?: number; subscriptionPrice?: number
  }) {
    // 检查开发者身份
    const [userRows]: any = await dbPool.execute('SELECT user_type FROM users WHERE id = ?', [developerId])
    if (!userRows.length || userRows[0].user_type < 2) throw new CodeError('需要先升级为开发者', 403)

    const toolNo = `TOOL${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const [result]: any = await dbPool.execute(
      `INSERT INTO ai_tools (tool_no, developer_id, name, description, category, icon, screenshots,
        web_url, api_endpoint, pricing_model, price, subscription_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3)`,
      [toolNo, developerId, data.name, data.description, data.category, data.icon,
       data.screenshots ? JSON.stringify(data.screenshots) : null,
       data.webUrl, data.apiEndpoint, data.pricingModel, data.price, data.subscriptionPrice]
    )
    logger.info('AI工具上架申请提交', { toolId: result.insertId, name: data.name })
    return { id: result.insertId, toolNo, status: 3 }
  }

  /**
   * 订阅/购买工具
   */
  static async subscribe(userId: number, toolId: number, type: number = 2) {
    const tool = await this.getToolDetail(toolId)
    if (tool.status !== 1) throw new CodeError('工具已下架', 400)

    let amount: number
    let startAt = new Date()
    let expireAt: Date | null = null

    switch (type) {
      case 1: // 免费试用
        amount = 0
        expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天试用
        break
      case 2: // 单次购买
        amount = tool.price || 0
        expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天有效
        break
      case 3: // 月订阅
        amount = tool.subscription_price || 0
        expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        break
      default:
        throw new CodeError('无效的订阅类型', 400)
    }

    if (amount > 0) {
      await PaymentService.deduct(userId, amount, toolId, 'tool_subscription', `订阅工具: ${tool.name}`)
    }

    const [result]: any = await dbPool.execute(
      `INSERT INTO tool_subscriptions (user_id, tool_id, type, amount, start_at, expire_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, toolId, type, amount, startAt, expireAt]
    )

    // 更新工具统计 + 开发者佣金
    await dbPool.execute('UPDATE ai_tools SET total_users = total_users + 1 WHERE id = ?', [toolId])
    if (amount > 0) {
      const commission = +(amount * tool.platform_commission).toFixed(2)
      const devAmount = +(amount - commission).toFixed(2)
      await PaymentService.addCommission(tool.developer_id, devAmount, result.insertId, `工具订阅佣金: ${tool.name}`)
      await dbPool.execute('UPDATE ai_tools SET total_revenue = total_revenue + ? WHERE id = ?', [amount, toolId])
    }

    logger.info('工具订阅成功', { userId, toolId, type, amount })
    return { subscriptionId: result.insertId, amount, expireAt }
  }

  /**
   * 获取我的订阅列表
   */
  static async getSubscriptions(userId: number, page: number = 1, pageSize: number = 20) {
    const offset = (page - 1) * pageSize
    const [rows]: any = await dbPool.execute(
      `SELECT s.*, t.name as tool_name, t.icon, t.pricing_model
       FROM tool_subscriptions s
       LEFT JOIN ai_tools t ON s.tool_id = t.id
       WHERE s.user_id = ? AND s.status = 1 ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    )
    const [countResult]: any = await dbPool.execute(
      'SELECT COUNT(*) as total FROM tool_subscriptions WHERE user_id = ? AND status = 1', [userId]
    )
    return { list: rows, total: countResult[0].total, page, pageSize }
  }

  /**
   * 评价工具
   */
  static async createReview(userId: number, toolId: number, rating: number, comment: string) {
    if (rating < 1 || rating > 5) throw new CodeError('评分必须在1-5之间', 400)

    // 检查是否有订阅
    const [subRows]: any = await dbPool.execute(
      'SELECT id FROM tool_subscriptions WHERE user_id = ? AND tool_id = ? AND status = 1', [userId, toolId]
    )
    if (subRows.length === 0) throw new CodeError('请先订阅该工具再评价', 400)

    // 记录评价（简化版，实际应有 review 表）
    const avgResult: any = await dbPool.execute(
      'SELECT AVG(?) as avg_rating, COUNT(*) + 1 as count FROM ai_tools WHERE id = ?', [rating, toolId]
    )
    // 实际应存入 review 表，这里简化更新工具评分
    const [toolRows]: any = await dbPool.execute('SELECT rating, rating_count FROM ai_tools WHERE id = ?', [toolId])
    const oldRating = toolRows[0].rating
    const oldCount = toolRows[0].rating_count
    const newRating = +((oldRating * oldCount + rating) / (oldCount + 1)).toFixed(1)
    await dbPool.execute(
      'UPDATE ai_tools SET rating = ?, rating_count = rating_count + 1 WHERE id = ?', [newRating, toolId]
    )

    logger.info('工具评价成功', { userId, toolId, rating })
    return { success: true, newRating }
  }

  /**
   * 获取我的工具（开发者视角）
   */
  static async getMyTools(developerId: number) {
    const [rows]: any = await dbPool.execute(
      `SELECT * FROM ai_tools WHERE developer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [developerId]
    )
    return rows
  }
}