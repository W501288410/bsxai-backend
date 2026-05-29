import { type Context } from 'koa'
import { DistributionService } from '../services/distributionService'

export class DistributionController {
  static async getMyInviteInfo(ctx: Context) {
    const userId = ctx.state.user.id
    const data = await DistributionService.getMyInviteInfo(userId)
    ctx.body = { code: 0, data }
  }

  static async getMyTeam(ctx: Context) {
    const userId = ctx.state.user.id
    const { page = 1, pageSize = 20 } = ctx.query
    const data = await DistributionService.getMyTeam(userId, +page, +pageSize)
    ctx.body = { code: 0, data }
  }

  static async getMyCommissions(ctx: Context) {
    const userId = ctx.state.user.id
    const data = await DistributionService.getMyCommissions(userId)
    ctx.body = { code: 0, data }
  }

  static async getCommissionRecords(ctx: Context) {
    const userId = ctx.state.user.id
    const { page = 1, pageSize = 20 } = ctx.query
    const data = await DistributionService.getCommissionRecords(userId, +page, +pageSize)
    ctx.body = { code: 0, data }
  }
}

export class RiskController {
  static async getSecurityStatus(ctx: Context) {
    const { RiskControlService } = await import('../services/riskControlService')
    const data = await RiskControlService.getSecurityStatus()
    ctx.body = { code: 0, data }
  }

  static async blacklistIp(ctx: Context) {
    const { RiskControlService } = await import('../services/riskControlService')
    const { ip, reason, durationMinutes = 60 } = ctx.request.body as any
    if (!ip) { ctx.body = { code: 400, message: 'IP不能为空' }; return }
    await RiskControlService.blacklistIp(ip, reason, durationMinutes)
    ctx.body = { code: 0, message: 'IP已拉黑' }
  }
}