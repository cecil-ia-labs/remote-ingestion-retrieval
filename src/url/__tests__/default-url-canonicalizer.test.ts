import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import {
  DefaultUrlCanonicalizer,
} from "../default-url-canonicalizer.js";

test(
  "normalizes common URL aliases without changing path semantics by default",
  () => {
    const result =
      new DefaultUrlCanonicalizer()
        .canonicalize(
          "HTTPS://Example.COM:443/docs/?b=2&utm_source=nav&a=1#section",
        );

    assert.equal(
      result.url,
      "https://example.com/docs/?a=1&b=2",
    );

    assert.deepEqual(
      result.removedQueryParameters,
      [
        "utm_source",
      ],
    );

    assert.ok(
      result.appliedRules
        .includes(
          "remove-fragment",
        ),
    );

    assert.ok(
      result.appliedRules
        .includes(
          "sort-query-parameters",
        ),
    );
  },
);

test(
  "preserves trailing slash by default",
  () => {
    const canonicalizer =
      new DefaultUrlCanonicalizer();

    assert.equal(
      canonicalizer
        .canonicalize(
          "https://example.com/docs/",
        ).url,
      "https://example.com/docs/",
    );

    assert.equal(
      canonicalizer
        .canonicalize(
          "https://example.com/docs",
        ).url,
      "https://example.com/docs",
    );
  },
);

test(
  "supports explicit trailing slash removal",
  () => {
    const canonicalizer =
      new DefaultUrlCanonicalizer({
        trailingSlash:
          "remove",
      });

    assert.equal(
      canonicalizer
        .canonicalize(
          "https://example.com/docs/",
        ).url,
      "https://example.com/docs",
    );
  },
);

test(
  "supports host aliases and optional index-document collapse",
  () => {
    const canonicalizer =
      new DefaultUrlCanonicalizer({
        hostAliases: {
          "www.example.com":
            "example.com",
        },

        indexDocumentNames: [
          "index.html",
          "index.htm",
        ],
      });

    assert.equal(
      canonicalizer
        .canonicalize(
          "https://www.example.com/docs/index.html",
        ).url,
      "https://example.com/docs/",
    );
  },
);

test(
  "preserves relative order of repeated query values while sorting keys",
  () => {
    const result =
      new DefaultUrlCanonicalizer()
        .canonicalize(
          "https://example.com/search?z=9&a=2&a=1&b=3",
        );

    assert.equal(
      result.url,
      "https://example.com/search?a=2&a=1&b=3&z=9",
    );
  },
);

test(
  "can disable tracking parameter removal",
  () => {
    const result =
      new DefaultUrlCanonicalizer({
        removeTrackingParameters:
          false,
      }).canonicalize(
        "https://example.com/docs?utm_source=test",
      );

    assert.equal(
      result.url,
      "https://example.com/docs?utm_source=test",
    );
  },
);
