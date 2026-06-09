/**
 * Minimal durable job worker runner.
 *
 * Worker 只从 `JobRepository` lease 一个 job，调用对应 handler，并根据结果
 * complete/fail；重试、过期 lease 恢复由 repository 语义保证。
 */

import type { JobRecord, JobRepository } from "../storage/repositories/types.js";

export type JobHandler = (job: JobRecord) => Promise<unknown>;

export interface RunNextJobOptions {
  workerId: string;
  leaseMs: number;
  handlers: Record<string, JobHandler | undefined>;
}

export type RunNextJobResult =
  | { status: "idle" }
  | { status: "completed"; id: string; type: string; result: unknown }
  | { status: "failed"; id: string; type: string; error: string };

export async function runNextJob(
  repository: JobRepository,
  options: RunNextJobOptions,
): Promise<RunNextJobResult> {
  const job = await repository.lease({
    workerId: options.workerId,
    leaseMs: options.leaseMs,
  });
  if (!job) {
    return { status: "idle" };
  }

  const handler = options.handlers[job.type];
  if (!handler) {
    const error = `No handler registered for job type: ${job.type}`;
    await repository.fail(job.id, error);
    return { status: "failed", id: job.id, type: job.type, error };
  }

  try {
    const result = await handler(job);
    await repository.complete(job.id);
    return { status: "completed", id: job.id, type: job.type, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await repository.fail(job.id, error);
    return { status: "failed", id: job.id, type: job.type, error };
  }
}
