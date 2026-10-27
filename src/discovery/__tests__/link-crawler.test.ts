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

class FixturePageAcquirer
  implements CrawlPageAcquirer {
  constructor(
    private readonly pages:
      ReadonlyMap<string, string | null>,
  ) {}

  async acquire(
    _source: WebsiteSource,
    url: string,
  ): Promise<FetchedResource | null> {
    const html =
      this.pages.get(url);

    if (html === undefined) {
      throw new Error(
        `Fixture page not found: ${url}`,
      );
    }

    if (html === null) {
      return null;
    }

    const body =
      Buffer.from(
        html,
        "utf8",
      );

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
  maxDepth = 3,
): WebsiteSource {
  return {
    id: "site",
    type: "website",
    url: "https://example.com/",
    options: {
      crawl: {
        maxDepth,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function collect(
  crawler: LinkCrawler,
  website: WebsiteSource,
): Promise<readonly string[]> {
  const urls: string[] = [];

  for await (
    const discovered
    of crawler.crawl(
      website,
      {
        seedUrls: [
          website.url,
        ],
        knownUrls: [
          website.url,
        ],
      },
    )
  ) {
    urls.push(discovered.url);
  }

  return urls;
}

test(
  "performs deterministic breadth-first traversal",
  async () => {
    const pages =
      new Map<string, string | null>([
        [
          "https://example.com/",
          '<a href="/a">A</a><a href="/b">B</a>',
        ],
        [
          "https://example.com/a",
          '<a href="/a/one">A1</a>',
        ],
        [
          "https://example.com/b",
          '<a href="/b/one">B1</a>',
        ],
        [
          "https://example.com/a/one",
          "<p>end</p>",
        ],
        [
          "https://example.com/b/one",
          "<p>end</p>",
        ],
      ]);

    const crawler =
      new LinkCrawler({
        acquirer:
          new FixturePageAcquirer(
            pages,
          ),
      });

    assert.deepEqual(
      await collect(
        crawler,
        source(),
      ),
      [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/a/one",
        "https://example.com/b/one",
      ],
    );
  },
);

test(
  "respects maxDepth",
  async () => {
    const pages =
      new Map<string, string | null>([
        [
          "https://example.com/",
          '<a href="/a">A</a>',
        ],
        [
          "https://example.com/a",
          '<a href="/deep">Deep</a>',
        ],
      ]);

    const crawler =
      new LinkCrawler({
        acquirer:
          new FixturePageAcquirer(
            pages,
          ),
      });

    assert.deepEqual(
      await collect(
        crawler,
        source(1),
      ),
      [
        "https://example.com/a",
      ],
    );

    assert.equal(
      crawler.crawlStats
        .maxDepthLinksSkipped,
      1,
    );
  },
);

test(
  "filters cross-origin links",
  async () => {
    const pages =
      new Map<string, string | null>([
        [
          "https://example.com/",
          '<a href="/inside">Inside</a><a href="https://other.example/out">Outside</a>',
        ],
        [
          "https://example.com/inside",
          "<p>end</p>",
        ],
      ]);

    const crawler =
      new LinkCrawler({
        acquirer:
          new FixturePageAcquirer(
            pages,
          ),
      });

    assert.deepEqual(
      await collect(
        crawler,
        source(),
      ),
      [
        "https://example.com/inside",
      ],
    );

    assert.equal(
      crawler.crawlStats
        .outOfScopeLinks,
      1,
    );
  },
);
