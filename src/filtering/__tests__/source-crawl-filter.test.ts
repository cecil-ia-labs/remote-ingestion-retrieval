import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SourceCrawlFilter,
  UrlGlobPattern,
} from "../index.js";

test("path globs support segment and recursive wildcards", () => {
  const docs = new UrlGlobPattern("/docs/**");
  const oneSegment = new UrlGlobPattern("/blog/*");

  assert.equal(docs.matches("https://example.com/docs/api/v1"), true);
  assert.equal(docs.matches("https://example.com/blog/docs"), false);
  assert.equal(oneSegment.matches("https://example.com/blog/post"), true);
  assert.equal(oneSegment.matches("https://example.com/blog/2026/post"), false);
});

test("absolute URL globs may constrain origin", () => {
  const pattern = new UrlGlobPattern("HTTPS://EXAMPLE.COM:443/docs/**");

  assert.equal(pattern.matches("https://example.com/docs/a"), true);
  assert.equal(pattern.matches("https://other.example/docs/a"), false);
});

test("exclude rules take precedence over include rules", () => {
  const filter = new SourceCrawlFilter(
    ["/docs/**"],
    ["/docs/private/**"],
  );

  assert.equal(filter.evaluate("https://example.com/docs/api").accepted, true);

  const privateDecision = filter.evaluate(
    "https://example.com/docs/private/token",
  );

  assert.equal(privateDecision.accepted, false);
  assert.equal(privateDecision.traversalAllowed, false);
  assert.equal(privateDecision.reason, "excluded");
});

test("include misses may still traverse ancestors of an included branch", () => {
  const filter = new SourceCrawlFilter([
    "/docs/api/**",
  ]);

  const root = filter.evaluate("https://example.com/");
  const docs = filter.evaluate("https://example.com/docs");
  const blog = filter.evaluate("https://example.com/blog");

  assert.equal(root.accepted, false);
  assert.equal(root.traversalAllowed, true);

  assert.equal(docs.accepted, false);
  assert.equal(docs.traversalAllowed, true);

  assert.equal(blog.accepted, false);
  assert.equal(blog.traversalAllowed, false);
});

test("path patterns containing a query match pathname plus search", () => {
  const pattern = new UrlGlobPattern("/search?type=docs&*");

  assert.equal(
    pattern.matches("https://example.com/search?type=docs&q=auth"),
    true,
  );

  assert.equal(
    pattern.matches("https://example.com/search?type=blog&q=auth"),
    false,
  );
});
