import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createKnowledgeBaseVectorStoreAdapter } from "../knowledge/vector-store-provider-factory.js";
import { resolveVectorStoreProviderConfiguration, type VectorStoreProvider } from "../knowledge/vector-store-provider-config.js";
import { loadKnowledgeBaseFiles, type LocalKnowledgeBaseFile } from "../knowledge/knowledge-base-file-loader.js";
import type { JsonValue } from "../domain/source.types.js";
import type { KnowledgeBaseVectorStoreChunking, KnowledgeBaseVectorStoreResume } from "../knowledge/knowledge-base-vector-store.js";
import { loadKnowledgeBaseMarkdownSplitter, splitKnowledgeBaseFiles } from "../knowledge/split-knowledge-base-files.js";
import { createVectorStoreProgressRecorder } from "./vector-store-progress.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(value: unknown): value is JsonValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (Array.isArray(value) && value.every(json))
    || (record(value) && Object.values(value).every(json));
}

function integer(name: string, fallback: number, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  const value = process.env[name]?.trim();
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  return parsed;
}

interface SavedUploadInputs {
  readonly resume?: KnowledgeBaseVectorStoreResume;
  readonly requestedChunking?: KnowledgeBaseVectorStoreChunking;
  readonly sourceIngestionReport?: string;
  readonly splitManifestPath?: string;
  readonly files: readonly LocalKnowledgeBaseFile[];
  readonly alreadySplit: boolean;
  readonly namespace?: string;
  readonly name?: string;
}

async function readUploadJson(path: string, maximum: number): Promise<unknown> {
  const handle = await open(path, "r");
  let body: string;
  try {
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
  return JSON.parse(body) as unknown;
}

async function manifestInputs(path: string, ingestionReport = false): Promise<SavedUploadInputs> {
  const parsed = await readUploadJson(path, (ingestionReport ? 8 : 2) * 1024 * 1024);
  if (ingestionReport) {
    if (!record(parsed) || typeof parsed.markdownDirectory !== "string" || !Array.isArray(parsed.knowledgeBaseManifest)
      || !record(parsed.materialization) || !Array.isArray(parsed.materialization.succeeded)) throw new TypeError("Invalid ingestion report: saved Markdown and metadata manifest are required.");
    if (parsed.vectorStore !== null && parsed.vectorStore !== undefined) throw new Error("The ingestion report already contains a vector-store result; automatic resend was refused.");
    if (record(parsed.providerProgress) && parsed.providerProgress.storeId) throw new Error("The ingestion report already contains remote resources; inspect its providerProgressPath before resending.");
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

async function resumeUploadInputs(path: string): Promise<SavedUploadInputs> {
  const report = await readUploadJson(path, 8 * 1024 * 1024);
  if (!record(report) || typeof report.splitManifestPath !== "string" || typeof report.providerProgressPath !== "string" || typeof report.namespace !== "string" || !report.namespace.trim()) throw new TypeError("Resume requires an upload report with a split manifest, namespace and durable progress path.");
  const checkpoint = await readUploadJson(resolve(dirname(path), report.providerProgressPath), 8 * 1024 * 1024);
  if (!record(checkpoint) || typeof checkpoint.storeId !== "string" || !checkpoint.storeId || !Array.isArray(checkpoint.files)) throw new TypeError("Invalid upload checkpoint.");
  const files = (checkpoint.files as unknown[]).map((file) => {
    if (!record(file) || typeof file.filename !== "string" || !file.filename || typeof file.id !== "string" || !file.id) throw new TypeError("Invalid checkpoint file.");
    return { filename: file.filename, id: file.id };
  });
  const saved = await manifestInputs(resolve(dirname(path), report.splitManifestPath));
  if (!saved.alreadySplit) throw new TypeError("Resume requires an already-split manifest.");
  let requestedChunking: KnowledgeBaseVectorStoreChunking | undefined;
  if (report.requestedChunking !== undefined) {
    const value = report.requestedChunking;
    if (!record(value) || typeof value.maxChunkSizeTokens !== "number" || typeof value.chunkOverlapTokens !== "number"
      || !Number.isSafeInteger(value.maxChunkSizeTokens) || value.maxChunkSizeTokens < 100 || value.maxChunkSizeTokens > 4096
      || !Number.isSafeInteger(value.chunkOverlapTokens) || value.chunkOverlapTokens < 0 || value.chunkOverlapTokens > value.maxChunkSizeTokens / 2) throw new TypeError("Invalid saved chunking configuration.");
    requestedChunking = { maxChunkSizeTokens: value.maxChunkSizeTokens, chunkOverlapTokens: value.chunkOverlapTokens };
  }
  return {
    ...saved, namespace: report.namespace, name: typeof checkpoint.storeName === "string" ? checkpoint.storeName : undefined,
    splitManifestPath: resolve(dirname(path), report.splitManifestPath), requestedChunking,
    sourceIngestionReport: typeof report.sourceIngestionReport === "string" ? report.sourceIngestionReport : undefined,
    resume: { storeId: checkpoint.storeId, storeName: typeof checkpoint.storeName === "string" ? checkpoint.storeName : undefined, files },
  };
}

export async function runVectorStoreUpload(providerOverride?: VectorStoreProvider): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { namespace: { type: "string" }, name: { type: "string" }, domain: { type: "string" }, manifest: { type: "string" }, "ingestion-report": { type: "string" }, "resume-upload-report": { type: "string" }, report: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.info("Upload local UTF-8 Markdown/text to the selected vector provider.\nUsage: npm run upload:vector-store -- --namespace support [--domain billing] file.md [...]\n   or: npm run upload:vector-store -- --namespace support --manifest kb/source/split/run/manifest.json\nConfigure AUTO_VECTOR_STORE_PROVIDER/BASE_URL/COLLECTION/API_KEY and AUTO_EMBEDDING_*. Does not crawl websites.\nResume saved documents/metadata with --ingestion-report path/to/ingestion.json (no recrawl).\nResume an existing remote store/files with --resume-upload-report path/to/upload.json (no reupload).\nAUTO_UPLOAD_MAX_ELAPSED_MS overrides AUTO_MAX_ELAPSED_MS; standalone default is 3600000ms when both are absent.\nAUTO_MAX_KB_FILES limits input documents; AUTO_MAX_SPLIT_FILES defaults to 10000 generated files.\nOptional: --name, --report. Existing namespace/source defaults and AUTO_MAX_KB_* limits apply.\nThe legacy upload:weaviate command explicitly selects Weaviate.");
    return;
  }
  if (Number(Boolean(values.manifest)) + Number(Boolean(values["ingestion-report"])) + Number(Boolean(values["resume-upload-report"])) + Number(positionals.length > 0) !== 1) throw new TypeError("Supply paths, --manifest, --ingestion-report or --resume-upload-report, exclusively.");
  const saved: SavedUploadInputs = values["resume-upload-report"] ? await resumeUploadInputs(resolve(values["resume-upload-report"]))
    : values["ingestion-report"] ? await manifestInputs(resolve(values["ingestion-report"]), true)
    : values.manifest ? await manifestInputs(resolve(values.manifest))
      : { files: positionals.map((path): LocalKnowledgeBaseFile => ({ path: resolve(path), ...(values.domain ? { metadata: { domain: values.domain } } : {}) })), alreadySplit: false };
  const namespace = values.namespace?.trim() || process.env.AUTO_KB_NAMESPACE?.trim() || saved.namespace || process.env.SOURCE_ID?.trim() || "";
  if (!namespace.trim()) throw new TypeError("A nonempty --namespace or AUTO_KB_NAMESPACE is required.");
  if (saved.resume && namespace !== saved.namespace) throw new TypeError("Resume cannot change the saved namespace.");
  const configuration = resolveVectorStoreProviderConfiguration(process.env, providerOverride);
  const reportPath = resolve(values.report ?? (providerOverride === "weaviate" ? `data/weaviate-uploads/${randomUUID()}.json` : `data/vector-store-uploads/${configuration.provider}/${randomUUID()}.json`));
  const startedAt = new Date().toISOString();
  const progress = createVectorStoreProgressRecorder(`${reportPath}.progress.json`);
  let splitManifestPath = saved.splitManifestPath ?? (values.manifest ? resolve(values.manifest) : undefined);
  let requestedChunking: KnowledgeBaseVectorStoreChunking | undefined;
  let signal: AbortSignal | undefined;
  const uploadDeadline = process.env.AUTO_UPLOAD_MAX_ELAPSED_MS?.trim()
    ? integer("AUTO_UPLOAD_MAX_ELAPSED_MS", 3_600_000) : integer("AUTO_MAX_ELAPSED_MS", 3_600_000);
  try {
    const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration);
    if (saved.resume && !adapter.supportsResume) throw new TypeError("The selected provider does not support checkpoint resume.");
    signal = AbortSignal.timeout(uploadDeadline);
    const sourceFiles = await loadKnowledgeBaseFiles(saved.files, {
      maxFiles: integer(saved.alreadySplit ? "AUTO_MAX_SPLIT_FILES" : "AUTO_MAX_KB_FILES", saved.alreadySplit ? 10_000 : 100),
      maxFileBytes: integer("AUTO_MAX_BYTES_PER_DOCUMENT", 5 * 1024 * 1024),
      maxTotalBytes: integer("AUTO_MAX_KB_BYTES", 50 * 1024 * 1024),
      signal,
    });
    if (values["ingestion-report"] || saved.resume) for (const file of sourceFiles) {
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
    requestedChunking = adapter.supportsTokenChunking === false ? undefined : saved.requestedChunking ?? {
      maxChunkSizeTokens: integer("AUTO_MAX_CHUNK_SIZE_TOKENS", 1600), chunkOverlapTokens: integer("AUTO_CHUNK_OVERLAP_TOKENS", 200, 0),
    };
    const result = await adapter.ingest({
      name: values.name?.trim() || process.env.AUTO_VECTOR_STORE_NAME?.trim() || saved.name || configuration.collection || namespace,
      namespace, files, signal,
      uploadConcurrency: integer("AUTO_UPLOAD_CONCURRENCY", 4, 1, 32),
      chunking: requestedChunking, resume: saved.resume,
      onProgress: progress.record,
    });
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ status: "completed", namespace, startedAt, finishedAt: new Date().toISOString(), splitManifestPath, sourceIngestionReport: values["ingestion-report"] ?? saved.sourceIngestionReport, resumedFrom: values["resume-upload-report"], requestedChunking, uploadDeadlineMs: uploadDeadline, vectorStore: result, providerProgress: progress.snapshot(), providerProgressPath: progress.path }, null, 2), "utf8");
    console.info(`Vector store upload completed (${configuration.provider}): ${reportPath}`);
  } catch (error) {
    const reason: unknown = signal?.reason;
    const timedOut = signal?.aborted && reason instanceof Error && reason.name === "TimeoutError";
    const failure = timedOut ? new Error(`Upload deadline exceeded after ${uploadDeadline}ms. Existing resources were preserved; resume this upload report with a larger AUTO_UPLOAD_MAX_ELAPSED_MS.`, { cause: error }) : error;
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ status: timedOut ? "aborted" : "failed", namespace, startedAt, finishedAt: new Date().toISOString(), splitManifestPath, sourceIngestionReport: values["ingestion-report"] ?? saved.sourceIngestionReport, resumedFrom: values["resume-upload-report"], requestedChunking, uploadDeadlineMs: uploadDeadline, providerProgress: progress.snapshot(), providerProgressPath: progress.path, error: failure instanceof Error ? failure.message : String(failure) }, null, 2), "utf8");
    console.error(`Vector store upload failed (${configuration.provider}): ${reportPath}`);
    throw failure;
  }
}

