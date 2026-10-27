import type {
  IncomingHttpHeaders,
} from "node:http";

export function normalizeHttpHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (
    const [key, value]
    of Object.entries(headers)
  ) {
    if (value === undefined) {
      continue;
    }

    result[key.toLowerCase()] =
      Array.isArray(value)
        ? value.join(", ")
        : value;
  }

  return result;
}

export function getHttpHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value =
    headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function extractHttpContentLength(
  headers: IncomingHttpHeaders,
): number | undefined {
  const contentRange =
    getHttpHeader(
      headers,
      "content-range",
    );

  if (contentRange) {
    const match =
      contentRange.match(
        /\/(\d+)$/,
      );

    if (match) {
      const value = Number(match[1]);

      if (
        Number.isSafeInteger(value)
        && value >= 0
      ) {
        return value;
      }
    }
  }

  const contentLength =
    getHttpHeader(
      headers,
      "content-length",
    );

  if (!contentLength) {
    return undefined;
  }

  const value =
    Number(contentLength);

  return (
    Number.isSafeInteger(value)
    && value >= 0
  )
    ? value
    : undefined;
}
