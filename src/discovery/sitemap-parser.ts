import {
  SaxesParser,
} from "saxes";

import type {
  ParsedSitemap,
  SitemapIndexEntry,
  SitemapUrlEntry,
} from "./sitemap.types.js";

import {
  InvalidSitemapError,
  SitemapEntryLimitError,
} from "./website-discovery.errors.js";

export interface SitemapParserOptions {
  maxUrlEntries?:
    number;

  maxSitemapEntries?:
    number;

  maxLocLength?:
    number;

  allowRelativeLocs?:
    boolean;
}

function localName(
  name:
    string,
): string {
  const index =
    name.lastIndexOf(
      ":",
    );

  return (
    index >= 0
      ? name.slice(
          index + 1,
        )
      : name
  ).toLowerCase();
}

function parseDate(
  value:
    string | undefined,
): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date =
    new Date(
      value,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? undefined
    : date;
}

function parsePriority(
  value:
    string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const priority =
    Number(
      value,
    );

  return (
    Number.isFinite(
      priority,
    )
    && priority >= 0
    && priority <= 1
  )
    ? priority
    : undefined;
}

export class SitemapParser {
  private readonly maxUrlEntries:
    number;

  private readonly maxSitemapEntries:
    number;

  private readonly maxLocLength:
    number;

  private readonly allowRelativeLocs:
    boolean;

  constructor(
    options:
      SitemapParserOptions = {},
  ) {
    this.maxUrlEntries =
      options.maxUrlEntries
      ?? 50_000;

    this.maxSitemapEntries =
      options.maxSitemapEntries
      ?? 50_000;

    this.maxLocLength =
      options.maxLocLength
      ?? 2_048;

    this.allowRelativeLocs =
      options.allowRelativeLocs
      ?? true;
  }

  parse(
    xml:
      string,

    sitemapUrl:
      string,
  ): ParsedSitemap {
    const urls:
      SitemapUrlEntry[] = [];

    const sitemaps:
      SitemapIndexEntry[] = [];

    let rootKind:
      "urlset"
      | "sitemapindex"
      | undefined;

    let currentEntry:
      "url"
      | "sitemap"
      | undefined;

    let currentField:
      "loc"
      | "lastmod"
      | "changefreq"
      | "priority"
      | undefined;

    let fieldText =
      "";

    let loc:
      string | undefined;

    let lastmod:
      string | undefined;

    let changefreq:
      string | undefined;

    let priority:
      string | undefined;

    let invalidEntryCount =
      0;

    let parserError:
      Error | undefined;

    const resetEntry =
      (): void => {
        loc =
          undefined;

        lastmod =
          undefined;

        changefreq =
          undefined;

        priority =
          undefined;

        currentField =
          undefined;

        fieldText =
          "";
      };

    const resolveLoc =
      (
        raw:
          string | undefined,
      ): string | undefined => {
        const value =
          raw?.trim();

        if (
          !value
          || value.length
            > this.maxLocLength
        ) {
          return undefined;
        }

        try {
          if (
            !this.allowRelativeLocs
            && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(
              value,
            )
          ) {
            return undefined;
          }

          const url =
            new URL(
              value,
              sitemapUrl,
            );

          if (
            url.protocol !== "http:"
            && url.protocol
              !== "https:"
          ) {
            return undefined;
          }

          return url.toString();
        } catch {
          return undefined;
        }
      };

    const finishUrl =
      (): void => {
        const resolvedLoc =
          resolveLoc(
            loc,
          );

        if (!resolvedLoc) {
          invalidEntryCount += 1;

          resetEntry();

          return;
        }

        if (
          urls.length
          >= this.maxUrlEntries
        ) {
          throw new SitemapEntryLimitError(
            sitemapUrl,
            "url",
            this.maxUrlEntries,
          );
        }

        urls.push({
          loc:
            resolvedLoc,

          lastModified:
            parseDate(
              lastmod,
            ),

          changeFrequency:
            changefreq
              ?.trim()
              || undefined,

          priority:
            parsePriority(
              priority,
            ),
        });

        resetEntry();
      };

    const finishSitemap =
      (): void => {
        const resolvedLoc =
          resolveLoc(
            loc,
          );

        if (!resolvedLoc) {
          invalidEntryCount += 1;

          resetEntry();

          return;
        }

        if (
          sitemaps.length
          >= this.maxSitemapEntries
        ) {
          throw new SitemapEntryLimitError(
            sitemapUrl,
            "sitemap",
            this.maxSitemapEntries,
          );
        }

        sitemaps.push({
          loc:
            resolvedLoc,

          lastModified:
            parseDate(
              lastmod,
            ),
        });

        resetEntry();
      };

    try {
      const parser =
        new SaxesParser({
          xmlns:
            false,
        });

      parser.on(
        "opentag",
        (
          node,
        ) => {
          const name =
            localName(
              node.name,
            );

          if (!rootKind) {
            if (
              name === "urlset"
              || name
                === "sitemapindex"
            ) {
              rootKind =
                name;
            }

            return;
          }

          if (
            rootKind === "urlset"
            && name === "url"
          ) {
            currentEntry =
              "url";

            resetEntry();

            return;
          }

          if (
            rootKind === "sitemapindex"
            && name === "sitemap"
          ) {
            currentEntry =
              "sitemap";

            resetEntry();

            return;
          }

          if (
            currentEntry
            && (
              name === "loc"
              || name === "lastmod"
              || name === "changefreq"
              || name === "priority"
            )
          ) {
            currentField =
              name;

            fieldText =
              "";
          }
        },
      );

      parser.on(
        "text",
        (
          text,
        ) => {
          if (
            currentField
          ) {
            fieldText +=
              text;
          }
        },
      );

      parser.on(
        "cdata",
        (
          text,
        ) => {
          if (
            currentField
          ) {
            fieldText +=
              text;
          }
        },
      );

      parser.on(
        "closetag",
        (
          node,
        ) => {
          const name =
            localName(
              node.name,
            );

          if (
            currentField
            && name === currentField
          ) {
            const value =
              fieldText.trim();

            if (
              currentField === "loc"
            ) {
              loc =
                value;
            } else if (
              currentField === "lastmod"
            ) {
              lastmod =
                value;
            } else if (
              currentField === "changefreq"
            ) {
              changefreq =
                value;
            } else if (
              currentField === "priority"
            ) {
              priority =
                value;
            }

            currentField =
              undefined;

            fieldText =
              "";

            return;
          }

          if (
            currentEntry === "url"
            && name === "url"
          ) {
            finishUrl();

            currentEntry =
              undefined;

            return;
          }

          if (
            currentEntry === "sitemap"
            && name === "sitemap"
          ) {
            finishSitemap();

            currentEntry =
              undefined;
          }
        },
      );

      parser.on(
        "error",
        (
          error,
        ) => {
          parserError =
            error;
        },
      );

      parser.write(
        xml
          .replace(
            /^\uFEFF/,
            "",
          )
          .trimStart(),
      );

      parser.close();

      if (parserError) {
        throw parserError;
      }
    } catch (cause) {
      if (
        cause
        instanceof SitemapEntryLimitError
      ) {
        throw cause;
      }

      throw new InvalidSitemapError(
        sitemapUrl,
        "Malformed XML.",
        {
          cause,
        },
      );
    }

    if (
      rootKind === "urlset"
    ) {
      return {
        kind:
          "urlset",

        urls:
          Object.freeze(
            urls,
          ),

        invalidEntryCount,
      };
    }

    if (
      rootKind === "sitemapindex"
    ) {
      return {
        kind:
          "sitemapindex",

        sitemaps:
          Object.freeze(
            sitemaps,
          ),

        invalidEntryCount,
      };
    }

    throw new InvalidSitemapError(
      sitemapUrl,
      "Unsupported or missing sitemap root element.",
    );
  }
}
