import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import {
  CrawlScheduler,
  CrawlSchedulingAbortedError,
  InvalidCrawlConcurrencyError,
} from "../index.js";

test(
  "runs tasks concurrently but returns results in input order",
  async () => {
    const scheduler =
      new CrawlScheduler({
        defaultConcurrency: 3,
      });

    const completionOrder:
      string[] = [];

    const results =
      await scheduler.runOrdered(
        [
          async () => {
            await delay(60);
            completionOrder.push("a");
            return "a";
          },
          async () => {
            await delay(10);
            completionOrder.push("b");
            return "b";
          },
          async () => {
            await delay(30);
            completionOrder.push("c");
            return "c";
          },
        ],
      );

    assert.deepEqual(
      completionOrder,
      [
        "b",
        "c",
        "a",
      ],
    );

    assert.deepEqual(
      results.map(
        (result) =>
          result.status === "fulfilled"
            ? result.value
            : "rejected",
      ),
      [
        "a",
        "b",
        "c",
      ],
    );

    assert.equal(
      scheduler.stats.maxConcurrencyObserved,
      3,
    );
  },
);

test(
  "respects the configured concurrency bound",
  async () => {
    const scheduler =
      new CrawlScheduler();

    let active = 0;
    let maxActive = 0;

    const tasks =
      Array.from(
        {
          length: 8,
        },
        (_, index) =>
          async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await delay(15);
            active -= 1;
            return index;
          },
      );

    await scheduler.runOrdered(
      tasks,
      {
        concurrency: 2,
      },
    );

    assert.equal(maxActive, 2);
    assert.equal(
      scheduler.stats.maxConcurrencyObserved,
      2,
    );
    assert.equal(
      scheduler.stats.tasksStarted,
      8,
    );
  },
);

test(
  "captures task failures without losing ordered result positions",
  async () => {
    const scheduler =
      new CrawlScheduler();

    const failure =
      new Error("boom");

    const results =
      await scheduler.runOrdered(
        [
          async () => "a",
          async () => {
            throw failure;
          },
          async () => "c",
        ],
        {
          concurrency: 3,
        },
      );

    assert.equal(results[0]?.status, "fulfilled");
    assert.equal(results[1]?.status, "rejected");
    assert.equal(results[2]?.status, "fulfilled");

    if (
      results[1]?.status
      === "rejected"
    ) {
      assert.equal(
        results[1].reason,
        failure,
      );
    }

    assert.equal(
      scheduler.stats.tasksRejected,
      1,
    );
  },
);

test(
  "rejects invalid crawl concurrency",
  () => {
    const scheduler =
      new CrawlScheduler({
        maxConcurrency: 8,
      });

    assert.throws(
      () =>
        scheduler.resolveConcurrency(0),
      InvalidCrawlConcurrencyError,
    );

    assert.throws(
      () =>
        scheduler.resolveConcurrency(9),
      InvalidCrawlConcurrencyError,
    );
  },
);

test(
  "stops scheduling when the abort signal is already aborted",
  async () => {
    const controller =
      new AbortController();

    controller.abort();

    await assert.rejects(
      () =>
        new CrawlScheduler()
          .runOrdered(
            [
              async () => "never",
            ],
            {
              signal:
                controller.signal,
            },
          ),
      CrawlSchedulingAbortedError,
    );
  },
);
