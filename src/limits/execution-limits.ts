export const EXECUTION_BUDGET_SCHEMA_VERSION =
  1 as const;

export interface ExecutionLimits {
  /** Maximum wall-clock duration of one coordinated ingestion run. */
  readonly maxElapsedMs?:
    number;

  /** Maximum URLs yielded by website discovery. */
  readonly maxDiscoveredUrls?:
    number;

  /** Maximum document materialization attempts, successful or not. */
  readonly maxMaterializationAttempts?:
    number;

  /** Maximum successfully materialized WebDocuments. */
  readonly maxMaterializedDocuments?:
    number;

  /** Maximum tolerated materialization failures in the run. */
  readonly maxFailures?:
    number;

  /** Aggregate bytes downloaded for main resources during materialization. */
  readonly maxFetchedBytes?:
    number;

  /** Aggregate UTF-8 bytes of normalized Markdown produced by materialization. */
  readonly maxNormalizedBytes?:
    number;

  /** Aggregate chunks produced for documents that actually require chunking. */
  readonly maxChunks?:
    number;

  /** Aggregate texts submitted to embedding providers. */
  readonly maxEmbeddingInputs?:
    number;

  /** Aggregate vector records submitted to upsert operations. */
  readonly maxVectorUpserts?:
    number;

  /** Aggregate vector IDs submitted to delete operations. */
  readonly maxVectorDeletes?:
    number;
}

export type ExecutionBudgetCounterName =
  | "discoveredUrls"
  | "materializationAttempts"
  | "materializedDocuments"
  | "failures"
  | "fetchedBytes"
  | "normalizedBytes"
  | "chunks"
  | "embeddingInputs"
  | "vectorUpserts"
  | "vectorDeletes";

export type ExecutionBudgetDimension =
  | "elapsedMs"
  | ExecutionBudgetCounterName;

export interface ExecutionBudgetUsage {
  readonly discoveredUrls:
    number;

  readonly materializationAttempts:
    number;

  readonly materializedDocuments:
    number;

  readonly failures:
    number;

  readonly fetchedBytes:
    number;

  readonly normalizedBytes:
    number;

  readonly chunks:
    number;

  readonly embeddingInputs:
    number;

  readonly vectorUpserts:
    number;

  readonly vectorDeletes:
    number;
}

export interface ExecutionBudgetSnapshot {
  readonly schemaVersion:
    typeof EXECUTION_BUDGET_SCHEMA_VERSION;

  readonly startedAt:
    string;

  readonly deadlineAt?:
    string;

  readonly elapsedMs:
    number;

  readonly limits:
    ExecutionLimits;

  readonly consumed:
    ExecutionBudgetUsage;

  readonly remaining:
    Readonly<Partial<Record<ExecutionBudgetDimension, number>>>;
}

export const EXECUTION_LIMIT_BY_COUNTER:
  Readonly<Record<ExecutionBudgetCounterName, keyof ExecutionLimits>> =
  Object.freeze({
    discoveredUrls:
      "maxDiscoveredUrls",
    materializationAttempts:
      "maxMaterializationAttempts",
    materializedDocuments:
      "maxMaterializedDocuments",
    failures:
      "maxFailures",
    fetchedBytes:
      "maxFetchedBytes",
    normalizedBytes:
      "maxNormalizedBytes",
    chunks:
      "maxChunks",
    embeddingInputs:
      "maxEmbeddingInputs",
    vectorUpserts:
      "maxVectorUpserts",
    vectorDeletes:
      "maxVectorDeletes",
  });

export function createEmptyExecutionBudgetUsage():
  ExecutionBudgetUsage {
  return {
    discoveredUrls:
      0,
    materializationAttempts:
      0,
    materializedDocuments:
      0,
    failures:
      0,
    fetchedBytes:
      0,
    normalizedBytes:
      0,
    chunks:
      0,
    embeddingInputs:
      0,
    vectorUpserts:
      0,
    vectorDeletes:
      0,
  };
}
