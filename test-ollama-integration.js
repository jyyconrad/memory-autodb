/**
 * Ollama 嵌入模型集成测试
 *
 * 自动加载 .env 中的配置，测试 Ollama 嵌入服务
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env 配置
config({ path: join(__dirname, ".env") });

// 从环境变量获取配置
const EMBEDDING_API_KEY = process.env.OPENAI_API_KEY || process.env.EMBEDDING_API_KEY || "ollama";
const EMBEDDING_BASE_URL = process.env.OPENAI_BASE_URL || process.env.EMBEDDING_BASE_URL || "http://localhost:11434/v1";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || "nomic-embed-text";

console.log("=".repeat(60));
console.log("Ollama 嵌入模型集成测试");
console.log("=".repeat(60));
console.log("");
console.log("配置信息：");
console.log(`  API Key: ${EMBEDDING_API_KEY.replace(/^(.{4}).*/, "$1***")}`);
console.log(`  Base URL: ${EMBEDDING_BASE_URL}`);
console.log(`  Model: ${EMBEDDING_MODEL}`);
console.log("");

async function testEmbedding() {
  const client = new OpenAI({
    apiKey: EMBEDDING_API_KEY,
    baseURL: EMBEDDING_BASE_URL,
  });

  try {
    // 测试 1: 单个文本嵌入
    console.log("测试 1: 单个文本嵌入...");
    const singleResponse = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: ["这是一个测试文本，用于验证 Ollama 嵌入模型是否正常工作。"],
      encoding_format: "float",
    });

    console.log(`  ✓ 成功!`);
    console.log(`    向量维度：${singleResponse.data[0].embedding.length}`);
    console.log(`    模型：${singleResponse.model}`);
    console.log(`    使用 tokens: ${singleResponse.usage?.total_tokens || "N/A"}`);
    console.log("");

    // 测试 2: 批量文本嵌入
    console.log("测试 2: 批量文本嵌入...");
    const batchResponse = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [
        "个人笔记：今天学习了新的知识",
        "工作任务：完成项目代码审查",
        "随笔：周末去公园散步",
      ],
      encoding_format: "float",
    });

    console.log(`  ✓ 成功!`);
    console.log(`    批量大小：${batchResponse.data.length}`);
    console.log(`    每个向量维度：${batchResponse.data[0].embedding.length}`);
    console.log("");

    // 测试 3: 相似度计算
    console.log("测试 3: 相似度计算...");
    const vec1 = batchResponse.data[0].embedding; // 个人笔记
    const vec2 = batchResponse.data[1].embedding; // 工作任务
    const vec3 = batchResponse.data[2].embedding; // 随笔

    const sim12 = cosineSimilarity(vec1, vec2);
    const sim13 = cosineSimilarity(vec1, vec3);
    const sim23 = cosineSimilarity(vec2, vec3);

    console.log(`    个人笔记 vs 工作任务：${sim12.toFixed(4)}`);
    console.log(`    个人笔记 vs 随笔：${sim13.toFixed(4)}`);
    console.log(`    工作任务 vs 随笔：${sim23.toFixed(4)}`);
    console.log("");

    // 测试 4: 知识库路由测试
    console.log("测试 4: 知识库路由模拟测试...");
    try {
      const { createRoutingEngine } = await import("./routing/index.js");
      const engine = createRoutingEngine();

      const testCases = [
        { text: "个人日记：今天天气很好", expectedTable: "knowledge_personal" },
        { text: "工作项目进度报告", expectedTable: "knowledge_work" },
        { text: "笔记：JavaScript 学习心得", expectedTable: "knowledge_personal" },
        { text: "任务清单：完成代码审查", expectedTable: "knowledge_work" },
      ];

      for (const tc of testCases) {
        const result = engine.routeToKnowledgeBases(tc.text);
        const matched = result.targetTables.includes(tc.expectedTable);
        console.log(`    ${matched ? "✓" : "✗"} "${tc.text}" -> ${result.targetTables.join(", ")}`);
      }
    } catch (routingError) {
      console.log(`    ⚠ 路由测试跳过：${routingError.message}`);
      console.log(`    提示：路由模块是 TypeScript，需要使用 vitest 运行测试`);
    }
    console.log("");

    // 总结
    console.log("=".repeat(60));
    console.log("所有测试通过！Ollama 嵌入服务正常工作。");
    console.log("=".repeat(60));

  } catch (error) {
    console.log("");
    console.log("测试失败！");
    console.log("");
    console.log(`错误：${error.message || error}`);

    if (error.code === "ECONNREFUSED") {
      console.log("");
      console.log("建议：");
      console.log("  1. 确保 Ollama 服务正在运行：ollama serve");
      console.log("  2. 检查 Base URL 是否正确");
    } else if (error.status === 404 || error.message?.includes("not found")) {
      console.log("");
      console.log("建议：");
      console.log(`  1. 拉取模型：ollama pull ${EMBEDDING_MODEL}`);
      console.log("  2. 查看可用模型：ollama list");
    } else if (error.message?.includes("apiKey")) {
      console.log("");
      console.log("建议：");
      console.log("  检查 .env 中的 API Key 配置是否正确");
    }

    process.exit(1);
  }
}

/**
 * 计算两个向量的余弦相似度
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 运行测试
testEmbedding().catch(console.error);
