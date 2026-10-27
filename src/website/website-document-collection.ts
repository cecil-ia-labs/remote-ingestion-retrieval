import type {
  SourceId,
} from "../domain/source.types.js";

import type {
  WebsiteSource,
} from "../domain/website-source.js";

import {
  createSourceUrlCanonicalizer,
} from "../url/source-url-canonicalizer.js";

import type {
  UrlCanonicalizer,
} from "../url/url-canonicalization.js";

import type {
  WebDocument,
  WebDocumentId,
} from "./web-document.js";

export class WebsiteDocumentSourceMismatchError
  extends Error {
  constructor(
    expectedSourceId:
      string,

    actualSourceId:
      string,
  ) {
    super(
      `WebDocument source mismatch: expected "${expectedSourceId}", `
      + `received "${actualSourceId}".`,
    );

    this.name =
      new.target.name;
  }
}

export interface WebsiteDocumentCollectionOptions {
  canonicalizer?:
    UrlCanonicalizer;
}

export class WebsiteDocumentCollection {
  private readonly documents =
    new Map<
      WebDocumentId,
      WebDocument
    >();

  private readonly byUrl =
    new Map<
      string,
      WebDocumentId
    >();

  private readonly canonicalizer?:
    UrlCanonicalizer;

  constructor(
    readonly sourceId:
      SourceId,

    initialDocuments:
      readonly WebDocument[] = [],

    options:
      WebsiteDocumentCollectionOptions = {},
  ) {
    this.canonicalizer =
      options.canonicalizer;

    for (
      const document
      of initialDocuments
    ) {
      this.upsert(
        document,
      );
    }
  }

  static forSource(
    source:
      WebsiteSource,

    initialDocuments:
      readonly WebDocument[] = [],
  ): WebsiteDocumentCollection {
    return new WebsiteDocumentCollection(
      source.id,
      initialDocuments,
      {
        canonicalizer:
          createSourceUrlCanonicalizer(
            source,
          ),
      },
    );
  }

  get size():
    number {
    return this.documents
      .size;
  }

  upsert(
    document:
      WebDocument,
  ): void {
    if (
      document.sourceId
      !== this.sourceId
    ) {
      throw new WebsiteDocumentSourceMismatchError(
        this.sourceId,
        document.sourceId,
      );
    }

    const existing =
      this.documents.get(
        document.id,
      );

    if (existing) {
      this.removeUrlIndexes(
        existing,
      );
    }

    this.documents.set(
      document.id,
      document,
    );

    this.indexUrls(
      document,
    );
  }

  get(
    documentId:
      WebDocumentId,
  ): WebDocument | undefined {
    return this.documents.get(
      documentId,
    );
  }

  getByCanonicalUrl(
    canonicalUrl:
      string,
  ): WebDocument | undefined {
    return this.getByUrl(
      canonicalUrl,
    );
  }

  getByUrl(
    url:
      string,
  ): WebDocument | undefined {
    const candidates =
      new Set<string>([
        url,
      ]);

    if (
      this.canonicalizer
    ) {
      try {
        candidates.add(
          this.canonicalizer
            .canonicalize(
              url,
            ).url,
        );
      } catch {
        // Keep exact lookup as the fallback.
      }
    }

    for (
      const candidate
      of candidates
    ) {
      const id =
        this.byUrl.get(
          candidate,
        );

      if (id) {
        return this.documents.get(
          id,
        );
      }
    }

    return undefined;
  }

  has(
    documentId:
      WebDocumentId,
  ): boolean {
    return this.documents.has(
      documentId,
    );
  }

  remove(
    documentId:
      WebDocumentId,
  ): boolean {
    const document =
      this.documents.get(
        documentId,
      );

    if (!document) {
      return false;
    }

    this.removeUrlIndexes(
      document,
    );

    return this.documents.delete(
      documentId,
    );
  }

  list():
    readonly WebDocument[] {
    return [
      ...this.documents
        .values(),
    ];
  }

  private indexUrls(
    document:
      WebDocument,
  ): void {
    const values = [
      document.url,
      document.canonicalUrl,
      ...document.identity
        .aliases,
    ];

    for (
      const value
      of values
    ) {
      this.byUrl.set(
        value,
        document.id,
      );

      if (
        this.canonicalizer
      ) {
        try {
          this.byUrl.set(
            this.canonicalizer
              .canonicalize(
                value,
              ).url,
            document.id,
          );
        } catch {
          // Exact observed alias remains indexed.
        }
      }
    }
  }

  private removeUrlIndexes(
    document:
      WebDocument,
  ): void {
    for (
      const [
        url,
        id,
      ]
      of this.byUrl
    ) {
      if (
        id
        === document.id
      ) {
        this.byUrl.delete(
          url,
        );
      }
    }
  }
}
