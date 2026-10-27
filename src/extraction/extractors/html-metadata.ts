import type {
  JsonValue,
} from "../../domain/index.js";

export interface HtmlPageMetadata {
  canonicalUrl?: string;

  title?: string;

  description?: string;

  language?: string;

  attributes:
    Record<string, JsonValue>;
}

function firstMetaContent(
  document: Document,
  selectors:
    readonly string[],
): string | undefined {
  for (
    const selector
    of selectors
  ) {
    const value =
      document
        .querySelector(
          selector,
        )
        ?.getAttribute(
          "content",
        )
        ?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function absoluteUrl(
  value: string | null,
  baseUrl: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(
      value,
      baseUrl,
    ).toString();
  } catch {
    return undefined;
  }
}

export function extractHtmlPageMetadata(
  document: Document,
  baseUrl: string,
): HtmlPageMetadata {
  const canonicalUrl =
    absoluteUrl(
      document
        .querySelector(
          'link[rel~="canonical"]',
        )
        ?.getAttribute(
          "href",
        )
      ?? null,
      baseUrl,
    );

  const title =
    firstMetaContent(
      document,
      [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
      ],
    )
    ?? document.title
      ?.trim()
    ?? undefined;

  const description =
    firstMetaContent(
      document,
      [
        'meta[name="description"]',
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
      ],
    );

  const language =
    document.documentElement
      .getAttribute(
        "lang",
      )
      ?.trim()
    || firstMetaContent(
      document,
      [
        'meta[http-equiv="content-language"]',
      ],
    );

  const siteName =
    firstMetaContent(
      document,
      [
        'meta[property="og:site_name"]',
      ],
    );

  const author =
    firstMetaContent(
      document,
      [
        'meta[name="author"]',
        'meta[property="article:author"]',
      ],
    );

  const publishedTime =
    firstMetaContent(
      document,
      [
        'meta[property="article:published_time"]',
      ],
    );

  const modifiedTime =
    firstMetaContent(
      document,
      [
        'meta[property="article:modified_time"]',
      ],
    );

  const attributes:
    Record<string, JsonValue> = {};

  if (siteName) {
    attributes.siteName =
      siteName;
  }

  if (author) {
    attributes.author =
      author;
  }

  if (publishedTime) {
    attributes.publishedTime =
      publishedTime;
  }

  if (modifiedTime) {
    attributes.modifiedTime =
      modifiedTime;
  }

  return {
    canonicalUrl,
    title,
    description,
    language:
      language || undefined,
    attributes,
  };
}
