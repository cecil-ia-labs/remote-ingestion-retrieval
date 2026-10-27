import type {
  JsonValue,
} from "../domain/source.types.js";

import {
  SourceIngestionError,
} from "../errors/source-ingestion-error.js";

export class UnsupportedSourceInsertionTypeError
  extends SourceIngestionError {
  constructor(
    sourceType:
      unknown,
  ) {
    const normalized =
      typeof sourceType === "string"
        ? sourceType
        : typeof sourceType;

    super(
      `Unsupported source type for remote source insertion: ${normalized}.`,
      {
        code:
          "INVALID_INPUT",
        category:
          "validation",
        stage:
          "unknown",
        retryability:
          "no",
        details: {
          sourceType:
            normalized as JsonValue,
        },
      },
    );
  }
}
