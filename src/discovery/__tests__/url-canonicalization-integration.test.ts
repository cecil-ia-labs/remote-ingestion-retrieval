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
    url:
      string,
  ): Promise<RemoteTextDocument> {
    throw new Error(
      `No robots fixture: ${url}`,
    );
  }

  async loadOptional():
    Promise<RemoteTextDocument | null> {
    return null;
  }
}

class SitemapFixtureLoader
  implements RemotePayloadLoader {
  constructor(
    private readonly fixtures:
      ReadonlyMap<string, string>,
  ) {}

  async load(
    url:
      string,
  ): Promise<RemotePayloadDocument> {
    const xml =
      this.fixtures.get(
        url,
      );

    if (
      xml === undefined
    ) {
      throw new Error(
        `No sitemap fixture: ${url}`,
      );
    }

    return {
      requestedUrl:
        url,

      resolvedUrl:
        url,

      body:
        Buffer.from(
          xml,
          "utf8",
        ),
    };
  }

  async loadOptional(
    url:
      string,
  ): Promise<RemotePayloadDocument | null> {
    const xml =
      this.fixtures.get(
        url,
      );

    return xml === undefined
      ? null
      : {
          requestedUrl:
            url,

          resolvedUrl:
            url,

          body:
            Buffer.from(
              xml,
              "utf8",
            ),
        };
  }
}

class CrawlFixtureAcquirer
  implements CrawlPageAcquirer {
  constructor(
    private readonly pages:
      ReadonlyMap<string, string>,
  ) {}

  async acquire(
    _source:
      WebsiteSource,

    url:
      string,
  ): Promise<FetchedResource> {
    const html =
      this.pages.get(
        url,
      );

    if (
      html === undefined
    ) {
      throw new Error(
        `No crawl fixture: ${url}`,
      );
    }

    const body =
      Buffer.from(
        html,
        "utf8",
      );

    return {
      resource: {
        requestedUrl:
          url,

        resolvedUrl:
          url,

        redirectChain:
          [],

        statusCode:
          200,

        headers: {
          "content-type":
            "text/html",
        },

        contentType:
          "text/html",

        contentLength:
          body.byteLength,

        resourceType:
          "html",

        resourceTypeDetectedBy:
          "content-type",

        resolvedAddress:
          "203.0.113.10",

        resolvedAddressFamily:
          4,
      },

      body,

      byteLength:
        body.byteLength,

      headers: {
        "content-type":
          "text/html",
      },

      fetchedAt:
        new Date(),
    };
  }
}

function source(
  strategy:
    "crawl"
    | "sitemap",
): WebsiteSource {
  return {
    id:
      "canonical-site",

    type:
      "website",

    url:
      "HTTPS://EXAMPLE.COM:443/docs#home",

    options: {
      crawl: {
        discoveryStrategy:
          strategy,

        maxDepth:
          2,

        maxPages:
          10,

        canonicalization: {
          trailingSlash:
            "remove",
        },
      },
    },

    createdAt:
      new Date(),

    updatedAt:
      new Date(),
  };
}

test(
  "LinkCrawler collapses tracking/query/fragment aliases into one canonical URL",
  async () => {
    const pages =
      new Map<string, string>([
        [
          "https://example.com/docs",
          `
          <a href="/docs/api?utm_source=nav&b=2&a=1#methods">
            API tracked
          </a>

          <a href="HTTPS://EXAMPLE.COM:443/docs/api?a=1&b=2#other">
            API alias
          </a>
          `,
        ],
        [
          "https://example.com/docs/api?a=1&b=2",
          "<main><h1>API</h1></main>",
        ],
      ]);

    const crawler =
      new LinkCrawler({
        acquirer:
          new CrawlFixtureAcquirer(
            pages,
          ),
      });

    const discovered:
      string[] = [];

    for await (
      const entry
      of crawler.crawl(
        source(
          "crawl",
        ),
        {
          knownUrls: [
            "https://example.com/docs",
          ],
        },
      )
    ) {
      discovered.push(
        entry.url,
      );
    }

    assert.deepEqual(
      discovered,
      [
        "https://example.com/docs/api?a=1&b=2",
      ],
    );

    assert.ok(
      crawler.crawlStats
        .canonicalizedUrls
      >= 2,
    );

    assert.ok(
      crawler.crawlStats
        .canonicalAliasesCollapsed
      >= 1,
    );

    assert.ok(
      crawler.crawlStats
        .trackingParametersRemoved
      >= 1,
    );
  },
);

test(
  "sitemap discovery collapses canonical aliases before document emission",
  async () => {
    const sitemapUrl =
      "https://example.com/sitemap.xml";

    const sitemap =
      `
      <urlset>
        <url>
          <loc>https://example.com/docs/api?utm_source=sitemap&amp;b=2&amp;a=1#one</loc>
        </url>
        <url>
          <loc>HTTPS://EXAMPLE.COM:443/docs/api?a=1&amp;b=2#two</loc>
        </url>
      </urlset>
      `;

    const service =
      new WebsiteDiscoveryService({
        robotsResolver:
          new RobotsResolver({
            loader:
              new EmptyRobotsLoader(),
          }),

        sitemapResolver:
          new SitemapResolver({
            loader:
              new SitemapFixtureLoader(
                new Map([
                  [
                    sitemapUrl,
                    sitemap,
                  ],
                ]),
              ),
          }),
      });

    const report =
      await service.collectReport(
        source(
          "sitemap",
        ),
      );

    assert.deepEqual(
      report.urls.map(
        (entry) =>
          entry.url,
      ),
      [
        "https://example.com/docs",
        "https://example.com/docs/api?a=1&b=2",
      ],
    );

    assert.equal(
      report.stats
        .duplicateDocumentUrls,
      1,
    );

    assert.ok(
      report.stats
        .canonicalAliasesCollapsed
      >= 1,
    );

    assert.ok(
      report.stats
        .trackingParametersRemoved
      >= 1,
    );
  },
);
