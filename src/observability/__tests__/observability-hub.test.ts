import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InMemoryObservabilitySink,
} from "../in-memory-observability-sink.js";

import {
  ObservabilityHub,
} from "../observability-hub.js";

import {
  summarizeObservabilityEvents,
} from "../observability-summary.js";

function deterministicHub(
  sink:
    InMemoryObservabilitySink,
): ObservabilityHub {
  let id =
    0;

  let monotonic =
    0;

  return new ObservabilityHub({
    sink,
    idFactory: () =>
      `id-${++id}`,
    now: () =>
      new Date(
        "2026-09-16T18:00:00.000Z",
      ),
    monotonicNow: () => {
      monotonic +=
        5;

      return monotonic;
    },
  });
}

test(
  "preserves one run context across nested async stages and metrics",
  async () => {
    const sink =
      new InMemoryObservabilitySink();

    const hub =
      deterministicHub(
        sink,
      );

    await hub.run(
      "website.sync",
      {
        attributes: {
          sourceId:
            "site-1",
        },
      },
      async () => {
        await hub.stage(
          "website.discovery",
          {},
          async () => {
            await Promise.resolve();

            await hub.metric(
              "website.discovered_urls",
              3,
              {
                unit:
                  "count",
              },
            );
          },
        );
      },
    );

    const events =
      sink.events;

    assert.equal(
      new Set(
        events.map(
          (event) =>
            event.runId,
        ),
      ).size,
      1,
    );

    assert.deepEqual(
      events.map(
        (event) =>
          event.kind,
      ),
      [
        "run.start",
        "stage.start",
        "metric",
        "stage.end",
        "run.end",
      ],
    );

    assert.equal(
      events[2]?.stage,
      "website.discovery",
    );

    assert.equal(
      events[2]?.attributes
        ?.sourceId,
      "site-1",
    );

    const summary =
      summarizeObservabilityEvents(
        events,
      );

    assert.equal(
      summary?.status,
      "ok",
    );

    assert.equal(
      summary?.metrics[
        "website.discovered_urls"
      ]?.sum,
      3,
    );
  },
);

test(
  "records failed stage and failed run without swallowing the original error",
  async () => {
    const sink =
      new InMemoryObservabilitySink();

    const hub =
      deterministicHub(
        sink,
      );

    await assert.rejects(
      hub.run(
        "fixture",
        {},
        () => hub.stage(
          "broken",
          {},
          async () => {
            throw new Error(
              "boom",
            );
          },
        ),
      ),
      /boom/,
    );

    assert.equal(
      sink.events.some(
        (event) =>
          event.kind
            === "stage.error"
          && event.error
            ?.message
            === "boom",
      ),
      true,
    );

    assert.equal(
      sink.events.at(-1)
        ?.kind,
      "run.error",
    );
  },
);


test(
  "shares the active run sink across independently constructed hubs",
  async () => {
    const sink =
      new InMemoryObservabilitySink();

    const rootHub =
      deterministicHub(
        sink,
      );

    const nestedHub =
      new ObservabilityHub();

    await rootHub.run(
      "shared-context",
      {},
      () => nestedHub.stage(
        "nested.component",
        {},
        async () => {
          await nestedHub.metric(
            "nested.metric",
            1,
          );
        },
      ),
    );

    assert.equal(
      sink.events.some(
        (event) =>
          event.stage
            === "nested.component"
          && event.kind
            === "stage.end",
      ),
      true,
    );

    assert.equal(
      sink.events.some(
        (event) =>
          event.metric
            ?.name
            === "nested.metric",
      ),
      true,
    );
  },
);
