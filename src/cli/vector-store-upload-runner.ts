import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createKnowledgeBaseVectorStoreAdapter } from "../knowledge/vector-store-provider-factory.js";
import { resolveVectorStoreProviderConfiguration, type VectorStoreProvider } from "../knowledge/vector-store-provider-config.js";
import { loadKnowledgeBaseFiles, type LocalKnowledgeBaseFile } from "../knowledge/knowledge-base-file-loader.js";
import type { JsonValue } from "../domain/source.types.js";
import { loadKnowledgeBaseMarkdownSplitter, splitKnowledgeBaseFiles } from "../knowledge/split-knowledge-base-files.js";

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

interface SavedUploadInputs {
  readonly files: readonly LocalKnowledgeBaseFile[];
  readonly alreadySplit: boolean;
  readonly namespace?: string;
  readonly name?: string;
}

async function manifestInputs(path: string, ingestionReport = false): Promise<SavedUploadInputs> {
  const handle = await open(path, "r");
  let body: string;
  try {
    const maximum = (ingestionReport ? 8 : 2) * 1024 * 1024;
    const buffer = Buffer.alloc(maximum + 1);
    let size = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maximum) throw new RangeError("Upload manifest/report exceeds its byte limit.");
    }
    body = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
  } finally {
    await handle.close();
  }
  const parsed: unknown = JSON.parse(body);
  if (ingestionReport) {
    if (!record(parsed) || typeof parsed.markdownDirectory !== "string" || !Array.isArray(parsed.knowledgeBaseManifest)
      || !record(parsed.materialization) || !Array.isArray(parsed.materialization.succeeded)) throw new TypeError("Invalid ingestion report: saved Markdown and metadata manifest are required.");
    if (parsed.vectorStore !== null && parsed.vectorStore !== undefined) throw new Error("The ingestion report already contains a vector-store result; automatic resend was refused.");
    const root = resolve(parsed.markdownDirectory);
    const saved = new Map<string, { path: string; hash: string }>();
    for (const item of parsed.materialization.succeeded as unknown[]) {
      if (!record(item) || typeof item.filename !== "string" || typeof item.relativePath !== "string" || typeof item.contentHash !== "string" || saved.has(item.filename)) throw new TypeError("Invalid or duplicate saved document in ingestion report.");
      const absolute = resolve(root, item.relativePath);
      const local = relative(root, absolute);
      if (isAbsolute(item.relativePath) || local === ".." || local.startsWith("../") || isAbsolute(local)) throw new TypeError("Saved document path escapes the Markdown directory.");
      saved.set(item.filename, { path: absolute, hash: item.contentHash });
    }
    const files = (parsed.knowledgeBaseManifest as unknown[]).map((entry): LocalKnowledgeBaseFile => {
      if (!record(entry) || typeof entry.filename !== "string" || !record(entry.metadata) || !json(entry.metadata)) throw new TypeError("Invalid saved knowledge metadata.");
      const document = saved.get(entry.filename);
      if (!document || entry.metadata.content_hash !== document.hash) throw new TypeError("Saved document hash/metadata mismatch.");
      return { path: document.path, filename: entry.filename, metadata: entry.metadata };
    });
    return { files, alreadySplit: false, namespace: typeof parsed.namespace === "string" ? parsed.namespace : undefined, name: typeof parsed.vectorStoreName === "string" ? parsed.vectorStoreName : undefined };
  }
  if (!record(parsed) || !Array.isArray(parsed.files)) throw new TypeError("Upload manifest must contain files: [{ filename, metadata }].");
  const files = (parsed.files as unknown[]).map((file) => {
    if (!record(file) || typeof file.filename !== "string" || !file.filename || /[/\\\0]/.test(file.filename)
      || file.filename === "." || file.filename === ".." || !record(file.metadata) || !json(file.metadata)) {
      throw new TypeError("Invalid upload manifest filename or metadata.");
    }
    return { path: resolve(dirname(path), file.filename), filename: file.filename, metadata: file.metadata };
  });
  return { files, alreadySplit: typeof parsed.splitter === "string" };
}

export async function runVectorStoreUpload(providerOverride?: VectorStoreProvider): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { namespace: { type: "string" }, name: { type: "string" }, domain: { type: "string" }, manifest: { type: "string" }, "ingestion-report": { type: "string" }, report: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.info("Upload local UTF-8 Markdown/text to the selected vector provider.\nUsage: npm run upload:vector-store -- --namespace support [--domain billing] file.md [...]\n   or: npm run upload:vector-store -- --namespace support --manifest kb/source/split/run/manifest.json\nConfigure AUTO_VECTOR_STORE_PROVIDER/BASE_URL/COLLECTION/API_KEY and AUTO_EMBEDDING_*. Does not crawl websites.\nResume saved documents/metadata with --ingestion-report path/to/ingestion.json (no recrawl).\nAUTO_MAX_KB_FILES limits input documents; AUTO_MAX_SPLIT_FILES defaults to 10000 generated files.\nOptional: --name, --report. Existing namespace/source defaults and AUTO_MAX_KB_* limits apply.\nThe legacy upload:weaviate command explicitly selects Weaviate.");
    return;
  }
  if (Number(Boolean(values.manifest)) + Number(Boolean(values["ingestion-report"])) + Number(positionals.length > 0) !== 1) throw new TypeError("Supply Markdown/text paths, --manifest or --ingestion-report, exclusively.");
  const saved: SavedUploadInputs = values["ingestion-report"] ? await manifestInputs(resolve(values["ingestion-report"]), true)
    : values.manifest ? await manifestInputs(resolve(values.manifest))
      : { files: positionals.map((path): LocalKnowledgeBaseFile => ({ path: resolve(path), ...(values.domain ? { metadata: { domain: values.domain } } : {}) })), alreadySplit: false };
  const namespace = values.namespace ?? process.env.AUTO_KB_NAMESPACE ?? saved.namespace ?? process.env.SOURCE_ID ?? "";
  if (!namespace.trim()) throw new TypeError("A nonempty --namespace or AUTO_KB_NAMESPACE is required.");
  const configuration = resolveVectorStoreProviderConfiguration(process.env, providerOverride);
  const reportPath = resolve(values.report ?? (providerOverride === "weaviate" ? `data/weaviate-uploads/${randomUUID()}.json` : `data/vector-store-uploads/${configuration.provider}/${randomUUID()}.json`));
  const startedAt = new Date().toISOString();
  let splitManifestPath = values.manifest ? resolve(values.manifest) : undefined;
  try {
    const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration);
    const signal = AbortSignal.timeout(integer("AUTO_MAX_ELAPSED_MS", 600_000));
    const sourceFiles = await loadKnowledgeBaseFiles(saved.files, {
      maxFiles: integer(saved.alreadySplit ? "AUTO_MAX_SPLIT_FILES" : "AUTO_MAX_KB_FILES", saved.alreadySplit ? 10_000 : 100),
      maxFileBytes: integer("AUTO_MAX_BYTES_PER_DOCUMENT", 5 * 1024 * 1024),
      maxTotalBytes: integer("AUTO_MAX_KB_BYTES", 50 * 1024 * 1024),
      signal,
    });
    if (values["ingestion-report"]) for (const file of sourceFiles) {
      if (createHash("sha256").update(file.markdown).digest("hex") !== file.metadata.content_hash) throw new Error(`Saved Markdown changed since ingestion: ${file.filename}.`);
    }
    const splitter = saved.alreadySplit ? undefined : await loadKnowledgeBaseMarkdownSplitter({ modulePath: process.env.AUTO_MARKDOWN_SPLITTER_MODULE?.trim(), maxCharacters: integer("AUTO_SPLITTER_MAX_CHARS", 6400) });
    const files = splitter ? await splitKnowledgeBaseFiles(sourceFiles, {
      splitter, namespace, signal,
      maxFiles: integer("AUTO_MAX_SPLIT_FILES", 10_000), maxBytes: integer("AUTO_MAX_KB_BYTES", 50 * 1024 * 1024),
      maxInputCharacters: integer("AUTO_SPLITTER_MAX_INPUT_CHARACTERS", 3_000_000),
    }) : sourceFiles;
    if (splitter) {
      const directory = resolve(dirname(reportPath), `${basename(reportPath, ".json")}-files`);
      await mkdir(directory, { recursive: true });
      for (const file of files) await writeFile(resolve(directory, file.filename), file.markdown, "utf8");
      splitManifestPath = resolve(directory, "manifest.json");
      await writeFile(splitManifestPath, JSON.stringify({ splitter: splitter.name, files: files.map(({ filename, metadata }) => ({ filename, metadata })) }, null, 2), "utf8");
    }
    const result = await adapter.ingest({
      name: values.name ?? process.env.AUTO_VECTOR_STORE_NAME ?? saved.name ?? configuration.collection ?? namespace,
      namespace, files, signal,
    });
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ status: "completed", namespace, startedAt, finishedAt: new Date().toISOString(), splitManifestPath, sourceIngestionReport: values["ingestion-report"], vectorStore: result }, null, 2), "utf8");
    console.info(`Vector store upload completed (${configuration.provider}): ${reportPath}`);
  } catch (error) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ status: "failed", namespace, startedAt, finishedAt: new Date().toISOString(), splitManifestPath, sourceIngestionReport: values["ingestion-report"], error: error instanceof Error ? error.message : String(error) }, null, 2), "utf8");
    console.error(`Vector store upload failed (${configuration.provider}): ${reportPath}`);
    throw error;
  }
}

