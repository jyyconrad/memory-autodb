# 命名决策记录

> 日期：2026-06-14
> 状态：Accepted
> 配套：[brand-story.md](./brand-story.md)

---

## 决策

产品正式更名为**梦枢**（Mengshu）。

| 项目 | 值 |
|------|-----|
| 中文产品名 | 梦枢 |
| 英文名 | Mengshu |
| npm 作用域 | `@mengshu` |
| CLI 命令 | `ms` |
| 配置目录 | `~/.mengshu/` |
| 工作空间指针 | `.mengshu.json` |

---

## 为什么换名

1. `memory` 在开源生态中重名太多（Mem0、Zep、Letta……），辨识度低。
2. `autodb` 把产品压成"数据库"，掩盖了跨应用共享、结构化注入等核心特征。
3. 旧名隐含"OpenClaw 子项目"印象，与多产品中间件定位有冲突。

---

## 命名映射

### CLI

| 旧 | 新 |
|----|-----|
| `ltm init` | `ms init` |
| `ltm search` | `ms search` |
| `ltm stats` | `ms stats` |
| `ltm scan` | `ms scan` |
| 其他 `ltm *` | 对应 `ms *` |

### 路径

| 旧 | 新 |
|----|-----|
| `~/.memory-autodb/` | `~/.mengshu/` |
| `~/.openclaw/memory/autodb/` | `~/.mengshu/lancedb/` |
| `<project>/.memory-autodb.json` | `<project>/.mengshu.json` |

### 环境变量

| 旧 | 新 |
|----|-----|
| `MEMORY_AUTODB_HOME` | `MENGSHU_HOME` |

### 包名

| 旧 | 新 |
|----|-----|
| `@openclaw/memory-autodb` | `@mengshu/core` |

---

## 迁移原则

- 旧名（`ltm`、旧路径）保留兼容层至少两个版本，每次调用打印弃用提示。
- 提供 `ms migrate-home` 一键迁移，不强制、不破坏旧数据。
- API 字段名不改，品牌名只影响包名、CLI 入口和配置路径。

---

## 不变量

1. 中文产品名是**梦枢**，不加后缀。
2. 英文名是 **Mengshu**，不写作 `MengShu` / `Meng-Shu`。
3. CLI 主命令是 `ms`，子命令保持英文。
4. 品牌名不进入代码符号、API 字段名、日志输出。

---

## 待执行项

- [ ] 更新 `README.md` 加入新品牌名
- [ ] 更新 `product-positioning.md` 顶部加品牌映射
- [ ] `package.json` name 改为 `@mengshu/core`，bin 同时暴露 `ms` 和 `ltm`
- [ ] `openclaw.plugin.json` dbPath placeholder 更新
- [ ] `core/paths.ts` 新增 `MENGSHU_HOME`，旧路径作为兼容源
- [ ] CHANGELOG 记录更名
