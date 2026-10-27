import {
  createHash,
} from "node:crypto";

import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
  resolve,
} from "node:path";

import type {
  IncrementalSyncState,
  IncrementalSyncStateKey,
} from "./incremental-sync-state.js";

import type {
  IncrementalSyncStateStore,
} from "./incremental-sync-state-store.js";

import {
  validateIncrementalSyncState,
} from "./incremental-sync-state.validation.js";

function assertNotAborted(
  signal:
    AbortSignal | undefined,
): void {
  signal?.throwIfAborted();
}

function keyHash(
  key:
    IncrementalSyncStateKey,
): string {
  return createHash(
    "sha256",
  )
    .update(
      `${key.sourceId}\n${key.namespace ?? ""}`,
      "utf8",
    )
    .digest(
      "hex",
    )
    .slice(
      0,
      24,
    );
}

export interface LocalJsonIncrementalSyncStateStoreOptions {
  readonly rootDirectory:
    string;
}

/**
 * Atomic local JSON state store suitable for development and single-process
 * ingestion workers. Distributed deployments can replace this interface with
 * a transactional DB-backed implementation.
 */
export class LocalJsonIncrementalSyncStateStore
  implements IncrementalSyncStateStore {
  private readonly rootDirectory:
    string;

  constructor(
    options:
      LocalJsonIncrementalSyncStateStoreOptions,
  ) {
    this.rootDirectory =
      resolve(
        options.rootDirectory,
      );
  }

  async load(
    key:
      IncrementalSyncStateKey,

    signal?:
      AbortSignal,
  ): Promise<IncrementalSyncState | null> {
    assertNotAborted(
      signal,
    );

    try {
      const json =
        await readFile(
          this.pathFor(
            key,
          ),
          "utf8",
        );

      assertNotAborted(
        signal,
      );

      const state =
        JSON.parse(
          json,
        ) as IncrementalSyncState;

      validateIncrementalSyncState(
        state,
      );

      return state;
    } catch (
      error
    ) {
      if (
        error
        && typeof error
          === "object"
        && "code" in error
        && error.code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }
  }

  async save(
    state:
      IncrementalSyncState,

    signal?:
      AbortSignal,
  ): Promise<void> {
    assertNotAborted(
      signal,
    );

    validateIncrementalSyncState(
      state,
    );

    await mkdir(
      this.rootDirectory,
      {
        recursive:
          true,
      },
    );

    const target =
      this.pathFor(
        state,
      );

    const temporary =
      `${target}.${process.pid}.${Date.now()}.tmp`;

    try {
      await writeFile(
        temporary,
        JSON.stringify(
          state,
          null,
          2,
        )
        + "\n",
        "utf8",
      );

      assertNotAborted(
        signal,
      );

      await rename(
        temporary,
        target,
      );
    } catch (error) {
      await rm(
        temporary,
        {
          force:
            true,
        },
      );

      throw error;
    }
  }

  async remove(
    key:
      IncrementalSyncStateKey,

    signal?:
      AbortSignal,
  ): Promise<boolean> {
    assertNotAborted(
      signal,
    );

    try {
      await rm(
        this.pathFor(
          key,
        ),
      );

      return true;
    } catch (
      error
    ) {
      if (
        error
        && typeof error
          === "object"
        && "code" in error
        && error.code === "ENOENT"
      ) {
        return false;
      }

      throw error;
    }
  }

  pathFor(
    key:
      IncrementalSyncStateKey,
  ): string {
    return join(
      this.rootDirectory,
      `sync-${keyHash(key)}.json`,
    );
  }
}
