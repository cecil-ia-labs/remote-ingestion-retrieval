import type { VectorRecord } from "./vector-record.js";
import type { VectorStore, VectorStoreOperationContext, VectorStoreWriteResult, VectorStoreDeleteResult } from "./vector-store.js";
import { QdrantRestClient, ensureQdrantCollection, qdrantPointId, qdrantPayload, qdrantPositiveInteger, validateQdrantCollection, validateQdrantVector, assertQdrantCompleted, type QdrantConnectionOptions, type QdrantDistance } from "./qdrant-client.js";

export interface QdrantVectorStoreOptions extends QdrantConnectionOptions {
  readonly collection: string;
  readonly dimensions: number;
  readonly distance?: QdrantDistance;
  readonly namespace?: string;
  readonly batchSize?: number;
}

/** Precomputed-vector adapter for Qdrant Cloud or self-hosted collections. */
export class QdrantVectorStore implements VectorStore {
  readonly name = "qdrant";
  readonly maxUpsertBatchSize: number;
  readonly maxDeleteBatchSize: number;
  private readonly client: QdrantRestClient;
  private readonly namespace: string;

  constructor(private readonly options: QdrantVectorStoreOptions) {
    validateQdrantCollection(options.collection);
    qdrantPositiveInteger(options.dimensions, "Qdrant dimensions");
    this.client = new QdrantRestClient(options);
    this.namespace = options.namespace ?? "default";
    this.maxUpsertBatchSize = qdrantPositiveInteger(options.batchSize ?? 100, "Qdrant batchSize", 1000);
    this.maxDeleteBatchSize = this.maxUpsertBatchSize;
  }

  async ensureCollection(signal?: AbortSignal): Promise<void> {
    await ensureQdrantCollection(this.client, this.options.collection, this.options.dimensions, this.options.distance ?? "Cosine", signal);
  }

  async upsert(records: readonly VectorRecord[], context?: VectorStoreOperationContext): Promise<VectorStoreWriteResult> {
    context?.signal?.throwIfAborted();
    const namespace = context?.namespace ?? this.namespace;
    if (!namespace.trim()) throw new TypeError("Qdrant namespace must not be empty.");
    const ids = new Set<string>();
    for (const record of records) {
      if (!record.id || ids.has(record.id)) throw new TypeError("Qdrant vector IDs must be nonempty and unique per batch.");
      ids.add(record.id);
      validateQdrantVector(record.values, this.options.dimensions);
    }
    for (let offset = 0; offset < records.length; offset += this.maxUpsertBatchSize) {
      const points = records.slice(offset, offset + this.maxUpsertBatchSize).map((record) => ({
        id: qdrantPointId(this.options.collection, namespace, record.id),
        vector: record.values,
        payload: qdrantPayload(record.metadata, record.text, namespace, record.id),
      }));
      await this.client.writePoints(this.options.collection, points, context?.signal);
    }
    return { accepted: records.length };
  }

  async delete(ids: readonly string[], context?: VectorStoreOperationContext): Promise<VectorStoreDeleteResult> {
    context?.signal?.throwIfAborted();
    const namespace = context?.namespace ?? this.namespace;
    if (!namespace.trim() || ids.some((id) => !id)) throw new TypeError("Qdrant namespace and vector IDs must not be empty.");
    const unique = [...new Set(ids)];
    for (let offset = 0; offset < unique.length; offset += this.maxDeleteBatchSize) {
      const points = unique.slice(offset, offset + this.maxDeleteBatchSize).map((id) => qdrantPointId(this.options.collection, namespace, id));
      const result = await this.client.request(`/collections/${encodeURIComponent(this.options.collection)}/points/delete?wait=true`, "POST", { points }, context?.signal);
      assertQdrantCompleted(result);
    }
    // Qdrant confirms completion, including IDs already absent (idempotent deletion).
    return { deleted: unique.length };
  }
}
