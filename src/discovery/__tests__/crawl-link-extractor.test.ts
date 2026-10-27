import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import {
  CrawlLinkExtractor,
} from "../crawl-link-extractor.js";

test(
  "extractor resolves links but leaves fragment/query canonicalization to Phase 13",
  () => {
    const result =
      new CrawlLinkExtractor()
        .extract(
          `
          <a href="/docs?a=2&utm_source=x#one">One</a>
          <a href="/docs?utm_source=x&a=2#two">Two</a>
          `,
          "https://example.com/",
        );

    assert.deepEqual(
      result.links.map(
        (link) =>
          link.url,
      ),
      [
        "https://example.com/docs?a=2&utm_source=x#one",
        "https://example.com/docs?utm_source=x&a=2#two",
      ],
    );
  },
);
