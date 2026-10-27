import type {
  WebsiteSource,
} from "../domain/website-source.js";

import type {
  NormalizedDocument,
} from "../normalization/normalized-document.js";

import type {
  MarkdownArtifactStore,
} from "../persistence/markdown-artifact-store.js";

import type {
  WebDocumentMaterializationContext,
} from "./web-document-context.js";

import type {
  WebDocument,
} from "./web-document.js";

import {
  WebDocumentFactory,
} from "./web-document-factory.js";

import {
  validateWebDocument,
} from "./web-document.validation.js";

export interface WebsiteDocumentServiceOptions {
  documentFactory?:
    WebDocumentFactory;

  artifactStore:
    MarkdownArtifactStore;
}

export class WebsiteDocumentService {
  private readonly documentFactory:
    WebDocumentFactory;

  private readonly artifactStore:
    MarkdownArtifactStore;

  constructor(
    options:
      WebsiteDocumentServiceOptions,
  ) {
    this.documentFactory =
      options.documentFactory
      ?? new WebDocumentFactory();

    this.artifactStore =
      options.artifactStore;
  }

  async materialize(
    source:
      WebsiteSource,

    normalized:
      NormalizedDocument,

    context:
      WebDocumentMaterializationContext = {},
  ): Promise<WebDocument> {
    const document =
      this.documentFactory.create(
        source,
        normalized,
        context,
      );

    const artifact =
      await this.artifactStore
        .save({
          sourceId:
            document.sourceId,

          documentId:
            document.id,

          canonicalUrl:
            document.canonicalUrl,

          markdown:
            document.markdown,

          contentHash:
            document.contentHash,
        });

    const materialized:
      WebDocument = {
      ...document,

      artifact,
    };

    validateWebDocument(
      materialized,
    );

    return materialized;
  }
}
