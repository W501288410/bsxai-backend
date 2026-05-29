import mysql from 'mysql2/promise'
import { createClient } from 'redis'
import { mockDB, mockRedis } from './mock'
import { getSqlitePool, initSqliteSchema } from './sqlite-adapter'
import { getPool as getPgPool, initPostgresSchema } from './postgres-adapter'

// 是否使用 Mock 模式
export let MOCK_MODE = false
export const DB_TYPE = process.env.DB_TYPE || 'auto' // auto | mysql | sqlite | postgres

// === Redis 客户端（带 fallback）===
let _redis: any

async function setupRedis() {
  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      connectTimeout: 3000,  // 3秒超时
      reconnectStrategy: false,  // 不重连
    }
  })
  client.on('error', () => {}) // 静默处理
  try {
    await client.connect()
    console.log('✅ Redis 连接成功')
    return client
  } catch {
    console.warn('⚠️ Redis 不可用，使用内存 Mock')
    MOCK_MODE = true
    return mockRedis
  }
}

// === 数据库连接（MySQL → SQLite → Mock 三级降级）===
async function setupDB() {
  const dbType = DB_TYPE

  // 强制 PostgreSQL
  if (dbType === 'postgres') {
    console.log('🐘 使用 PostgreSQL（云端持久化）')
    await initPostgresSchema()
    return getPgPool()
  }

  // 强制 SQLite
  if (dbType === 'sqlite') {
    console.log('📦 使用 SQLite（本地文件持久化）')
    initSqliteSchema()
    return getSqlitePool()
  }

  // 尝试 PostgreSQL（auto 模式下优先）
  if (dbType === 'auto' || dbType === 'postgres') {
    if (process.env.DATABASE_URL) {
      try {
        await initPostgresSchema()
        const pgPool = getPgPool()
        await pgPool.query('SELECT 1')
        console.log('✅ PostgreSQL 连接成功')
        return pgPool
      } catch (pgErr) {
        console.warn('⚠️ PostgreSQL 不可用:', (pgErr as Error).message)
      }
    }
  }

  // 尝试 MySQL
  if (dbType === 'auto' || dbType === 'mysql') {
    try {
      const pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'app',
        password: process.env.DB_PASSWORD || 'app123456',
        database: process.env.DB_NAME || 'ai_platform',
        charset: 'utf8mb4',
        waitForConnections: true,
        connectionLimit: 20,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 3000
      })
      const conn = await pool.getConnection()
      console.log('✅ MySQL 连接成功')
      conn.release()
      return pool
    } catch (mysqlErr) {
      console.warn('⚠️ MySQL 不可用，降级到 SQLite:', (mysqlErr as Error).message)
    }
  }

  // 尝试 SQLite（兜底）
  try {
    initSqliteSchema()
    return getSqlitePool()
  } catch (sqliteErr) {
    console.warn('⚠️ SQLite 不可用，降级到内存 Mock:', (sqliteErr as Error).message)
    MOCK_MODE = true
    return mockDB
  }
}

// 懒初始化
let _dbPool: any = null
export async function getDB() {
  if (!_dbPool) _dbPool = await setupDB()
  return _dbPool
}

let _redisClient: any = null
export async function getRedis() {
  if (!_redisClient) _redisClient = await setupRedis()
  return _redisClient
}

// 向后兼容：同步导出（启动时可能还未就绪）
// 各 service 文件 import { dbPool } 仍然用这些，启动时会先 init
export let dbPool: any = {
  execute: async (...args: any[]) => {
    const p = await getDB()
    return p.execute(...args)
  },
  getConnection: async () => {
    const p = await getDB()
    return p.getConnection ? p.getConnection() : p.connect()
  },
  transaction: async (fn: (conn: any) => Promise<any>) => {
    const p = await getDB()
    return p.transaction ? p.transaction(fn) : fn(await p.getConnection())
  }
}

export let redis: any = {
  get: async (...args: any[]) => (await getRedis()).get(...args),
  set: async (...args: any[]) => (await getRedis()).set(...args),
  setEx: async (...args: any[]) => (await getRedis()).setEx(...args),
  incr: async (...args: any[]) => (await getRedis()).incr(...args),
  pExpire: async (...args: any[]) => (await getRedis()).pExpire(...args),
  expire: async (...args: any[]) => (await getRedis()).expire(...args),
  sAdd: async (...args: any[]) => (await getRedis()).sAdd(...args),
  sIsMember: async (...args: any[]) => (await getRedis()).sIsMember(...args),
  sMembers: async (...args: any[]) => (await getRedis()).sMembers(...args),
  sRem: async (...args: any[]) => (await getRedis()).sRem(...args),
  del: async (...args: any[]) => (await getRedis()).del(...args),
  exists: async (...args: any[]) => (await getRedis()).exists(...args),
  connect: async () => getRedis(),
  on: (...args: any[]) => (async () => { const r = await getRedis(); r.on(...args) })()
}

// JWT 配置
export const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'your-jwt-secret-key',
  expiresIn: '7d'
}

// 分页默认配置
export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 20,
  maxPageSize: 100
}
