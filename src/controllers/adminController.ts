import { type Context } from 'koa'
import { AdminService } from '../services/adminService'
import { CodeError } from '../utils/errors'

export class AdminController {
  /* 数据看板 */
  static async getDashboard(ctx: Context) {
    const data = await AdminService.getDashboard()
    ctx.body = { code: 0, data }
  }
  static async getRevenueTrend(ctx: Context) {
    const days = +(ctx.query.days || 30)
    const data = await AdminService.getRevenueTrend(days)
    ctx.body = { code: 0, data }
  }
  static async getOrderTrend(ctx: Context) {
    const days = +(ctx.query.days || 30)
    const data = await AdminService.getOrderTrend(days)
    ctx.body = { code: 0, data }
  }

  /* 用户管理 */
  static async getUsers(ctx: Context) {
    const { page, pageSize, keyword, status } = ctx.query
    const data = await AdminService.getUsers({
      page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20,
      keyword: keyword as string, status: status ? +status : undefined
    })
    ctx.body = { code: 0, data }
  }
  static async updateUserStatus(ctx: Context) {
    const { id } = ctx.params
    const { status } = ctx.request.body as any
    if (![1, 2, 3].includes(status)) throw new CodeError('无效的状态值', 400)
    await AdminService.updateUserStatus(+id, status)
    await AdminService.logOperation(ctx.state.user.id, 'update_user_status', `user_${id}`, `status->${status}`)
    ctx.body = { code: 0, message: '状态已更新' }
  }

  /* API 商品管理 */
  static async getProducts(ctx: Context) {
    const { page, pageSize, status } = ctx.query
    const data = await AdminService.getProducts({ page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20, status: status ? +status : undefined })
    ctx.body = { code: 0, data }
  }
  static async createProduct(ctx: Context) {
    const result = await AdminService.createProduct(ctx.request.body)
    ctx.body = { code: 0, message: '商品已创建', data: result }
  }
  static async updateProduct(ctx: Context) {
    await AdminService.updateProduct(+(ctx.params as any).id, ctx.request.body)
    ctx.body = { code: 0, message: '商品已更新' }
  }
  static async updateProductStatus(ctx: Context) {
    const { id } = ctx.params
    const { status } = ctx.request.body as any
    await AdminService.updateProductStatus(+id, status)
    ctx.body = { code: 0, message: '状态已更新' }
  }

  /* AI 工具审核 */
  static async getTools(ctx: Context) {
    const { page, pageSize, status } = ctx.query
    const data = await AdminService.getTools({ page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20, status: status ? +status : undefined })
    ctx.body = { code: 0, data }
  }
  static async approveTool(ctx: Context) {
    await AdminService.approveTool(+(ctx.params as any).id)
    await AdminService.logOperation(ctx.state.user.id, 'approve_tool', `tool_${(ctx.params as any).id}`)
    ctx.body = { code: 0, message: '已通过审核' }
  }
  static async rejectTool(ctx: Context) {
    await AdminService.rejectTool(+(ctx.params as any).id)
    await AdminService.logOperation(ctx.state.user.id, 'reject_tool', `tool_${(ctx.params as any).id}`)
    ctx.body = { code: 0, message: '已拒绝' }
  }

  /* 需求管理 */
  static async getRequirements(ctx: Context) {
    const { page, pageSize, status } = ctx.query
    const data = await AdminService.getRequirements({ page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20, status: status ? +status : undefined })
    ctx.body = { code: 0, data }
  }
  static async cancelRequirement(ctx: Context) {
    const { id } = ctx.params
    const { reason } = ctx.request.body as any
    await AdminService.cancelRequirement(+id, reason || '管理员取消')
    await AdminService.logOperation(ctx.state.user.id, 'cancel_requirement', `req_${id}`, reason)
    ctx.body = { code: 0, message: '需求已取消，资金已解冻' }
  }

  /* 操作日志 */
  static async getLogs(ctx: Context) {
    const { page, pageSize } = ctx.query
    const data = await AdminService.getOperationLogs({ page: page ? +page : 1, pageSize: pageSize ? +pageSize : 30 })
    ctx.body = { code: 0, data }
  }

  // ========== Phase 4: 提现审核 ==========
  static async getWithdrawals(ctx: Context) {
    const { page, pageSize, status } = ctx.query
    const data = await AdminService.getWithdrawals({ page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20, status: status ? +status : undefined })
    ctx.body = { code: 0, data }
  }
  static async approveWithdrawal(ctx: Context) {
    const { id } = ctx.params
    await AdminService.approveWithdrawal(+id, ctx.state.user.id)
    await AdminService.logOperation(ctx.state.user.id, 'approve_withdrawal', `withdrawal_${id}`)
    ctx.body = { code: 0, message: '提现已通过' }
  }
  static async rejectWithdrawal(ctx: Context) {
    const { id } = ctx.params
    const { reason } = ctx.request.body as any || {}
    await AdminService.rejectWithdrawal(+id, reason || '审核不通过', ctx.state.user.id)
    await AdminService.logOperation(ctx.state.user.id, 'reject_withdrawal', `withdrawal_${id}`, reason)
    ctx.body = { code: 0, message: '提现已拒绝' }
  }

  // ========== Phase 4: 佣金结算 ==========
  static async getSettlementList(ctx: Context) {
    const { page, pageSize } = ctx.query
    const data = await AdminService.getSettlementList({ page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20 })
    ctx.body = { code: 0, data }
  }
  static async processBatchCommission(ctx: Context) {
    const { userId, amount } = ctx.request.body as any
    if (!userId || !amount) throw new CodeError('缺少参数', 400)
    await AdminService.processBatchCommission(userId, amount)
    await AdminService.logOperation(ctx.state.user.id, 'commission_settle', `user_${userId}`, `amount:${amount}`)
    ctx.body = { code: 0, message: '佣金结算成功' }
  }

  // ========== Phase 4: 风控事件 ==========
  static async getRiskEvents(ctx: Context) {
    const { page, pageSize, type } = ctx.query
    const data = await AdminService.getRiskEvents({ page: page ? +page : 1, pageSize: pageSize ? +pageSize : 20, type: type as string })
    ctx.body = { code: 0, data }
  }
}