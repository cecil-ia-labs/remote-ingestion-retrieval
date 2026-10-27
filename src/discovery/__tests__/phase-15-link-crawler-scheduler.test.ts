import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
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

class DelayedFixtureAcquirer
  implements CrawlPageAcquirer {
  active = 0;
  maxActive = 0;

  constructor(
    private readonly pages:
      ReadonlyMap<
        string,
        {
          html: string;
          delayMs: number;
        }
      >,
  ) {}

  async acquire(
    _source: WebsiteSource,
    url: string,
  ): Promise<FetchedResource> {
    const fixture =
      this.pages.get(url);

    if (!fixture) {
      throw new Error(
        `Missing scheduler fixture: ${url}`,
      );
    }

    this.active += 1;
    this.maxActive = Math.max(
      this.maxActive,
      this.active,
    );

    try {
      await delay(fixture.delayMs);
    } finally {
      this.active -= 1;
    }

    const body =
      Buffer.from(
        fixture.html,
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
  concurrency: number,
): WebsiteSource {
  return {
    id: "scheduler-site",
    type: "website",
    url: "https://example.com/",
    options: {
      crawl: {
        discoveryStrategy: "crawl",
        maxDepth: 2,
        maxPages: 20,
        concurrency,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test(
  "LinkCrawler fetches one BFS layer concurrently while preserving deterministic URL order",
  async () => {
    const acquirer =
      new DelayedFixtureAcquirer(
        new Map([
          [
            "https://example.com/",
            {
              delayMs: 1,
              html: `
                <a href="/a">A</a>
                <a href="/b">B</a>
                <a href="/c">C</a>
              `,
            },
          ],
          [
            "https://example.com/a",
            {
              delayMs: 60,
              html: '<a href="/a/one">A1</a>',
            },
          ],
          [
            "https://example.com/b",
            {
              delayMs: 10,
              html: '<a href="/b/one">B1</a>',
            },
          ],
          [
            "https://example.com/c",
            {
              delayMs: 30,
              html: '<a href="/c/one">C1</a>',
            },
          ],
          [
            "https://example.com/a/one",
            {
              delayMs: 1,
              html: "<p>A1</p>",
            },
          ],
          [
            "https://example.com/b/one",
            {
              delayMs: 1,
              html: "<p>B1</p>",
            },
          ],
          [
            "https://example.com/c/one",
            {
              delayMs: 1,
              html: "<p>C1</p>",
            },
          ],
        ]),
      );

    const crawler =
      new LinkCrawler({
        acquirer,
      });

    const urls:
      string[] = [];

    for await (
      const item
      of crawler.crawl(
        source(3),
        {
          seedUrls: [
            "https://example.com/",
          ],
          knownUrls: [
            "https://example.com/",
          ],
        },
      )
    ) {
      urls.push(item.url);
    }

    assert.deepEqual(
      urls,
      [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
        "https://example.com/a/one",
        "https://example.com/b/one",
        "https://example.com/c/one",
      ],
    );

    assert.equal(
      acquirer.maxActive,
      3,
    );

    assert.equal(
      crawler.crawlStats
        .schedulerMaxConcurrencyObserved,
      3,
    );

    assert.equal(
      crawler.crawlStats
        .schedulerConcurrencyLimit,
      3,
    );
  },
);
