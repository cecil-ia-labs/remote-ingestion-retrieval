import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeSourceError,
} from "../../errors/index.js";

import {
  consumeExecutionBudget,
  currentExecutionBudget,
  ExecutionBudgetTracker,
  ExecutionDeadlineExceededError,
  ExecutionLimitExceededError,
  InvalidExecutionLimitError,
  runWithExecutionBudget,
} from "../index.js";

test(
  "tracks cumulative usage and remaining budget",
  () => {
    const tracker =
      new ExecutionBudgetTracker({
        limits: {
          maxDiscoveredUrls:
            5,
          maxFetchedBytes:
            100,
        },
      });

    try {
      tracker.consume(
        "discoveredUrls",
        2,
      );

      tracker.consume(
        "fetchedBytes",
        40,
      );

      const snapshot =
        tracker.snapshot();

      assert.equal(
        snapshot.consumed
          .discoveredUrls,
        2,
      );

      assert.equal(
        snapshot.remaining
          .discoveredUrls,
        3,
      );

      assert.equal(
        snapshot.consumed
          .fetchedBytes,
        40,
      );

      assert.equal(
        snapshot.remaining
          .fetchedBytes,
        60,
      );
    } finally {
      tracker.close();
    }
  },
);

test(
  "throws a structured non-retryable limit error before over-consuming",
  () => {
    const tracker =
      new ExecutionBudgetTracker({
        limits: {
          maxChunks:
            3,
        },
      });

    try {
      tracker.consume(
        "chunks",
        2,
      );

      assert.throws(
        () => tracker.consume(
          "chunks",
          2,
          {
            stage:
              "chunk",
            url:
              "https://example.com/docs",
          },
        ),
        (error) => {
          assert.ok(
            error instanceof ExecutionLimitExceededError,
          );

          const descriptor =
            describeSourceError(
              error,
              {
                includeStack:
                  false,
              },
            );

          assert.equal(
            descriptor.code,
            "EXECUTION_LIMIT_EXCEEDED",
          );

          assert.equal(
            descriptor.category,
            "limit",
          );

          assert.equal(
            descriptor.stage,
            "chunk",
          );

          assert.equal(
            descriptor.retryability,
            "no",
          );

          assert.equal(
            tracker.snapshot()
              .consumed.chunks,
            2,
          );

          return true;
        },
      );
    } finally {
      tracker.close();
    }
  },
);

test(
  "rejects zero and negative configured limits",
  () => {
    assert.throws(
      () => new ExecutionBudgetTracker({
        limits: {
          maxVectorUpserts:
            0,
        },
      }),
      InvalidExecutionLimitError,
    );
  },
);

test(
  "propagates the current budget through async context",
  async () => {
    const tracker =
      new ExecutionBudgetTracker({
        limits: {
          maxEmbeddingInputs:
            4,
        },
      });

    try {
      await runWithExecutionBudget(
        tracker,
        async () => {
          await Promise.resolve();

          assert.equal(
            currentExecutionBudget(),
            tracker,
          );

          consumeExecutionBudget(
            "embeddingInputs",
            3,
            {
              stage:
                "embed",
            },
          );
        },
      );

      assert.equal(
        tracker.snapshot()
          .consumed.embeddingInputs,
        3,
      );
    } finally {
      tracker.close();
    }
  },
);

test(
  "deadline becomes an aborted structured error",
  () => {
    let monotonic =
      100;

    const tracker =
      new ExecutionBudgetTracker({
        limits: {
          maxElapsedMs:
            50,
        },
        now:
          () => new Date(
            "2026-09-16T18:00:00.000Z",
          ),
        monotonicNow:
          () => monotonic,
      });

    try {
      monotonic =
        151;

      assert.throws(
        () => tracker.throwIfExceeded(
          "fetch",
        ),
        (error) => {
          assert.ok(
            error instanceof ExecutionDeadlineExceededError,
          );

          const descriptor =
            describeSourceError(
              error,
              {
                includeStack:
                  false,
              },
            );

          assert.equal(
            descriptor.code,
            "EXECUTION_DEADLINE_EXCEEDED",
          );

          assert.equal(
            descriptor.aborted,
            true,
          );

          assert.equal(
            descriptor.stage,
            "fetch",
          );

          return true;
        },
      );
    } finally {
      tracker.close();
    }
  },
);

test(
  "preserves the execution-deadline reason through the concurrent scheduler",
  async () => {
    const {
      CrawlScheduler,
    } =
      await import(
        "../../scheduling/crawl-scheduler.js"
      );

    const tracker =
      new ExecutionBudgetTracker({
        limits: {
          maxElapsedMs:
            5,
        },
      });

    const scheduler =
      new CrawlScheduler({
        defaultConcurrency:
          1,
      });

    try {
      await assert.rejects(
        scheduler.runOrdered(
          [
            async () => {
              await new Promise<void>(
                (resolve) =>
                  setTimeout(
                    resolve,
                    20,
                  ),
              );

              return "done";
            },
          ],
          {
            signal:
              tracker.signal,
          },
        ),
        (error) => {
          assert.ok(
            error instanceof ExecutionDeadlineExceededError,
          );

          assert.equal(
            describeSourceError(
              error,
              {
                includeStack:
                  false,
              },
            ).code,
            "EXECUTION_DEADLINE_EXCEEDED",
          );

          return true;
        },
      );
    } finally {
      tracker.close();
    }
  },
);
