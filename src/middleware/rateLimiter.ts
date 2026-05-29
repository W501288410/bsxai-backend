// 生产环境限流中间件 — 内存存储，不依赖 Redis
// 参考 koa2-ratelimit API

interface RateEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateEntry>()

// 每分钟清理过期条目
const CLEANUP_INTERVAL = 60_000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function startCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }, CLEANUP_INTERVAL)
}

export interface RateLimitOptions {
  windowMs?: number  // 时间窗口（毫秒），默认 1 分钟
  max?: number       // 最大请求数，默认 60
  keyPrefix?: string
}

export function rateLimiter(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs || 60_000
  const max = opts.max || 60
  const prefix = opts.keyPrefix || 'global'

  startCleanup()

  return async (ctx: any, next: any) => {
    const key = `${prefix}:${ctx.ip || ctx.request.ip || 'unknown'}`
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count++

    // 设置响应头
    ctx.set('X-RateLimit-Limit', String(max))
    ctx.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)))
    ctx.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > max) {
      ctx.status = 429
      ctx.body = { code: 429, message: '请求过于频繁，请稍后重试' }
      return
    }

    await next()
  }
}
