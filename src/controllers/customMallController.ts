import { type Context } from 'koa'
import { CustomMallService } from '../services/customMallService'
import { CodeError } from '../utils/errors'

export class CustomMallController {
  static async getRequirements(ctx: Context) {
    const { page, pageSize, category, keyword, status } = ctx.query
    const result = await CustomMallService.getRequirements({
      page: page ? +page : 1, pageSize: pageSize ? +pageSize : 12,
      category: category as string, keyword: keyword as string, status: status ? +status : 1
    })
    ctx.body = { code: 0, message: 'success', data: result }
  }

  static async getRequirementDetail(ctx: Context) {
    const { id } = ctx.params
    const detail = await CustomMallService.getRequirementDetail(+id)
    ctx.body = { code: 0, message: 'success', data: detail }
  }

  static async createRequirement(ctx: Context) {
    const userId = ctx.state.user.id
    const { title, description, category, budget, deadline, attachments } = ctx.request.body as any
    if (!title || !budget || !deadline) throw new CodeError('标题、金额和截止时间不能为空', 400)
    const result = await CustomMallService.createRequirement(userId, {
      title, description, category, budget, deadline, attachments
    })
    ctx.body = { code: 0, message: '悬赏发布成功', data: result }
  }

  static async createBid(ctx: Context) {
    const userId = ctx.state.user.id
    const { requirementId, proposal, quote, duration, attachments } = ctx.request.body as any
    if (!requirementId || !proposal) throw new CodeError('需求ID和方案不能为空', 400)
    const result = await CustomMallService.createBid(userId, {
      requirementId, proposal, quote: quote || 0, duration: duration || 7, attachments
    })
    ctx.body = { code: 0, message: '竞标成功', data: result }
  }

  static async selectBid(ctx: Context) {
    const userId = ctx.state.user.id
    const { id } = ctx.params
    await CustomMallService.selectBid(userId, +id)
    ctx.body = { code: 0, message: '已选中该方案', data: null }
  }

  static async createArbitration(ctx: Context) {
    const userId = ctx.state.user.id
    const { requirementId, reason, evidence } = ctx.request.body as any
    if (!requirementId || !reason) throw new CodeError('需求ID和仲裁原因不能为空', 400)
    const result = await CustomMallService.createArbitration(userId, { requirementId, reason, evidence })
    ctx.body = { code: 0, message: '仲裁已提交', data: result }
  }

  static async completeRequirement(ctx: Context) {
    const userId = ctx.state.user.id
    const { id } = ctx.params
    await CustomMallService.completeRequirement(userId, +id)
    ctx.body = { code: 0, message: '需求已确认完成', data: null }
  }
}