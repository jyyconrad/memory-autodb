-- ============================================================
-- Supabase exec_sql 权限检查脚本
-- ============================================================

-- 步骤 1: 检查 exec_sql 函数是否存在
-- ------------------------------------------------------------
SELECT routine_name, routine_type, data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'exec_sql';

-- 如果返回空结果，说明 exec_sql 函数不存在


-- 步骤 2: 尝试创建一个简单的测试表（测试 exec_sql 权限）
-- ------------------------------------------------------------
-- 如果 exec_sql 存在，尝试执行以下 SQL
-- 如果返回错误，说明没有权限

SELECT exec_sql('CREATE TABLE IF NOT EXISTS _test_table (id UUID)');

-- 如果成功执行，说明有 exec_sql 权限
-- 如果失败，会看到类似错误：
-- - "permission denied for function exec_sql" - 没有执行权限
-- - "function exec_sql does not exist" - 函数不存在


-- 步骤 3: 检查当前用户的权限
-- ------------------------------------------------------------
-- 查看当前用户是否有执行函数的权限
SELECT has_function_privilege(
  current_user,
  'exec_sql(text)',
  'EXECUTE'
) AS can_execute_exec_sql;


-- 步骤 4: 查看可用的 SQL 执行方式
-- ------------------------------------------------------------
-- Supabase 通常有以下几种方式执行动态 SQL:
-- 1. exec_sql 函数（需要特殊权限）
-- 2. pg_cron 扩展（定时任务）
-- 3. Edge Functions（服务器端函数）

-- 检查已安装的扩展
SELECT extname FROM pg_extension;


-- 步骤 5: 如果没有 exec_sql 权限，手动创建表
-- ------------------------------------------------------------
-- 如果 exec_sql 不可用，直接在 Supabase 控制台执行以下 SQL 创建表：

-- 创建 memories 表
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  vector vector(1024) NOT NULL,  -- 根据你的模型调整维度：1536 或 1024
  importance FLOAT NOT NULL DEFAULT 0.7,
  category TEXT NOT NULL DEFAULT 'other',
  data_type TEXT NOT NULL DEFAULT 'memory',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 创建 knowledge 表
CREATE TABLE IF NOT EXISTS knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  vector vector(1024) NOT NULL,  -- 根据你的模型调整维度
  importance FLOAT NOT NULL DEFAULT 0.5,
  category TEXT NOT NULL DEFAULT 'other',
  data_type TEXT NOT NULL DEFAULT 'knowledge',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS memories_vector_idx ON memories USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
CREATE UNIQUE INDEX IF NOT EXISTS memories_content_hash_idx ON memories (content_hash);
CREATE INDEX IF NOT EXISTS memories_data_type_idx ON memories (data_type);
CREATE INDEX IF NOT EXISTS memories_created_at_idx ON memories (created_at DESC);

CREATE INDEX IF NOT EXISTS knowledge_vector_idx ON knowledge USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_content_hash_idx ON knowledge (content_hash);
CREATE INDEX IF NOT EXISTS knowledge_data_type_idx ON knowledge (data_type);
CREATE INDEX IF NOT EXISTS knowledge_created_at_idx ON knowledge (created_at DESC);


-- 步骤 6: 验证表创建成功
-- ------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('memories', 'knowledge');
