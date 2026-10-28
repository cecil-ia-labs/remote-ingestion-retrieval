import {
  join,
} from "node:path";

import type {
  DiscoveredUrl,
} from "../discovery/discovered-url.js";

import type {
  WebsiteSource,
} from "../domain/website-source.js";

import {
  ContentExtractorRegistry,
} from "../extraction/content-extractor-registry.js";

import type {
  ExtractedDocument,
} from "../extraction/extracted-document.js";

import {
  createDefaultExtractorRegistry,
} from "../extraction/extractors/create-default-extractor-registry.js";

import type {
  PdfMarkdownProcessor,
} from "../extraction/extractors/pdf-extractor.js";

import {
  canonicalJsonStringify,
  hashFetchedResource,
  hashNormalizedDocument,
} from "../hashing/index.js";

import {
  HtmlToMarkdownConverter,
  normalizeMarkdown,
} from "../normalization/index.js";

import type {
  NormalizedDocument,
} from "../normalization/normalized-document.js";

import {
  consumeExecutionBudget,
} from "../limits/index.js";

import {
  defaultObservabilityHub,
  observabilityAttributes,
} from "../observability/index.js";

import type {
  ObservabilityHub,
} from "../observability/index.js";

import {
  HttpRemoteFetcher,
  HttpRemoteResourceResolver,
} from "../remote/index.js";

import type {
  FetchedResource,
  RemoteFetcher,
  RemoteResourceResolver,
} from "../remote/index.js";

import {
  getSourceRenderingStrategy,
  HtmlRenderingOrchestrator,
  PuppeteerBrowserHtmlRenderer,
} from "../rendering/index.js";

import {
  createLocalWebsiteDocumentService,
} from "../website/create-local-website-document-service.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import type {
  WebsiteDocumentService,
} from "../website/website-document-service.js";

import type {
  WebsiteDocumentMaterializer,
} from "./website-document-materializer.js";
import { GitHubRepositoryMaterializer } from "../github/github-repository-materializer.js";

export interface DefaultWebsiteDocumentMaterializerOptions {
  readonly githubToken?: string;
  readonly resolver?:
    RemoteResourceResolver;

  readonly fetcher?:
    RemoteFetcher;

  readonly renderer?:
    HtmlRenderingOrchestrator;

  readonly extractorRegistry?:
    ContentExtractorRegistry;

  readonly htmlConverter?:
    HtmlToMarkdownConverter;

  readonly documentService?:
    WebsiteDocumentService;

  readonly pdfProcessor?:
    PdfMarkdownProcessor;

  readonly artifactRootDirectory?:
    string;

  readonly maxBytes?:
    number;

  readonly timeoutMs?:
    number;

  readonly observability?:
    ObservabilityHub;
}

function isHtmlResource(
  resource:
    FetchedResource,
): boolean {
  if (
    resource.resource.resourceType
    === "html"
  ) {
    return true;
  }

  const contentType =
    resource.resource.contentType
      ?.toLowerCase();

  return (
    contentType === "text/html"
    || contentType
      === "application/xhtml+xml"
  );
}

export class DefaultWebsiteDocumentMaterializer
  implements WebsiteDocumentMaterializer {
  private readonly githubMaterializer: GitHubRepositoryMaterializer;
  private readonly resolver:
    RemoteResourceResolver;

  private readonly fetcher:
    RemoteFetcher;

  private readonly renderer:
    HtmlRenderingOrchestrator;

  private readonly extractorRegistry:
    ContentExtractorRegistry;

  private readonly htmlConverter:
    HtmlToMarkdownConverter;

  private readonly documentService:
    WebsiteDocumentService;

  private readonly maxBytes:
    number;

  private readonly timeoutMs:
    number;

  private readonly observability:
    ObservabilityHub;

  constructor(
    options:
      DefaultWebsiteDocumentMaterializerOptions = {},
  ) {
    this.resolver =
      options.resolver
      ?? new HttpRemoteResourceResolver();

    this.fetcher =
      options.fetcher
      ?? new HttpRemoteFetcher();

    this.renderer =
      options.renderer
      ?? new HtmlRenderingOrchestrator({
        browserRenderer:
          new PuppeteerBrowserHtmlRenderer(),
      });

    this.extractorRegistry =
      options.extractorRegistry
      ?? createDefaultExtractorRegistry({
        pdfProcessor:
          options.pdfProcessor,
      });

    this.htmlConverter =
      options.htmlConverter
      ?? new HtmlToMarkdownConverter();

    this.documentService =
      options.documentService
      ?? createLocalWebsiteDocumentService({
        rootDirectory:
          options.artifactRootDirectory
          ?? join(
            process.cwd(),
            "data",
            "websources",
          ),
      });

    this.maxBytes =
      options.maxBytes
      ?? 50 * 1024 * 1024;

    this.timeoutMs =
      options.timeoutMs
      ?? 30_000;

    this.observability =
      options.observability
      ?? defaultObservabilityHub;
    this.githubMaterializer = new GitHubRepositoryMaterializer({
      token: options.githubToken, fetcher: this.fetcher, timeoutMs: this.timeoutMs,
      documentService: this.documentService, maxBytes: this.maxBytes,
    });
  }

  async materialize(
    source:
      WebsiteSource,

    discoveredUrl:
      DiscoveredUrl,

    signal?:
      AbortSignal,
  ): Promise<WebDocument> {
    if (source.options?.profile === "github-repository") return this.observability.stage(
      "document.materialize", { attributes: observabilityAttributes({ url: discoveredUrl.url, discoveredBy: "github", path: discoveredUrl.github?.path }) },
      () => this.githubMaterializer.materialize(source, discoveredUrl, signal),
    );
    return this.observability.stage(
      "document.materialize",
      {
        attributes:
          observabilityAttributes({
            url:
              discoveredUrl.url,
            discoveredBy:
              discoveredUrl.discoveredBy,
            depth:
              discoveredUrl.depth,
          }),
      },
      () => this.materializeObserved(
        source,
        discoveredUrl,
        signal,
      ),
    );
  }

  private async materializeObserved(
    source:
      WebsiteSource,

    discoveredUrl:
      DiscoveredUrl,

    signal?:
      AbortSignal,
  ): Promise<WebDocument> {
    signal?.throwIfAborted();

    const resource =
      await this.observability.stage(
        "remote.resolve",
        {
          attributes:
            observabilityAttributes({
              url:
                discoveredUrl.url,
            }),
        },
        () => this.resolver.resolve(
          discoveredUrl.url,
          {
            timeoutMs:
              this.timeoutMs,
          },
        ),
      );

    let fetched =
      await this.observability.stage(
        "remote.fetch",
        {
          attributes:
            observabilityAttributes({
              resourceType:
                resource.resourceType,
            }),
        },
        async () => {
          const value =
            await this.fetcher.fetch(
              resource,
              {
                maxBytes:
                  this.maxBytes,
                timeoutMs:
                  this.timeoutMs,
                signal,
              },
            );

          consumeExecutionBudget(
            "fetchedBytes",
            value.byteLength,
            {
              stage:
                "fetch",
              url:
                discoveredUrl.url,
            },
          );

          await this.observability.metric(
            "remote.fetched_bytes",
            value.byteLength,
            { unit: "bytes" },
          );

          if (
            value.resource.statusCode
            !== undefined
          ) {
            await this.observability.metric(
              "remote.http_status",
              value.resource.statusCode,
              { unit: "status-code" },
            );
          }

          return value;
        },
      );

    if (
      isHtmlResource(
        fetched,
      )
    ) {
      const rendered =
        await this.observability.stage(
          "rendering.html",
          {
            attributes:
              observabilityAttributes({
                strategy:
                  getSourceRenderingStrategy(
                    source,
                  ),
              }),
          },
          () => this.renderer.render(
            fetched,
            getSourceRenderingStrategy(
              source,
            ),
            {
              signal,
            },
          ),
        );

      fetched =
        rendered.resource;
    }

    fetched = {
      ...fetched,
      contentHash:
        fetched.contentHash
        ?? hashFetchedResource(
          fetched,
        ),
    };

    const extracted =
      await this.observability.stage(
        "content.extraction",
        {
          attributes:
            observabilityAttributes({
              resourceType:
                fetched.resource.resourceType,
              contentType:
                fetched.resource.contentType,
            }),
        },
        () => this.extractorRegistry.extract(
          fetched,
          {
            signal,
          },
        ),
      );

    const normalized =
      await this.observability.stage(
        "content.normalization",
        {
          attributes:
            observabilityAttributes({
              format:
                extracted.contentFormat,
            }),
        },
        () => this.normalize(
          extracted,
          signal,
        ),
      );

    consumeExecutionBudget(
      "normalizedBytes",
      Buffer.byteLength(
        normalized.markdown,
        "utf8",
      ),
      {
        stage:
          "normalize",
        url:
          discoveredUrl.url,
      },
    );

    const document =
      await this.observability.stage(
        "document.persist",
        {},
        () => this.documentService.materialize(
          source,
          normalized,
          {
            discoveredUrl,
            fetchedResource:
              fetched,
            extractedDocument:
              extracted,
          },
        ),
      );

    await this.observability.metric(
      "document.markdown_bytes",
      document.content.byteLength,
      { unit: "bytes" },
    );

    await this.observability.event(
      "document.materialized",
      observabilityAttributes({
        documentId:
          document.id,
        canonicalUrl:
          document.canonicalUrl,
        contentHash:
          document.contentHash,
      }),
    );

    return document;
  }

  private async normalize(
    extracted:
      ExtractedDocument,

    signal?:
      AbortSignal,
  ): Promise<NormalizedDocument> {
    signal?.throwIfAborted();

    if (
      extracted.contentFormat
      === "html"
    ) {
      return this.htmlConverter.convert(
        extracted,
        {
          signal,
        },
      );
    }

    let markdown:
      string;

    if (
      extracted.contentFormat
      === "structured"
    ) {
      markdown =
        "```json\n"
        + canonicalJsonStringify(
          extracted.content,
        )
        + "\n```";
    } else {
      markdown =
        extracted.content;
    }

    markdown =
      normalizeMarkdown(
        markdown,
      );

    const normalized:
      NormalizedDocument = {
      markdown,
      metadata:
        extracted.metadata,
    };

    return {
      ...normalized,
      contentHash:
        hashNormalizedDocument(
          normalized,
        ),
    };
  }
}
