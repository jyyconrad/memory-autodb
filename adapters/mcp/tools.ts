/**
 * MCP core tool adapter.
 *
 * 第一阶段不绑定具体 MCP SDK/transport，只提供稳定的工具注册表和 execute 映射；
 * 后续可以把这些定义挂到 stdio/http MCP server。
 */

import type {
  BuildContextInput,
  DeleteMemoryInput,
  MemoryService,
  RecallInput,
  StoreMemoryInput,
} from "../../core/service-types.js";

export interface McpMemoryTool {
  name: string;
  description: string;
  execute(input: Record<string, unknown>): Promise<unknown>;
}

export interface McpMemoryToolsOptions {
  service: MemoryService;
  namespaces?: string[];
}

export function createMcpMemoryTools(options: McpMemoryToolsOptions): McpMemoryTool[] {
  const namespaces = options.namespaces ?? ["memories", "knowledge"];

  return [
    {
      name: "memory_save",
      description: "Save a memory record.",
      execute: (input) => options.service.storeMemory(input as unknown as StoreMemoryInput),
    },
    {
      name: "memory_recall",
      description: "Recall relevant memories.",
      execute: (input) => options.service.recall(input as unknown as RecallInput),
    },
    {
      name: "memory_context",
      description: "Build a prompt-safe context block from recalled memories.",
      execute: (input) => options.service.buildContext(input as unknown as BuildContextInput),
    },
    {
      name: "memory_observe",
      description: "Observe and save a memory record.",
      execute: (input) => options.service.storeMemory(input as unknown as StoreMemoryInput),
    },
    {
      name: "memory_ingest",
      description: "Ingest an external source into memory.",
      execute: async () => ({
        error: "memory_ingest is not implemented until ingestion pipeline is available",
      }),
    },
    {
      name: "memory_namespaces",
      description: "List known memory namespaces.",
      execute: async () => ({ namespaces }),
    },
    {
      name: "memory_forget",
      description: "Forget memories by ids or filter.",
      execute: (input) => options.service.delete(input as unknown as DeleteMemoryInput),
    },
    {
      name: "memory_health",
      description: "Return memory service health.",
      execute: async () => options.service.health(),
    },
  ];
}
