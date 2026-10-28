import { createHash } from "node:crypto";

export interface WeaviateConnectionOptions {
  /** Cluster origin, optionally ending in /v1. */
  readonly url: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function isWeaviateRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function weaviateLabels(value: unknown): readonly string[] {
  const items: readonly unknown[] = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return [...new Set(items.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

export function validateCollectionName(name: string): void {
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) {
    throw new TypeError("Weaviate collection must start with an uppercase letter and contain only letters, digits and underscores.");
  }
}

/** Stable UUID v5: namespace and original ID remain isolated within a collection. */
export function weaviateObjectId(collection: string, namespace: string, id: string): string {
  const bytes = createHash("sha1")
    .update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
    .update(JSON.stringify([collection, namespace, id]))
    .digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class WeaviateHttpError extends Error {
  constructor(readonly status: number, readonly path: string) {
    super(`Weaviate ${path} returned HTTP ${status}.`);
    this.name = "WeaviateHttpError";
  }
}

/** Small REST transport; HTTP errors omit response bodies; batch errors expose limited object-level messages. */
export class WeaviateRestClient {
  private readonly baseUrl: string;
  private readonly headers: Headers;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: WeaviateConnectionOptions) {
    const url = new URL(options.url);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError("Weaviate URL must be an HTTP(S) endpoint without credentials, query or fragment.");
    }
    this.baseUrl = url.href.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new TypeError("Weaviate timeoutMs must be a positive safe integer.");
    }
    this.headers = new Headers(options.headers);
    this.headers.set("Content-Type", "application/json");
    if (options.apiKey) this.headers.set("Authorization", `Bearer ${options.apiKey}`);
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async request(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetcher(this.baseUrl + path, {
      method,
      headers: this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new WeaviateHttpError(response.status, path.split("?")[0]!);
    }
    if (response.status === 204) return undefined;
    return response.json() as Promise<unknown>;
  }

  async writeBatch(objects: readonly Readonly<Record<string, unknown>>[], signal?: AbortSignal): Promise<void> {
    if (!objects.length) return;
    const result = await this.request("/batch/objects", "POST", { objects }, signal);
    if (!Array.isArray(result) || result.length !== objects.length) {
      throw new Error("Weaviate batch returned an invalid object count.");
    }
    for (const [index, item] of result.entries()) {
      if (!isWeaviateRecord(item) || !isWeaviateRecord(item.result)) {
        throw new Error(`Weaviate batch object ${index} returned an invalid result; the batch may be partially persisted.`);
      }

      const batchResult = item.result;
      const errors = batchResult.errors;
      const errorItems = isWeaviateRecord(errors) ? errors.error : undefined;
      // Weaviate may include an empty errors array even when an object succeeds.
      const hasErrors = errors !== undefined && errors !== null
        && (!isWeaviateRecord(errors) || Object.keys(errors).some((key) => key !== "error")
          || !Array.isArray(errorItems) || errorItems.length > 0);
      if (batchResult.status !== "SUCCESS" || hasErrors) {
        const messages = Array.isArray(errorItems)
          ? errorItems.flatMap((entry: unknown): string[] => {
            if (typeof entry === "string") return [entry];
            if (isWeaviateRecord(entry) && typeof entry.message === "string") return [entry.message];
            return [];
          }).map((message: string) => message.replace(/\s+/g, " ").trim()).filter(Boolean)
            .slice(0, 3).map((message: string) => message.slice(0, 500))
          : [];
        const status = typeof batchResult.status === "string" ? batchResult.status.slice(0, 80) : "UNKNOWN";
        const details = messages.length ? `; errors: ${messages.join("; ")}` : "; no error details returned";
        throw new Error(
          `Weaviate batch object ${index} failed (status: ${status}${details}); the batch may be partially persisted.`,
        );
      }
    }
  }
}

export const WEAVIATE_INGESTION_PROPERTIES = [
  { name: "text", dataType: ["text"] },
  { name: "namespace", dataType: ["text"], tokenization: "field" },
  { name: "chunkId", dataType: ["text"], tokenization: "field" },
  { name: "filename", dataType: ["text"], tokenization: "field" },
  { name: "domain", dataType: ["text"], tokenization: "field" },
  { name: "tags", dataType: ["text[]"] },
  { name: "keywords", dataType: ["text[]"] },
  { name: "sourceId", dataType: ["text"], tokenization: "field" },
  { name: "documentId", dataType: ["text"], tokenization: "field" },
  { name: "canonicalUrl", dataType: ["text"], tokenization: "field" },
  { name: "metadataJson", dataType: ["text"], indexFilterable: false, indexSearchable: false },
] as const;

export interface WeaviateEmbeddingConfiguration {
  readonly model?: string;
  readonly dimensions?: number;
  readonly baseURL?: string;
}

export async function ensureWeaviateCollection(
  client: WeaviateRestClient,
  collection: string,
  vectorizer: "none" | "text2vec-weaviate",
  embedding?: WeaviateEmbeddingConfiguration,
  signal?: AbortSignal,
): Promise<void> {
  let schema: unknown;
  try {
    schema = await client.request(`/schema/${collection}`, "GET", undefined, signal);
  } catch (error) {
    if (!(error instanceof WeaviateHttpError) || error.status !== 404) throw error;
    const properties = WEAVIATE_INGESTION_PROPERTIES.map((property) => ({
      ...property,
      ...(vectorizer === "text2vec-weaviate" ? {
        moduleConfig: { [vectorizer]: { skip: property.name !== "text", vectorizePropertyName: false } },
      } : {}),
    }));
    try {
      await client.request("/schema", "POST", {
        class: collection,
        vectorizer,
        properties,
        ...(vectorizer === "text2vec-weaviate" ? {
          moduleConfig: { [vectorizer]: {
            model: embedding?.model,
            dimensions: embedding?.dimensions,
            base_url: embedding?.baseURL,
            vectorizeClassName: false,
          } },
        } : {}),
      }, signal);
      return;
    } catch (createError) {
      // A concurrent creator can win; verify the final schema before writing.
      if (!(createError instanceof WeaviateHttpError) || createError.status !== 422) throw createError;
      schema = await client.request(`/schema/${collection}`, "GET", undefined, signal);
    }
  }
  if (!isWeaviateRecord(schema) || schema.vectorizer !== vectorizer) {
    throw new Error(`Weaviate collection ${collection} must use vectorizer ${vectorizer}.`);
  }
  if (isWeaviateRecord(schema.vectorConfig) && Object.keys(schema.vectorConfig).length > 0) {
    throw new Error(`Weaviate collection ${collection} must use a single unnamed vector.`);
  }
  if (vectorizer === "text2vec-weaviate") {
    const modules = schema.moduleConfig;
    const config = isWeaviateRecord(modules) ? modules[vectorizer] : undefined;
    if (!isWeaviateRecord(config)
      || (embedding?.model !== undefined && config.model !== embedding.model)
      || (embedding?.dimensions !== undefined && config.dimensions !== embedding.dimensions)
      || (embedding?.baseURL !== undefined && config.base_url !== embedding.baseURL)
      || config.vectorizeClassName !== false) {
      throw new Error(`Weaviate collection ${collection} uses a different embedding configuration.`);
    }
  }
  if (!Array.isArray(schema.properties)) throw new Error("Weaviate collection properties are missing.");
  for (const expected of WEAVIATE_INGESTION_PROPERTIES) {
    const actual: unknown = schema.properties.find((value: unknown) => isWeaviateRecord(value) && value.name === expected.name);
    if (!isWeaviateRecord(actual) || !Array.isArray(actual.dataType)
      || actual.dataType[0] !== expected.dataType[0]) {
      throw new Error(`Weaviate collection ${collection} has incompatible property ${expected.name}.`);
    }
    if ("tokenization" in expected && actual.tokenization !== expected.tokenization) {
      throw new Error(`Weaviate collection ${collection} must use field tokenization for ${expected.name}.`);
    }
    if (vectorizer === "text2vec-weaviate") {
      const modules = actual.moduleConfig;
      const config = isWeaviateRecord(modules) ? modules[vectorizer] : undefined;
      if (!isWeaviateRecord(config) || config.skip !== (expected.name !== "text")) {
        throw new Error(`Weaviate collection ${collection} must vectorize text only.`);
      }
    }
  }
}
