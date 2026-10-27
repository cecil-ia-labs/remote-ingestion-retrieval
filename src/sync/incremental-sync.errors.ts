export class IncrementalSyncError
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

export class InvalidIncrementalSyncStateError
  extends IncrementalSyncError {}

export class InvalidPipelineRevisionError
  extends IncrementalSyncError {
  constructor() {
    super(
      "pipelineRevision must be a non-empty string.",
    );
  }
}

export class DuplicateIncrementalDocumentIdError
  extends IncrementalSyncError {
  constructor(
    documentId:
      string,
  ) {
    super(
      `Duplicate WebDocument id in incremental sync input: ${documentId}`,
    );
  }
}

export class IncrementalChunkingResultMismatchError
  extends IncrementalSyncError {
  constructor(
    message:
      string,
  ) {
    super(
      message,
    );
  }
}

export class IncrementalSyncAbortedError
  extends IncrementalSyncError {
  constructor() {
    super(
      "Incremental sync was aborted.",
    );
  }
}
