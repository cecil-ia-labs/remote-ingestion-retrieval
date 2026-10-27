import type {
  FetchedResource,
} from "../remote/index.js";

export class ContentExtractorRegistryError
  extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class DuplicateContentExtractorError
  extends ContentExtractorRegistryError {
  constructor(
    public readonly extractorName: string,
  ) {
    super(
      `Duplicate content extractor name: ${extractorName}`,
    );
  }
}

export class NoContentExtractorError
  extends ContentExtractorRegistryError {
  constructor(
    resource: FetchedResource,
  ) {
    const type =
      resource.resource.resourceType;

    const contentType =
      resource.resource.contentType
      ?? "unknown";

    super(
      `No content extractor supports ${resource.resource.resolvedUrl} `
      + `(resourceType=${type}, contentType=${contentType})`,
    );
  }
}

export class ContentExtractionError
  extends ContentExtractorRegistryError {
  constructor(
    public readonly extractorName: string,
    public readonly url: string,
    options?: ErrorOptions,
  ) {
    super(
      `Content extractor "${extractorName}" failed for ${url}`,
      options,
    );
  }
}

export class InvalidExtractedDocumentError
  extends ContentExtractorRegistryError {
  constructor(
    public readonly extractorName: string,
    message: string,
  ) {
    super(
      `Content extractor "${extractorName}" returned an invalid document: `
      + message,
    );
  }
}

export class ContentExtractionAbortedError
  extends ContentExtractorRegistryError {
  constructor(
    public readonly url: string,
  ) {
    super(
      `Content extraction aborted: ${url}`,
    );
  }
}
