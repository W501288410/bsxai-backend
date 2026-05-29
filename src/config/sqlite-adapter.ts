/**
 * SQLite 适配器 — 提供 mysql2 兼容的 execute() 接口
 * 让所有 service 代码无需修改即可使用 SQLite
 */
import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

let _db: Database.Database | null = null

export interface SqlitePool {
  execute(sql: string, params?: any[]): Promise<[any[], any[]]>
  getConnection(): Promise<{
    execute(sql: string, params?: any[]): Promise<[any[], any[]]>
    beginTransaction(): void
    commit(): void
    rollback(): void
    release(): void
    query(sql: string, params?: any[]): Promise<[any[], any[]]>
  }>
}

function convertMySQLToSQLite(sql: string): string {
  let s = sql.trim()

  // Skip MySQL-only DDL/administrative statements
  if (/^(CREATE\s+DATABASE|USE\s+|DROP\s+DATABASE|SET\s+|LOCK\s+|UNLOCK\s+|DELIMITER|CALL|--)/i.test(s)) {
    return 'SELECT 1'
  }

  // Runtime function conversions
  s = s.replace(/\bNOW\(\)/gi, "datetime('now')")
  s = s.replace(/\bCURDATE\(\)/gi, "date('now')")

  return s
}

export function getSqlitePool(dbPath?: string): SqlitePool {
  if (!_db) {
    const filePath = dbPath || path.resolve(__dirname, '../../data/ai_platform.sqlite')
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    _db = new Database(filePath)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    console.log('✅ SQLite 连接成功: ' + filePath)
  }

  return {
    async execute(sql: string, params?: any[]): Promise<[any[], any[]]> {
      const converted = convertMySQLToSQLite(sql)

      if (/^\s*SELECT|PRAGMA/i.test(converted)) {
        const stmt = _db!.prepare(converted)
        const rows = params ? stmt.all(...(Array.isArray(params) ? params : [params])) : stmt.all()
        return [rows as any[], []]
      }

      if (/^\s*INSERT/i.test(converted)) {
        const stmt = _db!.prepare(converted)
        const result = params ? stmt.run(...(Array.isArray(params) ? params : [params])) : stmt.run()
        return [{ insertId: Number(result.lastInsertRowid || 0), affectedRows: result.changes } as any, []]
      }

      const stmt = _db!.prepare(converted)
      const result = params ? stmt.run(...(Array.isArray(params) ? params : [params])) : stmt.run()
      return [{ affectedRows: result.changes } as any, []]
    },

    async getConnection() {
      const pool = this
      return {
        execute: pool.execute,
        beginTransaction() { _db!.prepare('BEGIN').run() },
        commit() { _db!.prepare('COMMIT').run() },
        rollback() { _db!.prepare('ROLLBACK').run() },
        release() {},
        query: pool.execute
      }
    }
  }
}

/**
 * 从 SQLite 原生 schema 文件初始化表
 */
export function initSqliteSchema(dbPath?: string): void {
  const filePath = dbPath || path.resolve(__dirname, '../../data/ai_platform.sqlite')
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 从 dist/config/ 回到 src/config/ 读取 SQLite schema
  const schemaPath = path.resolve(__dirname, '../../src/config/schema.sqlite.sql')
  if (!fs.existsSync(schemaPath)) {
    console.warn('⚠️  SQLite schema 文件不存在:', schemaPath)
    db.close()
    return
  }

  const raw = fs.readFileSync(schemaPath, 'utf-8')
  try {
    db.exec(raw)
    console.log('✅ SQLite 表初始化完成')
  } catch (err: any) {
    console.warn('⚠️  SQLite 初始化错误:', (err as Error).message)
  }

  db.close()
}
