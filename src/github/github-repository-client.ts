import type { RemoteFetcher } from "../remote/remote-fetcher.js";
import type { FetchedResource } from "../remote/fetched-resource.js";
import { HttpRemoteFetcher } from "../remote/http-remote-fetcher.js";
import { consumeExecutionBudget } from "../limits/execution-budget-context.js";
import { SourceIngestionError } from "../errors/source-ingestion-error.js";

export interface GitHubRepositoryClientOptions {
  readonly token?: string;
  readonly fetcher?: RemoteFetcher;
  readonly timeoutMs?: number;
}

export function githubInputError(message: string): SourceIngestionError {
  return new SourceIngestionError(message, { code: "INVALID_INPUT", category: "validation", stage: "discover", retryability: "no" });
}

export function githubLimitError(message: string): SourceIngestionError {
  return new SourceIngestionError(message, { code: "DISCOVERY_LIMIT", category: "limit", stage: "discover", retryability: "no" });
}

export function githubRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function githubSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}

/** Uses the same DNS-pinned, byte-bounded HTTP transport as website acquisition. */
export class GitHubRepositoryClient {
  private readonly fetcher: RemoteFetcher;
  constructor(private readonly options: GitHubRepositoryClientOptions = {}) {
    this.fetcher = options.fetcher ?? new HttpRemoteFetcher();
  }

  async fetch(owner: string, repo: string, suffix: string, maxBytes: number, signal?: AbortSignal, raw = false): Promise<FetchedResource> {
    signal?.throwIfAborted();
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)
      || (suffix !== "" && !suffix.startsWith("/")) || suffix.includes("#")) throw githubInputError("Invalid GitHub repository API target.");
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;
    const fetched = await this.fetcher.fetch({
      requestedUrl: url, resolvedUrl: url, redirectChain: [], statusCode: 0, headers: {},
      resourceType: raw ? "text" : "json", resourceTypeDetectedBy: "hint",
      // The fetcher resolves and pins the public destination before opening a socket.
      resolvedAddress: "", resolvedAddressFamily: 4,
    }, {
      maxBytes, timeoutMs: this.options.timeoutMs ?? 30_000, signal, maxRedirects: 0,
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
      },
    });
    consumeExecutionBudget("fetchedBytes", fetched.byteLength, { stage: raw ? "fetch" : "discover", url });
    return fetched;
  }

  async json(owner: string, repo: string, suffix: string, maxBytes: number, signal?: AbortSignal): Promise<unknown> {
    const fetched = await this.fetch(owner, repo, suffix, maxBytes, signal);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fetched.body)) as unknown;
  }
}
