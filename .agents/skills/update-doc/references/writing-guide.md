# Open-Source Documentation Writing Guide

Use the relevant section for the document type you are writing.

## Table Of Contents

- [1. Getting Started](#1-getting-started)
- [2. Configuration](#2-configuration)
- [3. API Reference](#3-api-reference)
- [4. Architecture](#4-architecture)
- [5. Design](#5-design)
- [6. Full Red-Line Checklist](#6-full-red-line-checklist)
- [7. Documentation Update Flow](#7-documentation-update-flow)
- [8. Tools And Commands](#8-tools-and-commands)
- [9. Common Templates](#9-common-templates)

## 1. Getting Started

Must include:

- clear, copyable installation steps;
- minimal configuration that can be completed in about five minutes;
- a runnable Hello World example;
- next-step links.

Example structure:

````markdown
# Quick Start

## Install
```bash
npm install -g mengshu
```

## Initialize
```bash
ms init
```

## Basic Usage
```typescript
import { MemoryService } from "mengshu";
```

## Next Steps
- [Configuration](configuration.md)
- [Integration](integration.md)
````

## 2. Configuration

Must include:

- config file locations;
- every public config item in a table;
- defaults;
- example config;
- common troubleshooting notes.

Format:

```markdown
## Configuration Options

| Field | Description | Default | Required |
|-------|-------------|---------|----------|
| `apiKey` | LLM API key | - | Yes |
| `model` | Model name | `gpt-4o-mini` | No |
```

## 3. API Reference

Must include:

- interface signature;
- parameters;
- return values;
- example code;
- error handling.

Format:

````markdown
## memory.recall(options)

Recall relevant memories.

### Parameters

- `query` (string) - Search query.
- `limit` (number) - Maximum hits, default 5.
- `minImportance` (number) - Minimum importance threshold.

### Returns

```typescript
{
  memories: Memory[];
  context: string;
}
```

### Example

```typescript
const result = await memory.recall({
  query: "user preference",
  limit: 5,
});
```
````

## 4. Architecture

Principles:

- keep it high-level;
- use diagrams when useful;
- explain "why" before "how";
- avoid detailed class diagrams, private method signatures, and low-level implementation details.

Include:

- system overview;
- module boundaries and responsibilities;
- technology choices and rationale;
- extension and integration model.

## 5. Design

Use for core algorithm explanations, key decisions, and stable data models.

Principles:

- keep the public version concise;
- focus on implemented decisions;
- remove process notes and temporary planning;
- preserve the single source of truth for D-01 to D-23 decisions.

When algorithm-level decisions change, sync the public condensed docs in `docs/design/` and the internal full docs under `.memory-docs/.../04-design/` if present.

## 6. Full Red-Line Checklist

Do not expose:

1. Internal process: requirements discussion, design iteration, test case workflow, defect records.
2. Implementation details: private functions, internal file organization unless necessary, low-level code details.
3. Temporary status: "next step", "TODO", "FIXME", unfinished functionality.

Do expose:

1. User value: features, usage, best practices.
2. API contract: public interfaces, data formats, error behavior.
3. Architecture decisions: design rationale, technology choices, extension points.

## 7. Documentation Update Flow

For new features:

1. Add or update user guide.
2. Update API reference.
3. Update configuration docs when config changes.
4. Record changelog in internal docs when needed.

For modified features:

1. Identify affected docs.
2. Update code and docs together.
3. Call out breaking changes clearly.

For removed features:

1. Mark deprecated first.
2. Provide migration guidance.
3. Remove docs in the next major version.

## 8. Tools And Commands

Use these only if available in the project:

```bash
npx markdown-link-check docs/**/*.md
npx cspell "docs/**/*.md"
npm run docs:api
npm run docs:serve
```

## 9. Common Templates

### User Guide Template

````markdown
# Feature Name

> One-sentence summary.

## Use Cases

Explain when to use this feature.

## Quick Example

```typescript
// minimal example
```

## Details

### Step 1
### Step 2

## Notes

- Note 1
- Note 2

## Next Steps

- [Related feature](link)
````

### API Reference Template

```markdown
## functionName(params)

One-sentence description.

### Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|

### Returns

### Example

### Error Handling
```
