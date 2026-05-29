import { dbPool, redis } from '../config'
import { logger } from '../utils/logger'

export class RiskControlService {
  /**
   * IP 请求频率检查（Redis 滑动窗口）
   */
  static async checkRequestRate(ip: string, limit: number = 100, windowMs: number = 60000): Promise<boolean> {
    const key = `rate:ip:${ip}`
    const current = await redis.incr(key)
    if (current === 1) await redis.pExpire(key, windowMs)
    if (current > limit) {
      logger.warn('IP请求频率超限', { ip, current, limit })
      return false
    }
    return true
  }

  /**
   * 用户行为频率检查
   */
  static async checkUserActionRate(userId: number, action: string, limit: number = 10, windowMs: number = 60000): Promise<boolean> {
    const key = `rate:user:${userId}:${action}`
    const current = await redis.incr(key)
    if (current === 1) await redis.pExpire(key, windowMs)
    if (current > limit) {
      logger.warn('用户行为频率超限', { userId, action, current, limit })
      return false
    }
    return true
  }

  /**
   * IP 黑名单检查
   */
  static async isBlacklisted(ip: string): Promise<boolean> {
    const exists = await redis.sIsMember('blacklist:ip', ip)
    return !!exists
  }

  /**
   * 添加/移除 IP 黑名单
   */
  static async addToBlacklist(ip: string, reason: string = '') {
    await redis.sAdd('blacklist:ip', [ip])
    await dbPool.execute('INSERT INTO ip_blacklist (ip, reason) VALUES (?, ?) ON DUPLICATE KEY UPDATE reason=?, updated_at=NOW()', [ip, reason, reason])
    logger.info('IP加入黑名单', { ip, reason })
  }

  static async removeFromBlacklist(ip: string) {
    await redis.sRem('blacklist:ip', ip)
    await dbPool.execute('DELETE FROM ip_blacklist WHERE ip=?', [ip])
    logger.info('IP移出黑名单', { ip })
  }

  static async getBlacklist(): Promise<string[]> {
    return await redis.sMembers('blacklist:ip')
  }

  /**
   * 敏感词检测
   */
  static async checkContent(text: string): Promise<{ pass: boolean; blockedWords: string[] }> {
    const words = await redis.sMembers('sensitive:words')
    const blockedWords: string[] = []
    for (const word of words) {
      if (text.includes(word)) blockedWords.push(word)
    }
    return { pass: blockedWords.length === 0, blockedWords }
  }

  /**
   * 敏感词管理
   */
  static async addSensitiveWords(words: string[]) {
    if (words.length > 0) {
      await redis.sAdd('sensitive:words', words)
      for (const w of words) {
        await dbPool.execute('INSERT IGNORE INTO sensitive_words (word) VALUES (?)', [w])
      }
      logger.info('添加敏感词', { count: words.length })
    }
  }

  static async removeSensitiveWord(word: string) {
    await redis.sRem('sensitive:words', word)
    await dbPool.execute('DELETE FROM sensitive_words WHERE word=?', [word])
  }

  static async getSensitiveWords(): Promise<string[]> {
    return await redis.sMembers('sensitive:words')
  }

  /**
   * Phase 4: 异常行为检测
   * 检测短时间内的大量异常操作（注册、下单、提现等）
   */
  static async detectAnomaly(userId: number, actionType: string): Promise<{ isAnomaly: boolean; score: number; reason: string }> {
    let score = 0
    let reason = ''

    // 1. 同一用户 5 分钟内操作次数
    const actionKey = `anomaly:${userId}:${actionType}`
    const actionCount = await redis.incr(actionKey)
    if (actionCount === 1) await redis.pExpire(actionKey, 300000) // 5 min

    if (actionCount > 20) { score += 40; reason += `5分钟内${actionType}操作${actionCount}次;` }
    else if (actionCount > 10) { score += 20; reason += `5分钟内${actionType}操作${actionCount}次;` }

    // 2. 同一用户 1 小时内不同 IP 数量
    const ipKey = `anomaly:${userId}:ips`
    const currentIp = 'current' // 实际从请求中获取
    const ipCount = await redis.sCard(ipKey)
    if (ipCount > 5) { score += 30; reason += `1小时内使用${ipCount}个不同IP;` }

    // 3. 金额异常（大额提现/充值）
    if (actionType === 'withdraw' || actionType === 'recharge') {
      const amountKey = `anomaly:${userId}:${actionType}:amount`
      const totalAmount = parseFloat(await redis.get(amountKey) || '0')
      if (totalAmount > 10000) { score += 30; reason += `${actionType}累计金额${totalAmount};` }
    }

    const isAnomaly = score >= 60
    if (isAnomaly) {
      logger.warn('异常行为检测', { userId, actionType, score, reason })
      // 自动加入观察名单
      await redis.setEx(`watchlist:${userId}`, 86400, JSON.stringify({ score, reason }))
    }

    return { isAnomaly, score, reason }
  }

  /**
   * Phase 4: 获取观察名单
   */
  static async getWatchlist(): Promise<any[]> {
    const keys = await redis.keys('watchlist:*')
    const result = []
    for (const key of keys) {
      const data = await redis.get(key)
      if (data) {
        const userId = key.replace('watchlist:', '')
        result.push({ userId: +userId, ...JSON.parse(data) })
      }
    }
    return result
  }

  /**
   * Phase 4: 全局风控统计
   */
  static async getRiskStats() {
    const [blocked]: any = await dbPool.execute(
      "SELECT COUNT(*) as cnt FROM operation_logs WHERE action='fraud_alert' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)"
    )
    const [rateLimited]: any = await dbPool.execute(
      "SELECT COUNT(*) as cnt FROM operation_logs WHERE action='rate_limit' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)"
    )
    const [blacklist]: any = await dbPool.execute('SELECT COUNT(*) as cnt FROM ip_blacklist')
    return {
      blocked: blocked[0]?.cnt || 0,
      rateLimited: rateLimited[0]?.cnt || 0,
      blacklistCount: blacklist[0]?.cnt || 0
    }
  }

  /** 安全状态概览（供管理后台） */
  static async getSecurityStatus() {
    return await this.getRiskStats()
  }

  /** IP 拉黑 */
  static async blacklistIp(ip: string, reason: string = '', durationMinutes: number = 0) {
    await dbPool.execute(
      'INSERT INTO ip_blacklist (ip, reason) VALUES (?, ?) ON DUPLICATE KEY UPDATE reason=VALUES(reason)',
      [ip, reason]
    )
    if (durationMinutes > 0) {
      await redis.setEx(`blockip:${ip}`, durationMinutes * 60, '1')
    }
    logger.info('IP 拉入黑名单', { ip, reason, durationMinutes })
  }
}
