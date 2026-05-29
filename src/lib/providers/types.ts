/**
 * Provider 适配层 - 通用类型定义
 * 统一所有大模型 API 的请求/响应格式
 */

/** 对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function'
  content: string
  name?: string
  function_call?: { name: string; arguments: string }
}

/** 统一请求参数 */
export interface ChatRequest {
  model: string              // 模型名称，如 qwen-max、doubao-pro-32k
  messages: ChatMessage[]
  maxTokens?: number         // 最大输出 token
  temperature?: number       // 0-2，默认 1
  topP?: number              // 0-1
  stream?: boolean           // 是否流式
  stop?: string[]            // 停止词
  extra?: Record<string, any> // 各厂商特有参数
}

/** 统一响应 Token 用量 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 统一响应 */
export interface ChatResponse {
  content: string
  model: string
  usage?: TokenUsage
  finishReason?: string
  id?: string
}

/** 流式回调 */
export interface StreamCallbacks {
  onToken?: (token: string) => void
  onComplete?: (response: ChatResponse) => void
  onError?: (error: Error) => void
}

/** Provider 配置 */
export interface ProviderConfig {
  name: string               // 显示名称
  key: string                // 标识: qwen/doubao/openai/claude/hunyuan/glm
  apiBaseUrl: string         // API 基础地址
  apiKey: string             // API Key
  defaultModel: string       // 默认模型
  models: string[]           // 支持的模型列表
  maxInputTokens?: number    // 最大输入 token
  pricing?: {                // 定价 (元/1K tokens)
    input: number
    output: number
  }
}
