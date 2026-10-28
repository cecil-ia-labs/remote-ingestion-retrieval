import type { WebsiteSource } from "../domain/website-source.js";
import type { DiscoveredUrl } from "../discovery/discovered-url.js";
import type { WebsiteDiscovery } from "../discovery/website-discovery.js";
import { UrlGlobPattern } from "../filtering/url-glob-pattern.js";
import { RemoteFetchHttpStatusError } from "../remote/remote-fetcher.errors.js";
import { GitHubRepositoryClient, githubInputError, githubLimitError, githubRecord, githubSha, type GitHubRepositoryClientOptions } from "./github-repository-client.js";
import type { GitHubDiscoverySummary, GitHubFileProvenance } from "./github-repository.types.js";

const reservedOwners = new Set(["about", "features", "marketplace", "settings", "search", "topics", "collections", "sponsors", "login", "signup", "organizations", "orgs", "users", "enterprise", "customer-stories", "security", "readme", "events"]);
const omittedDirectories = new Set([".git", "node_modules", "vendor", "vendors", "third_party", "third-party", "dist", "build", "target", "coverage", "__pycache__", ".next"]);
const documentExtensions = new Set(["md", "markdown", "mdx", "rst", "txt", "adoc", "asciidoc"]);
const configurationExtensions = new Set(["json", "yaml", "yml", "toml", "ini", "conf", "csv"]);
const codeExtensions = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "c", "h", "cpp", "hpp", "cs", "rb", "php", "sh", "sql", "proto"]);

function positive(value: number, option: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw githubInputError(`${option} must be a positive safe integer.`);
  return value;
}

export function githubPath(value: string): string {
  const path = value.replace(/^\/+|\/+$/g, "");
  if (path.includes("\\") || path.includes("\0") || path.split("/").some((part) => part === "." || part === ".." || (!part && path !== ""))) throw githubInputError("Invalid repository path.");
  return path;
}

export function githubPathUrl(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function parseGitHubRepositoryUrl(value: string): { owner: string; repo: string; kind?: "tree" | "blob"; tail: string } {
  let url: URL;
  try { url = new URL(value); } catch { throw githubInputError("A GitHub repository URL is required."); }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password) throw githubInputError("Repository acquisition accepts https://github.com URLs only.");
  let parts: string[];
  try { parts = url.pathname.replace(/\/+$/, "").split("/").slice(1).map((part) => decodeURIComponent(part)); }
  catch { throw githubInputError("Invalid percent-encoding in GitHub repository URL."); }
  const owner = parts[0] ?? "";
  const repo = (parts[1] ?? "").replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || /^\.+$/.test(repo) || reservedOwners.has(owner.toLowerCase())) throw githubInputError("Invalid GitHub owner/repository URL.");
  const kind = parts[2];
  if (kind !== undefined && kind !== "tree" && kind !== "blob") throw githubInputError("Use a repository root, tree or blob URL, not a social/navigation route.");
  const tail = githubPath(parts.slice(3).join("/"));
  if (kind && !tail) throw githubInputError("A tree/blob URL must include a reference.");
  return { owner, repo, kind, tail };
}

export function isGitHubRepositoryUrl(value: string): boolean {
  try { parseGitHubRepositoryUrl(value); return true; } catch { return false; }
}

interface TreeEntry { path: string; mode: string; type: string; sha: string; size: number }
function treeEntries(value: unknown): { entries: TreeEntry[]; truncated: boolean } {
  if (!githubRecord(value) || !Array.isArray(value.tree) || typeof value.truncated !== "boolean") throw githubInputError("Invalid GitHub tree response.");
  return {
    truncated: value.truncated,
    entries: (value.tree as unknown[]).map((entry) => {
      if (!githubRecord(entry) || typeof entry.path !== "string" || !githubPath(entry.path) || !githubSha(entry.sha)
        || typeof entry.mode !== "string" || typeof entry.type !== "string"
        || (entry.type === "blob" && (!Number.isSafeInteger(entry.size) || Number(entry.size) < 0))) throw githubInputError("Invalid GitHub tree entry.");
      return { path: entry.path, sha: entry.sha, mode: entry.mode, type: entry.type, size: typeof entry.size === "number" ? entry.size : 0 };
    }),
  };
}

function priority(path: string): number {
  if (/^readme(?:\.[^/]*)?$/i.test(path)) return 0;
  if (/^(?:docs?|documentation)\//i.test(path)) return 1;
  if (/(?:^|\/)(?:api|reference|openapi|swagger)(?:\/|\.)/i.test(path)) return 2;
  if (/^(?:examples?|samples?|tutorials?)\//i.test(path)) return 3;
  return documentExtensions.has(path.split(".").pop()!.toLowerCase()) ? 4 : 5;
}

/** Enumerates immutable Git trees, never the GitHub website or its sitemap. */
export class GitHubRepositoryDiscoveryService implements WebsiteDiscovery {
  private readonly client: GitHubRepositoryClient;
  private report?: GitHubDiscoverySummary;
  constructor(options: GitHubRepositoryClientOptions = {}) { this.client = new GitHubRepositoryClient(options); }
  get discoverySummary(): GitHubDiscoverySummary | undefined { return this.report; }

  async *discover(source: WebsiteSource, signal?: AbortSignal): AsyncIterable<DiscoveredUrl> {
    this.report = undefined;
    const input = parseGitHubRepositoryUrl(source.url);
    const options = source.options?.github ?? {};
    const maxApiRequests = positive(options.maxApiRequests ?? 200, "maxApiRequests");
    const maxApiBytes = positive(options.maxApiResponseBytes ?? 16 * 1024 * 1024, "maxApiResponseBytes");
    const maxEntries = positive(options.maxTreeEntries ?? 100_000, "maxTreeEntries");
    const maxFileBytes = positive(options.maxFileBytes ?? 5 * 1024 * 1024, "maxFileBytes");
    const maxFiles = Math.min(positive(options.maxFiles ?? 100, "maxFiles"), positive(source.options?.crawl?.maxPages ?? options.maxFiles ?? 100, "maxPages"));
    let requests = 0;
    const json = async (suffix: string): Promise<unknown> => {
      signal?.throwIfAborted();
      if (requests >= maxApiRequests) throw githubLimitError("GitHub API request budget exhausted during enumeration.");
      requests++;
      return this.client.json(input.owner, input.repo, suffix, maxApiBytes, signal);
    };
    let ref = options.ref;
    let path = options.path === undefined ? "" : githubPath(options.path);
    let commit: unknown;
    if (ref !== undefined) {
      if (!ref.trim() || ref.length > 1024) throw githubInputError("GitHub ref must be nonempty and bounded.");
      if (input.kind && options.path === undefined) {
        if (input.tail === ref) path = "";
        else if (input.tail.startsWith(ref + "/")) path = githubPath(input.tail.slice(ref.length + 1));
        else throw githubInputError("For an overridden ref, supply github.path explicitly or use the repository root URL.");
      }
      commit = await json(`/commits/${encodeURIComponent(ref)}?per_page=1`);
    } else if (input.kind) {
      const tail = input.tail.split("/");
      for (let count = tail.length; count > 0; count--) {
        const candidate = tail.slice(0, count).join("/");
        try {
          commit = await json(`/commits/${encodeURIComponent(candidate)}?per_page=1`);
          ref = candidate;
          if (options.path === undefined) path = githubPath(tail.slice(count).join("/"));
          break;
        } catch (error) { if (!(error instanceof RemoteFetchHttpStatusError) || error.statusCode !== 404) throw error; }
      }
      if (!ref) throw githubInputError("GitHub tree/blob reference could not be resolved.");
    } else {
      const repository = await json("");
      if (!githubRecord(repository) || typeof repository.default_branch !== "string" || !repository.default_branch) throw githubInputError("GitHub default branch was not returned.");
      ref = repository.default_branch;
      commit = await json(`/commits/${encodeURIComponent(ref)}?per_page=1`);
    }
    if (!githubRecord(commit) || !githubSha(commit.sha) || !githubRecord(commit.commit) || !githubRecord(commit.commit.tree) || !githubSha(commit.commit.tree.sha)) throw githubInputError("Invalid GitHub commit/tree response.");
    if (input.kind === "blob" && !path) throw githubInputError("A blob URL must identify a file.");
    const commitSha = commit.sha;
    const rootSha = commit.commit.tree.sha;
    const reasons = new Set<string>();
    const skipped: { path: string; reason: string }[] = [];
    const skip = (entryPath: string, reason: string): void => { if (skipped.length < 1000) skipped.push({ path: entryPath, reason }); };
    const initial = treeEntries(await json(`/git/trees/${rootSha}?recursive=1`));
    let entries = initial.entries;
    if (initial.truncated) {
      entries = [];
      const queue = [{ sha: rootSha, prefix: "" }];
      // Keep download capacity when a large tree cannot be fully enumerated.
      const enumerationLimit = Math.max(requests, maxApiRequests - Math.min(maxFiles, Math.floor(maxApiRequests / 2)));
      while (queue.length) {
        signal?.throwIfAborted();
        if (requests >= enumerationLimit) { reasons.add("api-request-limit"); break; }
        const current = queue.shift()!;
        const tree = treeEntries(await json(`/git/trees/${current.sha}`));
        if (tree.truncated) reasons.add("truncated-tree");
        for (const entry of tree.entries) {
          const fullPath = current.prefix + entry.path;
          if (entries.length >= maxEntries) { reasons.add("tree-entry-limit"); break; }
          if (fullPath.split("/").some((part) => omittedDirectories.has(part))) { skip(fullPath, "excluded-directory"); continue; }
          if (entry.type === "tree") {
            if (!path || path === fullPath || path.startsWith(fullPath + "/") || fullPath.startsWith(path + "/")) queue.push({ sha: entry.sha, prefix: fullPath + "/" });
          } else entries.push({ ...entry, path: fullPath });
        }
        queue.sort((a, b) => priority(a.prefix) - priority(b.prefix) || a.prefix.localeCompare(b.prefix));
        if (reasons.has("tree-entry-limit")) break;
      }
      if (reasons.size) entries = [...new Map([...initial.entries, ...entries].map((entry) => [entry.path, entry])).values()];
    }
    if (entries.length > maxEntries) {
      entries.sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path));
      entries = entries.slice(0, maxEntries); reasons.add("tree-entry-limit");
    }
    const patterns = (values: readonly string[] | undefined): UrlGlobPattern[] => (values ?? []).map((pattern) => new UrlGlobPattern(pattern));
    const includes = patterns(options.include);
    const excludes = patterns(options.exclude);
    const eligible: TreeEntry[] = [];
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (entry.type === "tree") continue;
      if (path && entry.path !== path && (input.kind === "blob" || !entry.path.startsWith(path + "/"))) continue;
      if (entry.path.split("/").some((part) => omittedDirectories.has(part))) { skip(entry.path, "excluded-directory"); continue; }
      if (entry.mode === "120000" || entry.type === "commit") { skip(entry.path, entry.mode === "120000" ? "symlink" : "submodule"); continue; }
      if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) { skip(entry.path, "unsupported-entry"); continue; }
      const target = `https://repository.invalid/${githubPathUrl(entry.path)}`;
      if (excludes.some((pattern) => pattern.matches(target)) || (includes.length && !includes.some((pattern) => pattern.matches(target)))) { skip(entry.path, "path-filter"); continue; }
      const filename = entry.path.split("/").pop()!;
      const extension = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
      if (/^(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|\.env(?:\..*)?)$/i.test(filename) || /\.(?:min\.(?:js|css)|map|lock)$/i.test(filename)) { skip(entry.path, "generated-or-sensitive-file"); continue; }
      const documentation = documentExtensions.has(extension) || /^(?:readme|license|copying|changelog|contributing|security)(?:[._-].*)?$/i.test(filename);
      const configuration = configurationExtensions.has(extension) && (!entry.path.includes("/") || priority(entry.path) <= 3);
      if (!documentation && !configuration && !(options.includeCode && codeExtensions.has(extension))) { skip(entry.path, "unsupported-or-code-disabled"); continue; }
      if (entry.size === 0) { skip(entry.path, "empty-file"); continue; }
      if (entry.size > maxFileBytes) { skip(entry.path, "file-byte-limit"); reasons.add("file-byte-limit"); continue; }
      eligible.push(entry);
    }
    if (path && !entries.some((entry) => entry.path === path || entry.path.startsWith(path + "/")) && !reasons.size) throw githubInputError("Requested GitHub path does not exist in the pinned commit.");
    eligible.sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path));
    const selected = eligible.slice(0, Math.min(maxFiles, Math.max(0, maxApiRequests - requests)));
    if (selected.length < eligible.length) reasons.add(selected.length >= maxFiles ? "file-count-limit" : "api-request-limit");
    const complete = reasons.size === 0;
    this.report = { owner: input.owner, repo: input.repo, ref: ref!, commitSha, path, treeEntries: entries.length, eligibleFiles: eligible.length, selectedFiles: selected.length, pendingFiles: eligible.length - selected.length, apiRequests: requests, reservedDownloadRequests: selected.length, snapshotComplete: complete, reasons: [...reasons], skipped };
    if (!selected.length && !complete) throw githubLimitError("GitHub enumeration was incomplete and produced no materializable files.");
    for (const entry of selected) {
      const github: GitHubFileProvenance = { owner: input.owner, repo: input.repo, ref: ref!, commitSha, path: entry.path, blobSha: entry.sha, size: entry.size, snapshotComplete: complete };
      // Ref-based identity is stable between commits; acquisition uses the pinned blob SHA.
      yield { url: `https://github.com/${input.owner}/${input.repo}/blob/${encodeURIComponent(ref!)}/${githubPathUrl(entry.path)}`, discoveredBy: "github", discoveredFrom: source.url, depth: 0, github };
    }
  }
}
