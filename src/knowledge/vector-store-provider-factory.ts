import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { EmbeddingProvider } from "../vector/embedding-provider.js";
import { WeaviateVectorStore } from "../vector/weaviate-vector-store.js";
import { QdrantVectorStore } from "../vector/qdrant-vector-store.js";
import { QdrantKnowledgeBaseAdapter } from "./qdrant-knowledge-base-adapter.js";
import { createWeaviateKnowledgeBaseAdapter } from "./weaviate-knowledge-base-adapter.js";
import { isKnowledgeBaseVectorStoreAdapter, type KnowledgeBaseVectorStoreAdapter } from "./knowledge-base-vector-store.js";
import { resolveVectorStoreProviderConfiguration, type VectorStoreProviderConfiguration } from "./vector-store-provider-config.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Host-owned embedding module receives only its configuration, not vector-store credentials. */
export async function createConfiguredEmbeddingProvider(configuration: VectorStoreProviderConfiguration): Promise<EmbeddingProvider> {
  const path = configuration.embedding.providerModule;
  if (!path) throw new TypeError("AUTO_EMBEDDING_PROVIDER_MODULE or an injected embeddingProvider is required in provided mode.");
  const module: unknown = await import(pathToFileURL(resolve(path)).href);
  if (!record(module)) throw new TypeError("Invalid embedding provider module.");
  const factory: unknown = module.createEmbeddingProvider;
  const provider: unknown = typeof factory === "function" ? await factory(configuration.embedding) : module.embeddingProvider;
  if (!record(provider) || typeof provider.name !== "string" || !provider.name.trim() || typeof provider.embed !== "function"
    || (provider.dimensions !== undefined && (!Number.isSafeInteger(provider.dimensions) || Number(provider.dimensions) < 1))
    || (provider.maxBatchSize !== undefined && (!Number.isSafeInteger(provider.maxBatchSize) || Number(provider.maxBatchSize) < 1))) {
    throw new TypeError("Embedding module must export embeddingProvider or createEmbeddingProvider(configuration), implementing name and embed().");
  }
  return provider as unknown as EmbeddingProvider;
}

function connection(configuration: VectorStoreProviderConfiguration): { url: string; apiKey?: string; collection: string; timeoutMs: number; batchSize: number } {
  if (!configuration.baseUrl || !configuration.collection) throw new TypeError("AUTO_VECTOR_STORE_BASE_URL and AUTO_VECTOR_STORE_COLLECTION are required for the selected database provider.");
  return { url: configuration.baseUrl, apiKey: configuration.apiKey, collection: configuration.collection, timeoutMs: configuration.timeoutMs, batchSize: configuration.batchSize };
}

/** Create the file-ingestion adapter from one common configuration interface. */
export async function createKnowledgeBaseVectorStoreAdapter(
  configuration: VectorStoreProviderConfiguration = resolveVectorStoreProviderConfiguration(),
  dependencies: { readonly embeddingProvider?: EmbeddingProvider } = {},
): Promise<KnowledgeBaseVectorStoreAdapter> {
  if (configuration.provider === "weaviate") return createWeaviateKnowledgeBaseAdapter(configuration);
  if (configuration.provider === "qdrant") {
    const options = connection(configuration);
    const embeddingProvider = configuration.embedding.mode === "provided"
      ? dependencies.embeddingProvider ?? await createConfiguredEmbeddingProvider(configuration)
      : undefined;
    if (configuration.embedding.mode === "native" && (configuration.embedding.baseUrl || configuration.embedding.apiKey)) throw new TypeError("Qdrant native Cloud Inference uses the cluster endpoint/key. External embedding endpoints require provided mode.");
    const dimensions = configuration.embedding.dimensions ?? embeddingProvider?.dimensions;
    if (!dimensions || (!embeddingProvider && !configuration.embedding.model)) throw new TypeError("Qdrant native ingestion requires AUTO_EMBEDDING_MODEL and AUTO_EMBEDDING_DIMENSIONS; provided mode requires known dimensions.");
    return new QdrantKnowledgeBaseAdapter({
      ...options, embeddingProvider, dimensions, model: configuration.embedding.model,
      distance: configuration.qdrantDistance,
      maxChunkCharacters: configuration.maxChunkCharacters, maxChunks: configuration.maxChunks,
      verificationAttempts: configuration.verificationAttempts, verificationDelayMs: configuration.verificationDelayMs,
    });
  }
  if (configuration.provider === "openai-compatible" && !configuration.adapterModule) {
    const { createVectorStoreAdapter } = await import("./openai-vector-store.adapter.js");
    return createVectorStoreAdapter(configuration);
  }
  const modulePath = configuration.adapterModule;
  if (!modulePath) throw new TypeError("AUTO_VECTOR_STORE_ADAPTER_MODULE is required for a custom provider.");
  const module: unknown = await import(pathToFileURL(resolve(modulePath)).href);
  if (!record(module)) throw new TypeError("Invalid vector store adapter module.");
  if (isKnowledgeBaseVectorStoreAdapter(module.vectorStoreAdapter)) return module.vectorStoreAdapter;
  const factory: unknown = module.createVectorStoreAdapter;
  const adapter: unknown = typeof factory === "function" ? await factory(configuration) : undefined;
  if (!isKnowledgeBaseVectorStoreAdapter(adapter)) throw new TypeError("Adapter module must export vectorStoreAdapter or createVectorStoreAdapter(configuration), implementing name and ingest().");
  return adapter;
}

/** Create a precomputed-vector store for the incremental ingestion facade. */
export function createPrecomputedVectorStore(configuration: VectorStoreProviderConfiguration = resolveVectorStoreProviderConfiguration()): WeaviateVectorStore | QdrantVectorStore {
  const options = connection(configuration);
  if (configuration.provider === "weaviate") return new WeaviateVectorStore(options);
  if (configuration.provider === "qdrant") {
    if (!configuration.embedding.dimensions) throw new TypeError("AUTO_EMBEDDING_DIMENSIONS is required to configure a Qdrant vector collection.");
    return new QdrantVectorStore({ ...options, dimensions: configuration.embedding.dimensions, distance: configuration.qdrantDistance });
  }
  throw new TypeError("Precomputed vector factories support weaviate and qdrant; inject other VectorStore implementations directly.");
}
