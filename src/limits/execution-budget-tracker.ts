import {
  performance,
} from "node:perf_hooks";

import type {
  SourceErrorStage,
} from "../errors/error-model.types.js";

import {
  ExecutionDeadlineExceededError,
  ExecutionLimitExceededError,
  InvalidExecutionLimitError,
} from "./execution-limit.errors.js";

import {
  createEmptyExecutionBudgetUsage,
  EXECUTION_BUDGET_SCHEMA_VERSION,
  EXECUTION_LIMIT_BY_COUNTER,
} from "./execution-limits.js";

import type {
  ExecutionBudgetCounterName,
  ExecutionBudgetDimension,
  ExecutionBudgetSnapshot,
  ExecutionBudgetUsage,
  ExecutionLimits,
} from "./execution-limits.js";

export interface ExecutionBudgetTrackerOptions {
  readonly limits?:
    ExecutionLimits;

  readonly now?:
    () => Date;

  readonly monotonicNow?:
    () => number;
}

export interface ExecutionBudgetConsumeOptions {
  readonly stage?:
    SourceErrorStage;

  readonly url?:
    string;
}

function normalizeLimits(
  limits:
    ExecutionLimits | undefined,
): ExecutionLimits {
  const result:
    Partial<Record<keyof ExecutionLimits, number>> = {};

  for (
    const [
      name,
      value,
    ]
    of Object.entries(
      limits
      ?? {},
    ) as [
      keyof ExecutionLimits,
      number | undefined,
    ][]
  ) {
    if (
      value === undefined
    ) {
      continue;
    }

    if (
      !Number.isInteger(
        value,
      )
      || value <= 0
    ) {
      throw new InvalidExecutionLimitError(
        name,
        value,
      );
    }

    result[name] =
      value;
  }

  return Object.freeze({
    ...result,
  });
}

function cloneUsage(
  usage:
    ExecutionBudgetUsage,
): ExecutionBudgetUsage {
  return Object.freeze({
    ...usage,
  });
}

export class ExecutionBudgetTracker {
  readonly limits:
    ExecutionLimits;

  private usage:
    ExecutionBudgetUsage;

  private readonly startedAtDate:
    Date;

  private readonly startedMonotonic:
    number;

  private readonly now:
    () => Date;

  private readonly monotonicNow:
    () => number;

  private readonly controller =
    new AbortController();

  private deadlineTimer?:
    NodeJS.Timeout;

  constructor(
    options:
      ExecutionBudgetTrackerOptions = {},
  ) {
    this.limits =
      normalizeLimits(
        options.limits,
      );

    this.now =
      options.now
      ?? (() => new Date());

    this.monotonicNow =
      options.monotonicNow
      ?? (() => performance.now());

    this.startedAtDate =
      this.now();

    this.startedMonotonic =
      this.monotonicNow();

    this.usage =
      createEmptyExecutionBudgetUsage();

    if (
      this.limits.maxElapsedMs
      !== undefined
    ) {
      this.deadlineTimer =
        setTimeout(
          () => {
            if (
              this.controller.signal.aborted
            ) {
              return;
            }

            const elapsedMs =
              this.elapsedMs();

            this.controller.abort(
              new ExecutionDeadlineExceededError(
                this.limits.maxElapsedMs!,
                elapsedMs,
              ),
            );
          },
          this.limits.maxElapsedMs,
        );

      this.deadlineTimer.unref();
    }
  }

  get signal():
    AbortSignal {
    return this.controller.signal;
  }

  signalWith(
    external:
      AbortSignal | undefined,
  ): AbortSignal {
    if (!external) {
      return this.signal;
    }

    return AbortSignal.any([
      external,
      this.signal,
    ]);
  }

  consume(
    counter:
      ExecutionBudgetCounterName,

    amount = 1,

    options:
      ExecutionBudgetConsumeOptions = {},
  ): void {
    if (
      !Number.isInteger(
        amount,
      )
      || amount < 0
    ) {
      throw new RangeError(
        `Execution budget consumption must be a non-negative integer; received ${amount}.`,
      );
    }

    this.throwIfExceeded(
      options.stage,
    );

    if (
      amount === 0
    ) {
      return;
    }

    const limitName =
      EXECUTION_LIMIT_BY_COUNTER[
        counter
      ];

    const limit =
      this.limits[
        limitName
      ];

    const consumed =
      this.usage[
        counter
      ];

    if (
      limit !== undefined
      && consumed + amount
        > limit
    ) {
      throw new ExecutionLimitExceededError(
        counter,
        limitName,
        limit,
        consumed,
        amount,
        options,
      );
    }

    this.usage = {
      ...this.usage,
      [counter]:
        consumed + amount,
    };
  }

  throwIfExceeded(
    stage:
      SourceErrorStage = "website-sync",
  ): void {
    if (
      this.signal.aborted
    ) {
      const reason =
        this.signal.reason;

      if (
        reason instanceof Error
      ) {
        throw reason;
      }

      throw new ExecutionDeadlineExceededError(
        this.limits.maxElapsedMs
        ?? 0,
        this.elapsedMs(),
        stage,
      );
    }

    const maxElapsedMs =
      this.limits.maxElapsedMs;

    if (
      maxElapsedMs !== undefined
      && this.elapsedMs()
        > maxElapsedMs
    ) {
      const error =
        new ExecutionDeadlineExceededError(
          maxElapsedMs,
          this.elapsedMs(),
          stage,
        );

      this.controller.abort(
        error,
      );

      throw error;
    }
  }

  snapshot():
    ExecutionBudgetSnapshot {
    const elapsedMs =
      this.elapsedMs();

    const remaining:
      Partial<Record<ExecutionBudgetDimension, number>> = {};

    for (
      const [
        counter,
        limitName,
      ]
      of Object.entries(
        EXECUTION_LIMIT_BY_COUNTER,
      ) as [
        ExecutionBudgetCounterName,
        keyof ExecutionLimits,
      ][]
    ) {
      const limit =
        this.limits[
          limitName
        ];

      if (
        limit !== undefined
      ) {
        remaining[counter] =
          Math.max(
            0,
            limit
            - this.usage[
              counter
            ],
          );
      }
    }

    if (
      this.limits.maxElapsedMs
      !== undefined
    ) {
      remaining.elapsedMs =
        Math.max(
          0,
          this.limits.maxElapsedMs
          - elapsedMs,
        );
    }

    const deadlineAt =
      this.limits.maxElapsedMs
      === undefined
        ? undefined
        : new Date(
            this.startedAtDate.getTime()
            + this.limits.maxElapsedMs,
          ).toISOString();

    return {
      schemaVersion:
        EXECUTION_BUDGET_SCHEMA_VERSION,
      startedAt:
        this.startedAtDate.toISOString(),
      deadlineAt,
      elapsedMs,
      limits:
        this.limits,
      consumed:
        cloneUsage(
          this.usage,
        ),
      remaining:
        Object.freeze({
          ...remaining,
        }),
    };
  }

  close():
    void {
    if (
      this.deadlineTimer
    ) {
      clearTimeout(
        this.deadlineTimer,
      );

      this.deadlineTimer =
        undefined;
    }
  }

  private elapsedMs():
    number {
    return Math.max(
      0,
      this.monotonicNow()
      - this.startedMonotonic,
    );
  }
}
