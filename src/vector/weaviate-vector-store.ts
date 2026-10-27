import type { VectorRecord } from "./vector-record.js";
import type { VectorStore, VectorStoreOperationContext, VectorStoreWriteResult, VectorStoreDeleteResult } from "./vector-store.js";
import {
  WeaviateRestClient, WeaviateHttpError, ensureWeaviateCollection, validateCollectionName, weaviateObjectId, weaviateLabels,
  type WeaviateConnectionOptions,
} from "./weaviate-client.js";

export interface WeaviateVectorStoreOptions extends WeaviateConnectionOptions {
  readonly collection: string;
  /** Default namespace when the pipeline does not provide one. */
  readonly namespace?: string;
  readonly batchSize?: number;
}

/** Precomputed-vector adapter. Use a dedicated single-vector collection. */
export class WeaviateVectorStore implements VectorStore {
  readonly name = "weaviate";
  readonly maxUpsertBatchSize: number;
  readonly maxDeleteBatchSize = 100;
  private readonly client: WeaviateRestClient;
  private readonly collection: string;
  private readonly namespace: string;

  constructor(options: WeaviateVectorStoreOptions) {
    validateCollectionName(options.collection);
    this.client = new WeaviateRestClient(options);
    this.collection = options.collection;
    this.namespace = options.namespace ?? "default";
    this.maxUpsertBatchSize = options.batchSize ?? 100;
    if (!Number.isSafeInteger(this.maxUpsertBatchSize) || this.maxUpsertBatchSize < 1 || this.maxUpsertBatchSize > 200) {
      throw new TypeError("Weaviate batchSize must be an integer from 1 to 200.");
    }
  }

  /** Explicit setup; never changes the configuration of an existing collection. */
  async ensureCollection(signal?: AbortSignal): Promise<void> {
    await ensureWeaviateCollection(this.client, this.collection, "none", undefined, signal);
  }

  async upsert(records: readonly VectorRecord[], context?: VectorStoreOperationContext): Promise<VectorStoreWriteResult> {
    context?.signal?.throwIfAborted();
    const namespace = context?.namespace ?? this.namespace;
    const ids = new Set<string>();
    let dimensions: number | undefined;
    // Validate the whole input before the first network write.
    for (const record of records) {
      if (!record.id || ids.has(record.id)) throw new TypeError("Weaviate vector IDs must be nonempty and unique per batch.");
      ids.add(record.id);
      if (!record.values.length || record.values.some((value) => !Number.isFinite(value))) {
        throw new TypeError("Weaviate requires nonempty finite embedding vectors.");
      }
      dimensions ??= record.values.length;
      if (record.values.length !== dimensions) throw new TypeError("Weaviate embedding dimensions must agree.");
    }
    for (let offset = 0; offset < records.length; offset += this.maxUpsertBatchSize) {
      const objects = records.slice(offset, offset + this.maxUpsertBatchSize).map((record) => ({
        class: this.collection,
        id: weaviateObjectId(this.collection, namespace, record.id),
        vector: record.values,
        properties: {
          text: record.text,
          namespace,
          chunkId: record.id,
          filename: typeof record.metadata.filename === "string" ? record.metadata.filename : "",
          domain: typeof record.metadata.domain === "string" ? record.metadata.domain : "",
          tags: weaviateLabels(record.metadata.tags),
          keywords: weaviateLabels(record.metadata.keywords),
          sourceId: typeof record.metadata.sourceId === "string" ? record.metadata.sourceId : "",
          documentId: typeof record.metadata.documentId === "string" ? record.metadata.documentId : "",
          canonicalUrl: typeof record.metadata.canonicalUrl === "string" ? record.metadata.canonicalUrl : "",
          metadataJson: JSON.stringify(record.metadata),
        },
      }));
      await this.client.writeBatch(objects, context?.signal);
    }
    return { accepted: records.length };
  }

  async delete(ids: readonly string[], context?: VectorStoreOperationContext): Promise<VectorStoreDeleteResult> {
    const namespace = context?.namespace ?? this.namespace;
    let deleted = 0;
    for (const id of new Set(ids)) {
      context?.signal?.throwIfAborted();
      const uuid = weaviateObjectId(this.collection, namespace, id);
      try {
        await this.client.request(`/objects/${this.collection}/${uuid}`, "DELETE", undefined, context?.signal);
        deleted += 1;
      } catch (error) {
        if (!(error instanceof WeaviateHttpError) || error.status !== 404) throw error;
      }
    }
    return { deleted };
  }
}
