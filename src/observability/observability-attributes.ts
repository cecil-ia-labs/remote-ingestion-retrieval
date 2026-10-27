import type {
  JsonValue,
} from "../domain/source.types.js";

import {
  describeSourceError,
  isAbortedSourceError,
} from "../errors/source-error-classifier.js";

import type {
  ObservabilityAttributes,
  ObservabilityErrorInfo,
} from "./observability.types.js";

export function observabilityAttributes(
  values:
    Readonly<Record<string, JsonValue | undefined>>,
): ObservabilityAttributes {
  const result:
    Record<string, JsonValue> = {};

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      values,
    )
  ) {
    if (
      value !== undefined
    ) {
      result[key] =
        value;
    }
  }

  return Object.freeze(
    result,
  );
}

export function observabilityError(
  value:
    unknown,
): ObservabilityErrorInfo {
  return describeSourceError(
    value,
    {
      includeStack:
        true,
      maxCauseDepth:
        4,
    },
  );
}

export function isAbortError(
  value:
    unknown,
): boolean {
  return isAbortedSourceError(
    value,
  );
}
