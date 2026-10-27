import type {
  ContentHashComparison,
} from "../hashing/content-hash.js";

import type {
  DiscoveredUrl,
} from "../discovery/discovered-url.js";

import type {
  SourceErrorDescriptor,
} from "../errors/error-model.types.js";

import type {
  ObservabilityAttributes,
} from "../observability/observability.types.js";

import type {
  ExecutionBudgetSnapshot,
  ExecutionLimits,
} from "../limits/execution-limits.js";


import type {
  WebsiteSource,
} from "../domain/website-source.js";

import type {
  IncrementalVectorSyncResult,
} from "./incremental-vector-sync-service.js";

export type WebsiteSyncFailurePolicy =
  | "abort"
  | "continue-partial";

export type WebsiteSyncDocumentStatus =
  | "added"
  | "changed"
  | "unchanged"
  | "removed";

export type WebsiteSyncChangeReason =
  | "new-document"
  | "content"
  | "metadata"
  | "pipeline-revision"
  | "unchanged"
  | "removed";

export interface WebsiteSyncDocumentChange {
  readonly status:
    WebsiteSyncDocumentStatus;

  readonly reason:
    WebsiteSyncChangeReason;

  readonly documentId:
    string;

  readonly canonicalUrl:
    string;

  readonly previousContentHash?:
    string;

  readonly currentContentHash?:
    string;

  readonly hashComparison?:
    ContentHashComparison;
}

export interface WebsiteSyncPlanStats {
  readonly added:
    number;

  readonly changed:
    number;

  readonly unchanged:
    number;

  readonly removed:
    number;
}

export interface WebsiteSyncPlan {
  readonly snapshotComplete:
    boolean;

  readonly pipelineChanged:
    boolean;

  readonly added:
    readonly WebsiteSyncDocumentChange[];

  readonly changed:
    readonly WebsiteSyncDocumentChange[];

  readonly unchanged:
    readonly WebsiteSyncDocumentChange[];

  readonly removed:
    readonly WebsiteSyncDocumentChange[];

  readonly stats:
    WebsiteSyncPlanStats;
}

export interface WebsiteSyncMaterializationFailure {
  readonly discoveredUrl:
    string;

  readonly discoveredBy:
    DiscoveredUrl["discoveredBy"];

  readonly errorName:
    string;

  readonly message:
    string;

  readonly error:
    SourceErrorDescriptor;
}

export interface WebsiteSyncRequest {
  readonly source:
    WebsiteSource;

  readonly pipelineRevision:
    string;

  readonly namespace?:
    string;

  readonly materializationConcurrency?:
    number;

  readonly failurePolicy?:
    WebsiteSyncFailurePolicy;

  /**
   * Optional cumulative limits for the entire website-sync run.
   * Omitted limits are unlimited at the aggregate-budget layer.
   */
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

export interface WebsiteSyncStats {
  readonly discoveredUrls:
    number;

  readonly materializationAttempts:
    number;

  readonly materializedDocuments:
    number;

  readonly materializationFailures:
    number;

  readonly duplicateDocumentsCollapsed:
    number;

  readonly schedulerMaxConcurrencyObserved:
    number;

  readonly snapshotComplete:
    boolean;

  readonly downstreamMode:
    "full" | "partial";

  readonly added:
    number;

  readonly changed:
    number;

  readonly unchanged:
    number;

  readonly removed:
    number;
}

export interface WebsiteSyncResult {
  readonly observabilityRunId?:
    string;

  readonly sourceId:
    string;

  readonly namespace?:
    string;

  readonly pipelineRevision:
    string;

  readonly discovered:
    readonly DiscoveredUrl[];

  readonly failures:
    readonly WebsiteSyncMaterializationFailure[];

  readonly plan:
    WebsiteSyncPlan;

  readonly vectorSync:
    IncrementalVectorSyncResult;

  readonly budget:
    ExecutionBudgetSnapshot;

  readonly stats:
    WebsiteSyncStats;
}
