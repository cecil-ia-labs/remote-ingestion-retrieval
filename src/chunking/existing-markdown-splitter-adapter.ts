import type {
  MarkdownSplitSegment,
  MarkdownSplitSegmentMetadata,
  MarkdownSplitter,
  MarkdownSplitterContext,
} from "./markdown-splitter.js";

export type Awaitable<T> =
  T | Promise<T>;

export interface ExistingMarkdownSplitterAdapterOptions<TChunk = string> {
  name?:
    string;

  split:
    (
      markdown:
        string,

      context:
        MarkdownSplitterContext,
    ) => Awaitable<readonly TChunk[]>;

  toMarkdown?:
    (
      chunk:
        TChunk,

      index:
        number,
    ) => string;

  /**
   * Optional bridge for metadata already produced by the host splitter.
   */
  toMetadata?:
    (
      chunk:
        TChunk,

      index:
        number,
    ) => MarkdownSplitSegmentMetadata | undefined;
}

export class ExistingMarkdownSplitterAdapter<TChunk = string>
  implements MarkdownSplitter {
  readonly name:
    string;

  private readonly splitExisting:
    ExistingMarkdownSplitterAdapterOptions<TChunk>["split"];

  private readonly toMarkdown?:
    ExistingMarkdownSplitterAdapterOptions<TChunk>["toMarkdown"];

  private readonly toMetadata?:
    ExistingMarkdownSplitterAdapterOptions<TChunk>["toMetadata"];

  constructor(
    options:
      ExistingMarkdownSplitterAdapterOptions<TChunk>,
  ) {
    this.name =
      options.name
      ?? "existing-markdown-splitter";

    this.splitExisting =
      options.split;

    this.toMarkdown =
      options.toMarkdown;

    this.toMetadata =
      options.toMetadata;
  }

  async split(
    markdown:
      string,

    context:
      MarkdownSplitterContext,
  ): Promise<readonly MarkdownSplitSegment[]> {
    const chunks =
      await this.splitExisting(
        markdown,
        context,
      );

    return chunks.map(
      (
        chunk,
        index,
      ) => {
        const metadata =
          this.toMetadata?.(
            chunk,
            index,
          );

        return {
          markdown:
            this.normalizeChunk(
              chunk,
              index,
            ),

          ...(metadata
            ? {
                metadata,
              }
            : {}),
        };
      },
    );
  }

  private normalizeChunk(
    chunk:
      TChunk,

    index:
      number,
  ): string {
    if (
      this.toMarkdown
    ) {
      return this.toMarkdown(
        chunk,
        index,
      );
    }

    if (
      typeof chunk
      === "string"
    ) {
      return chunk;
    }

    throw new TypeError(
      "ExistingMarkdownSplitterAdapter requires toMarkdown when the existing splitter does not return strings.",
    );
  }
}
