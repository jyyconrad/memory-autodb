/**
 * v4 migration planning helpers.
 *
 * 当前先提供 dry-run/plan 语义，把 legacy records 估算为 v4 documents/chunks/jobs
 * 的迁移影响；执行阶段保持幂等，由调用方逐步接入实际持久化 repository。
 */

import type { MemoryRecord } from "../core/types.js";

export interface V4MigrationPlan {
  sourceRecords: number;
  memoryRecords: number;
  documentRecords: number;
  chunksEstimated: number;
  entitiesEstimated: number;
  jobsEstimated: number;
  dryRun: boolean;
}

export interface V4MigrationResult extends V4MigrationPlan {
  applied: boolean;
  skippedExisting: number;
}

export function planV4Migration(records: MemoryRecord[], dryRun = true): V4MigrationPlan {
  const documentRecords = records.filter((record) => record.dataType === "document" || record.dataType === "knowledge").length;
  const memoryRecords = records.length - documentRecords;
  return {
    sourceRecords: records.length,
    memoryRecords,
    documentRecords,
    chunksEstimated: documentRecords,
    entitiesEstimated: Math.ceil(records.length * 0.4),
    jobsEstimated: documentRecords * 2,
    dryRun,
  };
}

export function runV4Migration(records: MemoryRecord[], options: { dryRun?: boolean; existingIds?: Set<string> } = {}): V4MigrationResult {
  const existingIds = options.existingIds ?? new Set<string>();
  const newRecords = records.filter((record) => !existingIds.has(record.id));
  const plan = planV4Migration(newRecords, options.dryRun ?? true);
  return {
    ...plan,
    applied: !(options.dryRun ?? true),
    skippedExisting: records.length - newRecords.length,
  };
}
