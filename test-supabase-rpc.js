/**
 * Supabase RPC 连接测试脚本
 *
 * 使用方法：
 * 1. 确保 .env 文件中有 SUPABASE_URL 和 SUPABASE_SERVICE_KEY
 * 2. 运行：node test-supabase-rpc.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载 .env 文件
const envPath = join(__dirname, '.env');
console.log('正在加载环境变量:', envPath);

try {
  const envContent = readFileSync(envPath, 'utf-8');
  const envLines = envContent.split('\n');
  for (const line of envLines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  }
} catch (err) {
  console.error('无法读取 .env 文件:', err.message);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误：缺少 Supabase 配置');
  console.error('SUPABASE_URL:', supabaseUrl ? '已设置' : '未设置');
  console.error('SUPABASE_SERVICE_KEY:', supabaseKey ? '已设置' : '未设置');
  console.error('\n请确保 .env 文件中包含以下变量:');
  console.error('  SUPABASE_URL=https://your-project.supabase.co');
  console.error('  SUPABASE_SERVICE_KEY=your-service-key');
  process.exit(1);
}

console.log('\n=== Supabase 连接测试 ===\n');
console.log('URL:', supabaseUrl.replace(/\/\/[^.]+/, '//***'));
console.log('Key:', supabaseKey ? supabaseKey.substring(0, 20) + '...' : '未设置');
console.log();

const client = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('--- 测试 1: 检查 exec_sql 函数 ---\n');

  try {
    const { data: execSqlCheck, error: execSqlError } = await client.rpc('exec_sql', {
      sql: 'SELECT 1 as test'
    });

    if (execSqlError) {
      console.log('❌ exec_sql 函数不可用');
      console.log('错误:', execSqlError.message);
    } else {
      console.log('✅ exec_sql 函数可用');
      console.log('测试结果:', execSqlCheck);
    }
  } catch (err) {
    console.log('❌ exec_sql 调用失败:', err.message);
  }

  console.log('\n--- 测试 2: 检查表是否存在 ---\n');

  try {
    const { data: tables, error: tablesError } = await client
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');

    if (tablesError) {
      console.log('无法查询表列表:', tablesError.message);
    } else {
      console.log('当前表列表:');
      const targetTables = tables?.filter(t => ['memories', 'knowledge'].includes(t.table_name));
      if (targetTables?.length > 0) {
        console.log('✅ 目标表存在:', targetTables.map(t => t.table_name).join(', '));
      } else {
        console.log('⚠️  目标表 (memories/knowledge) 不存在');
      }
    }
  } catch (err) {
    console.log('查询表失败:', err.message);
  }

  console.log('\n--- 测试 3: 检查 match_memories RPC 函数 ---\n');

  try {
    // 创建一个 1024 维的测试向量（全 0）
    const testVector = new Array(1024).fill(0);

    const { data: matchResult, error: matchError } = await client.rpc('match_memories', {
      query_embedding: testVector,
      match_count: 1,
      min_similarity: 0,
      filter_data_type: null
    });

    if (matchError) {
      console.log('❌ match_memories 函数调用失败');
      console.log('错误:', matchError.message);

      if (matchError.message.includes('function') || matchError.message.includes('RPC')) {
        console.log('\n建议：需要创建 match_memories RPC 函数');
        console.log('请执行 supabase-rpc-functions-1024.sql 文件中的 SQL');
      }
    } else {
      console.log('✅ match_memories 函数可用');
      console.log('返回结果数量:', matchResult?.length || 0);
    }
  } catch (err) {
    console.log('match_memories 调用失败:', err.message);
  }

  console.log('\n--- 测试 4: 检查 match_knowledge RPC 函数 ---\n');

  try {
    const testVector = new Array(1024).fill(0);

    const { data: matchResult, error: matchError } = await client.rpc('match_knowledge', {
      query_embedding: testVector,
      match_count: 1,
      min_similarity: 0,
      filter_data_type: null
    });

    if (matchError) {
      console.log('❌ match_knowledge 函数调用失败');
      console.log('错误:', matchError.message);
    } else {
      console.log('✅ match_knowledge 函数可用');
      console.log('返回结果数量:', matchResult?.length || 0);
    }
  } catch (err) {
    console.log('match_knowledge 调用失败:', err.message);
  }

  console.log('\n--- 测试 5: 直接查询表数据 ---\n');

  try {
    const { data: memoriesData, error: memoriesError } = await client
      .from('memories')
      .select('id, text, category, data_type')
      .limit(3);

    if (memoriesError) {
      console.log('❌ 查询 memories 表失败:', memoriesError.message);
    } else {
      console.log('✅ memories 表查询成功');
      console.log('数据数量:', memoriesData?.length || 0);
      if (memoriesData?.length > 0) {
        console.log('示例数据:');
        memoriesData.slice(0, 2).forEach((row, i) => {
          console.log(`  ${i + 1}. [${row.category}] ${row.text?.substring(0, 50)}...`);
        });
      }
    }
  } catch (err) {
    console.log('查询 memories 表失败:', err.message);
  }

  try {
    const { data: knowledgeData, error: knowledgeError } = await client
      .from('knowledge')
      .select('id, text, category, data_type')
      .limit(3);

    if (knowledgeError) {
      console.log('❌ 查询 knowledge 表失败:', knowledgeError.message);
    } else {
      console.log('✅ knowledge 表查询成功');
      console.log('数据数量:', knowledgeData?.length || 0);
      if (knowledgeData?.length > 0) {
        console.log('示例数据:');
        knowledgeData.slice(0, 2).forEach((row, i) => {
          console.log(`  ${i + 1}. [${row.category}] ${row.text?.substring(0, 50)}...`);
        });
      }
    }
  } catch (err) {
    console.log('查询 knowledge 表失败:', err.message);
  }

  console.log('\n--- 测试 6: 实际向量搜索测试（BAAI/bge-m3 模型） ---\n');

  try {
    // 使用 OpenAI 兼容 API 生成一个测试向量（1024 维）
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (apiKey) {
      console.log('正在调用 API 生成测试向量 (BAAI/bge-m3, 1024 维)...');

      const response = await fetch(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          input: '测试记忆搜索',
          model: 'BAAI/bge-m3'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('⚠️  API 调用失败:', response.status, errorText.substring(0, 100));
        console.log('请检查 OPENAI_API_KEY 和模型配置是否正确');
      } else {
        const result = await response.json();
        const vector = result.data?.[0]?.embedding;

        if (vector) {
          console.log('✅ 生成向量维度:', vector.length);

          // 测试 match_memories
          const { data: searchResult, error: searchError } = await client.rpc('match_memories', {
            query_embedding: vector,
            match_count: 3,
            min_similarity: 0.1,
            filter_data_type: null
          });

          if (searchError) {
            console.log('❌ match_memories 向量搜索失败:', searchError.message);

            if (searchError.message.includes('vector') || searchError.message.includes('dimension')) {
              console.log('\n⚠️  可能是向量维度不匹配！');
              console.log('RPC 函数期望的维度可能与实际向量维度不一致');
              console.log('当前向量维度:', vector.length);
            }
          } else {
            console.log('✅ match_memories 向量搜索成功');
            console.log('返回结果:', searchResult?.length || 0, '条');
            if (searchResult?.length > 0) {
              console.log('最相关结果:');
              searchResult.forEach((row, i) => {
                console.log(`  ${i + 1}. [${row.category}] ${row.text?.substring(0, 60)}... (相似度：${(row.similarity * 100).toFixed(1)}%)`);
              });
            }
          }

          // 测试 match_knowledge
          const { data: knowledgeResult, error: knowledgeError } = await client.rpc('match_knowledge', {
            query_embedding: vector,
            match_count: 3,
            min_similarity: 0.1,
            filter_data_type: null
          });

          if (knowledgeError) {
            console.log('❌ match_knowledge 向量搜索失败:', knowledgeError.message);
          } else {
            console.log('✅ match_knowledge 向量搜索成功');
            console.log('返回结果:', knowledgeResult?.length || 0, '条');
          }
        }
      }
    } else {
      console.log('⚠️  未设置 OPENAI_API_KEY，跳过向量搜索测试');
    }
  } catch (err) {
    console.log('向量搜索测试失败:', err.message);
  }

  console.log('\n=== 测试完成 ===\n');
}

runTests().catch(console.error);
