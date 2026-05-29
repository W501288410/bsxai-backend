require('dotenv').config()

/**
 * 后端入口 - v5
 * ✅ 修复：koa-bodyparser (require)
 * ✅ 修复：errorHandler 中间件
 * ✅ Health 在 JWT 之前
 */
import Koa from 'koa'
import cors from 'koa-cors'

const koaBody = require('koa-bodyparser')

import {
  authRoutes,
  userRoutes,
  apiMallRoutes,
  toolMallRoutes,
  customMallRoutes,
  distributionRoutes,
  adminRoutes
} from './routes'

import { errorHandler } from './middleware/errorHandler'
import { rateLimiter } from './middleware/rateLimiter'
import { initProviders } from './lib/providers'
import { JWT_CONFIG, MOCK_MODE, getDB } from './config'

const app = new Koa()

// 1. 错误处理 + 请求日志（最外层）
app.use(errorHandler)
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  const len = (ctx.response.length || 0)
  console.log(`[${new Date().toISOString()}] ${ctx.method} ${ctx.path} → ${ctx.status} ${ms}ms ${len}b`)
})

// 2. 全局限流：60 次/分钟/IP（非生产可调大）
app.use(rateLimiter({ windowMs: 60_000, max: 60, keyPrefix: 'global' }))

// 3. CORS + BodyParser
app.use(cors({ origin: '*' }))
app.use(koaBody({ enableTypes: ['json'], jsonLimit: '10mb' }))

// 4. Health + Public APIs（在 JWT 之前）
app.use(async (ctx, next) => {
  const p = ctx.path
  if (p === '/health' || p === '/api/health') {
    ctx.status = 200
    ctx.body = { status: 'ok', ts: new Date().toISOString() }
    return
  }
  // 公开的查询接口（无需登录）
  const PUBLIC_METHODS = ['GET']
  const PUBLIC_ROUTES = ['/api/api-mall/products', '/api/tool-mall', '/api/custom-mall']
  const method = ctx.method.toUpperCase()
  for (const prefix of PUBLIC_ROUTES) {
    if (p.startsWith(prefix) && PUBLIC_METHODS.includes(method)) {
      ;(ctx as any)._isPublicRoute = true
      return next()
    }
  }
  await next()
})

// 5. 认证接口限流：20 次/分钟/IP（防暴力破解，仅对 auth/register/login）
const authLimiter = rateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'auth' })
app.use(async (ctx, next) => {
  if (['/api/auth/login', '/api/auth/register'].includes(ctx.path)) {
    return authLimiter(ctx, next)
  }
  await next()
})

// 6. JWT（排除公开路径）
const PUBLIC_PREFIXES = ['/api/auth', '/api/public', '/health']

app.use(async (ctx, next) => {
  if ((ctx as any)._isPublicRoute) return next()
  for (const prefix of PUBLIC_PREFIXES) {
    if (ctx.path.startsWith(prefix)) return next()
  }
  const jwt = require('koa-jwt')
  const jwtMw = jwt({ secret: JWT_CONFIG.secret, passthrough: true })
  await jwtMw(ctx, async () => {
    if (!ctx.state.user) {
      ctx.status = 401
      ctx.body = { code: 401, message: '未授权' }
      return
    }
    await next()
  })
})

// 7. 路由
const routers = [
  authRoutes, userRoutes, apiMallRoutes,
  toolMallRoutes, customMallRoutes, distributionRoutes, adminRoutes
]
for (const r of routers) {
  app.use(r.routes()).use(r.allowedMethods())
}

// 8. 404
app.use(async (ctx) => {
  ctx.status = 404
  ctx.body = { code: 404, message: `路径不存在: ${ctx.path}` }
})

// 9. 启动 + 优雅关闭
const PORT = parseInt(process.env.PORT || '8001')

async function bootstrap() {
  await getDB().catch(() => {})
  console.log(`MOCK_MODE = ${MOCK_MODE}`)
  initProviders()

  const server = app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`)
  })

  // 优雅关闭
  let shuttingDown = false
  async function shutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[shutdown] Received ${signal}, closing gracefully...`)
    server.close(() => {
      console.log('[shutdown] HTTP server closed')
      process.exit(0)
    })
    // 5 秒超时强制退出
    setTimeout(() => {
      console.log('[shutdown] Timeout, force exit')
      process.exit(1)
    }, 5000)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

bootstrap()

export default app
