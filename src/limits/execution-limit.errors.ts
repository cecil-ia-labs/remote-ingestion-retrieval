import type {
  SourceErrorStage,
} from "../errors/error-model.types.js";

import {
  SourceIngestionError,
} from "../errors/source-ingestion-error.js";

import type {
  ExecutionBudgetCounterName,
  ExecutionLimits,
} from "./execution-limits.js";

export class InvalidExecutionLimitError
  extends SourceIngestionError {
  constructor(
    readonly limitName:
      keyof ExecutionLimits,

    readonly limit:
      number,
  ) {
    super(
      `Execution limit ${limitName} must be a positive integer; received ${limit}.`,
      {
        code:
          "EXECUTION_LIMIT_INVALID_CONFIG",
        category:
          "validation",
        stage:
          "website-sync",
        retryability:
          "no",
        details: {
          limitName,
          limit,
        },
      },
    );
  }
}

export interface ExecutionLimitExceededErrorOptions {
  readonly stage?:
    SourceErrorStage;

  readonly url?:
    string;
}

export class ExecutionLimitExceededError
  extends SourceIngestionError {
  constructor(
    readonly counter:
      ExecutionBudgetCounterName,

    readonly limitName:
      keyof ExecutionLimits,

    readonly limit:
      number,

    readonly consumed:
      number,

    readonly attempted:
      number,

    options:
      ExecutionLimitExceededErrorOptions = {},
  ) {
    super(
      `Execution budget exceeded ${String(limitName)}: ${consumed} consumed + ${attempted} attempted > ${limit}.`,
      {
        code:
          "EXECUTION_LIMIT_EXCEEDED",
        category:
          "limit",
        stage:
          options.stage
          ?? "website-sync",
        retryability:
          "no",
        url:
          options.url,
        details: {
          counter,
          limitName,
          limit,
          consumed,
          attempted,
          projected:
            consumed + attempted,
        },
      },
    );
  }
}

export class ExecutionDeadlineExceededError
  extends SourceIngestionError {
  constructor(
    readonly limitMs:
      number,

    readonly elapsedMs:
      number,

    stage:
      SourceErrorStage = "website-sync",
  ) {
    super(
      `Execution deadline exceeded: ${elapsedMs.toFixed(2)} ms elapsed > ${limitMs} ms.`,
      {
        code:
          "EXECUTION_DEADLINE_EXCEEDED",
        category:
          "limit",
        stage,
        retryability:
          "no",
        aborted:
          true,
        details: {
          limitMs,
          elapsedMs,
        },
      },
    );
  }
}

export function isExecutionBudgetError(
  value:
    unknown,
): value is
  | ExecutionLimitExceededError
  | ExecutionDeadlineExceededError {
  return (
    value instanceof ExecutionLimitExceededError
    || value instanceof ExecutionDeadlineExceededError
  );
}
