export type VectorStoreProvider = "weaviate" | "qdrant" | "openai-compatible" | "custom";
export type VectorStoreEnvironment = Readonly<Record<string, string | undefined>>;

/** Connection to the selected vector database, independent of its wire API. */
export interface VectorStoreProviderConfiguration {
  readonly provider: VectorStoreProvider;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly collection?: string;
  readonly adapterModule?: string;
  readonly timeoutMs: number;
  readonly batchSize: number;
  readonly maxChunks: number;
  readonly maxChunkCharacters: number;
  readonly verificationAttempts: number;
  readonly verificationDelayMs: number;
  readonly embedding: EmbeddingProviderConfiguration;
  /** Qdrant metric is a provider capability, separate from common connection settings. */
  readonly qdrantDistance: "Cosine" | "Dot" | "Euclid" | "Manhattan";
}

export interface EmbeddingProviderConfiguration {
  readonly mode: "native" | "provided";
  readonly model?: string;
  readonly dimensions?: number;
  /** External embedding service, never the vector-database URL. */
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly providerModule?: string;
}

/** Nonempty generic values win over aliases belonging to the selected provider only. */
export function resolveVectorStoreProviderConfiguration(
  environment: VectorStoreEnvironment = process.env,
  providerOverride?: VectorStoreProvider,
): VectorStoreProviderConfiguration {
  const value = (...names: string[]): string | undefined => {
    for (const name of names) { const result = environment[name]?.trim(); if (result) return result; }
    return undefined;
  };
  const adapterModule = value("AUTO_VECTOR_STORE_ADAPTER_MODULE");
  const requested = providerOverride ?? value("AUTO_VECTOR_STORE_PROVIDER")?.toLowerCase() ?? (adapterModule ? "custom" : "openai-compatible");
  const provider = requested === "openai" ? "openai-compatible" : requested;
  if (provider !== "weaviate" && provider !== "qdrant" && provider !== "openai-compatible" && provider !== "custom") throw new TypeError("AUTO_VECTOR_STORE_PROVIDER must be weaviate, qdrant, openai-compatible or custom.");
  const prefix = provider === "weaviate" ? "WEAVIATE" : provider === "qdrant" ? "QDRANT" : undefined;
  const integer = (generic: string, legacy: string | undefined, fallback: number | undefined, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number | undefined => {
    const raw = value(generic, ...(legacy ? [legacy] : []));
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw new TypeError(`${generic} must be an integer from ${minimum} to ${maximum}.`);
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new TypeError(`${generic} must be an integer from ${minimum} to ${maximum}.`);
    return parsed;
  };
  const legacy = (suffix: string): string | undefined => prefix ? `${prefix}_${suffix}` : undefined;
  const withAlias = (generic: string, suffix: string): string | undefined => value(generic, ...(prefix ? [`${prefix}_${suffix}`] : []));
  const baseUrl = withAlias("AUTO_VECTOR_STORE_BASE_URL", "URL");
  if (baseUrl) {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError("AUTO_VECTOR_STORE_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.");
  }
  const providerModule = value("AUTO_EMBEDDING_PROVIDER_MODULE");
  const mode = value("AUTO_EMBEDDING_MODE") ?? (providerModule ? "provided" : "native");
  if (mode !== "native" && mode !== "provided") throw new TypeError("AUTO_EMBEDDING_MODE must be native or provided.");
  const distance = (provider === "qdrant" ? value("QDRANT_DISTANCE") : undefined) ?? "Cosine";
  if (!["Cosine", "Dot", "Euclid", "Manhattan"].includes(distance)) throw new TypeError("QDRANT_DISTANCE must be Cosine, Dot, Euclid or Manhattan.");
  return {
    provider, baseUrl,
    apiKey: value("AUTO_VECTOR_STORE_API_KEY", ...(prefix ? [`${prefix}_API_KEY`] : []), ...(provider === "openai-compatible" ? ["OPENAI_API_KEY"] : [])),
    collection: withAlias("AUTO_VECTOR_STORE_COLLECTION", "COLLECTION"),
    adapterModule,
    timeoutMs: integer("AUTO_VECTOR_STORE_TIMEOUT_MS", legacy("TIMEOUT_MS"), 30_000)!,
    batchSize: integer("AUTO_VECTOR_STORE_BATCH_SIZE", legacy("BATCH_SIZE"), 100, 1, 200)!,
    maxChunks: integer("AUTO_VECTOR_STORE_MAX_CHUNKS", legacy("MAX_CHUNKS"), 10_000)!,
    maxChunkCharacters: integer("AUTO_VECTOR_STORE_MAX_CHUNK_CHARACTERS", legacy("MAX_CHUNK_CHARACTERS"), 6400)!,
    verificationAttempts: integer("AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS", legacy("VERIFICATION_ATTEMPTS"), 3, 1, 10)!,
    verificationDelayMs: integer("AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS", legacy("VERIFICATION_DELAY_MS"), 250, 0, 10_000)!,
    embedding: {
      mode, providerModule,
      model: withAlias("AUTO_EMBEDDING_MODEL", "EMBEDDING_MODEL"),
      dimensions: integer("AUTO_EMBEDDING_DIMENSIONS", legacy("EMBEDDING_DIMENSIONS"), undefined),
      baseUrl: withAlias("AUTO_EMBEDDING_BASE_URL", "EMBEDDING_BASE_URL"),
      apiKey: value("AUTO_EMBEDDING_API_KEY"),
    },
    qdrantDistance: distance as VectorStoreProviderConfiguration["qdrantDistance"],
  };
}
