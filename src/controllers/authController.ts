import { type Context } from 'koa'
import { AuthService } from '../services/authService'
import { UserService } from '../services/userService'
import { CodeError } from '../utils/errors'
import { MOCK_MODE, DB_TYPE } from '../config'

export class AuthController {
  static async register(ctx: Context) {
    const { phone, password, code } = ctx.request.body as any
    if (!phone || !password) throw new CodeError('手机号和密码不能为空', 400)
    // Mock 或 SQLite 模式下跳过短信验证（非生产 MySQL）
    const isDev = MOCK_MODE || DB_TYPE !== 'mysql'
    if (!isDev) {
      if (!code) throw new CodeError('请输入短信验证码', 400)
      const isValid = await UserService.verifySmsCode(phone, code)
      if (!isValid) throw new CodeError('验证码错误或已过期', 400)
    }
    const result = await AuthService.register(phone, password)
    ctx.body = { code: 0, message: '注册成功', data: result }
  }

  static async login(ctx: Context) {
    const { phone, password } = ctx.request.body as any
    if (!phone || !password) throw new CodeError('手机号和密码不能为空', 400)
    const result = await AuthService.login(phone, password)
    ctx.body = { code: 0, message: '登录成功', data: result }
  }

  static async sendSms(ctx: Context) {
    const { phone } = ctx.request.body as any
    if (!phone) throw new CodeError('手机号不能为空', 400)
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new CodeError('手机号格式不正确', 400)
    await UserService.sendSmsCode(phone)
    ctx.body = { code: 0, message: '验证码已发送', data: null }
  }
}