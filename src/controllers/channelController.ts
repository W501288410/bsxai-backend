/**
 * 模型渠道管理 Controller
 * 管理员操作：CRUD 渠道 + 测试连通性
 */
import Koa from 'koa'
import { type Pool, type RowDataPacket } from 'mysql2/promise'
import { dbPool } from '../config'
import { getProvider, registerProvider, healthCheckAll } from '../lib/providers'
import { CodeError } from '../utils/errors'
import { logger } from '../utils/logger'

export class ChannelController {
  /** 渠道列表 */
  static async list(ctx: Koa.Context) {
    const [rows]: any = await dbPool.execute(
      'SELECT * FROM provider_channels ORDER BY id ASC'
    )
    ctx.body = { code: 0, data: rows }
  }

  /** 创建渠道 */
  static async create(ctx: Koa.Context) {
    const { name, provider_key, api_base_url, api_key, model_name, models, pricing_input, pricing_output } = ctx.request.body as any
    if (!name || !provider_key || !api_base_url || !api_key) {
      throw new CodeError('参数不完整', 400)
    }
    const [result]: any = await dbPool.execute(
      `INSERT INTO provider_channels (name, provider_key, api_base_url, api_key, model_name, models, pricing_input, pricing_output)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, provider_key, api_base_url, api_key, model_name || '', JSON.stringify(models || []), pricing_input || 0, pricing_output || 0]
    )
    logger.info('渠道创建', { id: result.insertId, name })
    ctx.body = { code: 0, data: { id: result.insertId } }
  }

  /** 更新渠道 */
  static async update(ctx: Koa.Context) {
    const id = Number(ctx.params.id)
    const { name, provider_key, api_base_url, api_key, model_name, models, pricing_input, pricing_output, status } = ctx.request.body as any
    const sets: string[] = []
    const values: any[] = []
    if (name !== undefined) { sets.push('name = ?'); values.push(name) }
    if (provider_key !== undefined) { sets.push('provider_key = ?'); values.push(provider_key) }
    if (api_base_url !== undefined) { sets.push('api_base_url = ?'); values.push(api_base_url) }
    if (api_key !== undefined) { sets.push('api_key = ?'); values.push(api_key) }
    if (model_name !== undefined) { sets.push('model_name = ?'); values.push(model_name) }
    if (models !== undefined) { sets.push('models = ?'); values.push(JSON.stringify(models)) }
    if (pricing_input !== undefined) { sets.push('pricing_input = ?'); values.push(pricing_input) }
    if (pricing_output !== undefined) { sets.push('pricing_output = ?'); values.push(pricing_output) }
    if (status !== undefined) { sets.push('status = ?'); values.push(status) }
    if (sets.length === 0) throw new CodeError('无更新字段', 400)
    values.push(id)
    await dbPool.execute(`UPDATE provider_channels SET ${sets.join(', ')} WHERE id = ?`, values)
    logger.info('渠道更新', { id })
    ctx.body = { code: 0, message: '更新成功' }
  }

  /** 删除渠道 */
  static async remove(ctx: Koa.Context) {
    const id = Number(ctx.params.id)
    await dbPool.execute('DELETE FROM provider_channels WHERE id = ?', [id])
    logger.info('渠道删除', { id })
    ctx.body = { code: 0, message: '删除成功' }
  }

  /** 测试渠道连通性 */
  static async test(ctx: Koa.Context) {
    const id = Number(ctx.params.id)
    const [rows]: any = await dbPool.execute('SELECT * FROM provider_channels WHERE id = ?', [id])
    if (rows.length === 0) throw new CodeError('渠道不存在', 404)
    const ch = rows[0]
    try {
      // 动态注册并测试
      const { OpenAICompatProvider } = await import('../lib/providers/openai-compat')
      const provider = new (OpenAICompatProvider as any)({
        name: ch.name,
        key: ch.provider_key,
        apiBaseUrl: ch.api_base_url,
        apiKey: ch.api_key,
        defaultModel: ch.model_name,
        models: JSON.parse(ch.models || '[]'),
      })
      const ok = await provider.healthCheck()
      ctx.body = { code: 0, data: { healthy: ok } }
    } catch (err: any) {
      ctx.body = { code: 0, data: { healthy: false, error: err.message } }
    }
  }

  /** 全局健康检查 */
  static async health(ctx: Koa.Context) {
    const results = await healthCheckAll()
    ctx.body = { code: 0, data: results }
  }
}
