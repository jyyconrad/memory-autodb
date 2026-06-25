/**
 * Canonicalize raw source content into Markdown plus metadata.
 *
 * 支持 YAML front matter 的常见子集，避免引入额外热路径复杂度；正文会做稳定的
 * 空白归一化，使 chunk hash 在重复导入时保持一致。
 */

import { parseFrontMatter } from "./front-matter.js";
import type { CanonicalizeInput, CanonicalizedDocument } from "./types.js";

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function canonicalize(input: CanonicalizeInput): CanonicalizedDocument {
  const { attributes, body } = parseFrontMatter(input.content);
  return {
    sourceId: input.sourceId,
    markdown: normalizeMarkdown(body),
    metadata: {
      ...attributes,
      ...(input.metadata ?? {}),
      sourceId: input.sourceId,
    },
  };
}
