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
  TextualExtractedDocument,
} from "../extracted-document.js";

import {
  supportsResourceType,
} from "./resource-support.js";

import {
  RemoteTextDecoder,
} from "./text-decoder.js";

export class MarkdownExtractor
  implements ContentExtractor {
  readonly name =
    "markdown";

  constructor(
    private readonly decoder =
      new RemoteTextDecoder(),
  ) {}

  supports(
    resource: FetchedResource,
  ): boolean {
    return supportsResourceType(
      resource,
      "markdown",
      [
        "text/markdown",
        "text/x-markdown",
      ],
    );
  }

  async extract(
    resource: FetchedResource,
    _context?: ContentExtractionContext,
  ): Promise<TextualExtractedDocument> {
    const decoded =
      this.decoder.decode(
        resource,
      );

    return {
      content:
        decoded.text,

      contentFormat:
        "markdown",

      metadata:
        createDocumentMetadata(
          resource,
          {
            charset:
              decoded.charset,

            attributes: {
              hadBom:
                decoded.hadBom,
            },
          },
        ),
    };
  }
}
