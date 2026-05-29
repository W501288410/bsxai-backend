import { dbPool, redis } from '../config'
import { CodeError } from '../utils/errors'
import { logger } from '../utils/logger'

export class PaymentService {
  /**
   * 充值（模拟支付，后续接入微信/支付宝）
   */
  static async recharge(userId: number, amount: number, paymentMethod: string) {
    if (amount <= 0) throw new CodeError('充值金额必须大于0', 400)
    if (amount > 50000) throw new CodeError('单次充值不能超过50000元', 400)

    const orderNo = `REC${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()

      // 1. 创建充值订单
      const [result]: any = await conn.execute(
        `INSERT INTO recharge_orders (order_no, user_id, amount, payment_method, status)
         VALUES (?, ?, ?, ?, 1)`,
        [orderNo, userId, amount, paymentMethod]
      )
      const orderId = result.insertId

      // 2. 模拟支付成功（实际应等待第三方回调）
      await conn.execute(
        `UPDATE recharge_orders SET status = 2, trade_no = ?, paid_at = datetime('now') WHERE id = ?`,
        [`SIM${Date.now()}`, orderId]
      )

      // 3. 更新账户余额
      await conn.execute(
        `UPDATE accounts SET balance = balance + ?, total_recharge = total_recharge + ? WHERE user_id = ?`,
        [amount, amount, userId]
      )

      // 4. 获取变动前后余额
      const [accRows]: any = await conn.execute(
        'SELECT balance FROM accounts WHERE user_id = ?', [userId]
      )
      const balanceAfter = accRows[0].balance
      const balanceBefore = +(balanceAfter - amount).toFixed(2)

      // 5. 记录交易流水
      const txNo = `TXN${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      await conn.execute(
        `INSERT INTO transactions (transaction_no, user_id, type, amount, balance_before, balance_after, related_id, related_type, remark)
         VALUES (?, ?, 1, ?, ?, ?, ?, 'recharge_order', ?)`,
        [txNo, userId, amount, balanceBefore, balanceAfter, orderId, `充值${amount}元`]
      )

      await conn.commit()

      logger.info('充值成功', { userId, amount, orderNo })
      return { orderNo, amount, balance: balanceAfter }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }

  /**
   * 扣款（内部调用，用于购买 API/工具等）
   */
  static async deduct(userId: number, amount: number, relatedId: number, relatedType: string, remark: string) {
    if (amount <= 0) throw new CodeError('扣款金额必须大于0', 400)

    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()

      // 1. 检查余额
      const [accRows]: any = await conn.execute(
        'SELECT balance FROM accounts WHERE user_id = ?', [userId]
      )
      if (accRows.length === 0) throw new CodeError('账户不存在', 404)
      const balanceBefore = accRows[0].balance
      if (balanceBefore < amount) throw new CodeError('余额不足', 400)

      // 2. 扣减余额
      const balanceAfter = +(balanceBefore - amount).toFixed(2)
      await conn.execute(
        `UPDATE accounts SET balance = ?, total_consumption = total_consumption + ? WHERE user_id = ?`,
        [balanceAfter, amount, userId]
      )

      // 3. 记录交易流水
      const txNo = `TXN${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      await conn.execute(
        `INSERT INTO transactions (transaction_no, user_id, type, amount, balance_before, balance_after, related_id, related_type, remark)
         VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?)`,
        [txNo, userId, -amount, balanceBefore, balanceAfter, relatedId, relatedType, remark]
      )

      await conn.commit()
      logger.info('扣款成功', { userId, amount, relatedId, relatedType })
      return { balanceBefore, balanceAfter }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }

  /**
   * 冻结资金（用于悬赏托管）
   */
  static async freeze(userId: number, amount: number, relatedId: number, relatedType: string, remark: string) {
    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()

      const [accRows]: any = await conn.execute(
        'SELECT balance, frozen_balance FROM accounts WHERE user_id = ?', [userId]
      )
      if (accRows.length === 0) throw new CodeError('账户不存在', 404)
      const { balance, frozen_balance } = accRows[0]
      if (balance < amount) throw new CodeError('可用余额不足', 400)

      await conn.execute(
        `UPDATE accounts SET balance = balance - ?, frozen_balance = frozen_balance + ? WHERE user_id = ?`,
        [amount, amount, userId]
      )

      const txNo = `TXN${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      await conn.execute(
        `INSERT INTO transactions (transaction_no, user_id, type, amount, balance_before, balance_after, related_id, related_type, remark)
         VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?)`,
        [txNo, userId, -amount, balance, +(balance - amount).toFixed(2), relatedId, relatedType, remark]
      )

      await conn.commit()
      logger.info('资金冻结成功', { userId, amount, relatedId })
      return { success: true }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }

  /**
   * 解冻资金（仲裁退款等）
   */
  static async unfreeze(userId: number, amount: number, relatedId: number, remark: string) {
    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()

      const [accRows]: any = await conn.execute(
        'SELECT balance, frozen_balance FROM accounts WHERE user_id = ?', [userId]
      )
      if (accRows.length === 0) throw new CodeError('账户不存在', 404)
      const { balance, frozen_balance } = accRows[0]
      if (frozen_balance < amount) throw new CodeError('冻结余额不足', 400)

      await conn.execute(
        `UPDATE accounts SET balance = balance + ?, frozen_balance = frozen_balance - ? WHERE user_id = ?`,
        [amount, amount, userId]
      )

      const txNo = `TXN${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      await conn.execute(
        `INSERT INTO transactions (transaction_no, user_id, type, amount, balance_before, balance_after, related_id, related_type, remark)
         VALUES (?, ?, 4, ?, ?, ?, ?, 'unfreeze', ?)`,
        [txNo, userId, amount, balance, +(balance + amount).toFixed(2), relatedId, remark]
      )

      await conn.commit()
      logger.info('资金解冻成功', { userId, amount, relatedId })
      return { success: true }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }

  /**
   * 转入佣金（分销收益等）
   */
  static async addCommission(userId: number, amount: number, relatedId: number, remark: string) {
    const conn = await dbPool.getConnection()
    try {
      await conn.beginTransaction()

      await conn.execute(
        `UPDATE accounts SET balance = balance + ? WHERE user_id = ?`,
        [amount, userId]
      )

      const [accRows]: any = await conn.execute(
        'SELECT balance FROM accounts WHERE user_id = ?', [userId]
      )
      const balanceAfter = accRows[0].balance
      const balanceBefore = +(balanceAfter - amount).toFixed(2)

      const txNo = `TXN${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      await conn.execute(
        `INSERT INTO transactions (transaction_no, user_id, type, amount, balance_before, balance_after, related_id, related_type, remark)
         VALUES (?, ?, 5, ?, ?, ?, ?, 'commission', ?)`,
        [txNo, userId, amount, balanceBefore, balanceAfter, relatedId, remark]
      )

      await conn.commit()
      return { success: true }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }
}