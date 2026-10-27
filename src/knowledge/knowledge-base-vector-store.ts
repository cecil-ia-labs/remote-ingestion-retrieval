import type {
  JsonValue,
} from "../domain/source.types.js";

export type KnowledgeBaseFileMetadata = Readonly<
  Record<string, JsonValue>
>;

export interface KnowledgeBaseFile {
  readonly filename: string;
  readonly markdown: string;
  readonly metadata: KnowledgeBaseFileMetadata;
}

export interface KnowledgeBaseVectorStoreChunking {
  readonly maxChunkSizeTokens: number;
  readonly chunkOverlapTokens: number;
}

export interface KnowledgeBaseVectorStoreIngestRequest {
  readonly name: string;
  readonly description?: string;
  readonly namespace: string;
  readonly files: readonly KnowledgeBaseFile[];
  readonly chunking?: KnowledgeBaseVectorStoreChunking;
  readonly uploadConcurrency?: number;
  readonly metadata?: KnowledgeBaseFileMetadata;
  readonly signal?: AbortSignal;
}

export interface KnowledgeBaseVectorStoreFileResult {
  readonly filename: string;
  readonly id?: string;
  readonly chunking?: KnowledgeBaseVectorStoreChunking;
}

export interface KnowledgeBaseVectorStoreIngestResult {
  readonly storeId: string;
  readonly storeName: string;
  readonly files: readonly KnowledgeBaseVectorStoreFileResult[];
}

/**
 * Provider-neutral, file-oriented contract for vector stores that accept
 * source documents and perform or manage their own chunking and embeddings.
 * This is separate from VectorStore, which accepts precomputed vectors.
 */
export interface KnowledgeBaseVectorStoreAdapter {
  readonly name: string;

  ingest(
    request: KnowledgeBaseVectorStoreIngestRequest,
  ): Promise<KnowledgeBaseVectorStoreIngestResult>;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isKnowledgeBaseVectorStoreAdapter(
  value: unknown,
): value is KnowledgeBaseVectorStoreAdapter {
  return isRecord(value)
    && typeof value.name === "string"
    && typeof value.ingest === "function";
}

export function isKnowledgeBaseVectorStoreIngestResult(
  value: unknown,
): value is KnowledgeBaseVectorStoreIngestResult {
  return isRecord(value)
    && typeof value.storeId === "string"
    && typeof value.storeName === "string"
    && Array.isArray(value.files)
    && value.files.every(
      (file: unknown) => isRecord(file)
        && typeof file.filename === "string"
        && (file.id === undefined || typeof file.id === "string")
        && (
          file.chunking === undefined
          || (
            isRecord(file.chunking)
            && typeof file.chunking.maxChunkSizeTokens === "number"
            && typeof file.chunking.chunkOverlapTokens === "number"
          )
        ),
    );
}
