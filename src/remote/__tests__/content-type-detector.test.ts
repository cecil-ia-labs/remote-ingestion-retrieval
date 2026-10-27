import assert from "node:assert/strict";
import test from "node:test";

import {
  ContentTypeDetector,
} from "../content-type-detector.js";

const detector =
  new ContentTypeDetector();

test(
  "detects PDF from Content-Type",
  () => {
    const result = detector.detect(
      new URL(
        "https://example.com/download?id=123",
      ),
      "application/pdf",
    );

    assert.equal(
      result.resourceType,
      "pdf",
    );

    assert.equal(
      result.detectedBy,
      "content-type",
    );
  },
);

test(
  "falls back to URL extension",
  () => {
    const result = detector.detect(
      new URL(
        "https://example.com/readme.md",
      ),
      "application/octet-stream",
    );

    assert.equal(
      result.resourceType,
      "markdown",
    );

    assert.equal(
      result.detectedBy,
      "url-extension",
    );
  },
);

test(
  "caller hint takes precedence",
  () => {
    const result = detector.detect(
      new URL(
        "https://example.com/resource",
      ),
      "application/octet-stream",
      "json",
    );

    assert.equal(
      result.resourceType,
      "json",
    );

    assert.equal(
      result.detectedBy,
      "hint",
    );
  },
);
