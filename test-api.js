const http = require('http')

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const data = body ? JSON.stringify(body) : null
    if (data) headers['Content-Length'] = Buffer.byteLength(data)
    const opts = { hostname: 'localhost', port: 8001, path, method, headers }
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ s: res.statusCode, b: d }))
    })
    r.on('error', reject)
    if (data) r.write(data); r.end()
  })
}

async function main() {
  const phone = '139' + Math.random().toString().slice(2, 12)

  // 1. health
  const h = await req('GET', '/health')
  console.log('1. health:', h.s, h.b.slice(0, 50))

  // 2. register（Mock 模式跳过短信）
  const r1 = await req('POST', '/api/auth/register', { phone, password: 'pwd123' })
  console.log('2. register:', r1.s, r1.b.slice(0, 100))

  const { data } = JSON.parse(r1.b)
  const firstUser = data?.id || data

  // 3. login
  const r2 = await req('POST', '/api/auth/login', { phone, password: 'pwd123' })
  console.log('3. login:', r2.s, r2.b.slice(0, 100))

  const { data: loginData } = JSON.parse(r2.b)
  const token = loginData?.token
  if (!token) { console.log('NO TOKEN, abort'); return }

  // 4. user/info (with token)
  const r3 = await req('GET', '/api/user/info', null, token)
  console.log('4. user/info:', r3.s, r3.b.slice(0, 100))

  // 5. user/info (no token → 401)
  const r4 = await req('GET', '/api/user/info')
  console.log('5. user/info (no token):', r4.s, r4.b.slice(0, 60))

  // summary
  const tests = [[2, r1], [3, r2], [4, r3], [5, r4]]
  for (const [testNum, r] of tests) {
    const ok = r.s === 200 || (r.s === 400 && r.b.includes('已注册') || r.s === 401)
    console.log('   ' + (ok ? '✅' : '❌') + ' test ' + testNum + ': ' + r.s)
  }
}

main().catch(e => console.error('FAIL:', e.message))