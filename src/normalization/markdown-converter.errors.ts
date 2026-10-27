export class MarkdownConverterError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class UnsupportedExtractedDocumentError
  extends MarkdownConverterError {}

export class MarkdownConversionError
  extends MarkdownConverterError {
  constructor(
    public readonly converterName: string,
    public readonly url: string,
    options?: ErrorOptions,
  ) {
    super(
      `Markdown converter "${converterName}" failed for ${url}`,
      options,
    );
  }
}

export class MarkdownConversionAbortedError
  extends MarkdownConverterError {
  constructor(
    public readonly url: string,
  ) {
    super(
      `Markdown conversion aborted: ${url}`,
    );
  }
}
