/**
 * Mock 数据层 — 无 MySQL/Redis 时用于开发验证
 * 支持基本的 CRUD + Redis Set 操作
 */

// === 内存数据库 ===
class MockDB {
  private tables: Map<string, any[]> = new Map()
  private autoIncrement: Map<string, number> = new Map()

  /** 模拟 execute(sql, params) */
  async execute(sql: string, params?: any[]): Promise<[any[], any]> {
    const upper = sql.trim().toUpperCase()
    console.log('  [mock-db]', sql.substring(0, 80), params ? JSON.stringify(params).substring(0, 60) : '')

    if (upper.startsWith('SELECT')) {
      const rows = this.handleSelect(sql, params)
      return [rows, []]
    }
    if (upper.startsWith('INSERT')) {
      return this.handleInsert(sql, params)
    }
    if (upper.startsWith('UPDATE')) {
      return [[{ affectedRows: 1 }], []]
    }
    if (upper.startsWith('DELETE')) {
      return [[{ affectedRows: 1 }], []]
    }
    if (upper.startsWith('CREATE') || upper.startsWith('ALTER') || upper.startsWith('DROP')) {
      return [[{}], []]
    }
    // CALL sp_xxx 存储过程
    if (upper.startsWith('CALL')) {
      return [[], []]
    }
    return [[], []]
  }

  async getConnection() {
    return {
      execute: (sql: string, params?: any[]) => this.execute(sql, params),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      query: (sql: string, params?: any[]) => this.execute(sql, params)
    }
  }

  private getTableName(sql: string): string {
    const fromMatch = sql.match(/FROM\s+`?(\w+)`?/i)
    const intoMatch = sql.match(/INTO\s+`?(\w+)`?/i)
    const updateMatch = sql.match(/UPDATE\s+`?(\w+)`?/i)
    const deleteMatch = sql.match(/DELETE\s+FROM\s+`?(\w+)`?/i)
    return (fromMatch?.[1] || intoMatch?.[1] || updateMatch?.[1] || deleteMatch?.[1] || '').toLowerCase()
  }

  private handleSelect(sql: string, params?: any[]): any[] {
    const table = this.getTableName(sql)
    const rows = this.tables.get(table) || []

    // 简单匹配：SELECT * FROM tbl WHERE col=?
    // 复杂查询：返回空或第一条
    if (sql.includes('COUNT(*)') || sql.includes('count(*)')) {
      return [{ total: rows.length }]
    }

    if (params && params.length > 0) {
      const whereCol = sql.match(/WHERE\s+`?(\w+)`?\s*=\s*\?/i)?.[1]
      if (whereCol) {
        const val = params[0]
        const matched = rows.filter(r => String(r[whereCol]) === String(val))
        return matched
      }
    }

    // 分页
    if (sql.includes('LIMIT')) {
      const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/i)
      if (limitMatch) {
        const offset = limitMatch[2] ? parseInt(limitMatch[1]) : 0
        const limit = limitMatch[2] ? parseInt(limitMatch[2]) : parseInt(limitMatch[1])
        return rows.slice(offset, offset + limit)
      }
    }

    return rows
  }

  private handleInsert(sql: string, params?: any[]): [any, any] {
    const table = this.getTableName(sql)
    if (!this.tables.has(table)) this.tables.set(table, [])
    if (!this.autoIncrement.has(table)) this.autoIncrement.set(table, 1)

    const id = this.autoIncrement.get(table)!
    this.autoIncrement.set(table, id + 1)

    const cols = (sql.match(/\(([^)]+)\)/)?.[1] || '').split(',').map(c => c.trim().replace(/`/g, ''))
    const row: any = { id }
    if (params) {
      cols.forEach((col, i) => {
        if (col && params[i] !== undefined) row[col] = params[i]
      })
    }
    row.created_at = new Date().toISOString()
    row.updated_at = row.created_at

    this.tables.get(table)!.push(row)
    return [{ insertId: id, affectedRows: 1 }, []]
  }
}

// === 内存 Redis ===
class MockRedis {
  private store: Map<string, any> = new Map()
  private expires: Map<string, number> = new Map()

  private cleanExpired(key: string) {
    const exp = this.expires.get(key)
    if (exp && Date.now() > exp) {
      this.store.delete(key)
      this.expires.delete(key)
    }
  }

  async get(key: string) {
    this.cleanExpired(key)
    return this.store.get(key) || null
  }

  async set(key: string, val: string) {
    this.store.set(key, val)
    this.expires.delete(key)
    return 'OK'
  }

  async setEx(key: string, seconds: number, val: string) {
    this.store.set(key, val)
    this.expires.set(key, Date.now() + seconds * 1000)
    return 'OK'
  }

  async incr(key: string) {
    const v = (parseInt(this.store.get(key)) || 0) + 1
    this.store.set(key, v)
    return v
  }

  async pExpire(key: string, ms: number) {
    if (this.expires.has(key)) {
      this.expires.set(key, Date.now() + ms)
    }
    return true
  }

  async expire(key: string, seconds: number) {
    this.expires.set(key, Date.now() + seconds * 1000)
    return true
  }

  async sAdd(key: string, members: string | string[]) {
    const arr = Array.isArray(members) ? members : [members]
    const set: Set<string> = this.store.get(key) || new Set()
    arr.forEach(m => set.add(m))
    this.store.set(key, set)
    return arr.length
  }

  async sIsMember(key: string, member: string) {
    const set: Set<string> = this.store.get(key)
    if (!set) return false
    return set.has(member)
  }

  async sMembers(key: string) {
    const set: Set<string> = this.store.get(key)
    return set ? [...set] : []
  }

  async sRem(key: string, member: string) {
    const set: Set<string> = this.store.get(key)
    if (!set) return 0
    const existed = set.has(member)
    set.delete(member)
    return existed ? 1 : 0
  }

  async del(key: string) {
    this.store.delete(key)
    this.expires.delete(key)
    return 1
  }

  async exists(key: string) {
    return this.store.has(key) ? 1 : 0
  }

  async connect() { return this }
  on(_event: string, _cb: Function) { return this }
}

export const mockDB = new MockDB()
export const mockRedis = new MockRedis() as any
