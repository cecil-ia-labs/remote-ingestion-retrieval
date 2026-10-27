import type {
  JsonValue,
} from "../domain/source.types.js";

import type {
  DocumentChunk,
} from "../chunking/document-chunk.js";

import type {
  VectorMetadata,
} from "./vector-record.js";

export interface VectorMetadataProjector {
  project(
    chunk:
      DocumentChunk,
  ): VectorMetadata;
}

function toJsonValue(
  value:
    unknown,
): JsonValue {
  const serialized =
    JSON.stringify(
      value,
    );

  if (
    serialized === undefined
  ) {
    return null;
  }

  return JSON.parse(
    serialized,
  ) as JsonValue;
}

/**
 * Rich default projector. The complete Phase 18 chunk metadata remains nested
 * and JSON-safe, while common identifiers are duplicated at the top level for
 * stores that support metadata filtering/indexing.
 */
export class DefaultVectorMetadataProjector
  implements VectorMetadataProjector {
  project(
    chunk:
      DocumentChunk,
  ): VectorMetadata {
    return Object.freeze({
      schemaVersion:
        1,

      chunkId:
        chunk.id,

      sourceId:
        chunk.sourceId,

      documentId:
        chunk.documentId,

      ordinal:
        chunk.ordinal,

      contentHash:
        chunk.contentHash,

      canonicalUrl:
        chunk.metadata
          .document
          .canonicalUrl,

      title:
        chunk.metadata
          .document
          .title
        ?? null,

      language:
        chunk.metadata
          .document
          .language
        ?? null,

      headingPath:
        toJsonValue(
          chunk.metadata
            .chunk
            .headingPath,
        ),

      chunkMetadata:
        toJsonValue(
          chunk.metadata,
        ),
    });
  }
}
