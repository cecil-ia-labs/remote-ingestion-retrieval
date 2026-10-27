import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJsonStringify,
  compareContentHashTraces,
  createContentHashTrace,
  hashBytes,
  hashCanonicalJson,
  hashText,
} from "../index.js";

test(
  "canonical JSON hash is independent of object key insertion order",
  () => {
    const a =
      hashCanonicalJson(
        "extracted",
        {
          z: 1,
          nested: {
            b: true,
            a: "x",
          },
          a: 2,
        },
      );

    const b =
      hashCanonicalJson(
        "extracted",
        {
          a: 2,
          nested: {
            a: "x",
            b: true,
          },
          z: 1,
        },
      );

    assert.equal(
      a.value,
      b.value,
    );
  },
);

test(
  "canonical JSON preserves array order",
  () => {
    assert.notEqual(
      hashCanonicalJson(
        "extracted",
        [1, 2, 3],
      ).value,
      hashCanonicalJson(
        "extracted",
        [3, 2, 1],
      ).value,
    );
  },
);

test(
  "hash descriptor captures stage representation and byte length",
  () => {
    const hash =
      hashText(
        "normalized",
        "Olá Markdown",
        "markdown",
      );

    assert.equal(
      hash.stage,
      "normalized",
    );

    assert.equal(
      hash.representation,
      "markdown",
    );

    assert.equal(
      hash.byteLength,
      Buffer.byteLength(
        "Olá Markdown",
        "utf8",
      ),
    );

    assert.match(
      hash.value,
      /^[a-f0-9]{64}$/,
    );
  },
);

test(
  "raw hashes operate on exact bytes",
  () => {
    assert.notEqual(
      hashBytes(
        "raw",
        Buffer.from([
          0x00,
          0xff,
        ]),
      ).value,
      hashBytes(
        "raw",
        Buffer.from([
          0x00,
          0xfe,
        ]),
      ).value,
    );
  },
);

test(
  "comparison identifies the earliest changed available stage",
  () => {
    const raw =
      hashText(
        "raw",
        "same",
      );

    const previous = {
      schemaVersion: 1 as const,
      algorithm: "sha256" as const,
      raw,
      extracted:
        hashText(
          "extracted",
          "before",
        ),
      normalized:
        hashText(
          "normalized",
          "before-md",
          "markdown",
        ),
    };

    const current = {
      schemaVersion: 1 as const,
      algorithm: "sha256" as const,
      raw,
      extracted:
        hashText(
          "extracted",
          "after",
        ),
      normalized:
        hashText(
          "normalized",
          "after-md",
          "markdown",
        ),
    };

    const comparison =
      compareContentHashTraces(
        previous,
        current,
      );

    assert.equal(
      comparison.firstChangedStage,
      "extracted",
    );

    assert.deepEqual(
      comparison.equalStages,
      ["raw"],
    );

    assert.deepEqual(
      comparison.changedStages,
      [
        "extracted",
        "normalized",
      ],
    );
  },
);

test(
  "trace can be partially populated without fabricating unavailable stages",
  () => {
    const trace =
      createContentHashTrace({
        normalizedDocument: {
          markdown:
            "# Hello",
          metadata: {
            requestedUrl:
              "https://example.com/",
            resolvedUrl:
              "https://example.com/",
            resourceType:
              "html",
            fetchedAt:
              new Date(),
            extractedAt:
              new Date(),
            byteLength:
              1,
          },
        },
      });

    assert.equal(
      trace.raw,
      undefined,
    );

    assert.equal(
      trace.extracted,
      undefined,
    );

    assert.equal(
      trace.normalized?.stage,
      "normalized",
    );
  },
);

test(
  "canonical serializer is deterministic",
  () => {
    assert.equal(
      canonicalJsonStringify({
        b: 1,
        a: 2,
      }),
      '{"a":2,"b":1}',
    );
  },
);
