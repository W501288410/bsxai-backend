-- =====================================================
-- SaaS 平台 — SQLite 数据库 Schema
-- 从 MySQL schema 转换，适配 better-sqlite3
-- 日期: 2026-05-29
-- =====================================================

PRAGMA foreign_keys = ON;

-- =====================================================
-- 第一部分：核心业务表
-- =====================================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  real_name TEXT,
  id_card TEXT,
  id_card_front TEXT,
  id_card_back TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  user_type INTEGER NOT NULL DEFAULT 1,
  invite_code TEXT,
  invited_by INTEGER,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 2. 账户表
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL,
  balance REAL NOT NULL DEFAULT 0.0,
  frozen_balance REAL NOT NULL DEFAULT 0.0,
  withdrawable_balance REAL NOT NULL DEFAULT 0.0,
  total_recharge REAL NOT NULL DEFAULT 0.0,
  total_withdraw REAL NOT NULL DEFAULT 0.0,
  total_consumption REAL NOT NULL DEFAULT 0.0,
  total_commission REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 充值订单表
CREATE TABLE IF NOT EXISTS recharge_orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_channel TEXT,
  trade_no TEXT UNIQUE,
  status INTEGER NOT NULL DEFAULT 1,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. 交易流水表
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  transaction_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  type INTEGER NOT NULL,
  amount REAL NOT NULL,
  balance_before REAL NOT NULL,
  balance_after REAL NOT NULL,
  related_id INTEGER,
  related_type TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. API 商品表
CREATE TABLE IF NOT EXISTS api_products (
  id INTEGER PRIMARY KEY,
  product_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  channel_id INTEGER,
  api_endpoint TEXT NOT NULL,
  api_method TEXT NOT NULL DEFAULT 'POST',
  pricing_model INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL,
  monthly_price REAL,
  rate_limit INTEGER NOT NULL DEFAULT 100,
  total_calls INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0.0,
  total_revenue REAL NOT NULL DEFAULT 0.0,
  status INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 6. API 订单表
CREATE TABLE IF NOT EXISTS api_orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  pricing_model INTEGER NOT NULL,
  amount REAL NOT NULL,
  calls_purchased INTEGER,
  traffic_purchased INTEGER,
  expire_at TEXT,
  calls_used INTEGER NOT NULL DEFAULT 0,
  traffic_used INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES api_products(id) ON DELETE CASCADE
);

-- 7. AI 工具表
CREATE TABLE IF NOT EXISTS ai_tools (
  id INTEGER PRIMARY KEY,
  tool_no TEXT UNIQUE NOT NULL,
  developer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  icon TEXT,
  screenshots TEXT,
  web_url TEXT,
  api_endpoint TEXT,
  pricing_model INTEGER NOT NULL DEFAULT 1,
  price REAL,
  subscription_price REAL,
  platform_commission REAL NOT NULL DEFAULT 0.20,
  total_users INTEGER NOT NULL DEFAULT 0,
  total_revenue REAL NOT NULL DEFAULT 0.0,
  rating REAL NOT NULL DEFAULT 0.0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. 工具订阅表
CREATE TABLE IF NOT EXISTS tool_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tool_id INTEGER NOT NULL,
  type INTEGER NOT NULL,
  amount REAL NOT NULL,
  start_at TEXT NOT NULL,
  expire_at TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_id) REFERENCES ai_tools(id) ON DELETE CASCADE
);

-- 9. 悬赏需求表
CREATE TABLE IF NOT EXISTS custom_requirements (
  id INTEGER PRIMARY KEY,
  requirement_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  budget REAL NOT NULL,
  budget_frozen REAL NOT NULL DEFAULT 0.0,
  deadline TEXT NOT NULL,
  attachments TEXT,
  total_bids INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  admin_remark TEXT,
  selected_bid_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. 竞标表
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY,
  bid_no TEXT UNIQUE NOT NULL,
  requirement_id INTEGER NOT NULL,
  developer_id INTEGER NOT NULL,
  proposal TEXT NOT NULL,
  quote REAL NOT NULL,
  duration INTEGER NOT NULL,
  attachments TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requirement_id) REFERENCES custom_requirements(id) ON DELETE CASCADE,
  FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 11. 仲裁表
CREATE TABLE IF NOT EXISTS arbitrations (
  id INTEGER PRIMARY KEY,
  requirement_id INTEGER NOT NULL,
  plaintiff_id INTEGER NOT NULL,
  defendant_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT,
  result TEXT,
  refund_amount REAL,
  status INTEGER NOT NULL DEFAULT 1,
  handled_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requirement_id) REFERENCES custom_requirements(id) ON DELETE CASCADE
);

-- =====================================================
-- 第二部分：辅助功能表
-- =====================================================

-- 12. 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  request_method TEXT,
  request_url TEXT,
  request_params TEXT,
  response_code INTEGER,
  response_time INTEGER,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. 错误日志表
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  error_code TEXT,
  error_message TEXT,
  error_stack TEXT,
  request_url TEXT,
  request_method TEXT,
  request_params TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. API 调用日志表
CREATE TABLE IF NOT EXISTS api_call_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  request_method TEXT NOT NULL,
  request_url TEXT NOT NULL,
  request_headers TEXT,
  request_body TEXT,
  response_status INTEGER,
  response_body TEXT,
  response_code INTEGER,
  response_time INTEGER,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
  id INTEGER PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT,
  config_type TEXT DEFAULT 'string',
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 16. 敏感词表
CREATE TABLE IF NOT EXISTS sensitive_words (
  id INTEGER PRIMARY KEY,
  word TEXT UNIQUE NOT NULL,
  category TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  replacement TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 17. 备份记录表
CREATE TABLE IF NOT EXISTS backup_records (
  id INTEGER PRIMARY KEY,
  backup_type TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  backup_size INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18. 管理员表
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT,
  email TEXT,
  role INTEGER NOT NULL DEFAULT 1,
  status INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  last_login_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 19. 用户 Token 表
CREATE TABLE IF NOT EXISTS user_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  device TEXT,
  ip TEXT,
  expire_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 20. 分销记录表
CREATE TABLE IF NOT EXISTS distribution_records (
  id INTEGER PRIMARY KEY,
  promoter_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  order_type TEXT NOT NULL,
  order_id INTEGER NOT NULL,
  order_amount REAL NOT NULL,
  commission_rate REAL NOT NULL,
  commission REAL NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- Phase 4: 提现/风控/流水
-- =====================================================

-- 21. 提现申请表
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  bank_name TEXT,
  bank_card TEXT,
  bank_holder TEXT,
  alipay_account TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  reject_reason TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 22. IP黑名单表
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id INTEGER PRIMARY KEY,
  ip TEXT UNIQUE NOT NULL,
  reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 23. 资金流水表（扩展）
CREATE TABLE IF NOT EXISTS transaction_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL DEFAULT 0.0,
  order_no TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- Phase 5: 模型渠道管理
-- =====================================================

-- 24. 模型渠道表
CREATE TABLE IF NOT EXISTS provider_channels (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  api_base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  models TEXT,
  pricing_input REAL NOT NULL DEFAULT 0.001,
  pricing_output REAL NOT NULL DEFAULT 0.003,
  status INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- 索引
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_user ON recharge_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_status ON recharge_orders(status);
CREATE INDEX IF NOT EXISTS idx_trans_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_trans_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_products_category ON api_products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON api_products(status);
CREATE INDEX IF NOT EXISTS idx_api_orders_user ON api_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_api_orders_product ON api_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_tools_developer ON ai_tools(developer_id);
CREATE INDEX IF NOT EXISTS idx_tools_category ON ai_tools(category);
CREATE INDEX IF NOT EXISTS idx_tools_status ON ai_tools(status);
CREATE INDEX IF NOT EXISTS idx_subs_user ON tool_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_tool ON tool_subscriptions(tool_id);
CREATE INDEX IF NOT EXISTS idx_reqs_user ON custom_requirements(user_id);
CREATE INDEX IF NOT EXISTS idx_reqs_status ON custom_requirements(status);
CREATE INDEX IF NOT EXISTS idx_bids_req ON bids(requirement_id);
CREATE INDEX IF NOT EXISTS idx_bids_dev ON bids(developer_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user ON api_call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_product ON api_call_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created ON api_call_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_op_logs_user ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expire ON user_tokens(expire_at);
CREATE INDEX IF NOT EXISTS idx_dist_promoter ON distribution_records(promoter_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_txn_logs_user ON transaction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_provider ON provider_channels(provider_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_name_provider ON provider_channels(name, provider_key);
CREATE INDEX IF NOT EXISTS idx_channel_status ON provider_channels(status);
CREATE INDEX IF NOT EXISTS idx_sensitive_category ON sensitive_words(category);
CREATE INDEX IF NOT EXISTS idx_arb_status ON arbitrations(status);

-- =====================================================
-- 初始种子数据
-- =====================================================

-- 种子用户（phone-based 登录）
INSERT OR IGNORE INTO users (phone, password, nickname, user_type, status, is_verified) VALUES
('admin', '$2a$10$ZfhtT/fbN6OCMrgULwidVuji2.rEQIGQAZWbiF78U7B.Xn9Hj9MrO', '超级管理员', 3, 1, 1),
('13800000001', '$2a$10$hPB.jPIIkillWe3I0vOFU.YcGsecEuDzZDvv.zSk4jpfxG4yvoJfy', '测试用户', 1, 1, 1);

INSERT OR IGNORE INTO accounts (user_id, balance) VALUES
(1, 100000),
(2, 1000);

INSERT OR IGNORE INTO admins (username, password, nickname, role) VALUES
('admin', '$2b$10$N9qo8uLOickgx2ZMRZoMy.MrqJ8uWKWBPBVQWOjLLPYjPzxQJgZmG', '超级管理员', 2);

INSERT OR IGNORE INTO system_configs (config_key, config_value, config_type, description) VALUES
('platform_commission', '0.20', 'number', '平台默认抽成比例'),
('min_withdraw_amount', '100', 'number', '最低提现金额'),
('api_rate_limit_default', '100', 'number', 'API默认限流次数'),
('sensitive_words_enabled', 'true', 'boolean', '敏感词过滤开关'),
('backup_enabled', 'true', 'boolean', '自动备份开关'),
('backup_retention_days', '30', 'number', '备份保留天数');

INSERT OR IGNORE INTO provider_channels (name, provider_key, api_base_url, api_key, model_name, models, pricing_input, pricing_output) VALUES
('阿里通义千问', 'qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1', '', 'qwen-plus', '["qwen-max","qwen-plus","qwen-turbo"]', 0.002, 0.006),
('字节豆包', 'doubao', 'https://ark.cn-beijing.volces.com/api/v3', '', 'doubao-pro-32k', '["doubao-pro-32k","doubao-lite-32k"]', 0.0008, 0.002),
('腾讯混元', 'hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1', '', 'hunyuan-pro', '["hunyuan-pro","hunyuan-lite"]', 0.001, 0.003),
('智谱 GLM-4', 'glm', 'https://open.bigmodel.cn/api/paas/v4', '', 'glm-4-flash', '["glm-4-plus","glm-4-flash"]', 0.001, 0.003);

INSERT OR IGNORE INTO sensitive_words (word, category, level) VALUES
('test_block', '政治', 2),
('test_warn', '广告', 1);