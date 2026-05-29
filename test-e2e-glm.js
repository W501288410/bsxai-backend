/**
 * API Mall 端到端测试 v2：GLM-4 全链路
 * 种子管理员 → 建渠道 → 建商品 → 真实注册用户 → 购买 → 调用 → 拿 GLM-4 回复
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })

const BASE = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:8001'
let adminToken = ''
let userToken = ''
let channelId = 0
let productId = 0

function log(step, msg) { console.log(`\n  [${step}] ${msg}`) }
function ok(msg) { console.log(`    ✅ ${msg}`) }
function fail(msg) { console.log(`    ❌ ${msg}`); process.exit(1) }

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  const resp = await fetch(`${BASE}${path}`, opts)
  const text = await resp.text()
  let json = {}
  try { json = JSON.parse(text) } catch {}
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`)
  return json
}

;(async () => {
  // ===== 1. 种子管理员（直接写 SQLite）=====
  log('准备', '创建管理员种子数据...')
  const Database = require('better-sqlite3')
  const path = require('path')
  const dbPath = path.resolve(__dirname, 'data', 'ai_platform.sqlite')
  const sqlite = new Database(dbPath)
  sqlite.pragma('foreign_keys = OFF')

  // 清理所有测试相关数据
  sqlite.prepare("DELETE FROM api_call_logs").run()
  sqlite.prepare("DELETE FROM api_orders").run()
  sqlite.prepare("DELETE FROM api_products").run()
  sqlite.prepare("DELETE FROM provider_channels").run()
  sqlite.prepare("DELETE FROM user_tokens").run()
  sqlite.prepare("DELETE FROM accounts").run()
  sqlite.prepare("DELETE FROM users").run()

  // 管理员
  const bcrypt = require('bcryptjs')
  const adminPw = bcrypt.hashSync('admin123', 10)
  const adminResult = sqlite.prepare(
    `INSERT INTO users (phone, password, nickname, user_type, status) VALUES (?, ?, ?, ?, ?)`
  ).run('admin_god', adminPw, '管理员', 3, 1)
  const adminId = adminResult.lastInsertRowid
  sqlite.prepare(`INSERT INTO accounts (user_id, balance, frozen_balance) VALUES (?, ?, ?)`).run(adminId, 999999, 0)

  // 普通用户（真实 bcrypt，可登录）
  const userPw = bcrypt.hashSync('test123', 10)
  const userResult = sqlite.prepare(
    `INSERT INTO users (phone, password, nickname, user_type, status) VALUES (?, ?, ?, ?, ?)`
  ).run('13800000001', userPw, '测试用户', 1, 1)
  const userId = userResult.lastInsertRowid
  sqlite.prepare(`INSERT INTO accounts (user_id, balance, frozen_balance) VALUES (?, ?, ?)`).run(userId, 10000, 0)
  sqlite.close()
  ok(`种子数据就绪: admin_god/3 + 13800000001 (余额10000)`)

  // ===== 2. 管理员登录 =====
  log('认证', '管理员登录...')
  const adminLogin = await api('POST', '/api/auth/login', {
    body: { phone: 'admin_god', password: 'admin123' }
  })
  adminToken = adminLogin.data.token
  ok('管理员 token 获取成功')

  // ===== 3. 用户直接登录（种子已创建）=====
  log('认证', '用户登录...')
  const userLogin = await api('POST', '/api/auth/login', {
    body: { phone: '13800000001', password: 'test123' }
  })
  userToken = userLogin.data.token
  ok('用户 token 获取成功')

  // 验证 token
  const info = await api('GET', '/api/user/info', { token: userToken })
  ok(`用户信息验证通过: id=${info.data.id}, phone=${info.data.phone}`)

  // ===== 4. 管理员创建 GLM 渠道 =====
  log('渠道', '管理员创建 GLM-4 渠道...')
  const chResp = await api('POST', '/api/admin/provider-channels', {
    token: adminToken,
    body: {
      name: '智谱 GLM-4 (测试)',
      provider_key: 'glm',
      api_base_url: 'https://open.bigmodel.cn/api/paas/v4',
      api_key: process.env.GLM_API_KEY || '',
      model_name: 'glm-4-flash',
      models: ['glm-4-flash', 'glm-4-plus'],
      pricing_input: 0.5, pricing_output: 0.5,
    }
  })
  channelId = chResp.data.id
  ok(`渠道创建成功, id=${channelId}`)

  // ===== 5. 管理员创建 API 商品 =====
  log('商品', '管理员创建 API 商品...')
  const prodResp = await api('POST', '/api/admin/products', {
    token: adminToken,
    body: {
      name: '智谱 GLM-4 Flash (测试)',
      description: '端到端测试商品',
      category: 'LLM',
      apiEndpoint: 'chat',
      apiMethod: 'POST',
      pricingModel: 1, price: 0.01, rateLimit: 100,
      channelId: channelId,
    }
  })
  productId = prodResp.data.id
  ok(`商品创建成功, id=${productId}`)

  // ===== 6. 用户购买 API =====
  log('购买', '用户购买 API...')
  const buyResp = await api('POST', '/api/api-mall/orders', {
    token: userToken,
    body: { productId, pricingModel: 1, quantity: 100 }
  })
  ok(`购买成功, orderNo=${buyResp.data.orderNo}, 金额=¥${buyResp.data.amount}`)

  // ===== 7. 用户调用 API =====
  log('调用', '调用 GLM-4 Flash...')
  const t0 = Date.now()
  const callResp = await api('POST', `/api/api-mall/call/${productId}`, {
    token: userToken,
    body: {
      messages: [{ role: 'user', content: '用一句中文介绍上海。' }],
      max_tokens: 100, temperature: 0.7,
    }
  })
  const elapsed = Date.now() - t0
  const content = callResp.data.response?.content || ''
  ok(`调用成功 (${elapsed}ms)`)

  console.log(`\n  🔮 GLM-4 回复:`)
  console.log(`  "${content}"`)
  if (callResp.data.response?.usage) {
    const u = callResp.data.response.usage
    console.log(`  📊 用量: prompt=${u.promptTokens} completion=${u.completionTokens} total=${u.totalTokens}`)
  }

  console.log('\n═══════════════════════════════')
  console.log('🎉 全链路通过！GLM-4 接入完整版')
  console.log('═══════════════════════════════')

})().catch(err => {
  console.error(`\n💥 失败: ${err.message}`)
  process.exit(1)
})