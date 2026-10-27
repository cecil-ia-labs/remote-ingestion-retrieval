import type {
  FetchedResource,
} from "../remote/index.js";

import {
  hashExtractedDocument,
} from "../hashing/content-hasher.js";

import type {
  ContentExtractionContext,
  ContentExtractor,
} from "./content-extractor.js";

import {
  ContentExtractionAbortedError,
  ContentExtractionError,
  DuplicateContentExtractorError,
  NoContentExtractorError,
} from "./content-extractor.errors.js";

import type {
  ExtractedDocument,
} from "./extracted-document.js";

import {
  assertValidExtractedDocument,
} from "./extracted-document.validation.js";

export class ContentExtractorRegistry {
  private readonly extractors:
    readonly ContentExtractor[];

  constructor(
    extractors:
      readonly ContentExtractor[] = [],
  ) {
    this.assertUniqueNames(
      extractors,
    );

    /**
     * Registry order defines precedence.
     *
     * The first extractor whose supports() returns true wins.
     */
    this.extractors =
      Object.freeze([
        ...extractors,
      ]);
  }

  get registeredExtractors():
    readonly ContentExtractor[] {
    return this.extractors;
  }

  find(
    resource: FetchedResource,
  ): ContentExtractor | undefined {
    return this.extractors.find(
      (extractor) =>
        extractor.supports(resource),
    );
  }

  findAll(
    resource: FetchedResource,
  ): readonly ContentExtractor[] {
    return this.extractors.filter(
      (extractor) =>
        extractor.supports(resource),
    );
  }

  require(
    resource: FetchedResource,
  ): ContentExtractor {
    const extractor =
      this.find(resource);

    if (!extractor) {
      throw new NoContentExtractorError(
        resource,
      );
    }

    return extractor;
  }

  async extract(
    resource: FetchedResource,
    context: ContentExtractionContext = {},
  ): Promise<ExtractedDocument> {
    if (context.signal?.aborted) {
      throw new ContentExtractionAbortedError(
        resource.resource.resolvedUrl,
      );
    }

    const extractor =
      this.require(resource);

    let document:
      ExtractedDocument;

    try {
      document =
        await extractor.extract(
          resource,
          context,
        );
    } catch (cause) {
      throw new ContentExtractionError(
        extractor.name,
        resource.resource.resolvedUrl,
        { cause },
      );
    }

    assertValidExtractedDocument(
      extractor.name,
      document,
    );

    return {
      ...document,
      contentHash:
        document.contentHash
        ?? hashExtractedDocument(
          document,
        ),
    };
  }

  private assertUniqueNames(
    extractors:
      readonly ContentExtractor[],
  ): void {
    const names =
      new Set<string>();

    for (
      const extractor
      of extractors
    ) {
      if (
        names.has(
          extractor.name,
        )
      ) {
        throw new DuplicateContentExtractorError(
          extractor.name,
        );
      }

      names.add(
        extractor.name,
      );
    }
  }
}
