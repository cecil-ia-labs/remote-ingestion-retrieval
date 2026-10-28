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
  resume?: KnowledgeBaseVectorStoreIngestRequest["resume"];
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
  if (!files.length) throw new Error("Knowledge base contains no Markdown files.");
  const filenames = new Set<string>();
  for (const file of files) {
    if (!file.filename.endsWith(".md") || !file.markdown.trim() || filenames.has(file.filename)) throw new Error(`Invalid, empty or duplicate Markdown file: ${file.filename}`);
    filenames.add(file.filename);
    validateOpenAIAttributes(file.filename, file.attributes);
  }
  const chunking = options.chunking ?? DEFAULT_CHUNKING;
  if (!Number.isInteger(chunking.maxChunkSizeTokens) || chunking.maxChunkSizeTokens < 100 || chunking.maxChunkSizeTokens > 4096
    || !Number.isInteger(chunking.chunkOverlapTokens) || chunking.chunkOverlapTokens < 0 || chunking.chunkOverlapTokens > chunking.maxChunkSizeTokens / 2) throw new Error("Invalid OpenAI Vector Store static chunking configuration.");
  const concurrency = options.uploadConcurrency ?? 4;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error("uploadConcurrency must be an integer from 1 to 32.");

  // Wait for every active worker before reporting a failure, retaining its checkpoints.
  async function limited<T, R>(items: readonly T[], operation: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    let failed = false;
    let failure: unknown;
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!failed && next < items.length) {
        const index = next++;
        try { options.signal?.throwIfAborted(); results[index] = await operation(items[index]!); }
        catch (error) { if (!failed) { failed = true; failure = error; } }
      }
    }));
    if (failed) throw failure;
    return results;
  }

  const resume = options.resume;
  const resumedIds = new Map<string, string>();
  if (resume) {
    const uniqueIds = new Set<string>();
    for (const file of resume.files) {
      if (!file.id || !filenames.has(file.filename) || resumedIds.has(file.filename) || uniqueIds.has(file.id)) throw new Error("Resume checkpoint has invalid or duplicate file IDs/filenames.");
      resumedIds.set(file.filename, file.id); uniqueIds.add(file.id);
    }
    if (!resume.storeId || resumedIds.size !== files.length) throw new Error("Resume checkpoint must contain the same store and every prepared file.");
  }
  const vectorStore = resume
    ? await openai.vectorStores.retrieve(resume.storeId, { signal: options.signal })
    : await openai.vectorStores.create({ name: options.name, ...(options.description ? { description: options.description } : {}), ...(options.metadata ? { metadata: options.metadata } : {}) }, { signal: options.signal });
  await options.onProgress?.({ stage: "store-created", storeId: vectorStore.id, storeName: vectorStore.name ?? options.name });

  const uploaded = await limited(files, async (entry) => {
    const existingId = resumedIds.get(entry.filename);
    // A resume never creates another Files API resource.
    const file = existingId ? await openai.files.retrieve(existingId, { signal: options.signal })
      : await openai.files.create({ file: await toFile(Buffer.from(entry.markdown, "utf8"), entry.filename), purpose: "assistants" }, { signal: options.signal });
    if (existingId && (file.filename !== entry.filename || file.bytes !== Buffer.byteLength(entry.markdown, "utf8"))) throw new Error(`Uploaded file no longer matches prepared content: ${entry.filename}, file=${file.id}.`);
    await options.onProgress?.({ stage: "file-uploaded", storeId: vectorStore.id, file: { filename: entry.filename, id: file.id } });
    return { filename: entry.filename, fileId: file.id, attributes: entry.attributes };
  });
  type Uploaded = (typeof uploaded)[number];
  type Stored = OpenAI.VectorStores.Files.VectorStoreFile;
  const strategy = { type: "static" as const, static: { max_chunk_size_tokens: chunking.maxChunkSizeTokens, chunk_overlap_tokens: chunking.chunkOverlapTokens } };
  function validate(entry: Uploaded, stored: Stored): void {
    if (stored.status !== "completed") throw new Error(`Vector Store file not completed: status=${stored.status}, store=${vectorStore.id}, file=${entry.fileId}.`);
    for (const [key, value] of Object.entries(entry.attributes)) if (stored.attributes?.[key] !== value) throw new Error(`Unexpected Vector Store attribute for ${entry.filename}: key=${key}, store=${vectorStore.id}, file=${entry.fileId}.`);
    const actual = stored.chunking_strategy;
    if (actual?.type !== "static" || !("static" in actual) || actual.static.max_chunk_size_tokens !== chunking.maxChunkSizeTokens || actual.static.chunk_overlap_tokens !== chunking.chunkOverlapTokens) throw new Error(`Unexpected Vector Store chunking for ${entry.filename}: expected=${chunking.maxChunkSizeTokens}/${chunking.chunkOverlapTokens}, received=${JSON.stringify(actual)}, store=${vectorStore.id}, file=${entry.fileId}.`);
  }
  const pending: Uploaded[] = [];
  if (resume) {
    // The last request may have completed remotely after the local deadline.
    // Read actual state and validate existing associations before scheduling writes.
    await limited(uploaded, async (entry) => {
      let stored: Stored;
      try { stored = await openai.vectorStores.files.retrieve(entry.fileId, { vector_store_id: vectorStore.id }, { signal: options.signal }); }
      catch (error) {
        if (error instanceof OpenAI.APIError && error.status === 404) { pending.push(entry); return; }
        throw error;
      }
      if (stored.status === "in_progress") stored = await openai.vectorStores.files.poll(vectorStore.id, entry.fileId, { signal: options.signal });
      validate(entry, stored);
      await options.onProgress?.({ stage: "file-verified", storeId: vectorStore.id, file: { filename: entry.filename, id: entry.fileId } });
    });
  } else pending.push(...uploaded);

  // Individual endpoints retain per-file attributes/strategy; bounded concurrency
  // avoids serial polling without returning to the problematic batch payload.
  await limited(pending, async (entry) => {
    const attached = await openai.vectorStores.files.createAndPoll(vectorStore.id, { file_id: entry.fileId, attributes: entry.attributes, chunking_strategy: strategy }, { signal: options.signal });
    if (attached.status !== "completed") throw new Error(`Vector Store ingestion failed: status=${attached.status}, store=${vectorStore.id}, file=${entry.fileId}.`);
    await options.onProgress?.({ stage: "file-attached", storeId: vectorStore.id, file: { filename: entry.filename, id: entry.fileId } });
  });
  const verifiedFiles = await limited(uploaded, async (entry) => {
    const stored = await openai.vectorStores.files.retrieve(entry.fileId, { vector_store_id: vectorStore.id }, { signal: options.signal });
    validate(entry, stored);
    await options.onProgress?.({ stage: "file-verified", storeId: vectorStore.id, file: { filename: entry.filename, id: entry.fileId } });
    return { filename: entry.filename, fileId: entry.fileId, chunking: { ...chunking } };
  });
  return { vectorStoreId: vectorStore.id, vectorStoreName: vectorStore.name ?? options.name, files: verifiedFiles };
}
