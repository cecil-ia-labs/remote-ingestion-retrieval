import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { KnowledgeBaseVectorStoreProgress } from "../knowledge/knowledge-base-vector-store.js";

/** Keep created resources recoverable even when ingestion or verification throws. */
export function createVectorStoreProgressRecorder(path: string) {
  let storeId: string | undefined;
  let storeName: string | undefined;
  const files = new Map<string, { readonly filename: string; readonly id: string; readonly stage: string }>();
  let writes = Promise.resolve();
  const snapshot = () => ({ storeId, storeName, files: [...files.values()] });
  return {
    path,
    snapshot,
    record(progress: KnowledgeBaseVectorStoreProgress): Promise<void> {
      if (!progress || typeof progress.storeId !== "string" || !progress.storeId || !["store-created", "file-uploaded", "file-attached", "file-verified"].includes(progress.stage)) throw new TypeError("Invalid vector store progress event.");
      if (storeId && storeId !== progress.storeId) throw new Error("Provider changed store ID during one ingestion.");
      storeId = progress.storeId;
      if (progress.storeName) storeName = progress.storeName;
      if (progress.file) {
        if (typeof progress.file.id !== "string" || !progress.file.id || typeof progress.file.filename !== "string" || !progress.file.filename) throw new TypeError("Invalid uploaded file progress event.");
        files.set(progress.file.id, { ...progress.file, stage: progress.stage });
      }
      const body = JSON.stringify({ updatedAt: new Date().toISOString(), ...snapshot() }, null, 2);
      writes = writes.then(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, body, "utf8");
        await rename(`${path}.tmp`, path);
      });
      return writes;
    },
  };
}
