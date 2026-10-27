import type {
  UrlSource,
  WebsiteSource,
} from "../domain/index.js";

import type {
  SourceErrorDescriptor,
} from "../errors/index.js";

import type {
  ExecutionBudgetSnapshot,
  ExecutionLimits,
} from "../limits/index.js";

import type {
  ObservabilityAttributes,
} from "../observability/index.js";

import type {
  WebsiteSyncFailurePolicy,
  WebsiteSyncResult,
} from "../sync/index.js";

export type SourceInsertionSource =
  | UrlSource
  | WebsiteSource;

export type SourceInsertionSourceType =
  SourceInsertionSource["type"];

export interface SourceInsertionRequest {
  readonly source:
    SourceInsertionSource;

  readonly pipelineRevision?:
    string;

  readonly namespace?:
    string;

  readonly materializationConcurrency?:
    number;

  readonly failurePolicy?:
    WebsiteSyncFailurePolicy;

  readonly limits?:
    ExecutionLimits;

  readonly observability?: {
    readonly runId?:
      string;

    readonly attributes?:
      ObservabilityAttributes;
  };

  readonly signal?:
    AbortSignal;
}

export type SourceInsertionResult =
  WebsiteSyncResult;

export type SourceInsertionStatus =
  | "completed"
  | "partial"
  | "failed"
  | "aborted";

export interface SourceInsertionDocumentSummary {
  readonly discovered:
    number;

  readonly materialized:
    number;

  readonly failures:
    number;

  readonly added:
    number;

  readonly changed:
    number;

  readonly unchanged:
    number;

  readonly removed:
    number;

  readonly snapshotComplete:
    boolean;
}

export interface SourceInsertionVectorSummary {
  readonly chunksProduced:
    number;

  readonly chunksReused:
    number;

  readonly chunksUpserted:
    number;

  readonly chunksDeleted:
    number;

  readonly embeddingsAvoided:
    number;
}

export interface SourceInsertionSummary {
  readonly sourceId:
    string;

  readonly sourceType:
    SourceInsertionSourceType;

  readonly namespace?:
    string;

  readonly pipelineRevision:
    string;

  readonly downstreamMode:
    "full" | "partial";

  readonly documents:
    SourceInsertionDocumentSummary;

  readonly vectors:
    SourceInsertionVectorSummary;

  readonly budget:
    ExecutionBudgetSnapshot;
}

export interface SourceInsertionOutcomeBase {
  readonly runId:
    string;

  readonly sourceId:
    string;

  readonly sourceType:
    SourceInsertionSourceType;

  readonly startedAt:
    string;

  readonly finishedAt:
    string;

  readonly durationMs:
    number;
}

export interface SourceInsertionCompletedOutcome
  extends SourceInsertionOutcomeBase {
  readonly ok:
    true;

  readonly status:
    "completed" | "partial";

  readonly result:
    SourceInsertionResult;

  readonly summary:
    SourceInsertionSummary;
}

export interface SourceInsertionFailedOutcome
  extends SourceInsertionOutcomeBase {
  readonly ok:
    false;

  readonly status:
    "failed" | "aborted";

  readonly error:
    SourceErrorDescriptor;
}

export type SourceInsertionOutcome =
  | SourceInsertionCompletedOutcome
  | SourceInsertionFailedOutcome;
