import {
  createHash,
} from "node:crypto";

import type {
  JsonValue,
} from "../domain/source.types.js";

import type {
  DocumentChunk,
} from "../chunking/document-chunk.js";

import type {
  ExtractedDocument,
} from "../extraction/extracted-document.js";

import type {
  FetchedResource,
} from "../remote/fetched-resource.js";

import type {
  NormalizedDocument,
} from "../normalization/normalized-document.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  canonicalJsonStringify,
} from "./canonical-json.js";

import type {
  ContentHash,
  ContentHashRepresentation,
  ContentHashStage,
  ContentHashTrace,
} from "./content-hash.js";

function digest(
  bytes:
    Uint8Array,
): string {
  return createHash(
    "sha256",
  )
    .update(
      bytes,
    )
    .digest(
      "hex",
    );
}

function createDescriptor(
  stage:
    ContentHashStage,

  representation:
    ContentHashRepresentation,

  bytes:
    Uint8Array,
): ContentHash {
  return Object.freeze({
    stage,
    algorithm:
      "sha256",
    encoding:
      "hex",
    representation,
    value:
      digest(
        bytes,
      ),
    byteLength:
      bytes.byteLength,
  });
}

function textBytes(
  value:
    string,
): Buffer {
  return Buffer.from(
    value,
    "utf8",
  );
}

export function hashBytes(
  stage:
    ContentHashStage,

  value:
    Uint8Array,
): ContentHash {
  return createDescriptor(
    stage,
    "bytes",
    value,
  );
}

export function hashText(
  stage:
    ContentHashStage,

  value:
    string,

  representation:
    Extract<
      ContentHashRepresentation,
      "utf8" | "markdown"
    > = "utf8",
): ContentHash {
  return createDescriptor(
    stage,
    representation,
    textBytes(
      value,
    ),
  );
}

export function hashCanonicalJson(
  stage:
    ContentHashStage,

  value:
    JsonValue,

  representation:
    Extract<
      ContentHashRepresentation,
      "canonical-json"
      | "web-document-snapshot"
      | "document-chunk-snapshot"
    > = "canonical-json",
): ContentHash {
  return createDescriptor(
    stage,
    representation,
    textBytes(
      canonicalJsonStringify(
        value,
      ),
    ),
  );
}

export function hashFetchedResource(
  resource:
    FetchedResource,
): ContentHash {
  return hashBytes(
    "raw",
    resource.body,
  );
}

export function hashExtractedDocument(
  document:
    ExtractedDocument,
): ContentHash {
  if (
    document.contentFormat
    === "structured"
  ) {
    return hashCanonicalJson(
      "extracted",
      document.content,
    );
  }

  return hashText(
    "extracted",
    document.content,
    "utf8",
  );
}

export function hashNormalizedDocument(
  document:
    NormalizedDocument,
): ContentHash {
  return hashText(
    "normalized",
    document.markdown,
    "markdown",
  );
}

function webDocumentSnapshot(
  document:
    WebDocument,
): JsonValue {
  return {
    id:
      document.id,
    sourceId:
      document.sourceId,
    canonicalUrl:
      document.canonicalUrl,
    contentHash:
      document.contentHash,
    title:
      document.title
      ?? null,
    description:
      document.metadata
        .description
      ?? null,
    language:
      document.metadata
        .language
      ?? null,
    resourceType:
      document.metadata
        .resourceType,
    contentType:
      document.metadata
        .contentType
      ?? null,
    attributes:
      document.metadata
        .attributes
      ?? null,
    discovery:
      document.discovery
        ? {
            method:
              document.discovery.method,
            url:
              document.discovery.url,
            originalUrl:
              document.discovery.originalUrl
              ?? null,
            sitemapUrl:
              document.discovery.sitemapUrl
              ?? null,
            discoveredFrom:
              document.discovery.discoveredFrom
              ?? null,
            depth:
              document.discovery.depth
              ?? null,
            anchorText:
              document.discovery.anchorText
              ?? null,
            lastModified:
              document.discovery.lastModified
                ?.toISOString()
              ?? null,
            changeFrequency:
              document.discovery.changeFrequency
              ?? null,
            priority:
              document.discovery.priority
              ?? null,
          }
        : null,
  };
}

export function hashWebDocumentSnapshot(
  document:
    WebDocument,
): ContentHash {
  return hashCanonicalJson(
    "document",
    webDocumentSnapshot(
      document,
    ),
    "web-document-snapshot",
  );
}

function chunkSnapshot(
  chunk:
    DocumentChunk,
): JsonValue {
  return {
    id:
      chunk.id,
    documentId:
      chunk.documentId,
    contentHash:
      chunk.contentHash,
    ordinal:
      chunk.ordinal,
    document: {
      canonicalUrl:
        chunk.metadata
          .document
          .canonicalUrl,
      title:
        chunk.metadata
          .document
          .title
        ?? null,
      description:
        chunk.metadata
          .document
          .description
        ?? null,
      language:
        chunk.metadata
          .document
          .language
        ?? null,
      resourceType:
        chunk.metadata
          .document
          .resourceType,
      contentType:
        chunk.metadata
          .document
          .contentType
        ?? null,
      documentContentHash:
        chunk.metadata
          .document
          .contentHash,
      attributes:
        chunk.metadata
          .document
          .attributes
        ?? null,
    },
    discovery:
      chunk.metadata.discovery
      ?? null,
    position: {
      total:
        chunk.metadata
          .chunk
          .total,
      headingPath:
        chunk.metadata
          .chunk
          .headingPath,
      headingLevels:
        chunk.metadata
          .chunk
          .headingLevels,
      sourceRange:
        chunk.metadata
          .chunk
          .sourceRange,
    },
    splitter: {
      name:
        chunk.metadata
          .splitter
          .name,
      attributes:
        chunk.metadata
          .splitter
          .attributes
        ?? null,
    },
  } as unknown as JsonValue;
}

export function hashDocumentChunkContent(
  chunk:
    Pick<
      DocumentChunk,
      "markdown"
    >,
): ContentHash {
  return hashText(
    "chunk",
    chunk.markdown,
    "markdown",
  );
}

export function hashDocumentChunkSnapshot(
  chunk:
    DocumentChunk,
): ContentHash {
  return hashCanonicalJson(
    "chunk",
    chunkSnapshot(
      chunk,
    ),
    "document-chunk-snapshot",
  );
}

export interface ContentHashTraceInput {
  fetchedResource?:
    FetchedResource;

  extractedDocument?:
    ExtractedDocument;

  normalizedDocument?:
    NormalizedDocument;

  webDocument?:
    WebDocument;
}

export function createContentHashTrace(
  input:
    ContentHashTraceInput,
): ContentHashTrace {
  return Object.freeze({
    schemaVersion:
      1,
    algorithm:
      "sha256",
    raw:
      input.fetchedResource
        ? input.fetchedResource.contentHash
          ?? hashFetchedResource(
            input.fetchedResource,
          )
        : undefined,
    extracted:
      input.extractedDocument
        ? input.extractedDocument.contentHash
          ?? hashExtractedDocument(
            input.extractedDocument,
          )
        : undefined,
    normalized:
      input.normalizedDocument
        ? input.normalizedDocument.contentHash
          ?? hashNormalizedDocument(
            input.normalizedDocument,
          )
        : undefined,
    document:
      input.webDocument
        ? hashWebDocumentSnapshot(
            input.webDocument,
          )
        : undefined,
  });
}
