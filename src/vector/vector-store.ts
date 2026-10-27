import type {
  VectorRecord,
  VectorRecordId,
} from "./vector-record.js";

export interface VectorStoreOperationContext {
  readonly namespace?:
    string;

  readonly signal?:
    AbortSignal;
}

export interface VectorStoreWriteResult {
  readonly accepted:
    number;
}

export interface VectorStoreDeleteResult {
  readonly deleted:
    number;
}

/**
 * Minimal provider-neutral vector-store contract required by ingestion.
 */
export interface VectorStore {
  readonly name:
    string;

  readonly maxUpsertBatchSize?:
    number;

  readonly maxDeleteBatchSize?:
    number;

  upsert(
    records:
      readonly VectorRecord[],

    context?:
      VectorStoreOperationContext,
  ): Promise<VectorStoreWriteResult | void>;

  delete(
    ids:
      readonly VectorRecordId[],

    context?:
      VectorStoreOperationContext,
  ): Promise<VectorStoreDeleteResult | void>;
}
