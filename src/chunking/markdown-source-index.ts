export interface MarkdownHeadingEntry {
  readonly level:
    number;

  readonly text:
    string;

  readonly offset:
    number;

  readonly line:
    number;
}

export interface MarkdownSourceLocation {
  readonly resolved:
    boolean;

  readonly startOffset?:
    number;

  readonly endOffset?:
    number;

  readonly startLine?:
    number;

  readonly endLine?:
    number;

  readonly headingPath:
    readonly string[];

  readonly headingLevels:
    readonly number[];
}

export interface ExplicitMarkdownSourceLocation {
  readonly startOffset?:
    number;

  readonly endOffset?:
    number;

  readonly headingPath?:
    readonly string[];

  readonly headingLevels?:
    readonly number[];
}

interface LineEntry {
  readonly text:
    string;

  readonly startOffset:
    number;

  readonly line:
    number;
}

function stripAtxClosingHashes(
  value:
    string,
): string {
  return value
    .replace(
      /\s+#+\s*$/,
      "",
    )
    .trim();
}

function parseMarkdownLines(
  markdown:
    string,
): readonly LineEntry[] {
  const result:
    LineEntry[] = [];

  let offset =
    0;

  const lines =
    markdown.split(
      "\n",
    );

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const text =
      lines[index]
      ?? "";

    result.push({
      text,
      startOffset:
        offset,
      line:
        index + 1,
    });

    offset +=
      text.length;

    if (
      index
      < lines.length - 1
    ) {
      offset +=
        1;
    }
  }

  return result;
}

function parseHeadings(
  markdown:
    string,
): readonly MarkdownHeadingEntry[] {
  const lines =
    parseMarkdownLines(
      markdown,
    );

  const result:
    MarkdownHeadingEntry[] = [];

  let fenced =
    false;

  let fenceMarker:
    "```" | "~~~" | undefined;

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const current =
      lines[index];

    if (!current) {
      continue;
    }

    const fenceMatch =
      /^\s*(```+|~~~+)/.exec(
        current.text,
      );

    if (fenceMatch) {
      const marker =
        fenceMatch[1]
          ?.startsWith(
            "`",
          )
          ? "```"
          : "~~~";

      if (!fenced) {
        fenced =
          true;

        fenceMarker =
          marker;
      } else if (
        fenceMarker
        === marker
      ) {
        fenced =
          false;

        fenceMarker =
          undefined;
      }

      continue;
    }

    if (fenced) {
      continue;
    }

    const atx =
      /^\s{0,3}(#{1,6})\s+(.+?)\s*$/.exec(
        current.text,
      );

    if (atx) {
      const hashes =
        atx[1]
        ?? "#";

      const rawText =
        atx[2]
        ?? "";

      const text =
        stripAtxClosingHashes(
          rawText,
        );

      if (text) {
        result.push({
          level:
            hashes.length,
          text,
          offset:
            current.startOffset,
          line:
            current.line,
        });
      }

      continue;
    }

    const next =
      lines[index + 1];

    if (
      current.text.trim()
      && next
      && /^\s{0,3}(=+|-+)\s*$/.test(
        next.text,
      )
    ) {
      const underline =
        next.text.trim();

      result.push({
        level:
          underline.startsWith(
            "=",
          )
          ? 1
          : 2,
        text:
          current.text.trim(),
        offset:
          current.startOffset,
        line:
          current.line,
      });

      index +=
        1;
    }
  }

  return result;
}

function lineForOffset(
  markdown:
    string,

  offset:
    number,
): number {
  let line =
    1;

  for (
    let index = 0;
    index < offset;
    index += 1
  ) {
    if (
      markdown.charCodeAt(
        index,
      ) === 10
    ) {
      line +=
        1;
    }
  }

  return line;
}

function headingPathAtOffset(
  headings:
    readonly MarkdownHeadingEntry[],

  offset:
    number,
): {
  readonly path:
    readonly string[];

  readonly levels:
    readonly number[];
} {
  const stack =
    new Map<number, string>();

  for (
    const heading
    of headings
  ) {
    if (
      heading.offset
      > offset
    ) {
      break;
    }

    for (
      const level
      of [...stack.keys()]
    ) {
      if (
        level
        >= heading.level
      ) {
        stack.delete(
          level,
        );
      }
    }

    stack.set(
      heading.level,
      heading.text,
    );
  }

  const ordered =
    [...stack.entries()]
      .sort(
        ([a], [b]) =>
          a - b,
      );

  return {
    path:
      Object.freeze(
        ordered.map(
          ([, text]) =>
            text,
        ),
      ),

    levels:
      Object.freeze(
        ordered.map(
          ([level]) =>
            level,
        ),
      ),
  };
}

export class MarkdownSourceIndex {
  private readonly headings:
    readonly MarkdownHeadingEntry[];

  private searchOffset =
    0;

  constructor(
    private readonly markdown:
      string,
  ) {
    this.headings =
      parseHeadings(
        markdown,
      );
  }

  locate(
    segmentMarkdown:
      string,

    explicit:
      ExplicitMarkdownSourceLocation = {},
  ): MarkdownSourceLocation {
    const explicitStart =
      explicit.startOffset;

    const explicitEnd =
      explicit.endOffset;

    if (
      explicitStart !== undefined
      && explicitEnd !== undefined
      && explicitStart >= 0
      && explicitEnd >= explicitStart
      && explicitEnd <= this.markdown.length
    ) {
      this.searchOffset =
        Math.max(
          this.searchOffset,
          explicitEnd,
        );

      const autoHeadings =
        headingPathAtOffset(
          this.headings,
          explicitStart,
        );

      return {
        resolved:
          true,
        startOffset:
          explicitStart,
        endOffset:
          explicitEnd,
        startLine:
          lineForOffset(
            this.markdown,
            explicitStart,
          ),
        endLine:
          lineForOffset(
            this.markdown,
            Math.max(
              explicitStart,
              explicitEnd - 1,
            ),
          ),
        headingPath:
          Object.freeze([
            ...(
              explicit.headingPath
              ?? autoHeadings.path
            ),
          ]),
        headingLevels:
          Object.freeze([
            ...(
              explicit.headingLevels
              ?? autoHeadings.levels
            ),
          ]),
      };
    }

    const startOffset =
      this.markdown.indexOf(
        segmentMarkdown,
        this.searchOffset,
      );

    if (
      startOffset < 0
    ) {
      return {
        resolved:
          false,
        headingPath:
          Object.freeze([
            ...(
              explicit.headingPath
              ?? []
            ),
          ]),
        headingLevels:
          Object.freeze([
            ...(
              explicit.headingLevels
              ?? []
            ),
          ]),
      };
    }

    const endOffset =
      startOffset
      + segmentMarkdown.length;

    this.searchOffset =
      endOffset;

    const autoHeadings =
      headingPathAtOffset(
        this.headings,
        startOffset,
      );

    return {
      resolved:
        true,
      startOffset,
      endOffset,
      startLine:
        lineForOffset(
          this.markdown,
          startOffset,
        ),
      endLine:
        lineForOffset(
          this.markdown,
          Math.max(
            startOffset,
            endOffset - 1,
          ),
        ),
      headingPath:
        Object.freeze([
          ...(
            explicit.headingPath
            ?? autoHeadings.path
          ),
        ]),
      headingLevels:
        Object.freeze([
          ...(
            explicit.headingLevels
            ?? autoHeadings.levels
          ),
        ]),
    };
  }
}
