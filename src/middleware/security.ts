import { type Context, Next } from 'koa'
import { RiskControlService } from '../services/riskControlService'
import { CodeError } from '../utils/errors'
import jwt from 'jsonwebtoken'
import { redis, JWT_CONFIG } from '../config'

/** JWT 黑名单检查 - Phase 4 */
const jwtBlacklistKey = (token: string) => `jwt:blacklist:${token.slice(-20)}`

export function addToJwtBlacklist(token: string, exp?: number) {
  const ttl = exp ? Math.max(exp - Math.floor(Date.now() / 1000), 1) : 86400
  redis.setEx(jwtBlacklistKey(token), ttl, '1').catch(() => {})
}

export async function jwtBlacklistMiddleware(ctx: Context, next: Next) {
  const authHeader = ctx.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const exists = await redis.get(jwtBlacklistKey(token))
    if (exists) throw new CodeError('令牌已失效', 401)
  }
  await next()
}

/**
 * 管理员权限中间件
 */
export async function adminAuth(ctx: Context, next: Next) {
  if (!ctx.state.user) throw new CodeError('未登录', 401)
  if (ctx.state.user.userType < 3) throw new CodeError('无管理员权限', 403)
  await next()
}

/**
 * 开发者权限中间件
 */
export async function developerAuth(ctx: Context, next: Next) {
  if (!ctx.state.user) throw new CodeError('未登录', 401)
  if (ctx.state.user.userType < 2) throw new CodeError('需要先升级为开发者', 403)
  await next()
}

/**
 * IP 请求限流中间件
 */
export async function rateLimiter(ctx: Context, next: Next) {
  const ip = ctx.ip || ctx.request.ip || '127.0.0.1'
  const blacklisted = await RiskControlService.isBlacklisted(ip)
  if (blacklisted) { ctx.status = 403; ctx.body = { code: 403, message: 'IP已被限制访问' }; return }
  const ok = await RiskControlService.checkRequestRate(ip, 300, 60000)
  if (!ok) { ctx.status = 429; ctx.body = { code: 429, message: '请求过于频繁' }; return }
  await next()
}

/**
 * 内容安全检查中间件（针对 POST/PUT 接口）
 */
export async function contentFilter(ctx: Context, next: Next) {
  await next()
  setImmediate(async () => {
    try {
      if (ctx.request.body && typeof ctx.request.body === 'object') {
        const text = JSON.stringify(ctx.request.body)
        if (text.length > 10) {
          const { pass, blockedWords } = await RiskControlService.checkContent(text)
          if (!pass) {
            const { dbPool } = await import('../config')
            await dbPool.execute(
              'INSERT INTO operation_logs (admin_id, action, target, detail) VALUES (0, ?, ?, ?)',
              ['fraud_alert', 'content', `blocked:${blockedWords.join(',')} path:${ctx.path}`]
            )
          }
        }
      }
    } catch { /* 静默 */ }
  })
}

/**
 * XSS 防护中间件
 */
export async function xssProtection(ctx: Context, next: Next) {
  ctx.set('X-XSS-Protection', '1; mode=block')
  ctx.set('X-Content-Type-Options', 'nosniff')
  ctx.set('X-Frame-Options', 'DENY')
  ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  ctx.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  ctx.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https:; font-src 'self' https://unpkg.com")
  await next()
}

/**
 * 审计日志中间件
 */
export async function auditLog(ctx: Context, next: Next) {
  const start = Date.now()
  await next()
  const duration = Date.now() - start
  if (ctx.path.startsWith('/admin/')) {
    const { dbPool } = await import('../config')
    await dbPool.execute(
      'INSERT INTO operation_logs (admin_id, action, target, detail) VALUES (?, ?, ?, ?)',
      [ctx.state.user?.id || 0, ctx.method, ctx.path, `status:${ctx.status} duration:${duration}ms`]
    ).catch(() => {})
  }
}

/**
 * Phase 4: 数据脱敏工具
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

export function maskIdCard(idCard: string): string {
  if (!idCard || idCard.length < 8) return idCard
  return idCard.slice(0, 6) + '********' + idCard.slice(-4)
}

export function maskBankCard(card: string): string {
  if (!card || card.length < 8) return card
  return '****' + card.slice(-4)
}

/**
 * Phase 4: SQL 注入基础防护（参数化查询已覆盖，此为额外 XSS 输入清洗）
 */
export function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/['";()]/g, '')
}
