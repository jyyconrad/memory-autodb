/**
 * 检查 Supabase 向量维度脚本
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载 .env 文件
const envPath = join(__dirname, '.env');
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const client = createClient(supabaseUrl, supabaseKey);

async function checkVectorDim() {
  console.log('=== 检查向量维度 ===\n');

  // 尝试获取表中一行数据来查看向量维度
  const { data: sampleData, error: sampleError } = await client
    .from('memories')
    .select('vector')
    .limit(1);

  if (sampleError) {
    console.log('查询 memories 表失败:', sampleError.message);
  } else if (sampleData && sampleData.length > 0) {
    const vector = sampleData[0].vector;
    console.log('✅ memories 表向量维度:', Array.isArray(vector) ? vector.length : '未知');
  }

  // 获取 knowledge 表的向量维度
  const { data: knowledgeData, error: knowledgeError } = await client
    .from('knowledge')
    .select('vector')
    .limit(1);

  if (knowledgeError) {
    console.log('查询 knowledge 表失败:', knowledgeError.message);
  } else if (knowledgeData && knowledgeData.length > 0) {
    const vector = knowledgeData[0].vector;
    console.log('✅ knowledge 表向量维度:', Array.isArray(vector) ? vector.length : '未知');
  }

  console.log('\n=== 检查完成 ===');
  console.log('\n提示：如果你的模型是 BAAI/bge-m3，向量维度应该是 1024');
  console.log('如果是 text-embedding-3-small，向量维度应该是 1536');
}

checkVectorDim().catch(console.error);
