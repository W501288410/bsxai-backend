import { type Context } from 'koa'
import { ToolMallService } from '../services/toolMallService'
import { CodeError } from '../utils/errors'

export class ToolMallController {
  static async getTools(ctx: Context) {
    const { page, pageSize, category, keyword, sortBy } = ctx.query
    const result = await ToolMallService.getTools({
      page: page ? +page : 1, pageSize: pageSize ? +pageSize : 12,
      category: category as string, keyword: keyword as string, sortBy: sortBy as string
    })
    ctx.body = { code: 0, message: 'success', data: result }
  }

  static async getToolDetail(ctx: Context) {
    const { id } = ctx.params
    const detail = await ToolMallService.getToolDetail(+id)
    ctx.body = { code: 0, message: 'success', data: detail }
  }

  static async createTool(ctx: Context) {
    const userId = ctx.state.user.id
    const result = await ToolMallService.createTool(userId, ctx.request.body as any)
    ctx.body = { code: 0, message: '工具已提交审核', data: result }
  }

  static async subscribe(ctx: Context) {
    const userId = ctx.state.user.id
    const { toolId, type = 2 } = ctx.request.body as any
    if (!toolId) throw new CodeError('工具ID不能为空', 400)
    const result = await ToolMallService.subscribe(userId, toolId, type)
    ctx.body = { code: 0, message: '订阅成功', data: result }
  }

  static async getSubscriptions(ctx: Context) {
    const userId = ctx.state.user.id
    const { page = 1, pageSize = 20 } = ctx.query
    const result = await ToolMallService.getSubscriptions(userId, +page, +pageSize)
    ctx.body = { code: 0, message: 'success', data: result }
  }

  static async createReview(ctx: Context) {
    const userId = ctx.state.user.id
    const { toolId, rating, comment } = ctx.request.body as any
    if (!toolId || !rating) throw new CodeError('工具ID和评分不能为空', 400)
    const result = await ToolMallService.createReview(userId, toolId, rating, comment)
    ctx.body = { code: 0, message: '评价成功', data: result }
  }

  static async getMyTools(ctx: Context) {
    const userId = ctx.state.user.id
    const result = await ToolMallService.getMyTools(userId)
    ctx.body = { code: 0, message: 'success', data: result }
  }
}