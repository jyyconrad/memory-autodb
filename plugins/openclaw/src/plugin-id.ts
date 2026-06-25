export const OPENCLAW_MEMORY_PLUGIN_ID = "mengshu-openclaw";
export const OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS = ["memory-autodb", "mengshu"] as const;

export type OpenClawLegacyMemoryPluginId = (typeof OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS)[number];
export type OpenClawMemoryPluginId = typeof OPENCLAW_MEMORY_PLUGIN_ID | OpenClawLegacyMemoryPluginId;

export function isOpenClawMemoryPluginId(id: unknown): id is OpenClawMemoryPluginId {
  return id === OPENCLAW_MEMORY_PLUGIN_ID || OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS.includes(id as OpenClawLegacyMemoryPluginId);
}
