import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  RemoteResourceType,
} from "../../domain/index.js";

import type {
  FetchedResource,
} from "../../remote/index.js";

import {
  CsvExtractor,
  JsonExtractor,
  MarkdownExtractor,
  PdfExtractor,
  TextExtractor,
  createSimpleExtractorRegistry,
} from "../extractors/index.js";

import type {
  PdfMarkdownProcessor,
} from "../extractors/index.js";

function createFetchedResource(
  body: Buffer,
  options: {
    resourceType:
      RemoteResourceType;

    contentType?:
      string;

    url?:
      string;
  },
): FetchedResource {
  const url =
    options.url
    ?? "https://example.com/resource";

  return {
    resource: {
      requestedUrl:
        url,

      resolvedUrl:
        url,

      redirectChain: [],

      statusCode:
        200,

      headers:
        options.contentType
          ? {
              "content-type":
                options.contentType,
            }
          : {},

      contentType:
        options.contentType
          ?.split(
            ";",
            1,
          )[0]
          ?.trim()
          .toLowerCase(),

      contentLength:
        body.byteLength,

      resourceType:
        options.resourceType,

      resourceTypeDetectedBy:
        "hint",

      resolvedAddress:
        "203.0.113.10",

      resolvedAddressFamily:
        4,
    },

    body,

    byteLength:
      body.byteLength,

    headers:
      options.contentType
        ? {
            "content-type":
              options.contentType,
          }
        : {},

    fetchedAt:
      new Date(
        "2026-09-15T19:00:00.000Z",
      ),
  };
}

test(
  "TextExtractor decodes UTF-8 text",
  async () => {
    const extractor =
      new TextExtractor();

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            "Olá mundo",
            "utf8",
          ),
          {
            resourceType:
              "text",

            contentType:
              "text/plain; charset=utf-8",
          },
        ),
      );

    assert.equal(
      result.contentFormat,
      "text",
    );

    assert.equal(
      result.content,
      "Olá mundo",
    );

    assert.equal(
      result.metadata.charset,
      "utf-8",
    );
  },
);

test(
  "TextExtractor honors Windows-1252 charset",
  async () => {
    const extractor =
      new TextExtractor();

    const body =
      Buffer.from([
        0x61, 0xe7, 0xe3, 0x6f, 0x20, 0x80,
      ]);

    const result =
      await extractor.extract(
        createFetchedResource(
          body,
          {
            resourceType:
              "text",

            contentType:
              "text/plain; charset=windows-1252",
          },
        ),
      );

    assert.equal(
      result.content,
      "ação €",
    );

    assert.equal(
      result.metadata.charset,
      "windows-1252",
    );
  },
);

test(
  "MarkdownExtractor preserves Markdown content",
  async () => {
    const extractor =
      new MarkdownExtractor();

    const markdown =
      "# Title\n\nHello **world**.";

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            markdown,
          ),
          {
            resourceType:
              "markdown",

            contentType:
              "text/markdown",
          },
        ),
      );

    assert.equal(
      result.contentFormat,
      "markdown",
    );

    assert.equal(
      result.content,
      markdown,
    );
  },
);

test(
  "JsonExtractor parses ordinary JSON into structured content",
  async () => {
    const extractor =
      new JsonExtractor();

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            JSON.stringify({
              name:
                "Cedar",

              realtime:
                true,
            }),
          ),
          {
            resourceType:
              "json",

            contentType:
              "application/json",
          },
        ),
      );

    assert.equal(
      result.contentFormat,
      "structured",
    );

    assert.deepEqual(
      result.content,
      {
        name:
          "Cedar",

        realtime:
          true,
      },
    );

    assert.equal(
      result.metadata
        .attributes
        ?.format,
      "json",
    );
  },
);

test(
  "JsonExtractor parses NDJSON",
  async () => {
    const extractor =
      new JsonExtractor();

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            '{"id":1}\n{"id":2}\n',
          ),
          {
            resourceType:
              "json",

            contentType:
              "application/x-ndjson",

            url:
              "https://example.com/events.ndjson",
          },
        ),
      );

    assert.deepEqual(
      result.content,
      [
        {
          id:
            1,
        },
        {
          id:
            2,
        },
      ],
    );

    assert.equal(
      result.metadata
        .attributes
        ?.format,
      "json-lines",
    );
  },
);

test(
  "CsvExtractor produces structured records",
  async () => {
    const extractor =
      new CsvExtractor();

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            "name,provider,realtime\n"
            + "Cedar,OpenAI,true\n"
            + "Marin,OpenAI,true\n",
          ),
          {
            resourceType:
              "csv",

            contentType:
              "text/csv",
          },
        ),
      );

    assert.deepEqual(
      result.content,
      [
        {
          name:
            "Cedar",

          provider:
            "OpenAI",

          realtime:
            "true",
        },
        {
          name:
            "Marin",

          provider:
            "OpenAI",

          realtime:
            "true",
        },
      ],
    );

    assert.equal(
      result.metadata
        .attributes
        ?.rowCount,
      2,
    );
  },
);

test(
  "CsvExtractor detects semicolon delimiter",
  async () => {
    const extractor =
      new CsvExtractor();

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            "name;provider\n"
            + "Cedar;OpenAI\n",
          ),
          {
            resourceType:
              "csv",

            contentType:
              "text/csv",
          },
        ),
      );

    assert.deepEqual(
      result.content,
      [
        {
          name:
            "Cedar",

          provider:
            "OpenAI",
        },
      ],
    );

    assert.equal(
      result.metadata
        .attributes
        ?.delimiter,
      ";",
    );
  },
);

test(
  "CsvExtractor preserves duplicate columns by renaming them",
  async () => {
    const extractor =
      new CsvExtractor();

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            "name,name\n"
            + "Cedar,Marin\n",
          ),
          {
            resourceType:
              "csv",

            contentType:
              "text/csv",
          },
        ),
      );

    assert.deepEqual(
      result.content,
      [
        {
          name:
            "Cedar",

          name_2:
            "Marin",
        },
      ],
    );
  },
);

test(
  "PdfExtractor delegates to the existing PDF Markdown processor",
  async () => {
    const processor:
      PdfMarkdownProcessor = {
        async process(
          pdf,
          context,
        ) {
          assert.equal(
            pdf.toString(),
            "%PDF fake",
          );

          assert.equal(
            context.sourceUrl,
            "https://example.com/manual.pdf",
          );

          return {
            markdown:
              "# Manual\n\nExtracted PDF.",

            metadata: {
              title:
                "Manual",

              attributes: {
                pageCount:
                  12,
              },
            },
          };
        },
      };

    const extractor =
      new PdfExtractor(
        processor,
      );

    const result =
      await extractor.extract(
        createFetchedResource(
          Buffer.from(
            "%PDF fake",
          ),
          {
            resourceType:
              "pdf",

            contentType:
              "application/pdf",

            url:
              "https://example.com/manual.pdf",
          },
        ),
      );

    assert.equal(
      result.contentFormat,
      "markdown",
    );

    assert.equal(
      result.content,
      "# Manual\n\nExtracted PDF.",
    );

    assert.equal(
      result.metadata.title,
      "Manual",
    );

    assert.equal(
      result.metadata
        .attributes
        ?.pageCount,
      12,
    );
  },
);

test(
  "simple registry includes PDF only when a processor is provided",
  () => {
    const withoutPdf =
      createSimpleExtractorRegistry();

    assert.deepEqual(
      withoutPdf
        .registeredExtractors
        .map(
          (extractor) =>
            extractor.name,
        ),
      [
        "markdown",
        "json",
        "csv",
        "text",
      ],
    );

    const processor:
      PdfMarkdownProcessor = {
        async process() {
          return {
            markdown:
              "",
          };
        },
      };

    const withPdf =
      createSimpleExtractorRegistry({
        pdfProcessor:
          processor,
      });

    assert.deepEqual(
      withPdf
        .registeredExtractors
        .map(
          (extractor) =>
            extractor.name,
        ),
      [
        "pdf",
        "markdown",
        "json",
        "csv",
        "text",
      ],
    );
  },
);
