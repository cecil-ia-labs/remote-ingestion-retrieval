export interface ParsedRobotsTxt {
  sitemapUrls:
    readonly string[];
}

function stripComment(
  line: string,
): string {
  const index =
    line.indexOf(
      "#",
    );

  return (
    index >= 0
      ? line.slice(
          0,
          index,
        )
      : line
  ).trim();
}

export class RobotsTxtParser {
  parse(
    text: string,
    baseUrl: string,
  ): ParsedRobotsTxt {
    const urls =
      new Set<string>();

    for (
      const rawLine
      of text.split(
        /\r?\n/,
      )
    ) {
      const line =
        stripComment(
          rawLine,
        );

      if (!line) {
        continue;
      }

      const match =
        line.match(
          /^sitemap\s*:\s*(.+)$/i,
        );

      const rawValue =
        match?.[1]
          ?.trim();

      if (!rawValue) {
        continue;
      }

      try {
        urls.add(
          new URL(
            rawValue,
            baseUrl,
          ).toString(),
        );
      } catch {
        // Ignore malformed sitemap directives.
      }
    }

    return {
      sitemapUrls:
        Object.freeze([
          ...urls,
        ]),
    };
  }
}
