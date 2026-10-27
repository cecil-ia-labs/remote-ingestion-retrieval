import type {
  IncrementalSyncState,
  IncrementalSyncStateKey,
} from "./incremental-sync-state.js";

export interface IncrementalSyncStateStore {
  load(
    key:
      IncrementalSyncStateKey,

    signal?:
      AbortSignal,
  ): Promise<IncrementalSyncState | null>;

  save(
    state:
      IncrementalSyncState,

    signal?:
      AbortSignal,
  ): Promise<void>;

  remove(
    key:
      IncrementalSyncStateKey,

    signal?:
      AbortSignal,
  ): Promise<boolean>;
}
