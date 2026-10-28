import OpenAI, { toFile } from "openai";
import type { KnowledgeBaseVectorStoreIngestRequest } from "./knowledge-base-vector-store.js";

import type {
  SemanticKnowledgeFileAttributes as KnowledgeFileAttributes,
  NormalizedKnowledgeBase
} from "../chunking/semantic-knowledge-base.js";



function toVectorStoreAttributes(
  attributes: KnowledgeFileAttributes,
): Record<string, string | number | boolean> {
  return {
    organization:
      attributes.organization,

    language:
      attributes.language,

    document_type:
      attributes.document_type,

    domain:
      attributes.domain,

    audience:
      attributes.audience,

    kb_namespace:
      attributes.kb_namespace,

    source_file:
      attributes.source_file,

    source_pages:
      attributes.source_pages,

    temporal_sensitivity:
      attributes.temporal_sensitivity,

    review_required:
      attributes.review_required,

    source_effective_date:
      attributes.source_effective_date,

    normalized_from:
      attributes.normalized_from,

    normalized_on:
      attributes.normalized_on,

    tags:
      attributes.tags,
  };
}


function validateAttributes(
  filename: string,
  attributes: KnowledgeFileAttributes,
): void {
  if (!attributes.domain.trim()) {
    throw new Error(
      `${filename}: missing domain`,
    );
  }

  if (!attributes.kb_namespace.trim()) {
    throw new Error(
      `${filename}: missing kb_namespace`,
    );
  }

  validateOpenAIAttributes(
    filename,
    toVectorStoreAttributes(attributes),
  );
}


function validateOpenAIAttributes(
  filename: string,
  attributes: Record<string, string | number | boolean>,
): void {
  const entries =
    Object.entries(attributes);

  if (entries.length > 16) {
    throw new Error(
      `${filename}: Vector Store files support at most 16 attributes`,
    );
  }

  for (const [key, value] of entries) {
    if (key.length > 64) {
      throw new Error(
        `${filename}: attribute key "${key}" exceeds 64 characters`,
      );
    }

    if (
      typeof value === "string" &&
      value.length > 512
    ) {
      throw new Error(
        `${filename}: attribute "${key}" exceeds 512 characters`,
      );
    }
  }
}


function validateKnowledgeBase(
  knowledgeBase: NormalizedKnowledgeBase,
): void {
  if (!knowledgeBase.files.length) {
    throw new Error(
      "Knowledge base contains no Markdown files.",
    );
  }

  if (
    knowledgeBase.files.length !==
    knowledgeBase.metadata.length
  ) {
    throw new Error(
      [
        "Files/metadata cardinality mismatch.",
        `files=${knowledgeBase.files.length}`,
        `metadata=${knowledgeBase.metadata.length}`,
      ].join(" "),
    );
  }

  const filenames = new Set<string>();

  for (const file of knowledgeBase.files) {
    if (!file.filename.endsWith(".md")) {
      throw new Error(
        `Invalid Markdown filename: ${file.filename}`,
      );
    }

    if (!file.markdown.trim()) {
      throw new Error(
        `Empty Markdown document: ${file.filename}`,
      );
    }

    if (filenames.has(file.filename)) {
      throw new Error(
        `Duplicate filename: ${file.filename}`,
      );
    }

    filenames.add(file.filename);
  }

  const metadataFilenames =
    new Set<string>();

  for (const metadata of knowledgeBase.metadata) {
    if (
      metadataFilenames.has(
        metadata.filename,
      )
    ) {
      throw new Error(
        `Duplicate metadata: ${metadata.filename}`,
      );
    }

    metadataFilenames.add(
      metadata.filename,
    );

    if (
      !filenames.has(metadata.filename)
    ) {
      throw new Error(
        `Metadata references unknown file: ${metadata.filename}`,
      );
    }

    validateAttributes(
      metadata.filename,
      metadata.attributes,
    );
  }

  for (const filename of filenames) {
    if (
      !metadataFilenames.has(filename)
    ) {
      throw new Error(
        `Missing metadata for ${filename}`,
      );
    }
  }
}


export interface CreateKnowledgeVectorStoreOptions {
  onProgress?: KnowledgeBaseVectorStoreIngestRequest["onProgress"];
  name: string;

  description?: string;

  chunking?: {
    maxChunkSizeTokens: number;
    chunkOverlapTokens: number;
  };

  metadata?: Record<string, string>;
}

export interface CreatedKnowledgeVectorStore {
  vectorStoreId: string;
  vectorStoreName: string;

  files: Array<{
    filename: string;
    fileId: string;
    domain: string;
  }>;

  domains: string[];
}

export interface KnowledgeVectorStoreMarkdownFile {
  filename: string;
  markdown: string;
  attributes: Record<string, string | number | boolean>;
}

export interface CreateKnowledgeVectorStoreFromFilesOptions {
  onProgress?: KnowledgeBaseVectorStoreIngestRequest["onProgress"];
  name: string;
  description?: string;
  uploadConcurrency?: number;
  signal?: AbortSignal;
  chunking?: {
    maxChunkSizeTokens: number;
    chunkOverlapTokens: number;
  };
  metadata?: Record<string, string>;
}

export interface CreatedKnowledgeVectorStoreFromFiles {
  vectorStoreId: string;
  vectorStoreName: string;
  files: Array<{
    filename: string;
    fileId: string;
    chunking: {
      maxChunkSizeTokens: number;
      chunkOverlapTokens: number;
    };
  }>;
}

const DEFAULT_CHUNKING = {
  maxChunkSizeTokens: 1600,
  chunkOverlapTokens: 100,
};

export async function createKnowledgeVectorStore(
  openai: OpenAI,
  knowledgeBase: NormalizedKnowledgeBase,
  options: CreateKnowledgeVectorStoreOptions,
): Promise<CreatedKnowledgeVectorStore> {
  validateKnowledgeBase(knowledgeBase);

  const metadataByFilename = new Map(
    knowledgeBase.metadata.map((entry) => [
      entry.filename,
      entry.attributes,
    ]),
  );

  const created = await createKnowledgeVectorStoreFromFiles(
    openai,
    knowledgeBase.files.map((entry) => {
      const attributes =
        metadataByFilename.get(entry.filename);

      if (!attributes) {
        throw new Error(
          `Missing metadata for ${entry.filename}`,
        );
      }

      return {
        filename: entry.filename,
        markdown: entry.markdown,
        attributes: toVectorStoreAttributes(attributes),
      };
    }),
    options,
  );

  const domains = [
    ...new Set(
      knowledgeBase.files.map(
        (file) =>
          metadataByFilename.get(file.filename)?.domain ?? "",
      ),
    ),
  ].filter(Boolean).sort();

  return {
    vectorStoreId: created.vectorStoreId,
    vectorStoreName: created.vectorStoreName,
    files: created.files.map((file) => ({
      ...file,
      domain: metadataByFilename.get(file.filename)?.domain ?? "",
    })),

    domains,
  };
}

export async function createKnowledgeVectorStoreFromFiles(
  openai: OpenAI,
  files: readonly KnowledgeVectorStoreMarkdownFile[],
  options: CreateKnowledgeVectorStoreFromFilesOptions,
): Promise<CreatedKnowledgeVectorStoreFromFiles> {
  if (!files.length) {
    throw new Error("Knowledge base contains no Markdown files.");
  }

  const filenames = new Set<string>();

  for (const file of files) {
    if (!file.filename.endsWith(".md")) {
      throw new Error(`Invalid Markdown filename: ${file.filename}`);
    }

    if (!file.markdown.trim()) {
      throw new Error(`Empty Markdown document: ${file.filename}`);
    }

    if (filenames.has(file.filename)) {
      throw new Error(`Duplicate filename: ${file.filename}`);
    }

    filenames.add(file.filename);
    validateOpenAIAttributes(file.filename, file.attributes);
  }

  const chunking = options.chunking ?? DEFAULT_CHUNKING;

  if (
    !Number.isInteger(chunking.maxChunkSizeTokens)
    || chunking.maxChunkSizeTokens < 100
    || chunking.maxChunkSizeTokens > 4096
    || !Number.isInteger(chunking.chunkOverlapTokens)
    || chunking.chunkOverlapTokens < 0
    || chunking.chunkOverlapTokens > chunking.maxChunkSizeTokens / 2
  ) {
    throw new Error("Invalid OpenAI Vector Store static chunking configuration.");
  }

  const uploadConcurrency = options.uploadConcurrency ?? 4;

  if (!Number.isInteger(uploadConcurrency) || uploadConcurrency < 1) {
    throw new Error("uploadConcurrency must be a positive integer.");
  }

  const vectorStore = await openai.vectorStores.create({
    name: options.name,
    ...(options.description
      ? { description: options.description }
      : {}),
    ...(options.metadata
      ? { metadata: options.metadata }
      : {}),
  }, { signal: options.signal });
  await options.onProgress?.({ stage: "store-created", storeId: vectorStore.id, storeName: vectorStore.name ?? options.name });

  const uploadedFiles: Array<{
    filename: string;
    fileId: string;
    attributes: Record<string, string | number | boolean>;
  }> = [];

  for (
    let offset = 0;
    offset < files.length;
    offset += uploadConcurrency
  ) {
    const batchFiles = files.slice(
      offset,
      offset + uploadConcurrency,
    );

    const uploadedBatch = await Promise.all(
      batchFiles.map(async (entry) => {
        const file = await openai.files.create({
          file: await toFile(
            Buffer.from(entry.markdown, "utf8"),
            entry.filename,
          ),
          purpose: "assistants",
        }, { signal: options.signal });
        await options.onProgress?.({ stage: "file-uploaded", storeId: vectorStore.id, file: { filename: entry.filename, id: file.id } });

        return {
          filename: entry.filename,
          fileId: file.id,
          attributes: entry.attributes,
        };
      }),
    );

    uploadedFiles.push(...uploadedBatch);
  }

  const requestedChunkingStrategy = {
    type: "static" as const,
    static: {
      max_chunk_size_tokens: chunking.maxChunkSizeTokens,
      chunk_overlap_tokens: chunking.chunkOverlapTokens,
    },
  };

  // Match inx-nlp: attach individually and sequentially, with attributes and
  // static strategy in the SAME request; only then retrieve every stored file.
  for (const uploadedFile of uploadedFiles) {
    options.signal?.throwIfAborted();
        const attached = await openai.vectorStores.files.createAndPoll(
          vectorStore.id,
          {
            file_id: uploadedFile.fileId,
            attributes: uploadedFile.attributes,
            chunking_strategy: requestedChunkingStrategy,
          },
          { signal: options.signal },
        );

        if (attached.status !== "completed") {
          throw new Error(
            `Vector Store ingestion failed for ${uploadedFile.filename}: `
            + `status=${attached.status}, store=${vectorStore.id}, `
            + `file=${uploadedFile.fileId}.`,
          );
        }
    await options.onProgress?.({ stage: "file-attached", storeId: vectorStore.id, file: { filename: uploadedFile.filename, id: uploadedFile.fileId } });
  }

  const verifiedFiles = await Promise.all(uploadedFiles.map(async (uploadedFile) => {
        const persisted = await openai.vectorStores.files.retrieve(
          uploadedFile.fileId,
          { vector_store_id: vectorStore.id },
          { signal: options.signal },
        );

        for (const [key, expected] of Object.entries(uploadedFile.attributes)) {
          if (persisted.attributes?.[key] !== expected) {
            throw new Error(
              `Unexpected Vector Store attribute for ${uploadedFile.filename}: `
              + `key=${key}, store=${vectorStore.id}, file=${uploadedFile.fileId}.`,
            );
          }
        }

        const strategy = persisted.chunking_strategy;

        if (
          strategy?.type !== "static"
          || !("static" in strategy)
          || strategy.static.max_chunk_size_tokens !== chunking.maxChunkSizeTokens
          || strategy.static.chunk_overlap_tokens !== chunking.chunkOverlapTokens
        ) {
          throw new Error(
            `Unexpected Vector Store chunking for ${uploadedFile.filename}: `
            + `expected=${chunking.maxChunkSizeTokens}/${chunking.chunkOverlapTokens}, `
            + `received=${JSON.stringify(strategy)}, store=${vectorStore.id}, `
            + `file=${uploadedFile.fileId}.`,
          );
        }

        await options.onProgress?.({ stage: "file-verified", storeId: vectorStore.id, file: { filename: uploadedFile.filename, id: uploadedFile.fileId } });

        return {
          filename: uploadedFile.filename,
          fileId: uploadedFile.fileId,
          chunking: {
            maxChunkSizeTokens: strategy.static.max_chunk_size_tokens,
            chunkOverlapTokens: strategy.static.chunk_overlap_tokens,
          },
        };
  }));

  return {
    vectorStoreId: vectorStore.id,
    vectorStoreName: vectorStore.name ?? options.name,
    files: verifiedFiles,
  };
}
