import { type Context } from 'koa'
import { ApiMallService } from '../services/apiMallService'
import { CodeError } from '../utils/errors'

export class ApiMallController {
  static async getProducts(ctx: Context) {
    const { page, pageSize, category, keyword } = ctx.query
    const result = await ApiMallService.getProducts({
      page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20,
      category: category as string, keyword: keyword as string
    })
    ctx.body = { code: 0, message: 'success', data: result }
  }

  static async getProductDetail(ctx: Context) {
    const { id } = ctx.params
    const product = await ApiMallService.getProductDetail(+id)
    ctx.body = { code: 0, message: 'success', data: product }
  }

  static async createOrder(ctx: Context) {
    const userId = ctx.state.user.id
    const { productId, pricingModel, quantity } = ctx.request.body as any
    if (!productId || !pricingModel) throw new CodeError('商品ID和计费模式不能为空', 400)
    const result = await ApiMallService.purchaseApi(userId, productId, pricingModel, quantity)
    ctx.body = { code: 0, message: '购买成功', data: result }
  }

  static async getOrders(ctx: Context) {
    const userId = ctx.state.user.id
    const { page = 1, pageSize = 20 } = ctx.query
    const result = await ApiMallService.getOrders(userId, +page, +pageSize)
    ctx.body = { code: 0, message: 'success', data: result }
  }

  static async callApi(ctx: Context) {
    const userId = ctx.state.user.id
    const { id } = ctx.params
    const result = await ApiMallService.callApi(userId, +id, ctx.request.body)
    ctx.body = { code: 0, message: '调用成功', data: result }
  }

  static async checkSensitive(ctx: Context) {
    const { content } = ctx.request.body as any
    if (!content) throw new CodeError('内容不能为空', 400)
    const result = await ApiMallService.checkSensitiveWords(content)
    ctx.body = { code: 0, message: 'success', data: result }
  }
}