import type {
  WebsiteSyncMaterializationFailure,
} from "./website-sync.types.js";

export class WebsiteSyncError
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

export class WebsiteSyncAbortedError
  extends WebsiteSyncError {
  constructor() {
    super(
      "Website synchronization was aborted.",
    );
  }
}

export class WebsiteSyncMaterializationError
  extends WebsiteSyncError {
  constructor(
    public readonly failures:
      readonly WebsiteSyncMaterializationFailure[],
  ) {
    super(
      `Website synchronization aborted because ${failures.length} discovered document(s) failed to materialize.`,
    );
  }
}

export class WebsiteSyncDocumentCollisionError
  extends WebsiteSyncError {
  constructor(
    public readonly documentId:
      string,

    public readonly firstCanonicalUrl:
      string,

    public readonly secondCanonicalUrl:
      string,
  ) {
    super(
      `Two materialized pages collapsed to WebDocument ${documentId} with different content: ${firstCanonicalUrl} and ${secondCanonicalUrl}.`,
    );
  }
}

export class WebsiteSyncSourceMismatchError
  extends WebsiteSyncError {
  constructor(
    public readonly documentId:
      string,

    public readonly expectedSourceId:
      string,

    public readonly actualSourceId:
      string,
  ) {
    super(
      `Materialized WebDocument ${documentId} belongs to source ${actualSourceId}; expected ${expectedSourceId}.`,
    );
  }
}
