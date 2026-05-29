/**
 * OpenAI 兼容适配器
 * 适用于所有 OpenAI API 兼容的提供商：
 * - 阿里 Qwen (DashScope)
 * - 字节 Doubao (火山引擎)
 * - 腾讯 Hunyuan
 * - 智谱 GLM-4
 * - DeepSeek
 * - 以及原生 OpenAI GPT
 *
 * 核心差异仅在于 apiBaseUrl + apiKey + model 名称
 */
import { BaseProvider } from './base'
import { type ChatRequest, type ChatResponse, type StreamCallbacks } from './types'

interface OpenAICompatConfig {
  name: string              // 显示名称
  key: string               // 标识
  apiBaseUrl: string
  apiKey: string
  defaultModel: string
  models: string[]
  maxInputTokens?: number
  pricing?: { input: number; output: number }
}

export class OpenAICompatProvider extends BaseProvider {
  constructor(config: OpenAICompatConfig) {
    // 确保 baseUrl 不以 / 结尾（fetch 拼接用）
    const baseUrl = config.apiBaseUrl.replace(/\/+$/, '')
    super({
      ...config,
      apiBaseUrl: baseUrl,
      apiKey: config.apiKey,
      name: config.name,
      key: config.key,
      defaultModel: config.defaultModel,
      models: config.models,
    })
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${this.config.apiBaseUrl}/chat/completions`
    const body = {
      model: request.model || this.config.defaultModel,
      messages: this.toOpenAIMessages(request.messages),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stop,
      stream: false,
      ...(request.extra || {}),
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000), // 2分钟超时
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`[${this.config.name}] API 错误 ${resp.status}: ${errText.slice(0, 200)}`)
    }

    const data: any = await resp.json()
    const choice = data.choices?.[0]
    const usage = data.usage

    return {
      content: choice?.message?.content || '',
      model: data.model || body.model,
      finishReason: choice?.finish_reason,
      id: data.id,
      usage: usage ? {
        promptTokens: usage.prompt_tokens || this.estimateInputTokens(request.messages),
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      } : undefined,
    }
  }

  async chatStream(request: ChatRequest, callbacks: StreamCallbacks): Promise<void> {
    const url = `${this.config.apiBaseUrl}/chat/completions`
    const body = {
      model: request.model || this.config.defaultModel,
      messages: this.toOpenAIMessages(request.messages),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stop,
      stream: true,
      ...(request.extra || {}),
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      callbacks.onError?.(new Error(`[${this.config.name}] 流式错误 ${resp.status}: ${errText.slice(0, 200)}`))
      return
    }

    const reader = resp.body?.getReader()
    if (!reader) {
      callbacks.onError?.(new Error('无法获取响应流'))
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let finishReason = ''
    const id = `chatcmpl-${Date.now()}`

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const jsonStr = trimmed.slice(6)
          if (jsonStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(jsonStr)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) {
              fullContent += delta.content
              callbacks.onToken?.(delta.content)
            }
            if (parsed.choices?.[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason
            }
          } catch { /* 跳过解析失败的行 */ }
        }
      }

      callbacks.onComplete?.({
        content: fullContent,
        model: body.model,
        finishReason,
        id,
        usage: {
          promptTokens: this.estimateInputTokens(request.messages),
          completionTokens: Math.ceil(fullContent.length * 0.5),
          totalTokens: this.estimateInputTokens(request.messages) + Math.ceil(fullContent.length * 0.5),
        }
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        callbacks.onError?.(new Error('请求超时'))
      } else {
        callbacks.onError?.(err)
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // 发一个最小请求测试连通性
      const resp = await fetch(`${this.config.apiBaseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      return resp.ok
    } catch {
      return false
    }
  }
}
