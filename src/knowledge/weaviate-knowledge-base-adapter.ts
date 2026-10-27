import { createHash } from "node:crypto";
import type { JsonValue } from "../domain/source.types.js";
import type { MarkdownSplitter } from "../chunking/markdown-splitter.js";
import { StructuralMarkdownSplitter } from "../chunking/structural-markdown-splitter.js";
import {
  WeaviateRestClient, ensureWeaviateCollection, validateCollectionName, weaviateObjectId, weaviateLabels,
  type WeaviateConnectionOptions, type WeaviateEmbeddingConfiguration,
} from "../vector/weaviate-client.js";
import type {
  KnowledgeBaseVectorStoreAdapter, KnowledgeBaseVectorStoreIngestRequest, KnowledgeBaseVectorStoreIngestResult,
} from "./knowledge-base-vector-store.js";

export interface WeaviateKnowledgeBaseAdapterOptions extends WeaviateConnectionOptions, WeaviateEmbeddingConfiguration {
  readonly collection: string;
  readonly splitter?: MarkdownSplitter;
  readonly maxChunkCharacters?: number;
  readonly batchSize?: number;
}

export interface WeaviateKnowledgeBaseIngestResult extends KnowledgeBaseVectorStoreIngestResult {
  /** Weaviate stores chunks as objects rather than uploaded files. */
  readonly objects: readonly { readonly filename: string; readonly id: string; readonly chunkId: string }[];
}

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Local Markdown chunking and native Weaviate Cloud embedding at object import. */
export class WeaviateKnowledgeBaseAdapter implements KnowledgeBaseVectorStoreAdapter {
  readonly name = "weaviate-native-embeddings";
  private readonly client: WeaviateRestClient;
  private readonly splitter: MarkdownSplitter;
  private readonly batchSize: number;

  constructor(private readonly options: WeaviateKnowledgeBaseAdapterOptions) {
    validateCollectionName(options.collection);
    if (options.dimensions !== undefined && (!Number.isSafeInteger(options.dimensions) || options.dimensions < 1)) {
      throw new TypeError("Weaviate embedding dimensions must be a positive safe integer.");
    }
    this.client = new WeaviateRestClient(options);
    this.splitter = options.splitter ?? new StructuralMarkdownSplitter({ maxCharacters: options.maxChunkCharacters ?? 6400 });
    this.batchSize = options.batchSize ?? 100;
    if (!Number.isSafeInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 200) {
      throw new TypeError("Weaviate batchSize must be an integer from 1 to 200.");
    }
  }

  async ingest(request: KnowledgeBaseVectorStoreIngestRequest): Promise<WeaviateKnowledgeBaseIngestResult> {
    request.signal?.throwIfAborted();
    if (request.chunking) {
      throw new TypeError("Weaviate uses local Markdown chunking; token chunking/overlap options are unsupported. Configure splitter or maxChunkCharacters instead.");
    }
    if (!request.namespace.trim()) throw new TypeError("Weaviate namespace must not be empty.");
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
    return {
      storeId: this.options.collection,
      storeName: this.options.collection,
      files: request.files.map((file) => ({ filename: file.filename })),
      objects: persisted,
    };
  }
}

/** Factory accepted by the manual runner's adapter-module loader. */
export function createVectorStoreAdapter(): WeaviateKnowledgeBaseAdapter {
  const url = process.env.WEAVIATE_URL?.trim();
  const collection = process.env.WEAVIATE_COLLECTION?.trim();
  if (!url || !collection) throw new Error("WEAVIATE_URL and WEAVIATE_COLLECTION are required.");
  const integer = (key: string): number | undefined => {
    const value = process.env[key];
    if (value === undefined || value === "") return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${key} must be a positive safe integer.`);
    return parsed;
  };
  return new WeaviateKnowledgeBaseAdapter({
    url,
    collection,
    apiKey: process.env.WEAVIATE_API_KEY,
    model: process.env.WEAVIATE_EMBEDDING_MODEL?.trim() || "Snowflake/snowflake-arctic-embed-l-v2.0",
    dimensions: integer("WEAVIATE_EMBEDDING_DIMENSIONS"),
    baseURL: process.env.WEAVIATE_EMBEDDING_BASE_URL?.trim() || undefined,
    timeoutMs: integer("WEAVIATE_TIMEOUT_MS"),
    batchSize: integer("WEAVIATE_BATCH_SIZE"),
    maxChunkCharacters: integer("WEAVIATE_MAX_CHUNK_CHARACTERS"),
  });
}
