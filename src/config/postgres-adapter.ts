export const pgAdapterVersion = 1;
const {Pool} = require('pg');
let _pool: any = null;
function getPool(): any {
  if (!_pool) {
    const connString = process.env.DATABASE_URL;
    if (!connString) throw new Error('DATABASE_URL not set');
    _pool = new Pool({
      connectionString: connString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    });
    _pool.on('error', (e: any) => console.error('PG pool err:', e));
  }
  return _pool;
}
async function execute(sql: string, params?: any[]): Promise<[any[], any[]]> {
  const result = await getPool().query(sql, params || []);
  return [result.rows, []];
}
function getConnection(): any { return getPool().connect(); }
function transaction(fn: (c: any) => Promise<any>): Promise<any> {
  const pool = getPool();
  return new Promise(async (res, rej) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn(client);
      await client.query('COMMIT');
      res(r);
    } catch (e) {
      await client.query('ROLLBACK');
      rej(e);
    } finally { client.release(); }
  });
}
async function initPostgresSchema(): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  const schemaPath = path.join(__dirname, '..', 'config', 'schema.postgres.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const pg = getPool();
  const stmts = sql.split(';').map((s: string) => s.trim()).filter((s: string) => s && !s.startsWith('--'));
  for (const stmt of stmts) {
    try { await pg.query(stmt); }
    catch (e: any) { if (!['42P07','42710','23505'].includes(e.code)) console.warn(' schema:', e.message.slice(0, 80)); }
  }
  console.log('PG schema OK');
}
export { getPool, execute, getConnection, transaction, initPostgresSchema };
