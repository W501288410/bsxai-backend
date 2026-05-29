/**
 * Provider 直连测试 — 绕过 API Mall 购买流程，直接验证大模型调用
 * 用法: node test-provider.js [qwen|hunyuan|glm|all]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })

// 加载编译后的模块
const { initProviders, getProvider } = require('./dist/lib/providers')

// 初始化
initProviders()

const providers = ['qwen', 'hunyuan', 'glm']
const target = (process.argv[2] || 'all').toLowerCase()

const testMessage = '你好，请用一句话介绍你自己。'

async function testProvider(key) {
  const provider = getProvider(key)
  if (!provider) {
    console.log(`\n❌ ${key}: Provider 未注册`)
    return
  }
  
  console.log(`\n🧪 测试 ${provider.name} (${key})...`)
  console.log(`   Model: ${provider.defaultModel}`)
  console.log(`   URL: ${provider.apiBaseUrl}`)
  console.log(`   Message: "${testMessage}"`)
  
  try {
    const t0 = Date.now()
    const resp = await provider.chat({
      model: provider.defaultModel,
      messages: [{ role: 'user', content: testMessage }],
      maxTokens: 100,
      temperature: 0.7,
    })
    const elapsed = Date.now() - t0
    
    console.log(`   ✅ 成功! (${elapsed}ms)`)
    console.log(`   回复: ${resp.content.slice(0, 200)}`)
    if (resp.usage) console.log(`   用量:`, resp.usage)
  } catch (err) {
    console.log(`   ❌ 失败: ${err.message}`)
  }
}

(async () => {
  if (target === 'all') {
    for (const key of providers) {
      await testProvider(key)
    }
  } else if (providers.includes(target)) {
    await testProvider(target)
  } else {
    console.log(`用法: node test-provider.js [qwen|hunyuan|glm|all]`)
    process.exit(1)
  }
  console.log('\n--- 测试完成 ---')
})()
