const Koa = require("koa")
const koaBody = require("koa-bodyparser")
const app = new Koa()

app.use(koaBody({ enableTypes: ["json"] }))

app.use(async (ctx, next) => {
  console.log("REQ:", ctx.method, ctx.path, "body:", JSON.stringify(ctx.request.body))
  if (ctx.path === "/health") {
    ctx.body = { ok: true }
    return
  }
  if (ctx.path === "/api/auth/register" && ctx.method === "POST") {
    ctx.body = { code: 0, data: ctx.request.body }
    return
  }
  await next()
})

app.listen(8003, () => console.log("minimal on :8003"))
