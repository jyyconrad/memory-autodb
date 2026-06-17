/**
 * OpenClaw Memory Plugin
 *
 * Long-term memory with vector search for AI conversations.
 * Supports LanceDB (local) and Supabase (cloud) storage.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { memoryConfigSchema } from "./config.js";
import { registerOpenClawAdapter } from "./adapters/openclaw/index.js";

export {
  escapeMemoryForPrompt,
  formatContextBlock,
  formatRelevantMemoriesContext,
  looksLikePromptInjection,
} from "./retrieval/prompt-safety.js";

export {
  detectCategory,
  shouldCapture,
} from "./adapters/openclaw/hooks.js";

const memoryPlugin = {
  id: "mengshu",
  name: "Memory (AutoDB)",
  description: "Long-term memory with vector search, supporting local LanceDB and cloud Supabase storage, with auto-recall/capture and directory scanning capabilities.",
  kind: "memory" as const,
  configSchema: memoryConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = memoryConfigSchema.parse(api.pluginConfig);
    registerOpenClawAdapter(api, cfg);
  },
};

export default memoryPlugin;
