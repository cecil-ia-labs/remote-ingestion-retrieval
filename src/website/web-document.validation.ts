import {
  createHash,
} from "node:crypto";

import type {
  WebDocument,
} from "./web-document.js";

export class InvalidWebDocumentError
  extends Error {
  constructor(
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      new.target.name;
  }
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

export function validateWebDocument(
  document:
    WebDocument,
): void {
  if (
    !document.id
    || !document.sourceId
  ) {
    throw new InvalidWebDocumentError(
      "WebDocument id and sourceId are required.",
    );
  }

  const canonical =
    new URL(
      document.canonicalUrl,
    );

  if (
    canonical.protocol !== "http:"
    && canonical.protocol
      !== "https:"
  ) {
    throw new InvalidWebDocumentError(
      `Unsupported WebDocument canonical URL protocol: ${canonical.protocol}`,
    );
  }

  if (
    document.identity
      .canonicalUrl
    !== document.canonicalUrl
  ) {
    throw new InvalidWebDocumentError(
      "WebDocument canonicalUrl does not match identity.canonicalUrl.",
    );
  }

  const expectedHash =
    sha256(
      document.markdown,
    );

  if (
    expectedHash
    !== document.contentHash
    || expectedHash
      !== document.content.hash
  ) {
    throw new InvalidWebDocumentError(
      "WebDocument Markdown hash is inconsistent with its content.",
    );
  }

  if (
    document.content
      .byteLength
    !== Buffer.byteLength(
      document.markdown,
      "utf8",
    )
  ) {
    throw new InvalidWebDocumentError(
      "WebDocument Markdown byte length is inconsistent.",
    );
  }

  if (
    document.content
      .characterLength
    !== document.markdown.length
  ) {
    throw new InvalidWebDocumentError(
      "WebDocument Markdown character length is inconsistent.",
    );
  }

  if (
    document.artifact
    && document.artifact
      .contentHash
      !== document.contentHash
  ) {
    throw new InvalidWebDocumentError(
      "WebDocument artifact hash does not match document contentHash.",
    );
  }
}

export function isValidWebDocument(
  value:
    WebDocument,
): boolean {
  try {
    validateWebDocument(
      value,
    );

    return true;
  } catch {
    return false;
  }
}
