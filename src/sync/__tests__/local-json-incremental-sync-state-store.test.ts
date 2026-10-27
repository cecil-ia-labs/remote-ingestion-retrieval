import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  INCREMENTAL_SYNC_STATE_SCHEMA_VERSION,
} from "../incremental-sync-state.js";

import {
  LocalJsonIncrementalSyncStateStore,
} from "../local-json-incremental-sync-state-store.js";

test(
  "local JSON state store persists and removes validated snapshots",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "remote-source-sync-",
        ),
      );

    try {
      const store =
        new LocalJsonIncrementalSyncStateStore({
          rootDirectory:
            directory,
        });

      const state = {
        schemaVersion:
          INCREMENTAL_SYNC_STATE_SCHEMA_VERSION,
        sourceId:
          "source-local",
        namespace:
          "docs",
        pipelineRevision:
          "pipeline-v1",
        documents:
          [],
        updatedAt:
          "2026-09-16T13:00:00.000Z",
      } as const;

      await store.save(
        state,
      );

      assert.deepEqual(
        await store.load({
          sourceId:
            "source-local",
          namespace:
            "docs",
        }),
        state,
      );

      assert.equal(
        await store.remove({
          sourceId:
            "source-local",
          namespace:
            "docs",
        }),
        true,
      );

      assert.equal(
        await store.load({
          sourceId:
            "source-local",
          namespace:
            "docs",
        }),
        null,
      );
    } finally {
      await rm(
        directory,
        {
          recursive:
            true,
          force:
            true,
        },
      );
    }
  },
);
