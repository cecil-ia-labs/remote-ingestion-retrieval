import {
  AsyncLocalStorage,
} from "node:async_hooks";

import type {
  SourceErrorStage,
} from "../errors/error-model.types.js";

import type {
  ExecutionBudgetConsumeOptions,
} from "./execution-budget-tracker.js";

import {
  ExecutionBudgetTracker,
} from "./execution-budget-tracker.js";

import {
  isExecutionBudgetError,
} from "./execution-limit.errors.js";

import type {
  ExecutionBudgetCounterName,
} from "./execution-limits.js";

const runtime =
  new AsyncLocalStorage<ExecutionBudgetTracker>();

export function currentExecutionBudget():
  ExecutionBudgetTracker | undefined {
  return runtime.getStore();
}

export async function runWithExecutionBudget<T>(
  budget:
    ExecutionBudgetTracker,

  operation:
    () => Promise<T>,
): Promise<T> {
  return runtime.run(
    budget,
    operation,
  );
}

export function consumeExecutionBudget(
  counter:
    ExecutionBudgetCounterName,

  amount = 1,

  options:
    ExecutionBudgetConsumeOptions = {},
): void {
  currentExecutionBudget()
    ?.consume(
      counter,
      amount,
      options,
    );
}

export function assertExecutionBudget(
  stage:
    SourceErrorStage = "website-sync",
): void {
  currentExecutionBudget()
    ?.throwIfExceeded(
      stage,
    );
}

export function throwIfExecutionBudgetAborted(
  signal:
    AbortSignal | undefined,
): void {
  if (
    signal?.aborted
    && isExecutionBudgetError(
      signal.reason,
    )
  ) {
    throw signal.reason;
  }
}
