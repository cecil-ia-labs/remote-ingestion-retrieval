export type CrawlScheduledTask<T> = (
  signal?: AbortSignal,
) => Promise<T>;

export type CrawlScheduledTaskResult<T> =
  | {
      status: "fulfilled";
      value: T;
    }
  | {
      status: "rejected";
      reason: unknown;
    };

export interface CrawlSchedulerRunOptions {
  concurrency?: number;
  signal?: AbortSignal;
}

export interface CrawlSchedulerStats {
  batches: number;
  tasksStarted: number;
  tasksFulfilled: number;
  tasksRejected: number;
  maxConcurrencyObserved: number;
  concurrencyLimit: number;
}

export function createEmptyCrawlSchedulerStats():
  CrawlSchedulerStats {
  return {
    batches: 0,
    tasksStarted: 0,
    tasksFulfilled: 0,
    tasksRejected: 0,
    maxConcurrencyObserved: 0,
    concurrencyLimit: 0,
  };
}
