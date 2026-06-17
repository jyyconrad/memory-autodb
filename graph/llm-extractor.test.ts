import { describe, expect, test, vi } from "vitest";
import {
  EXTRACTION_SCHEMA,
  GRAPH_EXTRACTION_SYSTEM_PROMPT,
  extractGraphWithLlm,
} from "./llm-extractor.js";
import { ENTITY_TYPES, RELATION_PREDICATES } from "./types.js";
import type { LlmClient, LlmCompletionMessage, SimpleJsonSchema } from "../processing/llm-client.js";

const scope = {
  tenantId: "local",
  appId: "openclaw",
  userId: "user-1",
  projectId: "project-1",
  agentId: "agent-1",
  namespace: "knowledge",
};

// 长文本，确保 extractGraphWithLlm 走 LLM 路径（>= 50 字符）。
const longText =
  "mengshu project uses PostgreSQL and LanceDB for storage. yyjiang works on the project.";

describe("GRAPH_EXTRACTION_SYSTEM_PROMPT (§2.4 / D-08)", () => {
  test("system prompt 包含角色定义与 evidence-bound 关键约束", () => {
    expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).toContain("知识图谱提取器");
    expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).toContain("evidence-bound");
    expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).toContain("规范名");
    expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).toContain("confidence");
  });

  test("system prompt 枚举全部 closed schema 实体类型与谓词", () => {
    for (const type of ENTITY_TYPES) {
      expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).toContain(type);
    }
    for (const predicate of RELATION_PREDICATES) {
      expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).toContain(predicate);
    }
  });

  test("system prompt 不含动态上下文占位（稳定规则才放 system）", () => {
    expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).not.toContain("projectName");
    expect(GRAPH_EXTRACTION_SYSTEM_PROMPT).not.toContain("待提取文本");
  });
});

describe("EXTRACTION_SCHEMA (对齐 §2.4 Response schema)", () => {
  test("顶层 required 标注 entities/relations（B1 运行时校验依据）", () => {
    expect(EXTRACTION_SCHEMA.required).toEqual(["entities", "relations"]);
  });

  test("entity 必填 name/type，可选 description/aliases", () => {
    const entityItem = EXTRACTION_SCHEMA.properties.entities.items;
    expect(entityItem.required).toEqual(["name", "type"]);
    expect(Object.keys(entityItem.properties)).toEqual(
      expect.arrayContaining(["name", "type", "description", "aliases"]),
    );
  });

  test("relation 必填 subject/predicate/object/evidence/confidence", () => {
    const relationItem = EXTRACTION_SCHEMA.properties.relations.items;
    expect(relationItem.required).toEqual([
      "subject",
      "predicate",
      "object",
      "evidence",
      "confidence",
    ]);
  });
});

describe("extractGraphWithLlm message 拆分 (D-08)", () => {
  function makeClient(
    capture: { messages?: LlmCompletionMessage[]; schema?: SimpleJsonSchema },
  ): LlmClient {
    return {
      available: true,
      complete: vi.fn(),
      summarize: vi.fn(),
      extractStructured: vi.fn(async (messages, schema) => {
        capture.messages = messages;
        capture.schema = schema;
        return { entities: [], relations: [] } as unknown;
      }),
    } as unknown as LlmClient;
  }

  test("稳定规则进 system，动态上下文与文本进 user", async () => {
    const capture: { messages?: LlmCompletionMessage[]; schema?: SimpleJsonSchema } = {};
    await extractGraphWithLlm(
      {
        scope,
        chunkId: "chunk-1",
        text: longText,
        createdAt: 1710000000000,
        context: { projectName: "mengshu", userName: "yyjiang" },
      },
      { llmClient: makeClient(capture) },
    );

    const messages = capture.messages ?? [];
    const system = messages.find((m) => m.role === "system");
    const user = messages.find((m) => m.role === "user");

    expect(system?.content).toBe(GRAPH_EXTRACTION_SYSTEM_PROMPT);
    expect(user?.content).toContain("projectName: mengshu");
    expect(user?.content).toContain("userName: yyjiang");
    expect(user?.content).toContain(longText);
    // 动态上下文不得出现在 system message（用专有值 yyjiang 断言，
    // 避免与角色定义里的品牌名 mengshu 混淆）。
    expect(system?.content).not.toContain("yyjiang");
    // 传入的 schema 即 EXTRACTION_SCHEMA（携带顶层 required，触发 B1 校验）。
    expect(capture.schema?.required).toEqual(["entities", "relations"]);
  });

  test("无 context 时 user message 仍含待提取文本", async () => {
    const capture: { messages?: LlmCompletionMessage[]; schema?: SimpleJsonSchema } = {};
    await extractGraphWithLlm(
      { scope, chunkId: "chunk-2", text: longText, createdAt: 1710000000000 },
      { llmClient: makeClient(capture) },
    );

    const user = (capture.messages ?? []).find((m) => m.role === "user");
    expect(user?.content).toContain(longText);
    expect(user?.content).not.toContain("提取上下文");
  });
});

describe("extractGraphWithLlm 经 validateExtraction 裁决 (铁律 §3.1)", () => {
  function clientReturning(raw: unknown): LlmClient {
    return {
      available: true,
      complete: vi.fn(),
      summarize: vi.fn(),
      extractStructured: vi.fn(async () => raw as unknown),
    } as unknown as LlmClient;
  }

  test("合法实体与关系经 validator 后正常入图", async () => {
    const raw = {
      entities: [
        { name: "PostgreSQL", type: "tool" },
        { name: "mengshu", type: "project" },
      ],
      relations: [
        {
          subject: "mengshu",
          predicate: "uses",
          object: "PostgreSQL",
          confidence: 0.8,
          evidence: "mengshu uses PostgreSQL",
        },
      ],
    };

    const result = await extractGraphWithLlm(
      { scope, chunkId: "chunk-1", text: longText, createdAt: 1710000000000 },
      { llmClient: clientReturning(raw) },
    );

    expect(result.entities.map((e) => e.displayName).sort()).toEqual(
      ["PostgreSQL", "mengshu"].sort(),
    );
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].predicate).toBe("uses");
  });

  test("confidence=0 的关系被 validator 拒绝（比旧内联过滤 >=0 更严格）", async () => {
    const raw = {
      entities: [
        { name: "PostgreSQL", type: "tool" },
        { name: "mengshu", type: "project" },
      ],
      relations: [
        {
          subject: "mengshu",
          predicate: "uses",
          object: "PostgreSQL",
          confidence: 0,
          evidence: "mengshu uses PostgreSQL",
        },
      ],
    };

    const result = await extractGraphWithLlm(
      { scope, chunkId: "chunk-1", text: longText, createdAt: 1710000000000 },
      { llmClient: clientReturning(raw) },
    );

    // validator 要求 confidence > 0，故该关系被丢弃。
    expect(result.relations).toHaveLength(0);
  });

  test("缺 evidence 的关系被 validator 拒绝", async () => {
    const raw = {
      entities: [
        { name: "PostgreSQL", type: "tool" },
        { name: "mengshu", type: "project" },
      ],
      relations: [
        {
          subject: "mengshu",
          predicate: "uses",
          object: "PostgreSQL",
          confidence: 0.9,
          evidence: "",
        },
      ],
    };

    const result = await extractGraphWithLlm(
      { scope, chunkId: "chunk-1", text: longText, createdAt: 1710000000000 },
      { llmClient: clientReturning(raw) },
    );

    expect(result.relations).toHaveLength(0);
  });

  test("subject/object 不在已声明实体中的关系被丢弃", async () => {
    const raw = {
      entities: [{ name: "PostgreSQL", type: "tool" }],
      relations: [
        {
          subject: "UnknownEntity",
          predicate: "uses",
          object: "PostgreSQL",
          confidence: 0.9,
          evidence: "UnknownEntity uses PostgreSQL",
        },
      ],
    };

    const result = await extractGraphWithLlm(
      { scope, chunkId: "chunk-1", text: longText, createdAt: 1710000000000 },
      { llmClient: clientReturning(raw) },
    );

    expect(result.entities).toHaveLength(1);
    expect(result.relations).toHaveLength(0);
  });
});
