import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { JsonValue } from "../domain/source.types.js";
import type { EmbeddingProvider } from "../vector/embedding-provider.js";
import type { MarkdownSplitter } from "../chunking/markdown-splitter.js";
import { StructuralMarkdownSplitter } from "../chunking/structural-markdown-splitter.js";
import { loadKnowledgeBaseFiles, type KnowledgeBaseFileLoadOptions, type LocalKnowledgeBaseFile } from "./knowledge-base-file-loader.js";
import type { KnowledgeBaseVectorStoreAdapter, KnowledgeBaseVectorStoreIngestRequest, KnowledgeBaseVectorStoreIngestResult } from "./knowledge-base-vector-store.js";
import { QdrantRestClient, ensureQdrantCollection, isQdrantRecord, qdrantPayload, qdrantPayloadMatches, qdrantPointId, qdrantPositiveInteger, validateQdrantCollection, validateQdrantVector, type QdrantConnectionOptions, type QdrantDistance } from "../vector/qdrant-client.js";

export interface QdrantKnowledgeBaseAdapterOptions extends QdrantConnectionOptions {
  readonly collection: string;
  /** Required model for native Cloud Inference; ignored when embeddingProvider is supplied. */
  readonly model?: string;
  readonly dimensions: number;
  readonly distance?: QdrantDistance;
  readonly embeddingProvider?: EmbeddingProvider;
  readonly splitter?: MarkdownSplitter;
  readonly maxChunkCharacters?: number;
  readonly batchSize?: number;
  readonly maxChunks?: number;
  readonly verificationAttempts?: number;
  readonly verificationDelayMs?: number;
}

export interface QdrantLocalFileIngestRequest extends Omit<KnowledgeBaseVectorStoreIngestRequest, "files" | "chunking">, KnowledgeBaseFileLoadOptions {
  readonly files: readonly LocalKnowledgeBaseFile[];
}

export interface QdrantKnowledgeBaseIngestResult extends KnowledgeBaseVectorStoreIngestResult {
  readonly files: readonly { readonly filename: string; readonly id: string; readonly chunkIds: readonly string[]; readonly contentHash: string; readonly byteLength: number; readonly status: "completed" }[];
  readonly objects: readonly { readonly filename: string; readonly id: string; readonly chunkId: string }[];
  readonly verification: { readonly objects: number; readonly vectors: number; readonly dimensions: number };
}

interface PreparedPoint {
  readonly id: string;
  readonly filename: string;
  readonly chunkId: string;
  readonly text: string;
  readonly payload: Readonly<Record<string, JsonValue>>;
}

function string(value: JsonValue | undefined): string { return typeof value === "string" ? value : ""; }

/** Text import via Cloud Inference or host embeddings; Qdrant persists points, not Files API uploads. */
export class QdrantKnowledgeBaseAdapter implements KnowledgeBaseVectorStoreAdapter {
  readonly supportsTokenChunking = false;
  readonly name: string;
  private readonly client: QdrantRestClient;
  private readonly splitter: MarkdownSplitter;
  private readonly batchSize: number;
  private readonly maxChunks: number;
  private readonly verificationAttempts: number;
  private readonly verificationDelayMs: number;

  constructor(private readonly options: QdrantKnowledgeBaseAdapterOptions) {
    validateQdrantCollection(options.collection);
    qdrantPositiveInteger(options.dimensions, "Qdrant dimensions");
    if (!options.embeddingProvider && !options.model?.trim()) throw new TypeError("Qdrant requires a Cloud Inference model or an injected EmbeddingProvider.");
    if (options.embeddingProvider?.dimensions !== undefined && options.embeddingProvider.dimensions !== options.dimensions) throw new TypeError("Qdrant embedding provider dimensions must match the collection.");
    if (options.embeddingProvider?.maxBatchSize !== undefined) qdrantPositiveInteger(options.embeddingProvider.maxBatchSize, "Embedding maxBatchSize");
    this.name = options.embeddingProvider ? "qdrant-provided-embeddings" : "qdrant-native-embeddings";
    this.client = new QdrantRestClient(options);
    this.splitter = options.splitter ?? new StructuralMarkdownSplitter({ maxCharacters: options.maxChunkCharacters ?? 6400 });
    this.batchSize = qdrantPositiveInteger(options.batchSize ?? 100, "Qdrant batchSize", 1000);
    this.maxChunks = qdrantPositiveInteger(options.maxChunks ?? 10_000, "Qdrant maxChunks");
    this.verificationAttempts = qdrantPositiveInteger(options.verificationAttempts ?? 3, "Qdrant verificationAttempts", 10);
    this.verificationDelayMs = options.verificationDelayMs ?? 250;
    if (!Number.isSafeInteger(this.verificationDelayMs) || this.verificationDelayMs < 0 || this.verificationDelayMs > 10_000) throw new TypeError("Qdrant verificationDelayMs must be an integer from 0 to 10000.");
  }

  async ingestFiles(request: QdrantLocalFileIngestRequest): Promise<QdrantKnowledgeBaseIngestResult> {
    const files = await loadKnowledgeBaseFiles(request.files, request);
    return this.ingest({ ...request, files });
  }

  async ingest(request: KnowledgeBaseVectorStoreIngestRequest): Promise<QdrantKnowledgeBaseIngestResult> {
    request.signal?.throwIfAborted();
    if (request.chunking) throw new TypeError("Qdrant uses local Markdown chunking; configure splitter or maxChunkCharacters instead of token chunking/overlap.");
    if (!request.namespace.trim() || !request.files.length) throw new TypeError("Qdrant requires a namespace and at least one knowledge file.");
    const prepared: PreparedPoint[] = [];
    const names = new Set<string>();
    const modelIdentity = this.options.embeddingProvider?.name ?? this.options.model!;
    for (const file of request.files) {
      request.signal?.throwIfAborted();
      if (!file.filename || names.has(file.filename)) throw new TypeError("Knowledge filenames must be nonempty and unique.");
      names.add(file.filename);
      const hash = createHash("sha256").update(file.markdown).digest("hex");
      const metadata = { ...request.metadata, ...file.metadata };
      const canonicalUrl = string(metadata.canonicalUrl) || string(metadata.canonical_url) || string(metadata.source_url) || string(metadata.url);
      const segments = await this.splitter.split(file.markdown, {
        sourceId: string(metadata.sourceId) || string(metadata.source_id) || request.namespace,
        documentId: file.filename, canonicalUrl,
        title: string(metadata.title) || undefined, documentContentHash: hash, signal: request.signal,
      });
      if (!segments.length) throw new Error(`Markdown splitter produced no chunks for ${file.filename}.`);
      for (const [ordinal, segment] of segments.entries()) {
        if (prepared.length >= this.maxChunks) throw new RangeError("Qdrant upload exceeds maxChunks before embedding requests.");
        if (!segment.markdown.trim()) throw new TypeError("Qdrant cannot index an empty chunk.");
        const chunkId = JSON.stringify([file.filename, hash, this.splitter.name, modelIdentity, this.options.dimensions, ordinal]);
        const id = qdrantPointId(this.options.collection, request.namespace, chunkId);
        const attributes: Record<string, JsonValue> = {
          ...metadata, ...segment.metadata?.attributes,
          filename: file.filename, canonicalUrl,
          sourceId: string(metadata.sourceId) || string(metadata.source_id) || request.namespace,
          documentId: string(metadata.documentId) || string(metadata.document_id) || file.filename,
          ordinal, documentHash: hash, splitter: this.splitter.name,
          embeddingModel: modelIdentity, embeddingDimensions: this.options.dimensions,
        };
        prepared.push({ id, filename: file.filename, chunkId, text: segment.markdown, payload: qdrantPayload(attributes, segment.markdown, request.namespace, chunkId) });
      }
    }
    await ensureQdrantCollection(this.client, this.options.collection, this.options.dimensions, this.options.distance ?? "Cosine", request.signal);
    const provider = this.options.embeddingProvider;
    const batchSize = Math.min(this.batchSize, provider?.maxBatchSize ?? this.batchSize);
    for (let offset = 0; offset < prepared.length; offset += batchSize) {
      const batch = prepared.slice(offset, offset + batchSize);
      const vectors = provider ? await provider.embed(batch.map((point) => point.text), { sourceId: request.namespace, signal: request.signal }) : undefined;
      request.signal?.throwIfAborted();
      if (vectors && vectors.length !== batch.length) throw new TypeError("Qdrant embedding provider returned a different vector count.");
      if (vectors) for (const vector of vectors) validateQdrantVector(vector, this.options.dimensions);
      const points = batch.map((point, index) => ({ id: point.id, payload: point.payload, vector: vectors ? vectors[index]! : { text: point.text, model: this.options.model! } }));
      await this.client.writePoints(this.options.collection, points, request.signal);
      await this.verify(batch, request.signal);
    }
    const objects = prepared.map(({ filename, id, chunkId }) => ({ filename, id, chunkId }));
    return {
      storeId: this.options.collection, storeName: this.options.collection,
      files: request.files.map((file) => {
        const chunkIds = objects.filter((point) => point.filename === file.filename).map((point) => point.id);
        return { filename: file.filename, id: chunkIds[0]!, chunkIds, contentHash: createHash("sha256").update(file.markdown).digest("hex"), byteLength: Buffer.byteLength(file.markdown, "utf8"), status: "completed" as const };
      }),
      objects,
      verification: { objects: prepared.length, vectors: prepared.length, dimensions: this.options.dimensions },
    };
  }

  private async verify(expected: readonly PreparedPoint[], signal?: AbortSignal): Promise<void> {
    for (let attempt = 0; attempt < this.verificationAttempts; attempt++) {
      const actual = await this.client.retrievePoints(this.options.collection, expected.map((point) => point.id), signal);
      const byId = new Map<string, Record<string, unknown>>();
      for (const point of actual) {
        if (!isQdrantRecord(point) || typeof point.id !== "string" || byId.has(point.id)) throw new Error("Qdrant returned an invalid or duplicate point during verification.");
        byId.set(point.id, point);
      }
      let complete = true;
      for (const point of expected) {
        const persisted = byId.get(point.id);
        if (!persisted) { complete = false; continue; }
        if (!qdrantPayloadMatches(persisted.payload, point.payload)) throw new Error(`Qdrant point ${point.id} has different content or provenance.`);
        if (persisted.vector === undefined || persisted.vector === null) { complete = false; continue; }
        validateQdrantVector(persisted.vector, this.options.dimensions);
      }
      if (complete) return;
      if (attempt + 1 < this.verificationAttempts) await delay(this.verificationDelayMs, undefined, { signal });
    }
    throw new Error("Qdrant point import did not produce all verified payloads and embedding vectors.");
  }
}
