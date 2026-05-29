/**
 * Provider 抽象基类
 * 所有大模型适配器继承此类，实现统一调用接口
 */
import {
  type ChatRequest, type ChatResponse, type ChatMessage,
  type StreamCallbacks, type ProviderConfig
} from './types'

export abstract class BaseProvider {
  protected config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  get key() { return this.config.key }
  get name() { return this.config.name }
  get defaultModel() { return this.config.defaultModel }
  get models() { return this.config.models }
  get pricing() { return this.config.pricing }

  /** 非流式调用 */
  abstract chat(request: ChatRequest): Promise<ChatResponse>

  /** 流式调用 */
  abstract chatStream(request: ChatRequest, callbacks: StreamCallbacks): Promise<void>

  /** 健康检查 */
  abstract healthCheck(): Promise<boolean>

  /** 统计 token（基于 input 字符长度估算，
      各子类可覆盖为更精确的 token 计数） */
  estimateInputTokens(messages: any[]): number {
    let chars = 0
    for (const m of messages as any[]) {
      if (typeof m.content === 'string') chars += m.content.length
      else if (Array.isArray(m.content)) {
        for (const p of m.content) {
          if ('text' in p) chars += p.text.length
        }
      }
    }
    // 粗略估算: 中文 1 字符≈1.5 token, 英文 1 字符≈0.25 token
    // 统一按 1 字符≈0.5 token（偏保守）
    return Math.ceil(chars * 0.5)
  }

  /** 序列化消息为 OpenAI 格式 */
  protected toOpenAIMessages(messages: ChatMessage[]) {
    return messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.name ? { name: m.name } : {}),
      ...(m.function_call ? { function_call: m.function_call } : {})
    }))
  }
}
