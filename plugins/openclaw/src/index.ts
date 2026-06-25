/**
 * OpenClaw plugin package entry.
 *
 * 这里是 OpenClaw 产品插件形态的 canonical 入口；根目录 index.ts 仅保留兼容转发。
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { memoryConfigSchema } from "../../../config.js";
import {
  registerOpenClawAdapter,
} from "./register.js";
import {
  OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS,
  OPENCLAW_MEMORY_PLUGIN_ID,
} from "./plugin-id.js";

export {
  escapeMemoryForPrompt,
  formatContextBlock,
  formatRelevantMemoriesContext,
  looksLikePromptInjection,
} from "../../../retrieval/prompt-safety.js";

export {
  detectCategory,
  shouldCapture,
} from "./hooks.js";

const memoryPlugin = {
  id: OPENCLAW_MEMORY_PLUGIN_ID,
  legacyPluginIds: [...OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS],
  name: "Mengshu OpenClaw",
  description: "mengshu local-first memory middleware for OpenClaw, sharing memory data through ~/.mengshu.",
  kind: "memory" as const,
  configSchema: memoryConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = memoryConfigSchema.parse(api.pluginConfig);
    registerOpenClawAdapter(api, cfg);
  },
};

export default memoryPlugin;
