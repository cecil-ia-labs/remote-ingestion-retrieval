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

export class TextExtractor
  implements ContentExtractor {
  readonly name =
    "text";

  constructor(
    private readonly decoder =
      new RemoteTextDecoder(),
  ) {}

  supports(
    resource: FetchedResource,
  ): boolean {
    return supportsResourceType(
      resource,
      "text",
      [
        "text/plain",
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
        "text",

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
