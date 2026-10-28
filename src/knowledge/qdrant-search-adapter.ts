import type { JsonValue } from "../domain/source.types.js";
import type { EmbeddingProvider } from "../vector/embedding-provider.js";
import { QdrantRestClient, isQdrantRecord, qdrantJson, qdrantPositiveInteger, validateQdrantCollection, validateQdrantVector, type QdrantConnectionOptions } from "../vector/qdrant-client.js";

export interface QdrantSearchAdapterOptions extends QdrantConnectionOptions {
  readonly collection: string;
  readonly model?: string;
  readonly dimensions: number;
  readonly embeddingProvider?: EmbeddingProvider;
}

export interface QdrantSearchRequest {
  readonly query: string;
  readonly namespace: string;
  readonly domain?: string;
  readonly limit?: number;
  readonly scoreThreshold?: number;
  readonly signal?: AbortSignal;
}

export interface QdrantKnowledgeSearchResult {
  readonly file_id: string;
  readonly filename: string;
  /** Native Qdrant score; its interpretation depends on the collection's distance metric. */
  readonly score: number;
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}

/** Uses Qdrant Query Points with exact namespace/domain filters and preserved provenance. */
export class QdrantSearchAdapter {
  readonly name = "qdrant-knowledge-search";
  private readonly client: QdrantRestClient;
  constructor(private readonly options: QdrantSearchAdapterOptions) {
    validateQdrantCollection(options.collection);
    qdrantPositiveInteger(options.dimensions, "Qdrant dimensions");
    if (!options.embeddingProvider && !options.model?.trim()) throw new TypeError("Qdrant search needs a Cloud Inference model or an EmbeddingProvider.");
    if (options.embeddingProvider?.dimensions !== undefined && options.embeddingProvider.dimensions !== options.dimensions) throw new TypeError("Qdrant query embedding dimensions must match the collection.");
    this.client = new QdrantRestClient(options);
  }

  async search(request: QdrantSearchRequest): Promise<{ readonly data: readonly QdrantKnowledgeSearchResult[]; readonly has_more: false }> {
    request.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const limit = qdrantPositiveInteger(request.limit ?? 10, "Qdrant search limit", 100);
    if (!request.query.trim() || request.query.length > 32_000 || !request.namespace.trim()
      || (request.domain !== undefined && !request.domain.trim()) || (request.scoreThreshold !== undefined && !Number.isFinite(request.scoreThreshold))) throw new TypeError("Qdrant search requires a bounded nonempty query, namespace and optional domain/score threshold.");
    let query: readonly number[] | { readonly text: string; readonly model: string };
    if (this.options.embeddingProvider) {
      const vectors = await this.options.embeddingProvider.embed([request.query], { signal });
      signal.throwIfAborted();
      if (vectors.length !== 1) throw new TypeError("Qdrant query embedding provider must return exactly one vector.");
      validateQdrantVector(vectors[0], this.options.dimensions);
      query = vectors[0];
    } else query = { text: request.query, model: this.options.model! };
    const must = [{ key: "namespace", match: { value: request.namespace } }, ...(request.domain === undefined ? [] : [{ key: "domain", match: { value: request.domain } }])];
    const result = await this.client.request(`/collections/${encodeURIComponent(this.options.collection)}/points/query`, "POST", {
      query, filter: { must }, limit, with_payload: true, with_vector: false,
      ...(request.scoreThreshold === undefined ? {} : { score_threshold: request.scoreThreshold }),
    }, signal);
    signal.throwIfAborted();
    if (!isQdrantRecord(result) || !Array.isArray(result.points) || result.points.length > limit) throw new Error("Qdrant search returned an invalid envelope.");
    const data = (result.points as unknown[]).map((point): QdrantKnowledgeSearchResult => {
      if (!isQdrantRecord(point) || typeof point.id !== "string" || typeof point.score !== "number" || !Number.isFinite(point.score) || !isQdrantRecord(point.payload)) throw new Error("Invalid Qdrant search point or score.");
      const payload = point.payload;
      if (payload.namespace !== request.namespace || (request.domain !== undefined && payload.domain !== request.domain) || typeof payload.text !== "string" || !payload.text.trim()) throw new Error("Qdrant search returned invalid text or a point outside the requested scope.");
      const metadata = payload.metadata ?? {};
      if (!isQdrantRecord(metadata) || !qdrantJson(metadata)) throw new Error("Invalid Qdrant search metadata.");
      return {
        file_id: point.id,
        filename: typeof payload.filename === "string" && payload.filename ? payload.filename : typeof payload.documentId === "string" ? payload.documentId : point.id,
        score: point.score,
        attributes: { ...metadata, namespace: request.namespace, domain: typeof payload.domain === "string" ? payload.domain : "", qdrant_point_id: point.id, canonical_url: typeof payload.canonicalUrl === "string" ? payload.canonicalUrl : typeof payload.canonical_url === "string" ? payload.canonical_url : "" },
        content: [{ type: "text", text: payload.text }],
      };
    });
    return { data, has_more: false };
  }
}
