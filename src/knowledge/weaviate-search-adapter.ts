import weaviate, { Filters, type WeaviateClient } from "weaviate-client";
import type { JsonValue } from "../domain/source.types.js";
import type { EmbeddingProvider } from "../vector/embedding-provider.js";
import { isWeaviateRecord, validateCollectionName } from "../vector/weaviate-client.js";

export interface WeaviateSearchRequest {
  readonly query: string;
  /** Always required, so a query cannot accidentally search all namespaces. */
  readonly namespace: string;
  readonly domain?: string;
  readonly limit?: number;
  readonly maxDistance?: number;
  readonly signal?: AbortSignal;
}

/** Shape suitable for inx knowledge consumers using OpenAI-style search results. */
export interface WeaviateKnowledgeSearchResult {
  readonly file_id: string;
  readonly filename: string;
  /** Negative vector distance: larger is better; not an OpenAI-calibrated probability. */
  readonly score: number;
  readonly distance: number;
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}

export interface WeaviateSearchAdapterOptions {
  readonly collection: string;
  readonly client: Pick<WeaviateClient, "collections"> & Partial<Pick<WeaviateClient, "close">>;
  /** Supply the same embedding configuration used at ingestion for BYOV collections. */
  readonly embeddingProvider?: EmbeddingProvider;
  readonly timeoutMs?: number;
  /** Defaults false for injected clients. The connection factory sets this true. */
  readonly ownsClient?: boolean;
}

export type WeaviateSearchConnection =
  | { readonly mode: "cloud"; readonly url: string; readonly options?: Parameters<typeof weaviate.connectToWeaviateCloud>[1] }
  | { readonly mode: "custom"; readonly options: Parameters<typeof weaviate.connectToCustom>[0] };

export interface ConnectWeaviateSearchOptions extends Omit<WeaviateSearchAdapterOptions, "client" | "ownsClient"> {
  readonly connection: WeaviateSearchConnection;
}

function jsonValue(value: unknown): value is JsonValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (Array.isArray(value) && value.every(jsonValue))
    || (isWeaviateRecord(value) && Object.values(value).every(jsonValue));
}

/** Uses the supported official SDK/gRPC query path, independent of deprecated GraphQL. */
export class WeaviateSearchAdapter {
  readonly name = "weaviate-knowledge-search";
  private readonly timeoutMs: number;
  private closed = false;

  constructor(private readonly options: WeaviateSearchAdapterOptions) {
    validateCollectionName(options.collection);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new TypeError("Search timeoutMs must be a positive safe integer.");
  }

  async search(request: WeaviateSearchRequest): Promise<{ readonly data: readonly WeaviateKnowledgeSearchResult[]; readonly has_more: false }> {
    if (this.closed) throw new Error("Weaviate search adapter is closed.");
    request.signal?.throwIfAborted();
    const limit = request.limit ?? 10;
    if (!request.query.trim() || request.query.length > 32_000 || !request.namespace.trim()
      || (request.domain !== undefined && !request.domain.trim())
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
      || (request.maxDistance !== undefined && !Number.isFinite(request.maxDistance))) {
      throw new TypeError("Search requires a nonempty query/namespace, optional nonempty domain, finite maxDistance and limit from 1 to 100.");
    }
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const collection = this.options.client.collections.use(this.options.collection);
    const namespaceFilter = collection.filter.byProperty("namespace").equal(request.namespace);
    const filters = request.domain === undefined ? namespaceFilter
      : Filters.and(namespaceFilter, collection.filter.byProperty("domain").equal(request.domain));
    const queryOptions = {
      filters, limit,
      distance: request.maxDistance,
      returnProperties: ["text", "namespace", "domain", "filename", "chunkId", "metadataJson", "sourceId", "documentId", "canonicalUrl"],
      returnMetadata: ["distance"] as ["distance"],
    };
    let result: unknown;
    if (this.options.embeddingProvider) {
      const vectors = await this.options.embeddingProvider.embed([request.query], { signal });
      signal.throwIfAborted();
      const vector = vectors[0];
      if (vectors.length !== 1 || !vector?.length || vector.some((value) => !Number.isFinite(value))
        || (this.options.embeddingProvider.dimensions !== undefined && vector.length !== this.options.embeddingProvider.dimensions)) {
        throw new TypeError("Search embedding provider returned an invalid query vector.");
      }
      result = await collection.query.nearVector([...vector], queryOptions, { abortSignal: signal });
    } else {
      result = await collection.query.nearText(request.query, queryOptions, { abortSignal: signal });
    }
    signal.throwIfAborted();
    if (!isWeaviateRecord(result) || !Array.isArray(result.objects) || result.objects.length > limit) throw new Error("Invalid Weaviate search result envelope.");
    const data = (result.objects as unknown[]).map((item): WeaviateKnowledgeSearchResult => {
      if (!isWeaviateRecord(item) || typeof item.uuid !== "string" || !isWeaviateRecord(item.properties)
        || !isWeaviateRecord(item.metadata) || typeof item.metadata.distance !== "number" || !Number.isFinite(item.metadata.distance)) {
        throw new Error("Invalid Weaviate search object or distance.");
      }
      const p = item.properties;
      if (p.namespace !== request.namespace || (request.domain !== undefined && p.domain !== request.domain)
        || typeof p.text !== "string" || !p.text.trim()) {
        throw new Error("Weaviate search returned content outside the requested scope or invalid text.");
      }
      const parsed: unknown = typeof p.metadataJson === "string" ? JSON.parse(p.metadataJson) as unknown : {};
      if (!isWeaviateRecord(parsed)) throw new Error("Weaviate search metadata is not a JSON object.");
      const metadata: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!jsonValue(value)) throw new Error("Weaviate search metadata contains an invalid JSON value.");
        metadata[key] = value;
      }
      const attributes: Record<string, JsonValue> = {
        ...metadata,
        namespace: request.namespace,
        domain: typeof p.domain === "string" ? p.domain : "",
        weaviate_object_id: item.uuid,
        canonical_url: typeof p.canonicalUrl === "string" ? p.canonicalUrl : "",
      };
      return {
        file_id: item.uuid,
        filename: typeof p.filename === "string" && p.filename ? p.filename : typeof p.documentId === "string" ? p.documentId : item.uuid,
        score: -item.metadata.distance,
        distance: item.metadata.distance,
        attributes,
        content: [{ type: "text", text: p.text }],
      };
    });
    return { data, has_more: false };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.options.ownsClient) await this.options.client.close?.();
  }
}

/** Creates/owns an SDK connection. Inject an existing client in the constructor to share one. */
export async function connectWeaviateSearch(options: ConnectWeaviateSearchOptions): Promise<WeaviateSearchAdapter> {
  validateCollectionName(options.collection);
  const connection = options.connection;
  const client = connection.mode === "cloud"
    ? await weaviate.connectToWeaviateCloud(connection.url, connection.options)
    : await weaviate.connectToCustom(connection.options);
  try {
    return new WeaviateSearchAdapter({ ...options, client, ownsClient: true });
  } catch (error) {
    client.close();
    throw error;
  }
}
