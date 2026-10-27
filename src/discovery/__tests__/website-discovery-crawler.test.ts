import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  WebsiteSource,
} from "../../domain/index.js";

import type {
  FetchedResource,
} from "../../remote/index.js";

import type {
  CrawlPageAcquirer,
} from "../crawl-page-acquirer.js";

import {
  LinkCrawler,
} from "../link-crawler.js";

import type {
  RemotePayloadDocument,
  RemotePayloadLoader,
} from "../remote-payload-loader.js";

import type {
  RemoteTextDocument,
  RemoteTextLoader,
} from "../remote-text-loader.js";

import {
  RobotsResolver,
} from "../robots-resolver.js";

import {
  SitemapResolver,
} from "../sitemap-resolver.js";

import {
  WebsiteDiscoveryService,
} from "../website-discovery-service.js";

class EmptyRobotsLoader
  implements RemoteTextLoader {
  async load(
    url: string,
  ): Promise<RemoteTextDocument> {
    throw new Error(
      `No fixture: ${url}`,
    );
  }

  async loadOptional():
    Promise<RemoteTextDocument | null> {
    return null;
  }
}

class EmptySitemapLoader
  implements RemotePayloadLoader {
  async load(
    url: string,
  ): Promise<RemotePayloadDocument> {
    throw new Error(
      `No fixture: ${url}`,
    );
  }

  async loadOptional():
    Promise<RemotePayloadDocument | null> {
    return null;
  }
}

class FixturePageAcquirer
  implements CrawlPageAcquirer {
  constructor(
    private readonly pages:
      ReadonlyMap<string, string>,
  ) {}

  async acquire(
    _source: WebsiteSource,
    url: string,
  ): Promise<FetchedResource> {
    const html =
      this.pages.get(url);

    if (html === undefined) {
      throw new Error(
        `Missing page: ${url}`,
      );
    }

    const body =
      Buffer.from(html);

    return {
      resource: {
        requestedUrl: url,
        resolvedUrl: url,
        redirectChain: [],
        statusCode: 200,
        headers: {
          "content-type": "text/html",
        },
        contentType: "text/html",
        contentLength: body.byteLength,
        resourceType: "html",
        resourceTypeDetectedBy: "content-type",
        resolvedAddress: "203.0.113.10",
        resolvedAddressFamily: 4,
      },
      body,
      byteLength: body.byteLength,
      headers: {
        "content-type": "text/html",
      },
      fetchedAt: new Date(),
    };
  }
}

function source(
  strategy:
    | "auto"
    | "crawl"
    | "sitemap"
    | "sitemap-and-crawl",
): WebsiteSource {
  return {
    id: "site",
    type: "website",
    url: "https://example.com/",
    options: {
      crawl: {
        discoveryStrategy: strategy,
        maxDepth: 2,
        maxPages: 10,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function service():
  WebsiteDiscoveryService {
  const pages =
    new Map<string, string>([
      [
        "https://example.com/",
        '<a href="/docs">Docs</a><a href="/about">About</a>',
      ],
      [
        "https://example.com/docs",
        '<a href="/docs/api">API</a>',
      ],
      [
        "https://example.com/about",
        "<p>About</p>",
      ],
      [
        "https://example.com/docs/api",
        "<p>API</p>",
      ],
    ]);

  return new WebsiteDiscoveryService({
    robotsResolver:
      new RobotsResolver({
        loader:
          new EmptyRobotsLoader(),
      }),
    sitemapResolver:
      new SitemapResolver({
        loader:
          new EmptySitemapLoader(),
      }),
    linkCrawler:
      new LinkCrawler({
        acquirer:
          new FixturePageAcquirer(
            pages,
          ),
      }),
  });
}

test(
  "crawl strategy performs BFS discovery after the root",
  async () => {
    const report =
      await service()
        .collectReport(
          source("crawl"),
        );

    assert.deepEqual(
      report.urls.map(
        (entry) => entry.url,
      ),
      [
        "https://example.com/",
        "https://example.com/docs",
        "https://example.com/about",
        "https://example.com/docs/api",
      ],
    );

    assert.equal(
      report.urls[1]?.discoveredBy,
      "crawl",
    );

    assert.equal(
      report.urls[1]?.depth,
      1,
    );

    assert.equal(
      report.urls[3]?.depth,
      2,
    );

    assert.equal(
      report.stats.crawlPagesFetched,
      4,
    );
  },
);

test(
  "auto falls back to crawl when no sitemap produces document URLs",
  async () => {
    const report =
      await service()
        .collectReport(
          source("auto"),
        );

    assert.ok(
      report.urls.some(
        (entry) =>
          entry.url
          === "https://example.com/docs",
      ),
    );

    assert.ok(
      report.stats.crawlPagesFetched
      > 0,
    );
  },
);
