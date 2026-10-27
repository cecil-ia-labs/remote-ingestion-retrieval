import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  JsonlFileObservabilitySink,
} from "../jsonl-file-observability-sink.js";

import type {
  ObservabilityEvent,
} from "../observability.types.js";

const fixtureEvent:
  ObservabilityEvent = {
  schemaVersion: 1,
  eventId:
    "event-1",
  kind:
    "event",
  timestamp:
    "2026-09-16T18:00:00.000Z",
  runId:
    "run-1",
  runName:
    "fixture",
  spanId:
    "span-1",
  name:
    "fixture.event",
};

test(
  "appends one valid JSON object per line",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "observability-",
        ),
      );

    try {
      const filePath =
        join(
          directory,
          "nested",
          "events.jsonl",
        );

      const sink =
        new JsonlFileObservabilitySink({
          filePath,
        });

      await sink.emit(
        fixtureEvent,
      );

      await sink.emit({
        ...fixtureEvent,
        eventId:
          "event-2",
      });

      const lines =
        (
          await readFile(
            filePath,
            "utf8",
          )
        )
          .trim()
          .split("\n")
          .map(
            (line) =>
              JSON.parse(
                line,
              ) as ObservabilityEvent,
          );

      assert.deepEqual(
        lines.map(
          (event) =>
            event.eventId,
        ),
        [
          "event-1",
          "event-2",
        ],
      );
    } finally {
      await rm(
        directory,
        {
          recursive:
            true,
          force:
            true,
        },
      );
    }
  },
);
