/** Repository paths/globs are relative to the repository root, not github.com. */
export interface GitHubRepositoryOptions {
  readonly ref?: string;
  readonly path?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly includeCode?: boolean;
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly maxApiRequests?: number;
  readonly maxApiResponseBytes?: number;
  readonly maxTreeEntries?: number;
}

export interface GitHubFileProvenance {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly commitSha: string;
  readonly path: string;
  readonly blobSha: string;
  readonly size: number;
  readonly snapshotComplete: boolean;
}

export interface GitHubDiscoverySummary {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly commitSha: string;
  readonly path: string;
  readonly treeEntries: number;
  readonly eligibleFiles: number;
  readonly selectedFiles: number;
  readonly pendingFiles: number;
  readonly apiRequests: number;
  readonly reservedDownloadRequests: number;
  readonly snapshotComplete: boolean;
  readonly reasons: readonly string[];
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
}
