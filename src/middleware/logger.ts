import { type Context, type Next } from 'koa'
import { logger } from '../utils/logger'

export function requestLogger() {
  return async (ctx: Context, next: Next) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    const message = `${ctx.method} ${ctx.url} ${ctx.status} ${ms}ms`
    if (ctx.status >= 400) {
      logger.warn(message)
    } else {
      logger.info(message)
    }
  }
}