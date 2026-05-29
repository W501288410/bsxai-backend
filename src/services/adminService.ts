import { dbPool, redis, PAGINATION } from '../config'
import { CodeError } from '../utils/errors'
import { logger } from '../utils/logger'

export class AdminService {
  /* ========== 数据看板 ========== */
  static async getDashboard() {
    const queries = {
      totalUsers: `SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL`,
      todayNewUsers: `SELECT COUNT(*) as c FROM users WHERE created_at >= CURDATE()`,
      totalRevenue: `SELECT COALESCE(SUM(total_recharge),0) as c FROM accounts`,
      todayRevenue: `SELECT COALESCE(SUM(amount),0) as c FROM recharge_orders WHERE status=2 AND paid_at>=CURDATE()`,
      totalOrders: `SELECT COUNT(*) as c FROM api_orders`,
      todayOrders: `SELECT COUNT(*) as c FROM api_orders WHERE created_at >= CURDATE()`,
      totalApiCalls: `SELECT COALESCE(SUM(total_calls),0) as c FROM api_products`,
      activeUsers: `SELECT COUNT(DISTINCT user_id) as c FROM api_call_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      pendingRequirements: `SELECT COUNT(*) as c FROM custom_requirements WHERE status=1`,
      pendingTools: `SELECT COUNT(*) as c FROM ai_tools WHERE status=3`,
      todayCalls: `SELECT COUNT(*) as c FROM api_call_logs WHERE created_at >= CURDATE()`
    }
    const result: Record<string, number> = {}
    for (const [key, sql] of Object.entries(queries)) {
      const [rows]: any = await dbPool.execute(sql)
      result[key] = rows[0]?.c || 0
    }
    return result
  }

  /* ========== 用户管理 ========== */
  static async getUsers(params: { page?: number; pageSize?: number; keyword?: string; status?: number }) {
    const { page = 1, pageSize = 20, keyword, status } = params
    const offset = (page - 1) * pageSize
    let where = 'WHERE deleted_at IS NULL'
    const values: any[] = []
    if (status !== undefined) { where += ' AND status = ?'; values.push(status) }
    if (keyword) { where += ' AND (phone LIKE ? OR nickname LIKE ?)'; values.push(`%${keyword}%`, `%${keyword}%`) }
    const [rows]: any = await dbPool.execute(
      `SELECT id,phone,nickname,user_type,is_verified,status,created_at FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute(`SELECT COUNT(*) as total FROM users ${where}`, values)
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  static async updateUserStatus(userId: number, status: number) {
    await dbPool.execute('UPDATE users SET status = ? WHERE id = ?', [status, userId])
    logger.info('用户状态更新', { userId, status })
  }

  /* ========== API 商品管理 ========== */
  static async getProducts(params: { page?: number; pageSize?: number; status?: number }) {
    const { page = 1, pageSize = 20, status } = params
    const offset = (page - 1) * pageSize
    let where = 'WHERE deleted_at IS NULL'
    const values: any[] = []
    if (status !== undefined) { where += ' AND status = ?'; values.push(status) }
    const [rows]: any = await dbPool.execute(
      `SELECT * FROM api_products ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...values, pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute(`SELECT COUNT(*) as total FROM api_products ${where}`, values)
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  static async createProduct(data: any) {
    const productNo = `API${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const [result]: any = await dbPool.execute(
      `INSERT INTO api_products (product_no,name,description,category,api_endpoint,api_method,pricing_model,price,monthly_price,rate_limit,channel_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [productNo, data.name, data.description, data.category, data.apiEndpoint, data.apiMethod || 'POST',
       data.pricingModel, data.price, data.monthlyPrice, data.rateLimit || 100, data.channelId || null]
    )
    logger.info('API商品创建', { id: result.insertId, name: data.name })
    return { id: result.insertId, productNo }
  }

  static async updateProduct(id: number, data: any) {
    const fields = Object.entries(data).filter(([k]) => k !== 'id').map(([k]) => `${k}=?`).join(',')
    if (!fields) return
    await (dbPool.execute as any)(`UPDATE api_products SET ${fields} WHERE id=?`, [...Object.values(data).filter((_, i, arr) => i < arr.length - 1), id])
  }

  static async updateProductStatus(id: number, status: number) {
    await dbPool.execute('UPDATE api_products SET status=? WHERE id=?', [status, id])
  }

  /* ========== AI 工具审核 ========== */
  static async getTools(params: { page?: number; pageSize?: number; status?: number }) {
    const { page = 1, pageSize = 20, status } = params
    const offset = (page - 1) * pageSize
    let where = 'WHERE t.deleted_at IS NULL'
    const values: any[] = []
    if (status !== undefined) { where += ' AND t.status = ?'; values.push(status) }
    const [rows]: any = await dbPool.execute(
      `SELECT t.*, u.nickname as developer_name FROM ai_tools t LEFT JOIN users u ON t.developer_id=u.id ${where} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute(`SELECT COUNT(*) as total FROM ai_tools t ${where}`, values)
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  static async approveTool(id: number) {
    await dbPool.execute('UPDATE ai_tools SET status=1 WHERE id=?', [id])
    logger.info('AI工具审核通过', { toolId: id })
  }

  static async rejectTool(id: number) {
    await dbPool.execute('UPDATE ai_tools SET status=2 WHERE id=?', [id])
    logger.info('AI工具审核拒绝', { toolId: id })
  }

  /* ========== 需求审核/风控 ========== */
  static async getRequirements(params: { page?: number; pageSize?: number; status?: number }) {
    const { page = 1, pageSize = 20, status } = params
    const offset = (page - 1) * pageSize
    let where = 'WHERE r.deleted_at IS NULL'
    const values: any[] = []
    if (status !== undefined) { where += ' AND r.status = ?'; values.push(status) }
    const [rows]: any = await dbPool.execute(
      `SELECT r.*, u.nickname as publisher_name FROM custom_requirements r LEFT JOIN users u ON r.user_id=u.id ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute(`SELECT COUNT(*) as total FROM custom_requirements r ${where}`, values)
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  static async cancelRequirement(id: number, reason: string) {
    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows]: any = await conn.execute('SELECT user_id,budget FROM custom_requirements WHERE id=?', [id])
      if (rows.length === 0) throw new CodeError('需求不存在', 404)
      // 解冻资金
      await conn.execute('UPDATE accounts SET balance=balance+?, frozen_balance=frozen_balance-? WHERE user_id=?',
        [rows[0].budget, rows[0].budget, rows[0].user_id])
      await conn.execute('UPDATE custom_requirements SET status=3, admin_remark=? WHERE id=?', [reason, id])
      await conn.commit()
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  }

  /* ========== 操作日志 ========== */
  static async getOperationLogs(params: { page?: number; pageSize?: number; adminId?: number }) {
    const { page = 1, pageSize = 30 } = params
    const offset = (page - 1) * pageSize
    const [rows]: any = await dbPool.execute(
      `SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`, [pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute('SELECT COUNT(*) as total FROM operation_logs')
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  static async logOperation(adminId: number, action: string, target: string, detail?: string) {
    await dbPool.execute(
      'INSERT INTO operation_logs (admin_id, action, target, detail) VALUES (?,?,?,?)',
      [adminId, action, target, detail]
    )
  }

  /* ========== 收入统计（趋势图用） ========== */
  static async getRevenueTrend(days: number = 30) {
    const [rows]: any = await dbPool.execute(
      `SELECT DATE(paid_at) as date, SUM(amount) as total
       FROM recharge_orders WHERE status=2 AND paid_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(paid_at) ORDER BY date`, [days]
    )
    return rows
  }

  static async getOrderTrend(days: number = 30) {
    const [rows]: any = await dbPool.execute(
      `SELECT DATE(created_at) as date, COUNT(*) as total
       FROM api_orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at) ORDER BY date`, [days]
    )
    return rows
  }

  /* ========== Phase 4: 提现审核 ========== */
  static async getWithdrawals(params: { page?: number; pageSize?: number; status?: number }) {
    const { page = 1, pageSize = 20, status } = params
    const offset = (page - 1) * pageSize
    let where = 'WHERE 1=1'
    const values: any[] = []
    if (status !== undefined) { where += ' AND w.status = ?'; values.push(status) }
    const [rows]: any = await dbPool.execute(
      `SELECT w.*, u.phone, u.nickname FROM withdrawal_requests w LEFT JOIN users u ON w.user_id=u.id ${where} ORDER BY w.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute(`SELECT COUNT(*) as total FROM withdrawal_requests w ${where}`, values)
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  static async approveWithdrawal(id: number, adminId: number) {
    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows]: any = await conn.execute('SELECT * FROM withdrawal_requests WHERE id=? AND status=1', [id])
      if (rows.length === 0) throw new CodeError('提现申请不存在或已处理', 404)
      const req = rows[0]
      await conn.execute('UPDATE accounts SET withdrawable_balance=withdrawable_balance-? WHERE user_id=?', [req.amount, req.user_id])
      await conn.execute('UPDATE withdrawal_requests SET status=2, approved_by=?, approved_at=NOW() WHERE id=?', [adminId, id])
      await conn.execute(`INSERT INTO transaction_logs (user_id, type, amount, balance_after, description) VALUES (?, 'withdraw', ?, 0, ?)`,
        [req.user_id, -req.amount, '提现审核通过'])
      await conn.commit()
      logger.info('提现审核通过', { id, adminId, userId: req.user_id, amount: req.amount })
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  }

  static async rejectWithdrawal(id: number, reason: string, adminId: number) {
    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows]: any = await conn.execute('SELECT * FROM withdrawal_requests WHERE id=? AND status=1', [id])
      if (rows.length === 0) throw new CodeError('提现申请不存在或已处理', 404)
      const req = rows[0]
      await conn.execute('UPDATE accounts SET frozen_balance=frozen_balance-?, balance=balance+? WHERE user_id=?', [req.amount, req.amount, req.user_id])
      await conn.execute('UPDATE withdrawal_requests SET status=3, reject_reason=?, approved_by=? WHERE id=?', [reason, adminId, id])
      await conn.commit()
      logger.info('提现审核拒绝', { id, adminId, reason })
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  }

  /* ========== Phase 4: 佣金结算管理 ========== */
  static async getSettlementList(params: { page?: number; pageSize?: number }) {
    const { page = 1, pageSize = 20 } = params
    const offset = (page - 1) * pageSize
    const [rows]: any = await dbPool.execute(
      `SELECT u.id, u.phone, u.nickname,
        COALESCE(a.withdrawable_balance, 0) as commission_balance,
        COALESCE(a.total_commission, 0) as total_commission,
        (SELECT COUNT(*) FROM withdrawal_requests wr WHERE wr.user_id=u.id AND wr.status=1) as pending_withdrawals
       FROM users u LEFT JOIN accounts a ON u.id=a.user_id
       WHERE COALESCE(a.total_commission, 0) > 0
       ORDER BY a.total_commission DESC LIMIT ? OFFSET ?`, [pageSize, offset]
    )
    return { list: rows, page, pageSize }
  }

  static async processBatchCommission(developerId: number, amount: number) {
    await dbPool.execute('UPDATE accounts SET withdrawable_balance=withdrawable_balance+?, total_commission=total_commission+? WHERE user_id=?', [amount, amount, developerId])
    await dbPool.execute(`INSERT INTO transaction_logs (user_id, type, amount, description) VALUES (?, 'commission_settle', ?, '佣金结算')`, [developerId, amount])
    logger.info('佣金批量结算', { developerId, amount })
  }

  /* ========== Phase 4: 风控数据查询 ========== */
  static async getRiskEvents(params: { page?: number; pageSize?: number; type?: string }) {
    const { page = 1, pageSize = 20, type } = params
    const offset = (page - 1) * pageSize
    let where = "WHERE action IN ('fraud_alert','rate_limit','blacklist')"
    const values: any[] = []
    if (type) { where += ' AND action=?'; values.push(type) }
    const [rows]: any = await dbPool.execute(
      `SELECT * FROM operation_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...values, pageSize, offset]
    )
    return { list: rows, page, pageSize }
  }
}