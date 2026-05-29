import { type Context } from 'koa'

export class ApiMallController {
  static async getProducts(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: [] }
  }

  static async getProductDetail(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: null }
  }

  static async createOrder(ctx: Context) {
    ctx.body = { code: 0, message: '订单创建成功', data: null }
  }

  static async getOrders(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: [] }
  }

  static async callApi(ctx: Context) {
    ctx.body = { code: 0, message: '调用成功', data: null }
  }
}

export class ToolMallController {
  static async getTools(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: [] }
  }

  static async getToolDetail(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: null }
  }

  static async createTool(ctx: Context) {
    ctx.body = { code: 0, message: '工具已上架', data: null }
  }

  static async subscribe(ctx: Context) {
    ctx.body = { code: 0, message: '订阅成功', data: null }
  }

  static async getSubscriptions(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: [] }
  }

  static async createReview(ctx: Context) {
    ctx.body = { code: 0, message: '评价成功', data: null }
  }
}

export class CustomMallController {
  static async getRequirements(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: [] }
  }

  static async getRequirementDetail(ctx: Context) {
    ctx.body = { code: 0, message: 'success', data: null }
  }

  static async createRequirement(ctx: Context) {
    ctx.body = { code: 0, message: '需求发布成功', data: null }
  }

  static async createBid(ctx: Context) {
    ctx.body = { code: 0, message: '竞标成功', data: null }
  }

  static async selectBid(ctx: Context) {
    ctx.body = { code: 0, message: '竞标已选中', data: null }
  }

  static async createArbitration(ctx: Context) {
    ctx.body = { code: 0, message: '仲裁已提交', data: null }
  }
}