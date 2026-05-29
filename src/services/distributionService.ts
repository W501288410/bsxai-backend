import { dbPool } from '../config'
import { PaymentService } from './paymentService'
import { logger } from '../utils/logger'

export class DistributionService {
  /**
   * 生成邀请码（注册时调用）
   */
  static async generateInviteCode(userId: number): Promise<string> {
    const code = `INV${userId}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    await dbPool.execute('UPDATE users SET invite_code = ? WHERE id = ?', [code, userId])
    return code
  }

  /**
   * 通过邀请码绑定上下级关系
   * 注：SQLite 不支持 ON DUPLICATE KEY UPDATE，用 IF NOT EXISTS 模式
   */
  static async bindInviter(userId: number, inviteCode: string) {
    if (!inviteCode) return
    const [rows]: any = await dbPool.execute(
      'SELECT id FROM users WHERE invite_code = ? AND id != ?', [inviteCode, userId]
    )
    if (!rows || rows.length === 0) return
    const inviterId = rows[0].id
    await dbPool.execute(
      'UPDATE users SET invited_by = ? WHERE id = ? AND invited_by IS NULL',
      [inviterId, userId]
    )
    const changes = (dbPool as any).lastChanges?.()
    if (changes > 0) {
      logger.info('分销关系绑定', { inviterId, inviteeId: userId })
    }
  }

  /**
   * 计算并分配佣金（通用方法，可用于任意业务）
   */
  static async calculateCommission(transaction: {
    userId: number; amount: number; orderType: string; orderId: number
  }) {
    // 查找邀请人
    const [rows]: any = await dbPool.execute(
      'SELECT invited_by FROM users WHERE id = ?', [transaction.userId]
    )
    if (!rows || rows.length === 0 || !rows[0].invited_by) return
    const inviterId = rows[0].invited_by

    // 检查分销配置
    const [configRows]: any = await dbPool.execute(
      'SELECT config_value FROM system_configs WHERE config_key = ?', ['distribution_rate']
    )
    let rate = 0.05
    if (configRows && configRows.length > 0) {
      try { rate = parseFloat(JSON.parse(configRows[0].config_value)) } catch { /* keep default */ }
    }

    const commission = Math.round(transaction.amount * rate * 100) / 100
    if (commission <= 0) return

    // 给邀请人发放佣金
    await PaymentService.addCommission(
      inviterId, commission, transaction.orderId,
      `分销佣金(${transaction.orderType}) 来自用户${transaction.userId}`
    )

    // 记录分销流水 — 使用 schema 实际列名
    await dbPool.execute(
      `INSERT INTO distribution_records (promoter_id, buyer_id, order_type, order_id, order_amount, commission_rate, commission)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [inviterId, transaction.userId, transaction.orderType, transaction.orderId,
       transaction.amount, rate, commission]
    )

    logger.info('分销佣金已发放', { inviterId, inviteeId: transaction.userId, commission })
  }

  /**
   * 获取我的分销团队（通过 users.invited_by = userId 查询，无 user_invites 表）
   */
  static async getMyTeam(userId: number, page: number = 1, pageSize: number = 20) {
    const offset = (page - 1) * pageSize
    const [rows]: any = await dbPool.execute(
      `SELECT id, phone, nickname, created_at as join_time
       FROM users WHERE invited_by = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute(
      'SELECT COUNT(*) as total FROM users WHERE invited_by = ?', [userId]
    )
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  /**
   * 获取我的佣金统计 — schema 列名: promoter_id, commission
   */
  static async getMyCommissions(userId: number) {
    const [rows]: any = await dbPool.execute(
      `SELECT COALESCE(SUM(commission), 0) as total, COUNT(*) as count
       FROM distribution_records WHERE promoter_id = ?`, [userId]
    )
    const [today]: any = await dbPool.execute(
      `SELECT COALESCE(SUM(commission), 0) as total
       FROM distribution_records WHERE promoter_id = ? AND date(created_at) = date('now')`, [userId]
    )
    return { total: rows[0].total, count: rows[0].count, today: today[0].total }
  }

  /**
   * 获取佣金记录明细
   */
  static async getCommissionRecords(userId: number, page: number = 1, pageSize: number = 20) {
    const offset = (page - 1) * pageSize
    const [rows]: any = await dbPool.execute(
      `SELECT dr.*, u.nickname as invitee_name FROM distribution_records dr
       LEFT JOIN users u ON dr.buyer_id = u.id
       WHERE dr.promoter_id = ? ORDER BY dr.created_at DESC LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    )
    const [cnt]: any = await dbPool.execute(
      'SELECT COUNT(*) as total FROM distribution_records WHERE promoter_id = ?', [userId]
    )
    return { list: rows, total: cnt[0].total, page, pageSize }
  }

  /**
   * 获取我的邀请链接信息
   */
  static async getMyInviteInfo(userId: number) {
    const [rows]: any = await dbPool.execute(
      'SELECT invite_code FROM users WHERE id = ?', [userId]
    )
    if (!rows || !rows.length) return { inviteCode: '', inviteUrl: '', teamCount: 0 }
    const code = rows[0].invite_code || ''
    const [cnt]: any = await dbPool.execute(
      'SELECT COUNT(*) as total FROM users WHERE invited_by = ?', [userId]
    )
    return {
      inviteCode: code,
      inviteUrl: code ? `https://example.com/register?invite=${code}` : '',
      teamCount: cnt ? cnt[0].total : 0
    }
  }
}