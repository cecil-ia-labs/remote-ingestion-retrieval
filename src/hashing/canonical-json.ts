import type {
  JsonValue,
} from "../domain/source.types.js";

export function canonicalizeJsonValue(
  value:
    JsonValue,
): JsonValue {
  if (
    value === null
    || typeof value
      !== "object"
  ) {
    return value;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      (item) =>
        canonicalizeJsonValue(
          item,
        ),
    );
  }

  const result:
    Record<string, JsonValue> = {};

  for (
    const key
    of Object.keys(
      value,
    ).sort()
  ) {
    result[key] =
      canonicalizeJsonValue(
        value[key] as JsonValue,
      );
  }

  return result;
}

/**
 * Stable JSON serialization used exclusively for hashing.
 *
 * Object keys are sorted recursively while array order is preserved.
 */
export function canonicalJsonStringify(
  value:
    JsonValue,
): string {
  return JSON.stringify(
    canonicalizeJsonValue(
      value,
    ),
  );
}
