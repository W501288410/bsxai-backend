// Global type augmentations for Koa
import 'koa'

declare module 'koa' {
  interface Request {
    body: any
    query: Record<string, string>
  }
}
