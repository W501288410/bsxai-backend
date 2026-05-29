import { dbPool, redis } from '../config'
import { CodeError } from '../utils/errors'
import { logger } from '../utils/logger'

export class UserService {
  /**
   * 获取用户信息
   */
  static async getUserInfo(userId: number) {
    const [rows]: any = await dbPool.execute(
      `SELECT id, phone, email, nickname, avatar, real_name, is_verified, user_type, status, created_at
       FROM users WHERE id = ? AND deleted_at IS NULL`, [userId]
    )
    if (rows.length === 0) throw new CodeError('用户不存在', 404)
    // 手机号脱敏
    const user = rows[0]
    if (user.phone) user.phone_masked = user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    return user
  }

  /**
   * 更新用户资料
   */
  static async updateProfile(userId: number, data: any) {
    const fields: string[] = []
    const values: any[] = []
    const allowed = ['nickname', 'avatar', 'email']
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]) }
    }
    if (fields.length === 0) throw new CodeError('没有可更新的字段', 400)
    values.push(userId)
    await dbPool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
    return { success: true }
  }

  /**
   * 实名认证
   */
  static async verifyRealName(userId: number, data: { realName: string; idCard: string; idCardFront: string; idCardBack: string }) {
    if (!data.realName || !data.idCard) throw new CodeError('姓名和身份证号不能为空', 400)

    // 检查是否已认证
    const [rows]: any = await dbPool.execute(
      'SELECT is_verified FROM users WHERE id = ?', [userId]
    )
    if (rows[0]?.is_verified) throw new CodeError('已实名认证', 400)

    // TODO: 调用第三方实名认证接口（阿里云/腾讯云）
    // 开发环境直接通过
    await dbPool.execute(
      `UPDATE users SET real_name = ?, id_card = ?, id_card_front = ?, id_card_back = ?, is_verified = 1 WHERE id = ?`,
      [data.realName, data.idCard, data.idCardFront, data.idCardBack, userId]
    )

    // 如果是实名认证，可以升级为开发者
    logger.info('实名认证成功', { userId, realName: data.realName })
    return { success: true, isVerified: true }
  }

  /**
   * 升级为开发者
   */
  static async upgradeToDeveloper(userId: number) {
    const [rows]: any = await dbPool.execute(
      'SELECT is_verified, user_type FROM users WHERE id = ?', [userId]
    )
    if (rows.length === 0) throw new CodeError('用户不存在', 404)
    if (!rows[0].is_verified) throw new CodeError('需要先完成实名认证', 400)
    if (rows[0].user_type >= 2) throw new CodeError('已经是开发者', 400)

    await dbPool.execute('UPDATE users SET user_type = 2 WHERE id = ?', [userId])
    logger.info('用户升级为开发者', { userId })
    return { success: true, userType: 2 }
  }

  /**
   * 获取账户余额
   */
  static async getBalance(userId: number) {
    const [rows]: any = await dbPool.execute(
      'SELECT balance, frozen_balance, total_recharge, total_consumption FROM accounts WHERE user_id = ?',
      [userId]
    )
    if (rows.length === 0) throw new CodeError('账户不存在', 404)
    return rows[0]
  }

  /**
   * 创建充值订单（调用 PaymentService）
   */
  static async createRechargeOrder(userId: number, amount: number, paymentMethod: string) {
    const { PaymentService } = await import('./paymentService')
    return await PaymentService.recharge(userId, amount, paymentMethod)
  }

  /**
   * 获取交易流水
   */
  static async getTransactions(userId: number, page: number = 1, pageSize: number = 20) {
    const offset = (page - 1) * pageSize
    const [rows]: any = await dbPool.execute(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, pageSize, offset]
    )
    const [countResult]: any = await dbPool.execute(
      'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?', [userId]
    )
    return { list: rows, total: countResult[0].total, page, pageSize }
  }

  /**
   * 发送短信验证码
   */
  static async sendSmsCode(phone: string) {
    // 生成6位验证码
    const code = String(Math.floor(100000 + Math.random() * 900000))

    // 存入 Redis，5分钟有效
    await redis.setEx(`sms_code:${phone}`, 300, code)

    // TODO: 调用短信服务商发送
    // 开发环境只打印日志
    logger.info('发送短信验证码', { phone, code })

    return { success: true }
  }

  /**
   * 验证短信验证码
   */
  static async verifySmsCode(phone: string, code: string): Promise<boolean> {
    const stored = await redis.get(`sms_code:${phone}`)
    if (!stored || stored !== code) return false
    await redis.del(`sms_code:${phone}`)
    return true
  }
}