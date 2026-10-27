import assert from "node:assert/strict";
import { test } from "node:test";

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

function htmlResource(
  url: string,
  html: string,
): FetchedResource {
  const body = Buffer.from(html, "utf8");

  return {
    resource: {
      requestedUrl: url,
      resolvedUrl: url,
      redirectChain: [],
      statusCode: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
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
      "content-type": "text/html; charset=utf-8",
    },
    fetchedAt: new Date(),
  };
}

class RecordingPageAcquirer
  implements CrawlPageAcquirer {
  readonly requested: string[] = [];

  constructor(
    private readonly pages:
      ReadonlyMap<string, string>,
  ) {}

  async acquire(
    _source: WebsiteSource,
    url: string,
  ): Promise<FetchedResource> {
    this.requested.push(url);

    const html = this.pages.get(url);

    if (html === undefined) {
      throw new Error(`Unexpected fetch: ${url}`);
    }

    return htmlResource(url, html);
  }
}

test(
  "crawler prunes unrelated include branches and never fetches excluded URLs",
  async () => {
    const pages = new Map<string, string>([
      [
        "https://example.com/",
        `
        <a href="/docs">Docs</a>
        <a href="/blog">Blog</a>
        `,
      ],
      [
        "https://example.com/docs",
        `
        <a href="/docs/api">API section</a>
        <a href="/docs/archive">Archive</a>
        `,
      ],
      [
        "https://example.com/docs/api",
        `
        <a href="/docs/api/reference?utm_source=nav#methods">Reference</a>
        <a href="/docs/api/private/secret">Private</a>
        `,
      ],
      [
        "https://example.com/docs/api/reference",
        "<main><h1>Reference</h1></main>",
      ],
    ]);

    const acquirer = new RecordingPageAcquirer(pages);

    const source: WebsiteSource = {
      id: "filters",
      type: "website",
      url: "https://example.com/",
      options: {
        crawl: {
          maxDepth: 4,
          include: [
            "/docs/api/**",
          ],
          exclude: [
            "/docs/api/private/**",
          ],
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const crawler = new LinkCrawler({
      acquirer,
    });

    const discovered: string[] = [];

    for await (
      const item
      of crawler.crawl(
        source,
        {
          seedUrls: [source.url],
          knownUrls: [source.url],
        },
      )
    ) {
      discovered.push(item.url);
    }

    assert.deepEqual(
      discovered,
      [
        "https://example.com/docs/api/reference",
      ],
    );

    assert.deepEqual(
      acquirer.requested,
      [
        "https://example.com/",
        "https://example.com/docs",
        "https://example.com/docs/api",
        "https://example.com/docs/api/reference",
      ],
    );

    assert.equal(
      acquirer.requested.includes(
        "https://example.com/blog",
      ),
      false,
    );

    assert.equal(
      acquirer.requested.includes(
        "https://example.com/docs/api/private/secret",
      ),
      false,
    );

    assert.ok(
      crawler.crawlStats.traversalOnlyLinks >= 2,
    );

    assert.ok(
      crawler.crawlStats.includeFilteredLinks >= 2,
    );

    assert.equal(
      crawler.crawlStats.excludeFilteredLinks,
      1,
    );
  },
);

class RobotsFixtureLoader
  implements RemoteTextLoader {
  async load(
    url: string,
  ): Promise<RemoteTextDocument> {
    return {
      requestedUrl: url,
      resolvedUrl: url,
      text: "Sitemap: https://example.com/sitemap.xml",
    };
  }

  async loadOptional(
    url: string,
  ): Promise<RemoteTextDocument | null> {
    return this.load(url);
  }
}

class SitemapFixtureLoader
  implements RemotePayloadLoader {
  async load(
    url: string,
  ): Promise<RemotePayloadDocument> {
    return {
      requestedUrl: url,
      resolvedUrl: url,
      body: Buffer.from(
        `
        <urlset>
          <url>
            <loc>https://example.com/docs/auth?utm_source=sitemap#login</loc>
          </url>
          <url>
            <loc>https://example.com/docs/archive/old</loc>
          </url>
          <url>
            <loc>https://example.com/blog/post</loc>
          </url>
        </urlset>
        `,
        "utf8",
      ),
    };
  }

  async loadOptional(
    url: string,
  ): Promise<RemotePayloadDocument | null> {
    return this.load(url);
  }
}

test(
  "sitemap URLs are canonicalized before include/exclude filtering",
  async () => {
    const source: WebsiteSource = {
      id: "sitemap-filters",
      type: "website",
      url: "https://example.com/docs",
      options: {
        crawl: {
          discoveryStrategy: "sitemap",
          include: [
            "/docs/auth",
            "/docs/archive/**",
          ],
          exclude: [
            "/docs/archive/**",
          ],
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const discovery = new WebsiteDiscoveryService({
      robotsResolver: new RobotsResolver({
        loader: new RobotsFixtureLoader(),
      }),
      sitemapResolver: new SitemapResolver({
        loader: new SitemapFixtureLoader(),
      }),
    });

    const report = await discovery.collectReport(source);

    assert.deepEqual(
      report.urls.map((item) => item.url),
      [
        "https://example.com/docs",
        "https://example.com/docs/auth",
      ],
    );

    assert.equal(
      report.stats.sitemapFilteredByExclude,
      1,
    );

    assert.equal(
      report.stats.sitemapFilteredByInclude,
      1,
    );

    assert.ok(
      report.stats.trackingParametersRemoved >= 1,
    );
  },
);
