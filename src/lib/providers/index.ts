/**
 * Provider 注册表
 * 管理所有大模型厂商适配器，提供统一路由
 */
import { BaseProvider } from './base'
import { OpenAICompatProvider } from './openai-compat'
import { type ProviderConfig, type ChatRequest, type ChatResponse, type StreamCallbacks } from './types'

/** 所有已注册的 Provider 实例 */
const registry = new Map<string, BaseProvider>()

/**
 * 注册一个 Provider
 */
export function registerProvider(config: ProviderConfig): BaseProvider {
  const provider = new OpenAICompatProvider(config)
  registry.set(config.key, provider)
  console.log(`[Provider] 注册成功: ${config.name} (${config.key})`)
  return provider
}

/**
 * 获取指定 Provider
 */
export function getProvider(key: string): BaseProvider | undefined {
  return registry.get(key)
}

/**
 * 获取所有已注册的 Provider
 */
export function listProviders(): { key: string; name: string; models: string[]; healthy: boolean }[] {
  return Array.from(registry.values()).map(p => ({
    key: p.key,
    name: p.name,
    models: p.models,
    healthy: true,  // 懒检测，首次调用时检查
  }))
}

/**
 * 根据 Provider 和模型调用
 */
export async function callProvider(
  providerKey: string,
  request: ChatRequest,
  options?: { stream?: boolean; callbacks?: StreamCallbacks }
): Promise<ChatResponse> {
  const provider = registry.get(providerKey)
  if (!provider) throw new Error(`Provider '${providerKey}' 未注册`)

  if (options?.stream && options?.callbacks) {
    await provider.chatStream(request, options.callbacks)
    return { content: '', model: request.model }
  }

  return provider.chat(request)
}

/**
 * 健康检查所有 Provider
 */
export async function healthCheckAll(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {}
  for (const [key, provider] of registry) {
    results[key] = await provider.healthCheck()
  }
  return results
}

/**
 * 一行初始化：注册所有预设 Provider
 * API Key 从环境变量读取，开发阶段也可从 system_configs 表读取
 */
export function initProviders(envKeys?: Record<string, string>) {
  const configs: ProviderConfig[] = [
    {
      name: '阿里 Qwen',
      key: 'qwen',
      apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: envKeys?.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || '',
      defaultModel: 'qwen-plus',
      models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-72b-instruct'],
      pricing: { input: 0.002, output: 0.006 },
    },
    {
      name: '字节 Doubao',
      key: 'doubao',
      apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: envKeys?.DOUBAO_API_KEY || process.env.DOUBAO_API_KEY || '',
      defaultModel: 'ep-20250101000000-xxxxx',  // 需替换为实际 endpoint ID
      models: ['doubao-pro-32k', 'doubao-lite-32k', 'doubao-pro-128k'],
      pricing: { input: 0.0008, output: 0.002 },
    },
    {
      name: '腾讯 Hunyuan',
      key: 'hunyuan',
      apiBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
      apiKey: envKeys?.HUNYUAN_API_KEY || process.env.HUNYUAN_API_KEY || '',
      defaultModel: 'hunyuan-pro',
      models: ['hunyuan-pro', 'hunyuan-lite', 'hunyuan-standard'],
      pricing: { input: 0.001, output: 0.003 },
    },
    {
      name: '智谱 GLM-4',
      key: 'glm',
      apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: envKeys?.GLM_API_KEY || process.env.GLM_API_KEY || '',
      defaultModel: 'glm-4-flash',
      models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
      pricing: { input: 0.001, output: 0.003 },
    },
  ]

  for (const config of configs) {
    if (config.apiKey) {
      registerProvider(config)
    } else {
      console.log(`[Provider] 跳过 ${config.name}: API Key 未配置`)
    }
  }

  console.log(`[Provider] 初始化完成，已注册 ${registry.size} 个 Provider`)
}
