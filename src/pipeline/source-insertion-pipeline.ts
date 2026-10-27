import {
  performance,
} from "node:perf_hooks";

import {
  describeSourceError,
} from "../errors/source-error-classifier.js";

import type {
  ObservabilityHub,
} from "../observability/observability-hub.js";

import {
  defaultObservabilityHub,
} from "../observability/observability-hub.js";

import {
  UnsupportedSourceInsertionTypeError,
} from "./source-insertion.errors.js";

import type {
  SourceInsertionCompletedOutcome,
  SourceInsertionOutcome,
  SourceInsertionRequest,
  SourceInsertionResult,
  SourceInsertionStatus,
  SourceInsertionSummary,
} from "./source-insertion.types.js";

export interface SourceInsertionPipelineOptions {
  readonly ingestWebsite: (
    request:
      SourceInsertionRequest & {
        readonly source:
          Extract<SourceInsertionRequest["source"], { readonly type: "website" }>;
      },
  ) => Promise<SourceInsertionResult>;

  readonly ingestUrl: (
    request:
      SourceInsertionRequest & {
        readonly source:
          Extract<SourceInsertionRequest["source"], { readonly type: "url" }>;
      },
  ) => Promise<SourceInsertionResult>;

  readonly observability?:
    ObservabilityHub;

  readonly now?:
    () => Date;

  readonly monotonicNow?:
    () => number;
}

function resultStatus(
  result:
    SourceInsertionResult,
): SourceInsertionStatus {
  if (
    !result.stats.snapshotComplete
    || result.stats.downstreamMode === "partial"
    || result.failures.length > 0
  ) {
    return "partial";
  }

  return "completed";
}

export function summarizeSourceInsertion(
  sourceType:
    SourceInsertionRequest["source"]["type"],

  result:
    SourceInsertionResult,
): SourceInsertionSummary {
  return Object.freeze({
    sourceId:
      result.sourceId,
    sourceType,
    namespace:
      result.namespace,
    pipelineRevision:
      result.pipelineRevision,
    downstreamMode:
      result.stats.downstreamMode,
    documents:
      Object.freeze({
        discovered:
          result.stats.discoveredUrls,
        materialized:
          result.stats.materializedDocuments,
        failures:
          result.stats.materializationFailures,
        added:
          result.stats.added,
        changed:
          result.stats.changed,
        unchanged:
          result.stats.unchanged,
        removed:
          result.stats.removed,
        snapshotComplete:
          result.stats.snapshotComplete,
      }),
    vectors:
      Object.freeze({
        chunksProduced:
          result.vectorSync.stats.chunksProduced,
        chunksReused:
          result.vectorSync.stats.chunksReused,
        chunksUpserted:
          result.vectorSync.stats.chunksUpserted,
        chunksDeleted:
          result.vectorSync.stats.chunksDeleted,
        embeddingsAvoided:
          result.vectorSync.stats.embeddingsAvoided,
      }),
    budget:
      result.budget,
  });
}

/**
 * Application-level orchestrator over the stable ingestion facade.
 *
 * `insert()` is strict and preserves failures as exceptions.
 * `run()` converts the same operation into a UI/job-friendly outcome that
 * always resolves with one of completed | partial | failed | aborted.
 */
export class SourceInsertionPipeline {
  private readonly ingestWebsite:
    SourceInsertionPipelineOptions["ingestWebsite"];

  private readonly ingestUrl:
    SourceInsertionPipelineOptions["ingestUrl"];

  private readonly observability:
    ObservabilityHub;

  private readonly now:
    () => Date;

  private readonly monotonicNow:
    () => number;

  constructor(
    options:
      SourceInsertionPipelineOptions,
  ) {
    this.ingestWebsite =
      options.ingestWebsite;

    this.ingestUrl =
      options.ingestUrl;

    this.observability =
      options.observability
      ?? defaultObservabilityHub;

    this.now =
      options.now
      ?? (() => new Date());

    this.monotonicNow =
      options.monotonicNow
      ?? (() => performance.now());
  }

  async insert(
    request:
      SourceInsertionRequest,
  ): Promise<SourceInsertionResult> {
    switch (
      request.source.type
    ) {
      case "website":
        return this.ingestWebsite({
          ...request,
          source:
            request.source,
        });

      case "url":
        return this.ingestUrl({
          ...request,
          source:
            request.source,
        });

      default:
        throw new UnsupportedSourceInsertionTypeError(
          (
            request.source as {
              readonly type?: unknown;
            }
          ).type,
        );
    }
  }

  async run(
    request:
      SourceInsertionRequest,
  ): Promise<SourceInsertionOutcome> {
    const startedAt =
      this.now();

    const started =
      this.monotonicNow();

    const runId =
      request.observability
        ?.runId
      ?? this.observability
        .createRunId();

    const effectiveRequest:
      SourceInsertionRequest = {
      ...request,
      observability: {
        ...request.observability,
        runId,
      },
    };

    try {
      const result =
        await this.insert(
          effectiveRequest,
        );

      const finishedAt =
        this.now();

      const outcome:
        SourceInsertionCompletedOutcome = {
        ok:
          true,
        status:
          resultStatus(
            result,
          ) as "completed" | "partial",
        runId:
          result.observabilityRunId
          ?? runId,
        sourceId:
          request.source.id,
        sourceType:
          request.source.type,
        startedAt:
          startedAt.toISOString(),
        finishedAt:
          finishedAt.toISOString(),
        durationMs:
          Math.max(
            0,
            this.monotonicNow()
            - started,
          ),
        result,
        summary:
          summarizeSourceInsertion(
            request.source.type,
            result,
          ),
      };

      return Object.freeze(
        outcome,
      );
    } catch (
      error:
        unknown
    ) {
      const finishedAt =
        this.now();

      const descriptor =
        describeSourceError(
          error,
          {
            includeStack:
              false,
          },
        );

      return Object.freeze({
        ok:
          false,
        status:
          descriptor.aborted
            ? "aborted"
            : "failed",
        runId,
        sourceId:
          request.source.id,
        sourceType:
          request.source.type,
        startedAt:
          startedAt.toISOString(),
        finishedAt:
          finishedAt.toISOString(),
        durationMs:
          Math.max(
            0,
            this.monotonicNow()
            - started,
          ),
        error:
          descriptor,
      });
    }
  }
}
