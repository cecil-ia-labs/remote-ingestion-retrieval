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
  TextualExtractedDocument,
} from "../extracted-document.js";

import {
  supportsResourceType,
} from "./resource-support.js";

export interface PdfProcessorMetadata {
  title?: string;

  description?: string;

  language?: string;

  attributes?:
    Record<string, JsonValue>;
}

export interface PdfMarkdownProcessorResult {
  markdown: string;

  metadata?:
    PdfProcessorMetadata;
}

export interface PdfMarkdownProcessorContext {
  signal?: AbortSignal;

  sourceUrl: string;

  contentType?: string;
}

/**
 * Adapter contract for the PDF → Markdown pipeline that already exists
 * outside this package.
 */
export interface PdfMarkdownProcessor {
  process(
    pdf: Buffer,
    context:
      PdfMarkdownProcessorContext,
  ): Promise<PdfMarkdownProcessorResult>;
}

export class PdfExtractor
  implements ContentExtractor {
  readonly name =
    "pdf";

  constructor(
    private readonly processor:
      PdfMarkdownProcessor,
  ) {}

  supports(
    resource: FetchedResource,
  ): boolean {
    return supportsResourceType(
      resource,
      "pdf",
      [
        "application/pdf",
      ],
    );
  }

  async extract(
    resource: FetchedResource,
    context: ContentExtractionContext = {},
  ): Promise<TextualExtractedDocument> {
    const result =
      await this.processor.process(
        resource.body,
        {
          signal:
            context.signal,

          sourceUrl:
            resource.resource.resolvedUrl,

          contentType:
            resource.resource.contentType,
        },
      );

    return {
      content:
        result.markdown,

      contentFormat:
        "markdown",

      metadata:
        createDocumentMetadata(
          resource,
          {
            title:
              result.metadata
                ?.title,

            description:
              result.metadata
                ?.description,

            language:
              result.metadata
                ?.language,

            attributes: {
              ...result.metadata
                ?.attributes,

              sourceFormat:
                "pdf",
            },
          },
        ),
    };
  }
}
