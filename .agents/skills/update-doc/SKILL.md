---
name: update-doc
description: Mengshu project documentation router for Codex. Use whenever the user asks to update docs, write documentation, generate guides, update API docs, convert internal design to public docs, initialize/check the internal document system, or mentions update-doc/doc-health in this repository.
---

# Update Doc

Use this skill as the Codex equivalent of the project `.claude/commands/update-doc.md` command.
It routes documentation work to the right document system and keeps internal process docs separate from public user-facing docs.

Mengshu has two documentation systems:

| Target | Document System | Output Location | Codex Approach |
|--------|-----------------|-----------------|----------------|
| Internal process docs | 9 numbered directories | `.memory-docs/original-docs/` | Use the global `document-workflow` skill when available |
| Public open-source docs | guides/api/architecture/design | `docs/` | Use this skill's public documentation workflow |

The single source of truth design documents can exist in both systems:
the internal full version under `.memory-docs/.../04-design/`, and the public condensed version under `docs/design/`.
When changing D-01 to D-23 design decisions, update both if both are present.

## Routing Rules

### Internal Process Documentation

Route to internal process docs when the user asks for:

| User Intent | Create or Update |
|-------------|------------------|
| "初始化文档系统", "建立文档规范" | 9-directory structure and config |
| "需要支持 XX 功能" | business requirements and system requirements |
| "数据库 Schema 变了" | database design docs |
| "XX 接口报错", "发现 Bug" | defect records and changelog |
| "准备发布 v1.x" | changelog |
| "设计 XX 模块" | module design or detailed design |
| `/doc-health`, "检查文档状态" | health check |

For these tasks, prefer the existing global `document-workflow` skill if it is available in the session.
If it is unavailable, preserve the same 9-directory internal structure and follow `.claude/rules/documentation-rules.md`.

### Public Open-Source Documentation

Route to `docs/` when the user asks for:

| User Intent | Create or Update |
|-------------|------------------|
| "写用户指南", "快速开始" | `docs/guides/` |
| "更新 API 参考", "CLI 命令文档" | `docs/api/` |
| "架构概览" for external users | `docs/architecture/` |
| "核心设计文档" public condensed version | `docs/design/` |
| "把内部设计转成对外文档" | matching `docs/` subdirectory with red-line filtering |

For public docs, follow the workflow below and read `references/writing-guide.md` for the relevant document type.

## When To Ask

Ask one concise question only when the target is ambiguous:

> 这是写给团队内部看的过程记录，还是给最终用户看的对外文档？

Do not ask when the path or wording already makes the target clear.

## Execution Flow

1. Identify intent and route to internal process docs or public docs.
2. Read the relevant existing docs before editing to match local structure and terminology.
3. For substantial changes, give a short plan first:
   - initialization that creates many files;
   - updates touching more than three docs;
   - conversion from internal design to public docs where red-line filtering matters.
4. For a narrow single-doc update, edit directly.
5. Verify links, examples, and consistency where practical.
6. Summarize changed files and any validation you ran.

## Public Docs Workflow

Public docs are for users, integrators, and contributors. They should explain how to use mengshu, not how internal work happened.

Directory map:

```text
docs/
├── README.md
├── guides/
├── api/
├── architecture/
└── design/
```

Use this policy:

- User guides: installation, configuration, integration, best practices, and runnable examples.
- API reference: public CLI/API contracts, parameters, return values, examples, and errors.
- Architecture: high-level module responsibilities, design rationale, extension points.
- Design: implemented core decisions and algorithms, especially D-01 to D-23.

## Red Lines For Public Docs

Do not expose:

- internal process notes, requirements discussion, defect triage, or test-case workflow;
- unnecessary internal function names, temporary file organization, or implementation details;
- "TODO", "待实施", "下一步", "FIXME", or unfinished promises.

Do expose:

- user value, usage steps, configuration, and best practices;
- public API contracts, data shapes, and error behavior;
- architecture decisions and extension model at a stable conceptual level.

## References

- For public docs templates and detailed writing rules, read `references/writing-guide.md`.
- For the internal 9-directory documentation rules, consult `.claude/rules/documentation-rules.md` in this repository if needed.
