import type {
  SourceErrorCategory,
  SourceErrorCode,
  SourceErrorDetails,
  SourceErrorRetryability,
  SourceErrorStage,
} from "./error-model.types.js";

export interface SourceIngestionErrorOptions {
  readonly code:
    SourceErrorCode;

  readonly category:
    SourceErrorCategory;

  readonly stage:
    SourceErrorStage;

  readonly retryability:
    SourceErrorRetryability;

  readonly aborted?:
    boolean;

  readonly statusCode?:
    number;

  readonly url?:
    string;

  readonly details?:
    SourceErrorDetails;

  readonly cause?:
    unknown;
}

export class SourceIngestionError
  extends Error {
  readonly code:
    SourceErrorCode;

  readonly category:
    SourceErrorCategory;

  readonly stage:
    SourceErrorStage;

  readonly retryability:
    SourceErrorRetryability;

  readonly aborted:
    boolean;

  readonly statusCode?:
    number;

  readonly url?:
    string;

  readonly details?:
    SourceErrorDetails;

  constructor(
    message:
      string,

    options:
      SourceIngestionErrorOptions,
  ) {
    super(
      message,
      options.cause === undefined
        ? undefined
        : {
            cause:
              options.cause,
          },
    );

    this.name =
      new.target.name;

    this.code =
      options.code;

    this.category =
      options.category;

    this.stage =
      options.stage;

    this.retryability =
      options.retryability;

    this.aborted =
      options.aborted
      ?? false;

    this.statusCode =
      options.statusCode;

    this.url =
      options.url;

    this.details =
      options.details;
  }
}
