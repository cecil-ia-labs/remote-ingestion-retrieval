import OpenAI from "openai";
import type { VectorStoreProviderConfiguration } from "./vector-store-provider-config.js";

import {
  createKnowledgeVectorStoreFromFiles,
} from "./openai-vector-store-ingestion.js";

import type {
  KnowledgeBaseFileMetadata,
  KnowledgeBaseVectorStoreAdapter,
  KnowledgeBaseVectorStoreIngestRequest,
} from "./knowledge-base-vector-store.js";

function toOpenAIAttributes(
  filename: string,
  namespace: string,
  metadata: KnowledgeBaseFileMetadata,
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" || typeof value === "boolean") {
      attributes[key] = value;
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      attributes[key] = value;
      continue;
    }

    throw new Error(
      `${filename}: OpenAI file attributes must be strings, finite numbers, or booleans (${key}).`,
    );
  }

  attributes.kb_namespace = namespace;

  return attributes;
}

function toOpenAIStoreMetadata(
  namespace: string,
  metadata: KnowledgeBaseFileMetadata | undefined,
): Record<string, string> {
  const result: Record<string, string> = {
    kb_namespace: namespace,
  };

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (key === "kb_namespace") {
      continue;
    }

    if (typeof value === "string") {
      result[key] = value;
      continue;
    }

    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
      throw new Error(`Could not serialize Vector Store metadata: ${key}.`);
    }

    result[key] = serialized;
  }

  for (const [key, value] of Object.entries(result)) {
    if (key.length > 64 || value.length > 512) {
      throw new Error(
        `Vector Store metadata exceeds OpenAI key/value length limits (${key}).`,
      );
    }
  }

  if (Object.keys(result).length > 16) {
    throw new Error("Vector Store metadata supports at most 16 attributes.");
  }

  return result;
}

export function createOpenAIVectorStoreAdapter(
  openai: OpenAI,
  name = "openai-vector-stores",
): KnowledgeBaseVectorStoreAdapter {
  return {
    name,

    async ingest(
      request: KnowledgeBaseVectorStoreIngestRequest,
    ) {
      if (!request.name.trim() || !request.namespace.trim()) {
        throw new Error("Vector Store name and namespace must be non-empty.");
      }

      const files = request.files.map((file) => ({
        filename: file.filename,
        markdown: file.markdown,
        attributes: toOpenAIAttributes(
          file.filename,
          request.namespace,
          file.metadata,
        ),
      }));

      const created = await createKnowledgeVectorStoreFromFiles(
        openai,
        files,
        {
          name: request.name,
          description: request.description,
          metadata: toOpenAIStoreMetadata(
            request.namespace,
            request.metadata,
          ),
          chunking: request.chunking,
          uploadConcurrency: request.uploadConcurrency,
          signal: request.signal,
          onProgress: request.onProgress,
        },
      );

      return {
        storeId: created.vectorStoreId,
        storeName: created.vectorStoreName,
        files: created.files.map((file) => ({
          filename: file.filename,
          id: file.fileId,
          chunking: file.chunking,
        })),
      };
    },
  };
}

/**
 * Adapter-module factory consumed by the generic AAC Auto runner. The OpenAI
 * SDK reads OPENAI_API_KEY from the process environment when requests execute.
 */
export function createVectorStoreAdapter(configuration?: VectorStoreProviderConfiguration): KnowledgeBaseVectorStoreAdapter {
  const genericBaseURL = configuration?.baseUrl ?? process.env.AUTO_VECTOR_STORE_BASE_URL?.trim();
  const compatibleBaseURL = genericBaseURL || process.env.AAC_AUTO_VECTOR_STORE_BASE_URL?.trim();

  if (compatibleBaseURL) {
    const url = new URL(compatibleBaseURL);

    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
    ) {
      throw new Error(
        "AAC_AUTO_VECTOR_STORE_BASE_URL must be an HTTPS URL without credentials, query, or fragment.",
      );
    }

    const apiKey = genericBaseURL
      ? configuration?.apiKey || process.env.AUTO_VECTOR_STORE_API_KEY?.trim() || (url.origin === "https://api.openai.com" ? process.env.OPENAI_API_KEY?.trim() : undefined)
      : process.env.AAC_AUTO_VECTOR_STORE_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        "Set AUTO_VECTOR_STORE_API_KEY for a generic OpenAI-compatible endpoint, or AAC_AUTO_VECTOR_STORE_API_KEY with its legacy URL.",
      );
    }

    return createOpenAIVectorStoreAdapter(
      new OpenAI({
        apiKey,
        baseURL: url.toString(),
      }),
      process.env.AAC_AUTO_VECTOR_STORE_PROVIDER_NAME?.trim()
        || "openai-compatible-vector-stores",
    );
  }

  const apiKey = configuration?.apiKey || process.env.AUTO_VECTOR_STORE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY for the OpenAI Vector Store endpoint.");
  }

  return createOpenAIVectorStoreAdapter(
    new OpenAI({
      apiKey,
      baseURL: "https://api.openai.com/v1",
    }),
  );
}
