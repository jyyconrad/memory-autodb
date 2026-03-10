/**
 * Ollama 嵌入模型测试脚本
 *
 * 使用方法：
 * 1. 确保 Ollama 服务运行：ollama serve
 * 2. 确保已拉取模型：ollama pull nomic-embed-text
 * 3. 运行测试：node test-ollama-embed.js
 */

import OpenAI from "openai";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "nomic-embed-text";

async function testOllamaEmbed() {
  console.log(`Testing Ollama embedding...`);
  console.log(`  Base URL: ${OLLAMA_BASE_URL}`);
  console.log(`  Model: ${OLLAMA_MODEL}`);
  console.log("");

  const client = new OpenAI({
    apiKey: "ollama",
    baseURL: OLLAMA_BASE_URL,
  });

  try {
    // 测试单个文本
    console.log("Testing single text embedding...");
    const response = await client.embeddings.create({
      model: OLLAMA_MODEL,
      input: ["Hello, this is a test."],
      encoding_format: "float",
    });

    console.log(`  Success!`);
    console.log(`  Vector dimensions: ${response.data[0].embedding.length}`);
    console.log(`  Model: ${response.model}`);
    console.log(`  Usage: ${response.usage?.total_tokens || "N/A"} tokens`);
    console.log("");

    // 测试批量文本
    console.log("Testing batch embeddings...");
    const batchResponse = await client.embeddings.create({
      model: OLLAMA_MODEL,
      input: [
        "First text",
        "Second text",
        "Third text",
      ],
      encoding_format: "float",
    });

    console.log(`  Success!`);
    console.log(`  Batch size: ${batchResponse.data.length}`);
    console.log(`  Each vector dimensions: ${batchResponse.data[0].embedding.length}`);
    console.log("");

    // 测试相似度计算
    console.log("Testing similarity calculation...");
    const vec1 = batchResponse.data[0].embedding;
    const vec2 = batchResponse.data[1].embedding;

    const similarity = cosineSimilarity(vec1, vec2);
    console.log(`  Similarity between 'First text' and 'Second text': ${similarity.toFixed(4)}`);
    console.log("");

    console.log("All tests passed!");
  } catch (error) {
    console.error("Error during embedding test:");
    if (error.code === "ECONNREFUSED") {
      console.error("  - Ollama service is not running. Start with: ollama serve");
    } else if (error.status === 404) {
      console.error(`  - Model '${OLLAMA_MODEL}' not found. Pull with: ollama pull ${OLLAMA_MODEL}`);
    } else {
      console.error(error);
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
testOllamaEmbed().catch(console.error);
