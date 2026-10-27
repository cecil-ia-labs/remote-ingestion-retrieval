import type {
  JsonValue,
} from "../domain/source.types.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  DOCUMENT_CHUNK_METADATA_SCHEMA_VERSION,
} from "./document-chunk-metadata.js";

import type {
  DocumentChunkMetadata,
} from "./document-chunk-metadata.js";

import type {
  MarkdownSplitSegmentMetadata,
} from "./markdown-splitter.js";

import type {
  MarkdownSourceLocation,
} from "./markdown-source-index.js";

export interface DocumentChunkMetadataBuilderInput {
  readonly document:
    WebDocument;

  readonly splitterName:
    string;

  readonly ordinal:
    number;

  readonly total:
    number;

  readonly markdown:
    string;

  readonly contentHash:
    string;

  readonly byteLength:
    number;

  readonly characterLength:
    number;

  readonly sourceLocation:
    MarkdownSourceLocation;

  readonly segmentMetadata?:
    MarkdownSplitSegmentMetadata;
}

function iso(
  value:
    Date,
): string {
  return value.toISOString();
}

function cloneAttributes(
  value:
    Readonly<Record<string, JsonValue>> | undefined,
): Readonly<Record<string, JsonValue>> | undefined {
  if (!value) {
    return undefined;
  }

  return Object.freeze({
    ...value,
  });
}

function lineMetrics(
  markdown:
    string,
): {
  readonly lineCount:
    number;

  readonly nonEmptyLineCount:
    number;
} {
  if (
    markdown.length === 0
  ) {
    return {
      lineCount:
        0,
      nonEmptyLineCount:
        0,
    };
  }

  const lines =
    markdown.split(
      "\n",
    );

  return {
    lineCount:
      lines.length,
    nonEmptyLineCount:
      lines.filter(
        (line) =>
          line.trim()
            .length > 0,
      ).length,
  };
}

export class DocumentChunkMetadataBuilder {
  build(
    input:
      DocumentChunkMetadataBuilderInput,
  ): DocumentChunkMetadata {
    const document =
      input.document;

    const metrics =
      lineMetrics(
        input.markdown,
      );

    const discovery =
      document.discovery;

    const acquisition =
      document.acquisition;

    return {
      schemaVersion:
        DOCUMENT_CHUNK_METADATA_SCHEMA_VERSION,

      document: {
        id:
          document.id,
        sourceId:
          document.sourceId,
        url:
          document.url,
        canonicalUrl:
          document.canonicalUrl,
        title:
          document.title,
        description:
          document.metadata
            .description,
        language:
          document.metadata
            .language,
        resourceType:
          document.metadata
            .resourceType,
        contentType:
          document.metadata
            .contentType,
        contentHash:
          document.contentHash,
        processedAt:
          iso(
            document.processedAt,
          ),
        etag:
          document.metadata
            .etag,
        lastModified:
          document.metadata
            .lastModified,
        attributes:
          cloneAttributes(
            document.metadata
              .attributes,
          ),
      },

      discovery:
        discovery
          ? {
              method:
                discovery.method,
              url:
                discovery.url,
              originalUrl:
                discovery.originalUrl,
              sitemapUrl:
                discovery.sitemapUrl,
              discoveredFrom:
                discovery.discoveredFrom,
              depth:
                discovery.depth,
              anchorText:
                discovery.anchorText,
              lastModified:
                discovery.lastModified
                  ? iso(
                      discovery.lastModified,
                    )
                  : undefined,
              changeFrequency:
                discovery.changeFrequency,
              priority:
                discovery.priority,
            }
          : undefined,

      acquisition: {
        requestedUrl:
          acquisition.requestedUrl,
        resolvedUrl:
          acquisition.resolvedUrl,
        statusCode:
          acquisition.statusCode,
        contentType:
          acquisition.contentType,
        fetchedByteLength:
          acquisition.fetchedByteLength,
        etag:
          acquisition.etag,
        lastModified:
          acquisition.lastModified,
        fetchedAt:
          iso(
            acquisition.fetchedAt,
          ),
        extractedAt:
          iso(
            acquisition.extractedAt,
          ),
        transport:
          acquisition.transport,
        networkSafety:
          acquisition.networkSafety,
      },

      chunk: {
        ordinal:
          input.ordinal,
        total:
          input.total,
        contentHash:
          input.contentHash,
        byteLength:
          input.byteLength,
        characterLength:
          input.characterLength,
        lineCount:
          metrics.lineCount,
        nonEmptyLineCount:
          metrics.nonEmptyLineCount,
        headingPath:
          Object.freeze([
            ...input.sourceLocation
              .headingPath,
          ]),
        headingLevels:
          Object.freeze([
            ...input.sourceLocation
              .headingLevels,
          ]),
        sourceRange: {
          resolved:
            input.sourceLocation
              .resolved,
          startOffset:
            input.sourceLocation
              .startOffset,
          endOffset:
            input.sourceLocation
              .endOffset,
          startLine:
            input.sourceLocation
              .startLine,
          endLine:
            input.sourceLocation
              .endLine,
        },
      },

      splitter: {
        name:
          input.splitterName,
        attributes:
          cloneAttributes(
            input.segmentMetadata
              ?.attributes,
          ),
      },
    };
  }
}
