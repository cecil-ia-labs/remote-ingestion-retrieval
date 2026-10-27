import type {
  WebsiteSource,
} from "../domain/index.js";

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
  HtmlRenderingOrchestrator,
  PuppeteerBrowserHtmlRenderer,
  getSourceRenderingStrategy,
} from "../rendering/index.js";

export interface CrawlPageAcquirer {
  acquire(
    source: WebsiteSource,
    url: string,
    signal?: AbortSignal,
  ): Promise<FetchedResource | null>;
}

export interface DefaultCrawlPageAcquirerOptions {
  resolver?: RemoteResourceResolver;
  fetcher?: RemoteFetcher;
  renderer?: HtmlRenderingOrchestrator;
  maxBytes?: number;
  timeoutMs?: number;
}

function isHtml(
  resource: FetchedResource,
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
    || contentType === "application/xhtml+xml"
  );
}

export class DefaultCrawlPageAcquirer
  implements CrawlPageAcquirer {
  private readonly resolver: RemoteResourceResolver;
  private readonly fetcher: RemoteFetcher;
  private readonly renderer: HtmlRenderingOrchestrator;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(
    options: DefaultCrawlPageAcquirerOptions = {},
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

    this.maxBytes =
      options.maxBytes
      ?? 20 * 1024 * 1024;

    this.timeoutMs =
      options.timeoutMs
      ?? 30_000;
  }

  async acquire(
    source: WebsiteSource,
    url: string,
    signal?: AbortSignal,
  ): Promise<FetchedResource | null> {
    signal?.throwIfAborted();

    const resource =
      await this.resolver.resolve(
        url,
        {
          timeoutMs: this.timeoutMs,
        },
      );

    if (
      resource.resourceType
      !== "html"
    ) {
      return null;
    }

    const fetched =
      await this.fetcher.fetch(
        resource,
        {
          maxBytes: this.maxBytes,
          timeoutMs: this.timeoutMs,
          signal,
        },
      );

    if (!isHtml(fetched)) {
      return null;
    }

    const rendered =
      await this.renderer.render(
        fetched,
        getSourceRenderingStrategy(source),
        {
          signal,
        },
      );

    return rendered.resource;
  }
}
