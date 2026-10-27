import assert from "node:assert/strict";
import {
  test,
} from "node:test";

import type {
  UrlSource,
  WebsiteSource,
} from "../../domain/index.js";

import {
  ObservabilityHub,
} from "../../observability/index.js";

import type {
  WebsiteSyncResult,
} from "../../sync/index.js";

import {
  SourceInsertionPipeline,
} from "../source-insertion-pipeline.js";

function websiteSource(): WebsiteSource {
  return {
    id:
      "site-27",
    type:
      "website",
    url:
      "https://example.com/docs",
    createdAt:
      new Date("2026-09-29T10:00:00.000Z"),
    updatedAt:
      new Date("2026-09-29T10:00:00.000Z"),
  };
}

function urlSource(): UrlSource {
  return {
    id:
      "url-27",
    type:
      "url",
    url:
      "https://example.com/spec.md",
    createdAt:
      new Date("2026-09-29T10:00:00.000Z"),
    updatedAt:
      new Date("2026-09-29T10:00:00.000Z"),
  };
}

function result(
  overrides: {
    readonly snapshotComplete?: boolean;
    readonly downstreamMode?: "full" | "partial";
    readonly failureCount?: number;
    readonly observabilityRunId?: string;
  } = {},
): WebsiteSyncResult {
  const snapshotComplete =
    overrides.snapshotComplete
    ?? true;
  const downstreamMode =
    overrides.downstreamMode
    ?? "full";
  const failureCount =
    overrides.failureCount
    ?? 0;

  return {
    observabilityRunId:
      overrides.observabilityRunId,
    sourceId:
      "site-27",
    pipelineRevision:
      "phase27:v1",
    discovered:
      [],
    failures:
      Array.from(
        { length: failureCount },
        (_, index) => ({
          discoveredUrl:
            `https://example.com/failure-${index}`,
          discoveredBy:
            "crawl" as const,
          errorName:
            "FixtureError",
          message:
            "fixture failure",
          error: {
            schemaVersion:
              1 as const,
            code:
              "UNKNOWN_ERROR" as const,
            category:
              "internal" as const,
            stage:
              "unknown" as const,
            retryability:
              "unknown" as const,
            aborted:
              false,
            name:
              "FixtureError",
            message:
              "fixture failure",
          },
        }),
      ),
    plan: {
      snapshotComplete,
      pipelineChanged:
        false,
      added:
        [],
      changed:
        [],
      unchanged:
        [],
      removed:
        [],
      stats: {
        added:
          1,
        changed:
          2,
        unchanged:
          3,
        removed:
          4,
      },
    },
    vectorSync: {
      sourceId:
        "site-27",
      pipelineRevision:
        "phase27:v1",
      mode:
        downstreamMode,
      stats: {
        previousStateFound:
          true,
        pipelineChanged:
          false,
        documentsReceived:
          6,
        documentsNew:
          1,
        documentsChanged:
          2,
        documentsReusedWithoutChunking:
          3,
        documentsDeleted:
          4,
        documentsChunked:
          3,
        chunksProduced:
          7,
        chunksReused:
          5,
        chunksUpserted:
          2,
        chunksDeleted:
          4,
        embeddingsAvoided:
          5,
      },
      upsertedChunkIds:
        [],
      deletedChunkIds:
        [],
      reusedChunkIds:
        [],
      state: {
        schemaVersion:
          1,
        sourceId:
          "site-27",
        pipelineRevision:
          "phase27:v1",
        documents:
          [],
        updatedAt:
          "2026-09-29T10:00:01.000Z",
      },
    },
    budget: {
      schemaVersion:
        1,
      startedAt:
        "2026-09-29T10:00:00.000Z",
      elapsedMs:
        10,
      limits:
        {},
      consumed: {
        discoveredUrls:
          6,
        materializationAttempts:
          6,
        materializedDocuments:
          6,
        failures:
          failureCount,
        fetchedBytes:
          100,
        normalizedBytes:
          90,
        chunks:
          7,
        embeddingInputs:
          2,
        vectorUpserts:
          2,
        vectorDeletes:
          4,
      },
      remaining:
        {},
    },
    stats: {
      discoveredUrls:
        6,
      materializationAttempts:
        6,
      materializedDocuments:
        6,
      materializationFailures:
        failureCount,
      duplicateDocumentsCollapsed:
        0,
      schedulerMaxConcurrencyObserved:
        2,
      snapshotComplete,
      downstreamMode,
      added:
        1,
      changed:
        2,
      unchanged:
        3,
      removed:
        4,
    },
  };
}

function deterministicPipeline(
  websiteResult:
    WebsiteSyncResult = result(),
) {
  let id = 0;
  let tick = 100;
  const calls:
    string[] = [];

  const observability =
    new ObservabilityHub({
      idFactory:
        () => `run-${++id}`,
    });

  const pipeline =
    new SourceInsertionPipeline({
      observability,
      now:
        () => new Date(
          `2026-09-29T10:00:0${Math.min(id, 9)}.000Z`,
        ),
      monotonicNow:
        () => tick += 5,
      ingestWebsite:
        async (request) => {
          calls.push(
            `website:${request.observability?.runId ?? "none"}`,
          );
          return {
            ...websiteResult,
            sourceId:
              request.source.id,
            observabilityRunId:
              request.observability?.runId,
          };
        },
      ingestUrl:
        async (request) => {
          calls.push(
            `url:${request.observability?.runId ?? "none"}`,
          );
          return {
            ...websiteResult,
            sourceId:
              request.source.id,
            observabilityRunId:
              request.observability?.runId,
          };
        },
    });

  return {
    calls,
    pipeline,
  };
}

test(
  "insert dispatches website and URL sources to the appropriate ingestion path",
  async () => {
    const fixture =
      deterministicPipeline();

    await fixture.pipeline.insert({
      source:
        websiteSource(),
    });
    await fixture.pipeline.insert({
      source:
        urlSource(),
    });

    assert.deepEqual(
      fixture.calls,
      [
        "website:none",
        "url:none",
      ],
    );
  },
);

test(
  "run returns completed outcome, propagates one run ID and projects a stable summary",
  async () => {
    const fixture =
      deterministicPipeline();

    const outcome =
      await fixture.pipeline.run({
        source:
          websiteSource(),
      });

    assert.equal(
      outcome.ok,
      true,
    );
    assert.equal(
      outcome.status,
      "completed",
    );
    assert.equal(
      outcome.runId,
      "run-1",
    );
    assert.deepEqual(
      fixture.calls,
      [
        "website:run-1",
      ],
    );

    if (!outcome.ok) {
      assert.fail(
        "expected completed outcome",
      );
    }

    assert.equal(
      outcome.summary.documents.changed,
      2,
    );
    assert.equal(
      outcome.summary.vectors.embeddingsAvoided,
      5,
    );
    assert.equal(
      outcome.durationMs,
      5,
    );
  },
);

test(
  "run reports partial when the website snapshot is incomplete",
  async () => {
    const fixture =
      deterministicPipeline(
        result({
          snapshotComplete:
            false,
          downstreamMode:
            "partial",
          failureCount:
            1,
        }),
      );

    const outcome =
      await fixture.pipeline.run({
        source:
          websiteSource(),
      });

    assert.equal(
      outcome.ok,
      true,
    );
    assert.equal(
      outcome.status,
      "partial",
    );
  },
);

test(
  "run converts ordinary failures into failed structured outcomes",
  async () => {
    const pipeline =
      new SourceInsertionPipeline({
        ingestWebsite:
          async () => {
            throw new Error(
              "fixture exploded",
            );
          },
        ingestUrl:
          async () => result(),
      });

    const outcome =
      await pipeline.run({
        source:
          websiteSource(),
        observability: {
          runId:
            "job-27",
        },
      });

    assert.equal(
      outcome.ok,
      false,
    );
    assert.equal(
      outcome.status,
      "failed",
    );

    if (outcome.ok) {
      assert.fail(
        "expected failed outcome",
      );
    }

    assert.equal(
      outcome.runId,
      "job-27",
    );
    assert.equal(
      outcome.error.message,
      "fixture exploded",
    );
  },
);

test(
  "run converts abort failures into aborted outcomes",
  async () => {
    const pipeline =
      new SourceInsertionPipeline({
        ingestWebsite:
          async () => {
            const error =
              new Error(
                "operation aborted",
              );
            error.name =
              "AbortError";
            throw error;
          },
        ingestUrl:
          async () => result(),
      });

    const outcome =
      await pipeline.run({
        source:
          websiteSource(),
      });

    assert.equal(
      outcome.ok,
      false,
    );
    assert.equal(
      outcome.status,
      "aborted",
    );
  },
);

test(
  "strict insert rejects an unsupported runtime source type",
  async () => {
    const fixture =
      deterministicPipeline();

    await assert.rejects(
      fixture.pipeline.insert({
        source: {
          ...websiteSource(),
          type:
            "file",
        } as unknown as WebsiteSource,
      }),
      (error: unknown) => {
        return (
          error instanceof Error
          && error.name
            === "UnsupportedSourceInsertionTypeError"
        );
      },
    );
  },
);
