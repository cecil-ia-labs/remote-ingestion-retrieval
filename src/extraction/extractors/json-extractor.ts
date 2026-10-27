import type {
  JsonValue,
} from "../../domain/index.js";

import type {
  FetchedResource,
} from "../../remote/index.js";

import type {
  ContentExtractionContext,
  ContentExtractor,
} from "../content-extractor.js";

import {
  createDocumentMetadata,
} from "../document-metadata.js";

import type {
  StructuredExtractedDocument,
} from "../extracted-document.js";

import {
  supportsResourceType,
} from "./resource-support.js";

import {
  RemoteTextDecoder,
} from "./text-decoder.js";

export type JsonDocumentMode =
  | "json"
  | "json-lines";

function isJsonLinesContentType(
  contentType?: string,
): boolean {
  return (
    contentType
    === "application/x-ndjson"
    || contentType
      === "application/jsonl"
    || contentType
      === "application/jsonlines"
  );
}

function isJsonLinesPath(
  url: string,
): boolean {
  const pathname =
    new URL(url).pathname
      .toLowerCase();

  return (
    pathname.endsWith(
      ".jsonl",
    )
    || pathname.endsWith(
      ".ndjson",
    )
  );
}

function parseJsonLines(
  text: string,
): JsonValue[] {
  const lines =
    text
      .split(
        /\r?\n/,
      )
      .map(
        (line) =>
          line.trim(),
      )
      .filter(Boolean);

  return lines.map(
    (line, index) => {
      try {
        return JSON.parse(
          line,
        ) as JsonValue;
      } catch (cause) {
        throw new SyntaxError(
          `Invalid JSON Lines document at line ${index + 1}`,
          { cause },
        );
      }
    },
  );
}

export class JsonExtractor
  implements ContentExtractor {
  readonly name =
    "json";

  constructor(
    private readonly decoder =
      new RemoteTextDecoder(),
  ) {}

  supports(
    resource: FetchedResource,
  ): boolean {
    if (
      supportsResourceType(
        resource,
        "json",
        [
          "application/json",
          "text/json",
          "application/x-ndjson",
          "application/jsonl",
          "application/jsonlines",
          "*+json",
        ],
      )
    ) {
      return true;
    }

    return false;
  }

  async extract(
    resource: FetchedResource,
    _context?: ContentExtractionContext,
  ): Promise<StructuredExtractedDocument> {
    const decoded =
      this.decoder.decode(
        resource,
      );

    const mode:
      JsonDocumentMode =
      (
        isJsonLinesContentType(
          resource.resource.contentType,
        )
        || isJsonLinesPath(
          resource.resource.resolvedUrl,
        )
      )
        ? "json-lines"
        : "json";

    let content:
      JsonValue;

    if (
      mode
      === "json-lines"
    ) {
      content =
        parseJsonLines(
          decoded.text,
        );
    } else {
      content =
        JSON.parse(
          decoded.text,
        ) as JsonValue;
    }

    return {
      content,

      contentFormat:
        "structured",

      metadata:
        createDocumentMetadata(
          resource,
          {
            charset:
              decoded.charset,

            attributes: {
              format:
                mode,

              hadBom:
                decoded.hadBom,
            },
          },
        ),
    };
  }
}
