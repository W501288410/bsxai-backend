import { dbPool, PAGINATION } from '../config'
import { PaymentService } from './paymentService'
import { CodeError } from '../utils/errors'
import { logger } from '../utils/logger'

export class CustomMallService {
  /**
   * 发布悬赏需求
   */
  static async createRequirement(userId: number, data: {
    title: string; description: string; category?: string;
    budget: number; deadline: string; attachments?: string[]
  }) {
    if (!data.title || !data.description) throw new CodeError('标题和描述不能为空', 400)
    if (!data.budget || data.budget <= 0) throw new CodeError('悬赏金额必须大于0', 400)
    if (!data.deadline || new Date(data.deadline) <= new Date()) throw new CodeError('截止时间必须晚于当前时间', 400)

    // 冻结资金
    const reqNo = `CUST${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    await PaymentService.freeze(userId, data.budget, 0, 'custom_requirement', `发布悬赏: ${data.title}`)

    const [result]: any = await dbPool.execute(
      `INSERT INTO custom_requirements (requirement_no, user_id, title, description, category, budget, budget_frozen, deadline, attachments, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [reqNo, userId, data.title, data.description, data.category, data.budget, data.budget, data.deadline,
       data.attachments ? JSON.stringify(data.attachments) : null]
    )

    logger.info('悬赏需求发布成功', { requirementId: result.insertId, title: data.title })
    return { id: result.insertId, requirementNo: reqNo, budget: data.budget }
  }

  /**
   * 获取需求列表
   */
  static async getRequirements(params: {
    page?: number; pageSize?: number; category?: string; keyword?: string; status?: number
  }) {
    const { page = PAGINATION.defaultPage, pageSize = PAGINATION.defaultPageSize, category, keyword, status = 1 } = params
    const offset = (page - 1) * pageSize

    let where = 'WHERE status = ? AND deleted_at IS NULL'
    const values: any[] = [status]
    if (category) { where += ' AND category = ?'; values.push(category) }
    if (keyword) { where += ' AND (title LIKE ? OR description LIKE ?)'; values.push(`%${keyword}%`, `%${keyword}%`) }

    const [rows]: any = await dbPool.execute(
      `SELECT r.*, u.nickname as publisher_name FROM custom_requirements r
       LEFT JOIN users u ON r.user_id = u.id
       ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    )
    const [countResult]: any = await dbPool.execute(
      `SELECT COUNT(*) as total FROM custom_requirements ${where}`, values
    )
    return { list: rows, total: countResult[0].total, page, pageSize }
  }

  /**
   * 获取需求详情
   */
  static async getRequirementDetail(requirementId: number) {
    const [rows]: any = await dbPool.execute(
      `SELECT r.*, u.nickname as publisher_name, u.phone as publisher_phone
       FROM custom_requirements r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = ? AND r.deleted_at IS NULL`, [requirementId]
    )
    if (rows.length === 0) throw new CodeError('需求不存在', 404)

    // 获取竞标列表
    const [bids]: any = await dbPool.execute(
      `SELECT b.*, u.nickname as developer_name FROM bids b
       LEFT JOIN users u ON b.developer_id = u.id
       WHERE b.requirement_id = ? ORDER BY created_at ASC`, [requirementId]
    )

    return { ...rows[0], bids }
  }

  /**
   * 提交竞标
   */
  static async createBid(developerId: number, data: {
    requirementId: number; proposal: string; quote: number; duration: number; attachments?: string[]
  }) {
    // 检查开发者身份
    const [userRows]: any = await dbPool.execute('SELECT user_type FROM users WHERE id = ?', [developerId])
    if (!userRows.length || userRows[0].user_type < 2) throw new CodeError('需要先升级为开发者', 403)

    // 检查需求是否存在且可竞标
    const [reqRows]: any = await dbPool.execute(
      'SELECT status FROM custom_requirements WHERE id = ? AND deleted_at IS NULL', [data.requirementId]
    )
    if (reqRows.length === 0) throw new CodeError('需求不存在', 404)
    if (reqRows[0].status !== 1) throw new CodeError('该需求不在竞标中', 400)

    // 检查是否已竞标
    const [existingBids]: any = await dbPool.execute(
      'SELECT id FROM bids WHERE requirement_id = ? AND developer_id = ?', [data.requirementId, developerId]
    )
    if (existingBids.length > 0) throw new CodeError('您已参与竞标，无需重复提交', 400)

    const bidNo = `BID${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const [result]: any = await dbPool.execute(
      `INSERT INTO bids (bid_no, requirement_id, developer_id, proposal, quote, duration, attachments, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [bidNo, data.requirementId, developerId, data.proposal, data.quote, data.duration,
       data.attachments ? JSON.stringify(data.attachments) : null]
    )

    // 更新需求竞标数
    await dbPool.execute(
      'UPDATE custom_requirements SET total_bids = total_bids + 1 WHERE id = ?', [data.requirementId]
    )

    logger.info('竞标提交成功', { bidId: result.insertId, requirementId: data.requirementId })
    return { id: result.insertId, bidNo }
  }

  /**
   * 雇主选中竞标方案
   */
  static async selectBid(userId: number, bidId: number) {
    // 检查竞标是否属于该用户的发布需求
    const [bidRows]: any = await dbPool.execute(
      `SELECT b.*, r.user_id as publisher_id, r.budget, r.id as req_id
       FROM bids b
       LEFT JOIN custom_requirements r ON b.requirement_id = r.id
       WHERE b.id = ?`, [bidId]
    )
    if (bidRows.length === 0) throw new CodeError('竞标不存在', 404)
    if (bidRows[0].publisher_id !== userId) throw new CodeError('无权操作此竞标', 403)
    if (bidRows[0].status !== 1) throw new CodeError('该竞标已被处理', 400)

    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()

      // 更新竞标状态
      await conn.execute('UPDATE bids SET status = 2 WHERE id = ?', [bidId])

      // 拒绝其他竞标
      await conn.execute('UPDATE bids SET status = 3 WHERE requirement_id = ? AND id != ?', [bidRows[0].requirement_id, bidId])

      // 更新需求状态
      await conn.execute('UPDATE custom_requirements SET status = 2, selected_bid_id = ? WHERE id = ?', [bidId, bidRows[0].requirement_id])

      await conn.commit()
      logger.info('竞标选中成功', { bidId, requirementId: bidRows[0].requirement_id })
      return { success: true }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }

  /**
   * 提交仲裁申请
   */
  static async createArbitration(userId: number, data: {
    requirementId: number; reason: string; evidence?: string[]
  }) {
    const [reqRows]: any = await dbPool.execute(
      'SELECT user_id, status FROM custom_requirements WHERE id = ? AND deleted_at IS NULL', [data.requirementId]
    )
    if (reqRows.length === 0) throw new CodeError('需求不存在', 404)
    // 只有发布者或中选开发者可以发起仲裁
    const [bidRows]: any = await dbPool.execute(
      'SELECT developer_id FROM bids WHERE requirement_id = ? AND status = 2', [data.requirementId]
    )
    if (!bidRows.length) throw new CodeError('该需求尚未选中竞标', 400)
    const isPublisher = reqRows[0].user_id === userId
    const isDeveloper = bidRows[0].developer_id === userId
    if (!isPublisher && !isDeveloper) throw new CodeError('无权发起仲裁', 403)

    const [result]: any = await dbPool.execute(
      `INSERT INTO arbitrations (requirement_id, plaintiff_id, defendant_id, reason, evidence, status)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [data.requirementId, userId,
       isPublisher ? bidRows[0].developer_id : reqRows[0].user_id,
       data.reason, data.evidence ? JSON.stringify(data.evidence) : null]
    )

    // 更新需求状态为仲裁中
    await dbPool.execute('UPDATE custom_requirements SET status = 6 WHERE id = ?', [data.requirementId])

    logger.info('仲裁申请提交成功', { arbitrationId: result.insertId, requirementId: data.requirementId })
    return { id: result.insertId }
  }

  /**
   * 完成需求（解冻资金给开发者）
   */
  static async completeRequirement(userId: number, requirementId: number) {
    const [reqRows]: any = await dbPool.execute(
      'SELECT user_id, budget, status, selected_bid_id FROM custom_requirements WHERE id = ?', [requirementId]
    )
    if (reqRows.length === 0) throw new CodeError('需求不存在', 404)
    if (reqRows[0].user_id !== userId) throw new CodeError('无权操作', 403)
    if (reqRows[0].status !== 2) throw new CodeError('需求状态不正确', 400)

    const [bidRows]: any = await dbPool.execute(
      'SELECT developer_id FROM bids WHERE id = ?', [reqRows[0].selected_bid_id]
    )

    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()

      // 解冻资金给开发者
      await PaymentService.unfreeze(reqRows[0].user_id, reqRows[0].budget, requirementId, '需求完成，资金解冻给开发者')
      // 实际应转账给开发者，这里简化为解冻到发布者余额，再由发布者手动打款
      // 更好的做法：直接扣减发布者余额，增加开发者余额
      await conn.execute(
        'UPDATE accounts SET balance = balance + ? WHERE user_id = ?',
        [reqRows[0].budget, bidRows[0].developer_id]
      )
      await conn.execute(
        'UPDATE accounts SET frozen_balance = frozen_balance - ? WHERE user_id = ?',
        [reqRows[0].budget, reqRows[0].user_id]
      )

      // 更新需求状态
      await conn.execute('UPDATE custom_requirements SET status = 4 WHERE id = ?', [requirementId])

      await conn.commit()
      logger.info('需求完成，资金已解冻', { requirementId, amount: reqRows[0].budget })
      return { success: true }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }
}