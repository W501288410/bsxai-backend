/**
 * Provider Service - 模型调用服务层
 * 封装 Provider 调用、计费统计、结果缓存
 */
import { dbPool } from '../config'
import { logger } from '../utils/logger'
import { CodeError } from '../utils/errors'
import { callProvider, getProvider } from '../lib/providers'
import { type ChatRequest, type ChatResponse } from '../lib/providers/types'

export class ProviderService {
  /**
   * 调用大模型（完整流程）
   * @param providerKey - 厂商标识: qwen/doubao/hunyuan/glm
   * @param model - 具体模型名
   * @param messages - 对话消息
   * @param options - 参数: temperature/maxTokens/stream
   */
  static async chat(
    providerKey: string,
    model: string,
    messages: ChatRequest['messages'],
    options?: {
      temperature?: number
      maxTokens?: number
      topP?: number
    }
  ): Promise<ChatResponse> {
    const provider = getProvider(providerKey)
    if (!provider) throw new CodeError(`模型提供商 '${providerKey}' 未配置`, 503)

    const request: ChatRequest = {
      model,
      messages,
      ...options,
    }

    const startTime = Date.now()
    try {
      const response = await callProvider(providerKey, request)
      const elapsed = Date.now() - startTime

      // 记录调用日志（可选，已有 apiMallService 记录）
      logger.info('模型调用成功', {
        provider: providerKey, model: request.model,
        elapsed, tokens: response.usage?.totalTokens
      })

      return response
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      logger.error('模型调用失败', {
        provider: providerKey, model: request.model,
        elapsed, error: err.message
      })
      throw new CodeError(`模型调用失败: ${err.message}`, 502)
    }
  }

  /**
   * 流式调用大模型（SSE 兼容）
   */
  static async chatStream(
    providerKey: string,
    model: string,
    messages: ChatRequest['messages'],
    onToken: (token: string) => void,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<ChatResponse> {
    const provider = getProvider(providerKey)
    if (!provider) throw new CodeError(`模型提供商 '${providerKey}' 未配置`, 503)

    const request: ChatRequest = {
      model,
      messages,
      ...options,
    }

    let fullContent = ''
    let finalResponse: ChatResponse = { content: '', model }

    return new Promise((resolve, reject) => {
      callProvider(providerKey, request, {
        stream: true,
        callbacks: {
          onToken(token) {
            fullContent += token
            onToken(token)
          },
          onComplete(response) {
            finalResponse = response
            resolve({ ...response, content: fullContent })
          },
          onError(err) {
            reject(new CodeError(`流式调用失败: ${err.message}`, 502))
          },
        }
      })
    })
  }

  /**
   * 获取所有可用的 Provider 列表（供前端展示）
   */
  static async listAvailable() {
    const configs: any[] = []
    const [rows]: any = await dbPool.execute(
      `SELECT p.*, pc.name as provider_name
       FROM api_products p
       LEFT JOIN provider_channels pc ON p.channel_id = pc.id
       WHERE p.status = 1 AND p.deleted_at IS NULL
       ORDER BY p.category, p.name`
    )
    for (const row of rows) {
      const p = getProvider(row.provider_key)
      configs.push({
        id: row.id,
        name: row.name,
        provider: row.provider_name || row.provider_key,
        model: row.model_name,
        pricing: p?.pricing || { input: 0, output: 0 },
        category: row.category,
      })
    }
    return configs
  }

  /**
   * 计算预估费用
   */
  static estimateCost(providerKey: string, inputTokens: number, outputTokens: number): number {
    const provider = getProvider(providerKey)
    if (!provider?.pricing) return 0
    const { input, output } = provider.pricing
    // 价格单位: 元/1K tokens
    return +((input * inputTokens + output * outputTokens) / 1000).toFixed(4)
  }
}
