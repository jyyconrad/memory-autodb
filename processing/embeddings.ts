import OpenAI from "openai";
import pLimit from "p-limit";
import retry from "p-retry";
import type { MemoryConfig } from "../config";

export interface EmbeddingsOptions {
  /** 最大并发请求数 */
  concurrency?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 每批最大处理文本数 */
  maxBatchSize?: number;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_BATCH_SIZE = 20;

/**
 * 向量化服务类
 * 支持批量向量化、并发控制、请求重试
 */
export class Embeddings {
  private client: OpenAI;
  private limit: ReturnType<typeof pLimit>;
  private maxRetries: number;
  private maxBatchSize: number;
  private model: string;

  constructor(
    private readonly embeddingConfig: MemoryConfig["embedding"],
    private readonly batchConfig?: MemoryConfig["batchProcessing"],
    options: EmbeddingsOptions = {},
  ) {
    this.client = new OpenAI({
      apiKey: embeddingConfig.apiKey,
      baseURL: embeddingConfig.baseURL,
    });

    this.model = embeddingConfig.model ?? "text-embedding-3-small";

    const concurrency = options.concurrency ?? batchConfig?.concurrency ?? DEFAULT_CONCURRENCY;
    this.maxRetries = options.maxRetries ?? batchConfig?.retryAttempts ?? DEFAULT_MAX_RETRIES;
    this.maxBatchSize = options.maxBatchSize ?? batchConfig?.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;

    this.limit = pLimit(concurrency);
  }

  /**
   * 单个文本向量化
   * @param text 要向量化的文本
   * @returns 向量数组
   */
  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  /**
   * 批量文本向量化
   * @param texts 文本数组
   * @returns 向量数组，顺序与输入对应
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // 分批处理
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      batches.push(texts.slice(i, i + this.maxBatchSize));
    }

    // 并发处理所有批次
    const batchPromises = batches.map(batch =>
      this.limit(() => this.processBatch(batch))
    );

    const results = await Promise.all(batchPromises);
    return results.flat();
  }

  /**
   * 处理单个批次的向量化请求
   */
  private async processBatch(batch: string[]): Promise<number[][]> {
    return retry(
      async () => {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: "float",
        });

        // 按输入顺序返回结果
        return response.data.map(item => item.embedding);
      },
      {
        retries: this.maxRetries,
        minTimeout: 1000,
        maxTimeout: 5000,
        factor: 2,
      }
    );
  }
}
