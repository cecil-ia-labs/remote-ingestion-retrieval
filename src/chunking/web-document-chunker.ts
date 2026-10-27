import {
  createHash,
} from "node:crypto";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  hashText,
} from "../hashing/content-hasher.js";

import {
  EmptyMarkdownSplitResultError,
  MarkdownSplitterExecutionError,
} from "./chunking.errors.js";

import {
  DocumentChunkMetadataBuilder,
} from "./document-chunk-metadata-builder.js";

import type {
  DocumentChunk,
  DocumentChunkId,
  WebDocumentChunkingResult,
} from "./document-chunk.js";

import type {
  MarkdownSplitSegment,
  MarkdownSplitter,
} from "./markdown-splitter.js";

import {
  MarkdownSourceIndex,
} from "./markdown-source-index.js";

export interface WebDocumentChunkerOptions {
  splitter:
    MarkdownSplitter;

  dropEmptySegments?:
    boolean;

  metadataBuilder?:
    DocumentChunkMetadataBuilder;
}

interface PreparedChunk {
  readonly segment:
    MarkdownSplitSegment;

  readonly ordinal:
    number;

  readonly contentHash:
    string;

  readonly byteLength:
    number;

  readonly characterLength:
    number;
}

function sha256(
  value:
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}

export function createDocumentChunkId(
  documentId:
    string,

  ordinal:
    number,

  contentHash:
    string,
): DocumentChunkId {
  return (
    "webchunk_"
    + sha256(
      `${documentId}\n${ordinal}\n${contentHash}`,
    ).slice(
      0,
      32,
    )
  );
}

export class WebDocumentChunker {
  private readonly splitter:
    MarkdownSplitter;

  private readonly dropEmptySegments:
    boolean;

  private readonly metadataBuilder:
    DocumentChunkMetadataBuilder;

  constructor(
    options:
      WebDocumentChunkerOptions,
  ) {
    this.splitter =
      options.splitter;

    this.dropEmptySegments =
      options.dropEmptySegments
      ?? true;

    this.metadataBuilder =
      options.metadataBuilder
      ?? new DocumentChunkMetadataBuilder();
  }

  async chunk(
    document:
      WebDocument,

    signal?: AbortSignal,
  ): Promise<WebDocumentChunkingResult> {
    let segments:
      readonly MarkdownSplitSegment[];

    try {
      segments =
        await this.splitter.split(
          document.markdown,
          {
            sourceId:
              document.sourceId,
            documentId:
              document.id,
            canonicalUrl:
              document.canonicalUrl,
            title:
              document.title,
            signal,

            documentContentHash:
              document.contentHash,
          },
        );
    } catch (cause) {
      throw new MarkdownSplitterExecutionError(
        this.splitter.name,
        document.id,
        {
          cause,
        },
      );
    }

    const prepared:
      PreparedChunk[] = [];

    let emptySegmentsDropped =
      0;

    for (
      const segment
      of segments
    ) {
      if (
        segment.markdown.trim()
          .length === 0
      ) {
        if (
          this.dropEmptySegments
        ) {
          emptySegmentsDropped +=
            1;

          continue;
        }
      }

      const ordinal =
        prepared.length;

      const contentHash =
        hashText(
          "chunk",
          segment.markdown,
          "markdown",
        ).value;

      prepared.push({
        segment,
        ordinal,
        contentHash,
        byteLength:
          Buffer.byteLength(
            segment.markdown,
            "utf8",
          ),
        characterLength:
          segment.markdown.length,
      });
    }

    if (
      document.markdown.trim()
        .length > 0
      && prepared.length === 0
    ) {
      throw new EmptyMarkdownSplitResultError(
        this.splitter.name,
        document.id,
      );
    }

    const sourceIndex =
      new MarkdownSourceIndex(
        document.markdown,
      );

    const chunks:
      DocumentChunk[] = [];

    let sourceRangesResolved =
      0;

    let sourceRangesUnresolved =
      0;

    for (
      const item
      of prepared
    ) {
      const sourceLocation =
        sourceIndex.locate(
          item.segment.markdown,
          {
            startOffset:
              item.segment.metadata
                ?.startOffset,
            endOffset:
              item.segment.metadata
                ?.endOffset,
            headingPath:
              item.segment.metadata
                ?.headingPath,
            headingLevels:
              item.segment.metadata
                ?.headingLevels,
          },
        );

      if (
        sourceLocation.resolved
      ) {
        sourceRangesResolved +=
          1;
      } else {
        sourceRangesUnresolved +=
          1;
      }

      const metadata =
        this.metadataBuilder.build({
          document,
          splitterName:
            this.splitter.name,
          ordinal:
            item.ordinal,
          total:
            prepared.length,
          markdown:
            item.segment.markdown,
          contentHash:
            item.contentHash,
          byteLength:
            item.byteLength,
          characterLength:
            item.characterLength,
          sourceLocation,
          segmentMetadata:
            item.segment.metadata,
        });

      chunks.push({
        id:
          createDocumentChunkId(
            document.id,
            item.ordinal,
            item.contentHash,
          ),
        sourceId:
          document.sourceId,
        documentId:
          document.id,
        ordinal:
          item.ordinal,
        markdown:
          item.segment.markdown,
        contentHash:
          item.contentHash,
        hash:
          hashText(
            "chunk",
            item.segment.markdown,
            "markdown",
          ),
        byteLength:
          item.byteLength,
        characterLength:
          item.characterLength,
        metadata,
      });
    }

    return {
      sourceId:
        document.sourceId,
      documentId:
        document.id,
      canonicalUrl:
        document.canonicalUrl,
      documentContentHash:
        document.contentHash,
      splitterName:
        this.splitter.name,
      chunks:
        Object.freeze(
          chunks,
        ),
      stats: {
        splitterSegments:
          segments.length,
        emittedChunks:
          chunks.length,
        emptySegmentsDropped,
        sourceRangesResolved,
        sourceRangesUnresolved,
      },
    };
  }
}
