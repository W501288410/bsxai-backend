import { type Context } from 'koa'
import { RiskControlService } from '../services/riskControlService'
import { CodeError } from '../utils/errors'

export class RiskController {
  /** 安全状态概览（兼容旧接口） */
  static async getSecurityStatus(ctx: Context) {
    const data = await RiskControlService.getSecurityStatus()
    ctx.body = { code: 0, data }
  }

  /** IP 拉黑（兼容旧接口） */
  static async blacklistIp(ctx: Context) {
    const { ip, reason, durationMinutes = 60 } = ctx.request.body as any || {}
    if (!ip) { ctx.body = { code: 400, message: 'IP不能为空' }; return }
    await RiskControlService.blacklistIp(ip, reason, durationMinutes)
    ctx.body = { code: 0, message: 'IP已拉黑' }
  }
  /** IP 黑名单管理 */
  static async getBlacklist(ctx: Context) {
    const list = await RiskControlService.getBlacklist()
    ctx.body = { code: 0, data: list }
  }
  static async addToBlacklist(ctx: Context) {
    const { ip, reason } = ctx.request.body as any
    if (!ip) throw new CodeError('IP 不能为空', 400)
    await RiskControlService.addToBlacklist(ip, reason || '')
    ctx.body = { code: 0, message: '已加入黑名单' }
  }
  static async removeFromBlacklist(ctx: Context) {
    const { ip } = ctx.params
    await RiskControlService.removeFromBlacklist(ip)
    ctx.body = { code: 0, message: '已移出黑名单' }
  }

  /** 敏感词管理 */
  static async getSensitiveWords(ctx: Context) {
    const words = await RiskControlService.getSensitiveWords()
    ctx.body = { code: 0, data: words }
  }
  static async addSensitiveWords(ctx: Context) {
    const { words } = ctx.request.body as any
    if (!words || !Array.isArray(words) || words.length === 0) throw new CodeError('敏感词列表不能为空', 400)
    await RiskControlService.addSensitiveWords(words)
    ctx.body = { code: 0, message: `已添加 ${words.length} 个敏感词` }
  }
  static async removeSensitiveWord(ctx: Context) {
    const { word } = ctx.params
    await RiskControlService.removeSensitiveWord(word)
    ctx.body = { code: 0, message: '已删除' }
  }

  /** 观察名单 */
  static async getWatchlist(ctx: Context) {
    const list = await RiskControlService.getWatchlist()
    ctx.body = { code: 0, data: list }
  }

  /** 风控统计 */
  static async getRiskStats(ctx: Context) {
    const stats = await RiskControlService.getRiskStats()
    ctx.body = { code: 0, data: stats }
  }

  /** 异常行为检测（内部调用） */
  static async checkAnomaly(ctx: Context) {
    const { userId, actionType } = ctx.request.body as any
    if (!userId || !actionType) throw new CodeError('参数不完整', 400)
    const result = await RiskControlService.detectAnomaly(userId, actionType)
    ctx.body = { code: 0, data: result }
  }
}
