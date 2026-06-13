/**
 * 默认记忆服务实现。
 *
 * 当前版本先把核心服务边界立起来：store/recall/context/delete/health 都通过
 * repository 和 embedding port 完成；context 组装委托给 retrieval context packer，
 * 让 REST/MCP/SDK/OpenClaw 共用同一套 provenance 和 prompt safety 规则。
 */

import { packContext } from "../retrieval/context-packer.js";
import { auditLifecycle } from "../lifecycle/audit.js";
import { normalizeScope, validateScopeForWrite } from "./scope.js";
import type { AuditRepository } from "../storage/repositories/types.js";
import type { ContextBlock, RecallHit } from "./types.js";
import type {
  BuildContextInput,
  DeleteMemoryInput,
  DeleteMemoryResult,
  EmbeddingPort,
  HealthSnapshot,
  MemoryRepository,
  MemoryService,
  RecallInput,
  RecallResult,
  StoreMemoryInput,
  StoreMemoryResult,
} from "./service-types.js";

export type {
  BuildContextInput,
  DeleteMemoryInput,
  DeleteMemoryResult,
  EmbeddingPort,
  HealthSnapshot,
  MemoryRepository,
  MemoryRepositoryQuery,
  MemoryService,
  RecallInput,
  StoreMemoryInput,
  StoreMemoryResult,
} from "./service-types.js";

export interface DefaultMemoryServiceOptions {
  repository: MemoryRepository;
  embeddings: EmbeddingPort;
  /**
   * 可选审计仓库。注入后写入/拒绝路径会追加 audit 记录；不传时行为与不审计版本完全一致，
   * 保持向后兼容。
   */
  audit?: AuditRepository;
}

export class DefaultMemoryService implements MemoryService {
  private readonly repository: MemoryRepository;
  private readonly embeddings: EmbeddingPort;
  private readonly audit?: AuditRepository;

  constructor(options: DefaultMemoryServiceOptions) {
    this.repository = options.repository;
    this.embeddings = options.embeddings;
    this.audit = options.audit;
  }

  async storeMemory(input: StoreMemoryInput): Promise<StoreMemoryResult> {
    // v0.1 单 appId：record.scope 与 request scope 自洽校验，防止隔离字段缺失或被改动。
    try {
      validateScopeForWrite(input.record.scope, input.record.scope);
    } catch (error) {
      if (this.audit) {
        await auditLifecycle(this.audit, {
          scope: input.record.scope,
          action: "scope.reject",
          targetId: input.record.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }

    await this.repository.store([input.record]);

    if (this.audit) {
      await auditLifecycle(this.audit, {
        scope: input.record.scope,
        action: "memory.store",
        targetId: input.record.id,
      });
    }

    return {
      id: input.record.id,
      stored: true,
    };
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    const scope = normalizeScope(input.scope);
    const vector = await this.embeddings.embed(input.query);
    const records = await this.repository.query({
      query: input.query,
      vector,
      limit: input.limit,
      minScore: input.minScore,
      filter: input.filter,
      scope,
      tableName: input.tableName,
      dataTypes: input.dataTypes,
      searchAll: input.searchAll,
    });

    const hits: RecallHit[] = records.map((record) => ({
      record,
      score: record.score,
      source: "vector",
      scoreBreakdown: { vector: record.score },
      provenance: record.provenance,
    }));

    return {
      scope,
      query: input.query,
      hits,
    };
  }

  async buildContext(input: BuildContextInput): Promise<ContextBlock> {
    const recalled = await this.recall(input);
    return packContext({
      scope: recalled.scope,
      title: input.title ?? "Retrieved Context",
      hits: recalled.hits,
    });
  }

  async delete(input: DeleteMemoryInput): Promise<DeleteMemoryResult> {
    if (input.ids && input.ids.length > 0) {
      await this.repository.delete(input.ids);
      return { deleted: input.ids.length };
    }
    if (input.filter) {
      const deleted = await this.repository.deleteByFilter(input.filter);
      return { deleted };
    }
    return { deleted: 0 };
  }

  async health(): Promise<HealthSnapshot> {
    try {
      const records = await this.repository.count();
      return { ok: true, records };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
