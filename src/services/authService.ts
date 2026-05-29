import { dbPool } from '../config'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { JWT_CONFIG } from '../config'
import { CodeError } from '../utils/errors'

export class AuthService {
  static async register(phone: string, password: string) {
    // 检查手机号是否已注册
    const [rows]: any = await dbPool.execute(
      'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL', [phone]
    )
    if (rows.length > 0) throw new CodeError('该手机号已注册', 400)

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10)

    // 创建用户
    const [result]: any = await dbPool.execute(
      'INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)',
      [phone, hashedPassword, `用户${phone.slice(-4)}`]
    )

    // 创建账户
    await dbPool.execute('INSERT INTO accounts (user_id) VALUES (?)', [result.insertId])

    // 生成 Token
    const token = jwt.sign({ id: result.insertId }, JWT_CONFIG.secret, {
      expiresIn: JWT_CONFIG.expiresIn
    } as jwt.SignOptions)

    return { token, user: { id: result.insertId, phone } }
  }

  static async login(phone: string, password: string) {
    const [rows]: any = await dbPool.execute(
      'SELECT id, phone, password, nickname, status FROM users WHERE phone = ? AND deleted_at IS NULL',
      [phone]
    )
    if (rows.length === 0) throw new CodeError('手机号未注册', 400)

    const user = rows[0]
    if (user.status === 2) throw new CodeError('账号已被冻结', 403)
    if (user.status === 3) throw new CodeError('账号已被封禁', 403)

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) throw new CodeError('密码错误', 400)

    const token = jwt.sign({ id: user.id }, JWT_CONFIG.secret, {
      expiresIn: JWT_CONFIG.expiresIn
    } as jwt.SignOptions)

    return { token, user: { id: user.id, phone: user.phone, nickname: user.nickname } }
  }

  static async sendSmsCode(phone: string) {
    // TODO: 集成短信服务商（阿里云/腾讯云）
    // 开发环境直接返回成功
    console.log(`[短信] 发送验证码到 ${phone}`)
    return true
  }
}