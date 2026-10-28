import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { JsonValue } from "../domain/source.types.js";
import type { MarkdownSplitter } from "../chunking/markdown-splitter.js";
import { StructuralMarkdownSplitter } from "../chunking/structural-markdown-splitter.js";
import {
  WeaviateRestClient, WeaviateHttpError, isWeaviateRecord, ensureWeaviateCollection, validateCollectionName, weaviateObjectId, weaviateLabels,
  type WeaviateConnectionOptions, type WeaviateEmbeddingConfiguration,
} from "../vector/weaviate-client.js";
import type {
  KnowledgeBaseVectorStoreAdapter, KnowledgeBaseVectorStoreIngestRequest, KnowledgeBaseVectorStoreIngestResult,
} from "./knowledge-base-vector-store.js";
import { loadKnowledgeBaseFiles, type LocalKnowledgeBaseFile, type KnowledgeBaseFileLoadOptions } from "./knowledge-base-file-loader.js";
import { resolveVectorStoreProviderConfiguration, type VectorStoreProviderConfiguration } from "./vector-store-provider-config.js";

export interface WeaviateKnowledgeBaseAdapterOptions extends WeaviateConnectionOptions, WeaviateEmbeddingConfiguration {
  readonly collection: string;
  readonly splitter?: MarkdownSplitter;
  readonly maxChunkCharacters?: number;
  readonly batchSize?: number;
  readonly maxChunks?: number;
  readonly verificationAttempts?: number;
  readonly verificationDelayMs?: number;
}

export interface WeaviateLocalFileIngestRequest extends Omit<KnowledgeBaseVectorStoreIngestRequest, "files" | "chunking">, KnowledgeBaseFileLoadOptions {
  readonly files: readonly LocalKnowledgeBaseFile[];
}

export interface WeaviateKnowledgeBaseIngestResult extends KnowledgeBaseVectorStoreIngestResult {
  readonly files: readonly {
    readonly filename: string;
    /** ID of the first persisted chunk, not a synthetic Files API identifier. */
    readonly id: string;
    readonly chunkIds: readonly string[];
    readonly contentHash: string;
    readonly byteLength: number;
    readonly status: "completed";
  }[];
  /** Weaviate stores chunks as objects rather than uploaded files. */
  readonly objects: readonly { readonly filename: string; readonly id: string; readonly chunkId: string }[];
  readonly verification: { readonly objects: number; readonly vectors: number; readonly dimensions: number };
}

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Local Markdown chunking and native Weaviate Cloud embedding at object import. */
export class WeaviateKnowledgeBaseAdapter implements KnowledgeBaseVectorStoreAdapter {
  readonly supportsTokenChunking = false;
  readonly name = "weaviate-native-embeddings";
  private readonly client: WeaviateRestClient;
  private readonly splitter: MarkdownSplitter;
  private readonly batchSize: number;
  private readonly maxChunks: number;
  private readonly verificationAttempts: number;
  private readonly verificationDelayMs: number;

  constructor(private readonly options: WeaviateKnowledgeBaseAdapterOptions) {
    validateCollectionName(options.collection);
    if (options.dimensions !== undefined && (!Number.isSafeInteger(options.dimensions) || options.dimensions < 1)) {
      throw new TypeError("Weaviate embedding dimensions must be a positive safe integer.");
    }
    this.client = new WeaviateRestClient(options);
    this.splitter = options.splitter ?? new StructuralMarkdownSplitter({ maxCharacters: options.maxChunkCharacters ?? 6400 });
    this.batchSize = options.batchSize ?? 100;
    this.maxChunks = options.maxChunks ?? 10_000;
    if (!Number.isSafeInteger(this.maxChunks) || this.maxChunks < 1) throw new TypeError("Weaviate maxChunks must be a positive safe integer.");
    if (!Number.isSafeInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 200) {
      throw new TypeError("Weaviate batchSize must be an integer from 1 to 200.");
    }
    this.verificationAttempts = options.verificationAttempts ?? 3;
    this.verificationDelayMs = options.verificationDelayMs ?? 250;
    if (!Number.isSafeInteger(this.verificationAttempts) || this.verificationAttempts < 1 || this.verificationAttempts > 10
      || !Number.isSafeInteger(this.verificationDelayMs) || this.verificationDelayMs < 0 || this.verificationDelayMs > 10_000) {
      throw new TypeError("Verification requires 1-10 attempts and a delay from 0 to 10000ms.");
    }
  }

  async ingestFiles(request: WeaviateLocalFileIngestRequest): Promise<WeaviateKnowledgeBaseIngestResult> {
    const files = await loadKnowledgeBaseFiles(request.files, request);
    return this.ingest({ ...request, files });
  }

  async ingest(request: KnowledgeBaseVectorStoreIngestRequest): Promise<WeaviateKnowledgeBaseIngestResult> {
    request.signal?.throwIfAborted();
    if (request.chunking) {
      throw new TypeError("Weaviate uses local Markdown chunking; token chunking/overlap options are unsupported. Configure splitter or maxChunkCharacters instead.");
    }
    if (!request.namespace.trim()) throw new TypeError("Weaviate namespace must not be empty.");
    if (!request.files.length) throw new TypeError("Weaviate ingestion requires at least one knowledge file.");
    const objects: Record<string, unknown>[] = [];
    const persisted: { filename: string; id: string; chunkId: string }[] = [];
    const filenames = new Set<string>();
    for (const file of request.files) {
      request.signal?.throwIfAborted();
      if (!file.filename || filenames.has(file.filename)) throw new TypeError("Knowledge filenames must be nonempty and unique.");
      filenames.add(file.filename);
      const metadata = { ...request.metadata, ...file.metadata };
      const documentHash = createHash("sha256").update(file.markdown).digest("hex");
      const chunks = await this.splitter.split(file.markdown, {
        sourceId: stringValue(metadata.sourceId) || stringValue(metadata.source_id) || request.namespace,
        documentId: file.filename,
        canonicalUrl: stringValue(metadata.canonicalUrl) || stringValue(metadata.canonical_url) || stringValue(metadata.source_url) || stringValue(metadata.url),
        title: stringValue(metadata.title) || undefined,
        documentContentHash: documentHash,
        signal: request.signal,
      });
      if (!chunks.length) throw new Error(`Markdown splitter produced no chunks for ${file.filename}.`);
      for (const [ordinal, chunk] of chunks.entries()) {
        if (objects.length >= this.maxChunks) throw new RangeError("Weaviate knowledge upload exceeds maxChunks before embedding requests.");
        if (!chunk.markdown.trim()) throw new Error(`Markdown splitter produced an empty chunk for ${file.filename}.`);
        const attributes = { ...metadata, ...chunk.metadata?.attributes };
        const chunkId = JSON.stringify([file.filename, documentHash, this.splitter.name, ordinal]);
        const id = weaviateObjectId(this.options.collection, request.namespace, chunkId);
        objects.push({
          class: this.options.collection,
          id,
          properties: {
            text: chunk.markdown,
            namespace: request.namespace,
            chunkId,
            filename: file.filename,
            domain: stringValue(attributes.domain),
            tags: weaviateLabels(attributes.tags),
            keywords: weaviateLabels(attributes.keywords),
            sourceId: stringValue(attributes.sourceId) || stringValue(attributes.source_id) || request.namespace,
            documentId: file.filename,
            canonicalUrl: stringValue(attributes.canonicalUrl) || stringValue(attributes.canonical_url) || stringValue(attributes.source_url) || stringValue(attributes.url),
            metadataJson: JSON.stringify({ ...attributes, ordinal, documentHash, splitter: this.splitter.name }),
          },
        });
        persisted.push({ filename: file.filename, id, chunkId });
      }
    }
    // Split and validate all files before any remote mutation.
    await ensureWeaviateCollection(this.client, this.options.collection, "text2vec-weaviate", this.options, request.signal);
    for (let offset = 0; offset < objects.length; offset += this.batchSize) {
      await this.client.writeBatch(objects.slice(offset, offset + this.batchSize), request.signal);
    }
    let dimensions = this.options.dimensions;
    // An accepted batch alone does not prove that embeddings were persisted.
    for (const expected of objects) {
      const properties = expected.properties;
      if (!isWeaviateRecord(properties)) throw new Error("Invalid local Weaviate object properties.");
      let verified = false;
      for (let attempt = 0; attempt < this.verificationAttempts; attempt++) {
        request.signal?.throwIfAborted();
        let actual: unknown;
        try {
          actual = await this.client.request(`/objects/${this.options.collection}/${String(expected.id)}?include=vector`, "GET", undefined, request.signal);
        } catch (error) {
          if (!(error instanceof WeaviateHttpError) || error.status !== 404 || attempt === this.verificationAttempts - 1) throw error;
        }
        if (isWeaviateRecord(actual) && isWeaviateRecord(actual.properties)) {
          if (actual.id !== expected.id || actual.class !== this.options.collection
            || Object.entries(properties).some(([key, value]) => JSON.stringify(actual.properties && (actual.properties as Record<string, unknown>)[key]) !== JSON.stringify(value))) {
            throw new Error(`Weaviate persisted object ${String(expected.id)} has different content or provenance.`);
          }
          const vector = actual.vector;
          if (Array.isArray(vector) && vector.length > 0 && vector.every((value: unknown) => typeof value === "number" && Number.isFinite(value))) {
            dimensions ??= vector.length;
            if (vector.length !== dimensions) throw new Error("Weaviate persisted embedding dimensions do not agree.");
            verified = true;
            break;
          }
        }
        if (attempt + 1 < this.verificationAttempts) await delay(this.verificationDelayMs, undefined, { signal: request.signal });
      }
      if (!verified) throw new Error(`Weaviate object ${String(expected.id)} has no verified persisted embedding.`);
    }
    return {
      storeId: this.options.collection,
      storeName: this.options.collection,
      files: request.files.map((file) => {
        const chunkIds = persisted.filter((object) => object.filename === file.filename).map((object) => object.id);
        return {
          filename: file.filename,
          id: chunkIds[0]!,
          chunkIds,
          contentHash: createHash("sha256").update(file.markdown).digest("hex"),
          byteLength: Buffer.byteLength(file.markdown, "utf8"),
          status: "completed" as const,
        };
      }),
      objects: persisted,
      verification: { objects: persisted.length, vectors: persisted.length, dimensions: dimensions! },
    };
  }
}

/** Factory accepted by the manual runner's adapter-module loader. */
export function createVectorStoreAdapter(): WeaviateKnowledgeBaseAdapter {
  return createWeaviateKnowledgeBaseAdapter(resolveVectorStoreProviderConfiguration(process.env, "weaviate"));
}

export function createWeaviateKnowledgeBaseAdapter(configuration: VectorStoreProviderConfiguration): WeaviateKnowledgeBaseAdapter {
  if (configuration.provider !== "weaviate") throw new TypeError("Expected Weaviate configuration.");
  if (!configuration.baseUrl || !configuration.collection) throw new TypeError("AUTO_VECTOR_STORE_BASE_URL and AUTO_VECTOR_STORE_COLLECTION are required (WEAVIATE_URL/COLLECTION remain aliases).");
  if (configuration.embedding.mode !== "native") throw new TypeError("Weaviate file ingestion uses native embeddings. For provided embeddings, use WeaviateVectorStore with the incremental facade.");
  if (configuration.embedding.apiKey) throw new TypeError("Weaviate native embeddings use the cluster API key, not AUTO_EMBEDDING_API_KEY.");
  return new WeaviateKnowledgeBaseAdapter({
    url: configuration.baseUrl, collection: configuration.collection, apiKey: configuration.apiKey,
    model: configuration.embedding.model ?? "Snowflake/snowflake-arctic-embed-l-v2.0",
    dimensions: configuration.embedding.dimensions, baseURL: configuration.embedding.baseUrl,
    timeoutMs: configuration.timeoutMs, batchSize: configuration.batchSize, maxChunks: configuration.maxChunks,
    maxChunkCharacters: configuration.maxChunkCharacters,
    verificationAttempts: configuration.verificationAttempts, verificationDelayMs: configuration.verificationDelayMs,
  });
}
