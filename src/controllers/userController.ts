import { type Context } from 'koa'
import { UserService } from '../services/userService'
import { CodeError } from '../utils/errors'

export class UserController {
  static async getInfo(ctx: Context) {
    const userId = ctx.state.user.id
    const [user, account] = await Promise.all([
      UserService.getUserInfo(userId),
      UserService.getBalance(userId).catch(() => null) // 若无账户则跳过
    ])
    ctx.body = { code: 0, message: 'success', data: { ...user, account } }
  }

  static async updateProfile(ctx: Context) {
    const userId = ctx.state.user.id
    const result = await UserService.updateProfile(userId, ctx.request.body as any)
    ctx.body = { code: 0, message: '更新成功', data: result }
  }

  static async verifyRealName(ctx: Context) {
    const userId = ctx.state.user.id
    const { realName, idCard, idCardFront, idCardBack } = ctx.request.body as any
    if (!realName || !idCard) throw new CodeError('姓名和身份证号不能为空', 400)
    const result = await UserService.verifyRealName(userId, { realName, idCard, idCardFront, idCardBack })
    ctx.body = { code: 0, message: '实名认证成功', data: result }
  }

  static async upgradeToDeveloper(ctx: Context) {
    const userId = ctx.state.user.id
    const result = await UserService.upgradeToDeveloper(userId)
    ctx.body = { code: 0, message: '已升级为开发者', data: result }
  }

  static async getBalance(ctx: Context) {
    const userId = ctx.state.user.id
    const balance = await UserService.getBalance(userId)
    ctx.body = { code: 0, message: 'success', data: balance }
  }

  static async recharge(ctx: Context) {
    const userId = ctx.state.user.id
    const { amount, paymentMethod } = ctx.request.body as any
    if (!amount || amount <= 0) throw new CodeError('充值金额无效', 400)
    const order = await UserService.createRechargeOrder(userId, amount, paymentMethod)
    ctx.body = { code: 0, message: '充值成功', data: order }
  }

  static async getTransactions(ctx: Context) {
    const userId = ctx.state.user.id
    const { page = 1, pageSize = 20 } = ctx.query
    const result = await UserService.getTransactions(userId, +page, +pageSize)
    ctx.body = { code: 0, message: 'success', data: result }
  }
}