import { type Context, type Next } from 'koa'
import { logger } from '../utils/logger'

export async function errorHandler(ctx: Context, next: Next) {
  try {
    await next()
  } catch (err: any) {
    logger.error('请求错误', {
      method: ctx.method,
      url: ctx.url,
      error: err.message,
      stack: err.stack,
      ip: ctx.ip
    })

    const status = err.status || 500
    const message = status === 500 ? '服务器内部错误' : err.message

    ctx.status = status
    ctx.body = {
      code: status,
      message,
      data: null
    }
  }
}
