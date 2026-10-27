export class DocumentChunkingError
  extends Error {
  constructor(
    message:
      string,

    options?:
      ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      new.target.name;
  }
}

export class MarkdownSplitterExecutionError
  extends DocumentChunkingError {
  constructor(
    public readonly splitterName:
      string,

    public readonly documentId:
      string,

    options?:
      ErrorOptions,
  ) {
    super(
      `Markdown splitter "${splitterName}" failed for document "${documentId}".`,
      options,
    );
  }
}

export class EmptyMarkdownSplitResultError
  extends DocumentChunkingError {
  constructor(
    public readonly splitterName:
      string,

    public readonly documentId:
      string,
  ) {
    super(
      `Markdown splitter "${splitterName}" produced no non-empty chunks for document "${documentId}".`,
    );
  }
}
