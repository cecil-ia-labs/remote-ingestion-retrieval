import {
  CrawlSchedulingAbortedError,
  InvalidCrawlConcurrencyError,
} from "./crawl-scheduler.errors.js";

import {
  throwIfExecutionBudgetAborted,
} from "../limits/execution-budget-context.js";

import {
  createEmptyCrawlSchedulerStats,
} from "./crawl-scheduler.types.js";

import type {
  CrawlScheduledTask,
  CrawlScheduledTaskResult,
  CrawlSchedulerRunOptions,
  CrawlSchedulerStats,
} from "./crawl-scheduler.types.js";

export interface CrawlSchedulerOptions {
  defaultConcurrency?: number;
  maxConcurrency?: number;
}

/**
 * Executes one crawl batch with bounded concurrency while keeping each result
 * at the same index as its input task. The scheduler never emits completion
 * order as traversal order.
 */
export class CrawlScheduler {
  private readonly defaultConcurrency:
    number;

  private readonly maxConcurrency:
    number;

  private lastRunStats:
    CrawlSchedulerStats =
      createEmptyCrawlSchedulerStats();

  constructor(
    options: CrawlSchedulerOptions = {},
  ) {
    this.maxConcurrency =
      options.maxConcurrency
      ?? 32;

    this.defaultConcurrency =
      options.defaultConcurrency
      ?? 4;

    this.validateConcurrency(
      this.maxConcurrency,
      Number.MAX_SAFE_INTEGER,
    );

    this.validateConcurrency(
      this.defaultConcurrency,
      this.maxConcurrency,
    );
  }

  get stats():
    CrawlSchedulerStats {
    return {
      ...this.lastRunStats,
    };
  }

  resolveConcurrency(
    requested?: number,
  ): number {
    const concurrency =
      requested
      ?? this.defaultConcurrency;

    this.validateConcurrency(
      concurrency,
      this.maxConcurrency,
    );

    return concurrency;
  }

  async runOrdered<T>(
    tasks: readonly CrawlScheduledTask<T>[],
    options: CrawlSchedulerRunOptions = {},
  ): Promise<readonly CrawlScheduledTaskResult<T>[]> {
    const concurrency =
      this.resolveConcurrency(
        options.concurrency,
      );

    const stats =
      createEmptyCrawlSchedulerStats();

    stats.batches =
      tasks.length > 0
        ? 1
        : 0;

    stats.concurrencyLimit =
      concurrency;

    this.lastRunStats =
      stats;

    if (tasks.length === 0) {
      return [];
    }

    this.assertNotAborted(
      options.signal,
    );

    const results =
      new Array<
        CrawlScheduledTaskResult<T>
      >(tasks.length);

    let nextIndex =
      0;

    let active =
      0;

    const workerCount =
      Math.min(
        concurrency,
        tasks.length,
      );

    const worker =
      async (): Promise<void> => {
        while (true) {
          this.assertNotAborted(
            options.signal,
          );

          const index =
            nextIndex;

          nextIndex +=
            1;

          if (
            index
            >= tasks.length
          ) {
            return;
          }

          const task =
            tasks[index];

          if (!task) {
            return;
          }

          active +=
            1;

          stats.tasksStarted +=
            1;

          stats.maxConcurrencyObserved =
            Math.max(
              stats.maxConcurrencyObserved,
              active,
            );

          try {
            const value =
              await task(
                options.signal,
              );

            results[index] = {
              status:
                "fulfilled",

              value,
            };

            stats.tasksFulfilled +=
              1;
          } catch (reason) {
            results[index] = {
              status:
                "rejected",

              reason,
            };

            stats.tasksRejected +=
              1;
          } finally {
            active -=
              1;
          }
        }
      };

    try {
      await Promise.all(
        Array.from(
          {
            length:
              workerCount,
          },
          () => worker(),
        ),
      );

      this.assertNotAborted(
        options.signal,
      );

      return results;
    } finally {
      this.lastRunStats = {
        ...stats,
      };
    }
  }

  private validateConcurrency(
    concurrency: number,
    maxConcurrency: number,
  ): void {
    if (
      !Number.isInteger(
        concurrency,
      )
      || concurrency < 1
      || concurrency
        > maxConcurrency
    ) {
      throw new InvalidCrawlConcurrencyError(
        concurrency,
        maxConcurrency,
      );
    }
  }

  private assertNotAborted(
    signal: AbortSignal | undefined,
  ): void {
    throwIfExecutionBudgetAborted(
      signal,
    );

    if (
      signal?.aborted
    ) {
      throw new CrawlSchedulingAbortedError();
    }
  }
}
