import {
  JSDOM,
} from "jsdom";

import type {
  CrawlLink,
  CrawlLinkExtractionResult,
  CrawlLinkExtractionStats,
} from "./crawl-link.js";

export interface CrawlLinkExtractorOptions {
  respectNofollow?: boolean;
  maxAnchorTextLength?: number;
}

function normalizeAnchorText(
  value: string | null | undefined,
  maxLength: number,
): string | undefined {
  const normalized =
    value
      ?.replace(/\s+/g, " ")
      .trim();

  return normalized
    ? normalized.slice(0, maxLength)
    : undefined;
}

function hasNofollow(
  element: Element,
): boolean {
  return (
    element
      .getAttribute("rel")
      ?.toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .includes("nofollow")
    ?? false
  );
}

export class CrawlLinkExtractor {
  private readonly respectNofollow: boolean;
  private readonly maxAnchorTextLength: number;

  constructor(
    options: CrawlLinkExtractorOptions = {},
  ) {
    this.respectNofollow =
      options.respectNofollow
      ?? true;

    this.maxAnchorTextLength =
      options.maxAnchorTextLength
      ?? 256;
  }

  extract(
    html: string | Buffer,
    pageUrl: string,
  ): CrawlLinkExtractionResult {
    const dom =
      new JSDOM(
        html,
        {
          url: pageUrl,
          includeNodeLocations: false,
        },
      );

    try {
      const stats: CrawlLinkExtractionStats = {
        anchorsInspected: 0,
        invalidLinks: 0,
        unsupportedProtocolLinks: 0,
        nofollowLinks: 0,
        duplicateLinks: 0,
      };

      const links: CrawlLink[] = [];
      const seen = new Set<string>();

      for (
        const element
        of Array.from(
          dom.window.document.querySelectorAll(
            "a[href],area[href]",
          ),
        )
      ) {
        stats.anchorsInspected += 1;

        const rawHref =
          element.getAttribute("href");

        if (!rawHref) {
          stats.invalidLinks += 1;
          continue;
        }

        const nofollow =
          hasNofollow(element);

        if (nofollow) {
          stats.nofollowLinks += 1;

          if (this.respectNofollow) {
            continue;
          }
        }

        let url: URL;

        try {
          url = new URL(
            rawHref,
            dom.window.document.baseURI
              || pageUrl,
          );
        } catch {
          stats.invalidLinks += 1;
          continue;
        }

        if (
          url.protocol !== "http:"
          && url.protocol !== "https:"
        ) {
          stats.unsupportedProtocolLinks += 1;
          continue;
        }

        const normalized =
          url.toString();

        if (seen.has(normalized)) {
          stats.duplicateLinks += 1;
          continue;
        }

        seen.add(normalized);

        links.push({
          url: normalized,
          text: normalizeAnchorText(
            element.textContent,
            this.maxAnchorTextLength,
          ),
          nofollow,
        });
      }

      return {
        links: Object.freeze(links),
        stats,
      };
    } finally {
      dom.window.close();
    }
  }
}
