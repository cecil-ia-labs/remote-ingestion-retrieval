const SENSITIVE_QUERY_NAMES =
  new Set([
    "access_token",
    "token",
    "id_token",
    "refresh_token",
    "api_key",
    "apikey",
    "key",
    "signature",
    "sig",
    "authorization",
    "auth",
    "password",
    "passwd",
    "secret",
    "client_secret",
    "code",
    "session",
    "session_id",
    "jwt",
  ]);

const REDACTED =
  "[REDACTED]";

export function sanitizeErrorUrl(
  value:
    string,
): string {
  try {
    const url =
      new URL(
        value,
      );

    url.username =
      "";

    url.password =
      "";

    for (
      const key
      of [
        ...url.searchParams.keys(),
      ]
    ) {
      if (
        SENSITIVE_QUERY_NAMES.has(
          key.toLowerCase(),
        )
      ) {
        url.searchParams.set(
          key,
          REDACTED,
        );
      }
    }

    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeUrlToken(
  token:
    string,
): string {
  const trailing =
    token.match(
      /[),.;\]}]+$/,
    )?.[0]
    ?? "";

  const raw =
    trailing
      ? token.slice(
          0,
          -trailing.length,
        )
      : token;

  return sanitizeErrorUrl(
    raw,
  ) + trailing;
}

export function sanitizeErrorText(
  value:
    string,
): string {
  return value.replace(
    /https?:\/\/[^\s"'<>]+/giu,
    sanitizeUrlToken,
  );
}
