import { createHash } from "node:crypto";
import type { JsonValue } from "../domain/source.types.js";

export interface QdrantConnectionOptions {
  readonly url: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export type QdrantDistance = "Cosine" | "Dot" | "Euclid" | "Manhattan";

export function isQdrantRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function qdrantJson(value: unknown): value is JsonValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (Array.isArray(value) && value.every(qdrantJson))
    || (isQdrantRecord(value) && Object.values(value).every(qdrantJson));
}

export function qdrantPositiveInteger(value: number, name: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError(`${name} must be an integer from 1 to ${maximum}.`);
  return value;
}

export function validateQdrantCollection(collection: string): void {
  if (!collection.trim() || collection.length > 255 || /[/\\\0\r\n]/.test(collection) || collection === "." || collection === "..") {
    throw new TypeError("Qdrant collection must be a nonempty safe collection name of at most 255 characters.");
  }
}

export function qdrantPointId(collection: string, namespace: string, id: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
    .update(JSON.stringify(["qdrant", collection, namespace, id])).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 0x50;
  bytes[8] = (bytes[8]! & 63) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validateQdrantVector(value: unknown, dimensions: number): asserts value is readonly number[] {
  if (!Array.isArray(value) || value.length !== dimensions || !value.every((item: unknown) => typeof item === "number" && Number.isFinite(item))) {
    throw new TypeError(`Qdrant requires a finite dense vector with ${dimensions} dimensions.`);
  }
}

export class QdrantHttpError extends Error {
  constructor(readonly status: number, readonly path: string) {
    super(`Qdrant ${path} returned HTTP ${status}.`);
    this.name = "QdrantHttpError";
  }
}

export class QdrantRestClient {
  private readonly baseUrl: string;
  private readonly headers: Headers;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: QdrantConnectionOptions) {
    const url = new URL(options.url);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError("Qdrant URL must be HTTP(S), without credentials, query or fragment.");
    this.baseUrl = url.href.replace(/\/+$/, "");
    this.timeoutMs = qdrantPositiveInteger(options.timeoutMs ?? 30_000, "Qdrant timeoutMs");
    this.headers = new Headers(options.headers);
    this.headers.set("Content-Type", "application/json");
    if (options.apiKey) this.headers.set("api-key", options.apiKey);
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async request(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetcher(this.baseUrl + path, {
      method, headers: this.headers, redirect: "error",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) { await response.body?.cancel(); throw new QdrantHttpError(response.status, path.split("?")[0]!); }
    const result: unknown = await response.json();
    if (!isQdrantRecord(result) || result.status !== "ok" || !("result" in result)) throw new Error("Qdrant returned an invalid response envelope.");
    return result.result;
  }

  async writePoints(collection: string, points: readonly Readonly<Record<string, unknown>>[], signal?: AbortSignal): Promise<void> {
    if (!points.length) return;
    const result = await this.request(`/collections/${encodeURIComponent(collection)}/points?wait=true`, "PUT", { points }, signal);
    assertQdrantCompleted(result);
  }

  async retrievePoints(collection: string, ids: readonly string[], signal?: AbortSignal): Promise<readonly unknown[]> {
    const result = await this.request(`/collections/${encodeURIComponent(collection)}/points`, "POST", { ids, with_payload: true, with_vector: true }, signal);
    if (!Array.isArray(result)) throw new Error("Qdrant returned an invalid point readback.");
    return result as readonly unknown[];
  }
}

export function assertQdrantCompleted(result: unknown): void {
  if (!isQdrantRecord(result) || result.status !== "completed") throw new Error("Qdrant write was not confirmed completed; points may be partially persisted.");
}

export async function ensureQdrantCollection(client: QdrantRestClient, collection: string, dimensions: number, distance: QdrantDistance, signal?: AbortSignal): Promise<void> {
  validateQdrantCollection(collection);
  qdrantPositiveInteger(dimensions, "Qdrant dimensions");
  if (!["Cosine", "Dot", "Euclid", "Manhattan"].includes(distance)) throw new TypeError("Invalid Qdrant distance metric.");
  const path = `/collections/${encodeURIComponent(collection)}`;
  let info: unknown;
  try { info = await client.request(path, "GET", undefined, signal); }
  catch (error) {
    if (!(error instanceof QdrantHttpError) || error.status !== 404) throw error;
    try {
      const created = await client.request(path, "PUT", { vectors: { size: dimensions, distance } }, signal);
      if (created !== true) throw new Error("Qdrant did not confirm collection creation.");
    } catch (createError) { if (!(createError instanceof QdrantHttpError) || createError.status !== 409) throw createError; }
    info = await client.request(path, "GET", undefined, signal);
  }
  const params = isQdrantRecord(info) && isQdrantRecord(info.config) && isQdrantRecord(info.config.params) ? info.config.params : undefined;
  const vectors = params?.vectors;
  if (!isQdrantRecord(vectors) || vectors.size !== dimensions || vectors.distance !== distance || vectors.multivector_config !== undefined && vectors.multivector_config !== null) {
    throw new Error(`Qdrant collection ${collection} must use one unnamed dense vector with the requested dimensions and distance.`);
  }
  const schema = isQdrantRecord(info) && isQdrantRecord(info.payload_schema) ? info.payload_schema : {};
  for (const field of ["namespace", "domain"]) {
    const existing = schema[field];
    if (existing !== undefined && (!isQdrantRecord(existing) || existing.data_type !== "keyword")) throw new Error(`Qdrant ${field} index must have keyword type.`);
    if (existing === undefined) {
      const indexed = await client.request(`${path}/index?wait=true`, "PUT", { field_name: field, field_schema: "keyword" }, signal);
      assertQdrantCompleted(indexed);
    }
  }
}

export function qdrantPayload(metadata: Readonly<Record<string, JsonValue>>, text: string, namespace: string, chunkId: string): Readonly<Record<string, JsonValue>> {
  return {
    ...metadata, text, namespace, chunkId,
    domain: typeof metadata.domain === "string" ? metadata.domain : "",
    metadata: { ...metadata },
  };
}

export function qdrantPayloadMatches(actual: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  if (!isQdrantRecord(actual)) return false;
  const equal = (left: unknown, right: unknown): boolean => {
    if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => equal(item, right[index]));
    if (isQdrantRecord(left) && isQdrantRecord(right)) return Object.keys(left).length === Object.keys(right).length && Object.entries(right).every(([key, value]) => equal(left[key], value));
    return left === right;
  };
  return Object.entries(expected).every(([key, value]) => equal(actual[key], value));
}
