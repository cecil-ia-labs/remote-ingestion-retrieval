import { randomUUID } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createVectorStoreAdapter } from "../knowledge/weaviate-knowledge-base-adapter.js";
import type { LocalKnowledgeBaseFile } from "../knowledge/knowledge-base-file-loader.js";
import type { JsonValue } from "../domain/source.types.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(value: unknown): value is JsonValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (Array.isArray(value) && value.every(json))
    || (record(value) && Object.values(value).every(json));
}

function integer(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new TypeError(`${name} must be a positive safe integer.`);
  return parsed;
}

async function manifestInputs(path: string): Promise<readonly LocalKnowledgeBaseFile[]> {
  const handle = await open(path, "r");
  let body: string;
  try {
    const maximum = 2 * 1024 * 1024;
    const buffer = Buffer.alloc(maximum + 1);
    let size = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maximum) throw new RangeError("Upload manifest exceeds 2 MiB.");
    }
    body = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
  } finally {
    await handle.close();
  }
  const parsed: unknown = JSON.parse(body);
  if (!record(parsed) || !Array.isArray(parsed.files)) throw new TypeError("Upload manifest must contain files: [{ filename, metadata }].");
  return (parsed.files as unknown[]).map((file) => {
    if (!record(file) || typeof file.filename !== "string" || !file.filename || /[/\\\0]/.test(file.filename)
      || file.filename === "." || file.filename === ".." || !record(file.metadata) || !json(file.metadata)) {
      throw new TypeError("Invalid upload manifest filename or metadata.");
    }
    return { path: resolve(dirname(path), file.filename), filename: file.filename, metadata: file.metadata };
  });
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { namespace: { type: "string" }, name: { type: "string" }, domain: { type: "string" }, manifest: { type: "string" }, report: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.info("Upload local UTF-8 Markdown/text to Weaviate native embeddings and vector storage.\nUsage: npm run upload:weaviate -- --namespace support [--domain billing] file.md [...]\n   or: npm run upload:weaviate -- --namespace support --manifest kb/source/split/run/manifest.json\nRequires WEAVIATE_URL, WEAVIATE_COLLECTION and cluster credentials. Does not crawl websites.\nOptional: --name, --report. Existing namespace/source defaults and AUTO_MAX_KB_* limits apply.");
    return;
  }
  if ((values.manifest && positionals.length) || (!values.manifest && !positionals.length)) throw new TypeError("Supply Markdown/text paths or --manifest, exclusively.");
  const namespace = values.namespace ?? process.env.AUTO_KB_NAMESPACE ?? process.env.SOURCE_ID ?? "";
  if (!namespace.trim()) throw new TypeError("A nonempty --namespace or AUTO_KB_NAMESPACE is required.");
  const inputs: readonly LocalKnowledgeBaseFile[] = values.manifest
    ? await manifestInputs(resolve(values.manifest))
    : positionals.map((path): LocalKnowledgeBaseFile => ({ path: resolve(path), ...(values.domain ? { metadata: { domain: values.domain } } : {}) }));
  const reportPath = resolve(values.report ?? `data/weaviate-uploads/${randomUUID()}.json`);
  const startedAt = new Date().toISOString();
  try {
    const adapter = createVectorStoreAdapter();
    const result = await adapter.ingestFiles({
      name: values.name ?? process.env.AUTO_VECTOR_STORE_NAME ?? process.env.WEAVIATE_COLLECTION ?? namespace,
      namespace, files: inputs,
      maxFiles: integer("AUTO_MAX_KB_FILES", 100),
      maxFileBytes: integer("AUTO_MAX_BYTES_PER_DOCUMENT", 5 * 1024 * 1024),
      maxTotalBytes: integer("AUTO_MAX_KB_BYTES", 50 * 1024 * 1024),
      signal: AbortSignal.timeout(integer("AUTO_MAX_ELAPSED_MS", 600_000)),
    });
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ status: "completed", namespace, startedAt, finishedAt: new Date().toISOString(), vectorStore: result }, null, 2), "utf8");
    console.info(`Weaviate upload completed: ${reportPath}`);
  } catch (error) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ status: "failed", namespace, startedAt, finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }, null, 2), "utf8");
    console.error(`Weaviate upload failed: ${reportPath}`);
    throw error;
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
