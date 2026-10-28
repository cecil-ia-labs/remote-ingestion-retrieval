import { createHash } from "node:crypto";
import { join } from "node:path";
import type { WebsiteSource } from "../domain/website-source.js";
import type { DiscoveredUrl } from "../discovery/discovered-url.js";
import type { WebsiteDocumentMaterializer } from "../sync/website-document-materializer.js";
import type { WebsiteDocumentService } from "../website/website-document-service.js";
import type { WebDocument } from "../website/web-document.js";
import { createLocalWebsiteDocumentService } from "../website/create-local-website-document-service.js";
import { createDocumentMetadata } from "../extraction/document-metadata.js";
import { normalizeMarkdown } from "../normalization/index.js";
import { consumeExecutionBudget } from "../limits/execution-budget-context.js";
import { GitHubRepositoryClient, githubInputError, githubSha, type GitHubRepositoryClientOptions } from "./github-repository-client.js";
import { parseGitHubRepositoryUrl } from "./github-repository-discovery.js";

export interface GitHubRepositoryMaterializerOptions extends GitHubRepositoryClientOptions {
  readonly documentService?: WebsiteDocumentService;
  readonly artifactRootDirectory?: string;
  readonly maxBytes?: number;
}

/** Acquires a pinned raw Git blob. It never renders or follows repository links. */
export class GitHubRepositoryMaterializer implements WebsiteDocumentMaterializer {
  private readonly client: GitHubRepositoryClient;
  private readonly documents: WebsiteDocumentService;
  constructor(private readonly options: GitHubRepositoryMaterializerOptions = {}) {
    this.client = new GitHubRepositoryClient(options);
    this.documents = options.documentService ?? createLocalWebsiteDocumentService({ rootDirectory: options.artifactRootDirectory ?? join(process.cwd(), "data", "websources") });
  }

  async materialize(source: WebsiteSource, discovered: DiscoveredUrl, signal?: AbortSignal): Promise<WebDocument> {
    signal?.throwIfAborted();
    const file = discovered.github;
    const repository = parseGitHubRepositoryUrl(source.url);
    if (!file || !githubSha(file.blobSha) || !githubSha(file.commitSha) || file.owner !== repository.owner || file.repo !== repository.repo) throw githubInputError("GitHub materialization requires discovery from the same repository and pinned commit.");
    const fetched = await this.client.fetch(file.owner, file.repo, `/git/blobs/${file.blobSha}`, Math.min(this.options.maxBytes ?? 5 * 1024 * 1024, source.options?.github?.maxFileBytes ?? 5 * 1024 * 1024), signal, true);
    const actualSha = createHash("sha1").update(`blob ${fetched.body.length}\0`).update(fetched.body).digest("hex");
    if (actualSha.toLowerCase() !== file.blobSha.toLowerCase() || fetched.byteLength !== file.size) throw githubInputError("GitHub blob integrity does not match the pinned tree.");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(fetched.body);
    if (text.includes("\0") || !text.trim() || /^version https:\/\/git-lfs\.github\.com\/spec\/v1(?:\r?\n|$)/.test(text)) throw githubInputError("GitHub blob is binary, empty or a Git LFS pointer; it was not indexed.");
    const extension = file.path.split(".").pop()!.toLowerCase();
    const markdownSource = ["md", "markdown", "mdx", "txt"].includes(extension) || !file.path.split("/").pop()!.includes(".");
    let markdown = text;
    if (!markdownSource) {
      let fenceLength = 3;
      for (const match of text.matchAll(/`{3,}/g)) fenceLength = Math.max(fenceLength, match[0].length + 1);
      const fence = "`".repeat(fenceLength);
      const language = /^[a-z0-9]+$/.test(extension) ? extension : "text";
      markdown = `${fence}${language}\n${text}\n${fence}`;
    }
    markdown = normalizeMarkdown(markdown);
    consumeExecutionBudget("normalizedBytes", Buffer.byteLength(markdown, "utf8"), { stage: "normalize", url: discovered.url });
    const metadata = createDocumentMetadata(fetched, {
      canonicalUrl: discovered.url,
      title: `${file.repo}/${file.path}`,
      resourceType: markdownSource ? "markdown" : "text",
      contentType: markdownSource ? "text/markdown" : "text/plain",
      attributes: { github: { ...file }, source_file: file.path, repository_url: `https://github.com/${file.owner}/${file.repo}` },
    });
    return this.documents.materialize(source, { markdown, metadata }, { discoveredUrl: discovered, fetchedResource: fetched });
  }
}
