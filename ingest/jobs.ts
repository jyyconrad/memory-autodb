/**
 * Ingestion job helpers.
 *
 * Job 的持久语义由 `JobRepository` 提供，这里只统一 dedupe key 约定，
 * 让 ingestion pipeline、workers 和后续文件系统 adapter 使用同一规则。
 */

import type { JobRecord, JobRepository } from "../storage/repositories/types.js";

export interface EnqueueUniqueJobInput {
  type: string;
  targetId: string;
  payload: Record<string, unknown>;
}

export function jobDedupeKey(type: string, targetId: string): string {
  return `${type}:${targetId}`;
}

export function enqueueUniqueJob(
  repository: JobRepository,
  input: EnqueueUniqueJobInput,
): Promise<JobRecord> {
  return repository.enqueue({
    type: input.type,
    payload: input.payload,
    dedupeKey: jobDedupeKey(input.type, input.targetId),
  });
}
