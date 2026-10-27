import assert from "node:assert/strict";

import test from "node:test";

import type {
  FetchedResource,
} from "../../remote/index.js";

import type {
  ContentExtractor,
} from "../content-extractor.js";

import {
  ContentExtractionError,
  DuplicateContentExtractorError,
  InvalidExtractedDocumentError,
  NoContentExtractorError,
} from "../content-extractor.errors.js";

import {
  ContentExtractorRegistry,
} from "../content-extractor-registry.js";

import {
  createDocumentMetadata,
} from "../document-metadata.js";

function createFetchedResource(
  overrides: Partial<FetchedResource> = {},
): FetchedResource {
  const body =
    Buffer.from(
      "hello extractor",
    );

  return {
    resource: {
      requestedUrl:
        "https://example.com/document.txt",

      resolvedUrl:
        "https://example.com/document.txt",

      redirectChain: [],

      statusCode: 200,

      headers: {
        "content-type":
          "text/plain",
      },

      contentType:
        "text/plain",

      contentLength:
        body.byteLength,

      resourceType:
        "text",

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
        "text/plain",
    },

    fetchedAt:
      new Date(
        "2026-09-15T18:00:00.000Z",
      ),

    ...overrides,
  };
}

function createTextExtractor(
  name: string,
  supports = true,
): ContentExtractor {
  return {
    name,

    supports:
      () => supports,

    async extract(
      resource,
    ) {
      return {
        content:
          resource.body.toString(
            "utf8",
          ),

        contentFormat:
          "text",

        metadata:
          createDocumentMetadata(
            resource,
            {
              title:
                "Example",
            },
          ),
      };
    },
  };
}

test(
  "selects the first supporting extractor",
  () => {
    const first =
      createTextExtractor(
        "first",
      );

    const second =
      createTextExtractor(
        "second",
      );

    const registry =
      new ContentExtractorRegistry([
        first,
        second,
      ]);

    assert.equal(
      registry.require(
        createFetchedResource(),
      ).name,
      "first",
    );
  },
);

test(
  "findAll exposes all compatible extractors in precedence order",
  () => {
    const registry =
      new ContentExtractorRegistry([
        createTextExtractor(
          "one",
        ),

        createTextExtractor(
          "ignored",
          false,
        ),

        createTextExtractor(
          "two",
        ),
      ]);

    assert.deepEqual(
      registry.findAll(
        createFetchedResource(),
      ).map(
        (extractor) =>
          extractor.name,
      ),
      [
        "one",
        "two",
      ],
    );
  },
);

test(
  "extract delegates to the selected extractor and validates the result",
  async () => {
    const registry =
      new ContentExtractorRegistry([
        createTextExtractor(
          "text",
        ),
      ]);

    const result =
      await registry.extract(
        createFetchedResource(),
      );

    assert.equal(
      result.contentFormat,
      "text",
    );

    assert.equal(
      result.content,
      "hello extractor",
    );

    assert.equal(
      result.metadata.title,
      "Example",
    );
  },
);

test(
  "throws when no extractor supports the resource",
  () => {
    const registry =
      new ContentExtractorRegistry([
        createTextExtractor(
          "never",
          false,
        ),
      ]);

    assert.throws(
      () =>
        registry.require(
          createFetchedResource(),
        ),
      NoContentExtractorError,
    );
  },
);

test(
  "rejects duplicate extractor names",
  () => {
    assert.throws(
      () =>
        new ContentExtractorRegistry([
          createTextExtractor(
            "text",
          ),

          createTextExtractor(
            "text",
          ),
        ]),
      DuplicateContentExtractorError,
    );
  },
);

test(
  "wraps extractor failures with extractor and URL context",
  async () => {
    const extractor:
      ContentExtractor = {
        name:
          "broken",

        supports:
          () => true,

        async extract() {
          throw new Error(
            "parser exploded",
          );
        },
      };

    const registry =
      new ContentExtractorRegistry([
        extractor,
      ]);

    await assert.rejects(
      () =>
        registry.extract(
          createFetchedResource(),
        ),
      (
        error: unknown,
      ) => {
        assert.ok(
          error
          instanceof ContentExtractionError,
        );

        assert.equal(
          error.extractorName,
          "broken",
        );

        assert.equal(
          error.url,
          "https://example.com/document.txt",
        );

        assert.ok(
          error.cause
          instanceof Error,
        );

        return true;
      },
    );
  },
);

test(
  "rejects invalid extractor output",
  async () => {
    const extractor:
      ContentExtractor = {
        name:
          "invalid",

        supports:
          () => true,

        async extract(
          resource,
        ) {
          return {
            content:
              "text",

            contentFormat:
              "text",

            metadata: {
              ...createDocumentMetadata(
                resource,
              ),

              byteLength:
                -1,
            },
          };
        },
      };

    const registry =
      new ContentExtractorRegistry([
        extractor,
      ]);

    await assert.rejects(
      () =>
        registry.extract(
          createFetchedResource(),
        ),
      InvalidExtractedDocumentError,
    );
  },
);

test(
  "createDocumentMetadata inherits acquisition metadata",
  () => {
    const fetched =
      createFetchedResource();

    const metadata =
      createDocumentMetadata(
        fetched,
        {
          language:
            "pt-BR",
        },
      );

    assert.equal(
      metadata.requestedUrl,
      fetched.resource.requestedUrl,
    );

    assert.equal(
      metadata.resolvedUrl,
      fetched.resource.resolvedUrl,
    );

    assert.equal(
      metadata.resourceType,
      "text",
    );

    assert.equal(
      metadata.contentType,
      "text/plain",
    );

    assert.equal(
      metadata.byteLength,
      fetched.byteLength,
    );

    assert.equal(
      metadata.language,
      "pt-BR",
    );
  },
);
