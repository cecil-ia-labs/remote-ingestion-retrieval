import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
} from "node:path";

import type {
  KnowledgeBaseSemanticMetadata,
} from "./knowledge-base-metadata-enricher.js";

import {
  validateKnowledgeBaseSemanticMetadata,
} from "./knowledge-base-metadata-enricher.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function metadataCacheKey(input: {
  provider: string;
  domain: string;
  canonicalUrl: string;
  contentHash: string;
}): string {
  return createHash("sha256")
    .update([
      input.provider,
      input.domain,
      input.canonicalUrl,
      input.contentHash,
    ].join("\n"))
    .digest("hex");
}

export class MetadataCache {
  private constructor(
    private readonly path: string,
    private readonly entries: Map<string, KnowledgeBaseSemanticMetadata>,
  ) {}

  static async open(path: string): Promise<MetadataCache> {
    let contents: string;

    try {
      contents = await readFile(path, "utf8");
    } catch (cause) {
      if (isRecord(cause) && cause.code === "ENOENT") {
        return new MetadataCache(path, new Map());
      }

      throw cause;
    }

    const parsed: unknown = JSON.parse(contents);

    if (
      !isRecord(parsed)
      || parsed.schemaVersion !== 1
      || !isRecord(parsed.entries)
    ) {
      throw new Error(`Invalid semantic metadata cache: ${path}`);
    }

    const entries = new Map<string, KnowledgeBaseSemanticMetadata>();

    for (const [key, value] of Object.entries(parsed.entries)) {
      if (!isRecord(value) || typeof value.domain !== "string") {
        throw new Error(`Invalid semantic metadata cache entry: ${key}`);
      }

      entries.set(
        key,
        validateKnowledgeBaseSemanticMetadata(value, value.domain),
      );
    }

    return new MetadataCache(path, entries);
  }

  get(key: string, domain: string): KnowledgeBaseSemanticMetadata | undefined {
    const value = this.entries.get(key);
    return value?.domain === domain ? value : undefined;
  }

  set(key: string, value: KnowledgeBaseSemanticMetadata): void {
    this.entries.set(key, value);
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify({
          schemaVersion: 1,
          entries: Object.fromEntries(this.entries),
        }, null, 2)}\n`,
        "utf8",
      );
      await rename(temporaryPath, this.path);
    } catch (cause) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw cause;
    }
  }
}
