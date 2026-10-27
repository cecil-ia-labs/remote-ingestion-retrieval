/**
 * Applies conservative formatting normalization without changing Markdown
 * semantics.
 *
 * In particular, fenced code blocks are treated as opaque regions so blank
 * lines and whitespace inside source code are never rewritten.
 */
export function normalizeMarkdown(
  markdown: string,
): string {
  const source =
    markdown
      .replace(
        /\r\n?/g,
        "\n",
      );

  const lines =
    source.split("\n");

  const output:
    string[] = [];

  let insideFence =
    false;

  let fenceMarker =
    "";

  let pendingBlankLines =
    0;

  const flushBlankLines =
    (): void => {
      if (
        pendingBlankLines === 0
      ) {
        return;
      }

      // Canonical Markdown uses at most one empty line between blocks.
      output.push("");

      pendingBlankLines =
        0;
    };

  for (
    const originalLine
    of lines
  ) {
    const fenceMatch =
      originalLine.match(
        /^\s*(`{3,}|~{3,})/,
      );

    if (
      fenceMatch
      && fenceMatch[1]
    ) {
      if (!insideFence) {
        flushBlankLines();

        insideFence =
          true;

        fenceMarker =
          fenceMatch[1][0]
          ?? "";

        output.push(
          originalLine
            .replace(
              /[ \t]+$/g,
              "",
            ),
        );

        continue;
      }

      if (
        fenceMatch[1][0]
        === fenceMarker
      ) {
        output.push(
          originalLine
            .replace(
              /[ \t]+$/g,
              "",
            ),
        );

        insideFence =
          false;

        fenceMarker =
          "";

        continue;
      }
    }

    if (insideFence) {
      output.push(
        originalLine,
      );

      continue;
    }

    let line =
      originalLine.replace(
        /[ \t]+$/g,
        "",
      );

    // Turndown intentionally emits CommonMark list padding such as
    // `-   item` and `1.  item`. Canonicalize only the marker line while
    // preserving leading indentation used by nested lists.
    line = line.replace(
      /^(\s*[-+*])\s{2,}/,
      "$1 ",
    );

    line = line.replace(
      /^(\s*\d+\.)\s{2,}/,
      "$1 ",
    );

    // GFM task-list rules may leave two spaces after the checkbox marker.
    line = line.replace(
      /^(\s*(?:[-+*]|\d+\.) \[[ xX]\])\s{2,}/,
      "$1 ",
    );

    if (
      line.trim().length === 0
    ) {
      pendingBlankLines += 1;

      continue;
    }

    flushBlankLines();

    output.push(
      line,
    );
  }

  // Do not materialize trailing pending blank lines.
  return output
    .join("\n")
    .trim();
}
