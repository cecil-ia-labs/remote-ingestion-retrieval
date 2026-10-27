import type {
  JsonValue,
} from "../domain/index.js";

import type {
  ExtractedDocument,
} from "./extracted-document.js";

import {
  InvalidExtractedDocumentError,
} from "./content-extractor.errors.js";

const TEXTUAL_FORMATS =
  new Set([
    "markdown",
    "html",
    "text",
  ]);

function isJsonValue(
  value: unknown,
): value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (
    typeof value === "object"
  ) {
    return Object.values(
      value as Record<string, unknown>,
    ).every(isJsonValue);
  }

  return false;
}

export function assertValidExtractedDocument(
  extractorName: string,
  document: ExtractedDocument,
): void {
  if (
    !document
    || typeof document !== "object"
  ) {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "document must be an object",
    );
  }

  if (
    TEXTUAL_FORMATS.has(
      document.contentFormat,
    )
  ) {
    if (
      typeof document.content
      !== "string"
    ) {
      throw new InvalidExtractedDocumentError(
        extractorName,
        `content must be a string for ${document.contentFormat}`,
      );
    }
  } else if (
    document.contentFormat
    === "structured"
  ) {
    if (
      !isJsonValue(document.content)
    ) {
      throw new InvalidExtractedDocumentError(
        extractorName,
        "structured content must be JSON serializable",
      );
    }
  } else {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "unsupported contentFormat",
    );
  }

  const metadata =
    document.metadata;

  if (
    !metadata
    || typeof metadata !== "object"
  ) {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "metadata must be provided",
    );
  }

  if (
    typeof metadata.requestedUrl !== "string"
    || metadata.requestedUrl.length === 0
  ) {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "metadata.requestedUrl must be a non-empty string",
    );
  }

  if (
    typeof metadata.resolvedUrl !== "string"
    || metadata.resolvedUrl.length === 0
  ) {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "metadata.resolvedUrl must be a non-empty string",
    );
  }

  if (
    !Number.isSafeInteger(
      metadata.byteLength,
    )
    || metadata.byteLength < 0
  ) {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "metadata.byteLength must be a non-negative safe integer",
    );
  }

  if (
    !(metadata.fetchedAt instanceof Date)
    || Number.isNaN(
      metadata.fetchedAt.getTime(),
    )
  ) {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "metadata.fetchedAt must be a valid Date",
    );
  }

  if (
    !(metadata.extractedAt instanceof Date)
    || Number.isNaN(
      metadata.extractedAt.getTime(),
    )
  ) {
    throw new InvalidExtractedDocumentError(
      extractorName,
      "metadata.extractedAt must be a valid Date",
    );
  }
}
