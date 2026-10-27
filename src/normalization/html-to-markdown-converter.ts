import TurndownService from "turndown";

import {
  gfm,
} from "@truto/turndown-plugin-gfm";

import type {
  ExtractedDocument,
  TextualExtractedDocument,
} from "../extraction/extracted-document.js";

import {
  hashText,
} from "../hashing/content-hasher.js";

import type {
  MarkdownConversionContext,
  MarkdownConverter,
} from "./markdown-converter.js";

import {
  MarkdownConversionAbortedError,
  MarkdownConversionError,
  UnsupportedExtractedDocumentError,
} from "./markdown-converter.errors.js";

import {
  normalizeMarkdown,
} from "./markdown-normalizer.js";

import type {
  NormalizedDocument,
} from "./normalized-document.js";

export interface HtmlToMarkdownOptions {
  /**
   * ATX headings are easier to preserve through later Markdown splitters.
   */
  headingStyle?: "setext" | "atx";

  bulletListMarker?:
    "-" | "+" | "*";

  emDelimiter?:
    "_" | "*";

  strongDelimiter?:
    "__" | "**";

  /**
   * Fenced blocks are preferred because they can retain a language hint.
   */
  codeBlockStyle?:
    "indented" | "fenced";

  fence?:
    "```" | "~~~";

  linkStyle?:
    "inlined" | "referenced";

  /**
   * Preserve <br> as explicit Markdown hard breaks.
   */
  br?: string;
}

function isHtmlDocument(
  document: ExtractedDocument,
): document is TextualExtractedDocument {
  return (
    document.contentFormat
    === "html"
  );
}

function findDirectCodeElement(
  node: Element,
): Element | undefined {
  for (
    const child
    of Array.from(
      node.childNodes,
    )
  ) {
    if (
      child.nodeType === 1
      && child.nodeName === "CODE"
    ) {
      return child as Element;
    }
  }

  return undefined;
}

function detectCodeLanguage(
  node: Element,
): string {
  const code =
    findDirectCodeElement(
      node,
    );

  const explicitHints = [
    node.getAttribute(
      "data-language",
    ),

    node.getAttribute(
      "data-lang",
    ),

    node.getAttribute(
      "lang",
    ),

    code?.getAttribute(
      "data-language",
    ),

    code?.getAttribute(
      "data-lang",
    ),

    code?.getAttribute(
      "lang",
    ),
  ];

  for (
    const hint
    of explicitHints
  ) {
    const normalized =
      hint?.trim();

    if (
      normalized
      && /^[A-Za-z0-9_+#.-]+$/.test(
        normalized,
      )
    ) {
      return normalized;
    }
  }

  const classNames = [
    node.className,
    code?.className,
  ]
    .filter(
      (
        value,
      ): value is string =>
        typeof value === "string"
        && value.trim().length > 0,
    );

  for (
    const className
    of classNames
  ) {
    const languageMatch =
      className.match(
        /(?:^|\s)(?:language-|lang-|highlight-source-)([A-Za-z0-9_+#.-]+)/,
      );

    if (
      languageMatch?.[1]
    ) {
      return languageMatch[1];
    }
  }

  return "";
}

function chooseFence(
  code: string,
  preferredFence: string,
): string {
  const marker =
    preferredFence[0]
    ?? "`";

  const matches =
    code.match(
      marker === "`"
        ? /`+/g
        : /~+/g,
    );

  const longest =
    matches
      ?.reduce(
        (
          maximum,
          run,
        ) =>
          Math.max(
            maximum,
            run.length,
          ),
        0,
      )
    ?? 0;

  return marker.repeat(
    Math.max(
      preferredFence.length,
      longest + 1,
    ),
  );
}

function installSemanticRules(
  service: TurndownService,
  preferredFence: string,
): void {
  service.addRule(
    "semantic-pre-code",
    {
      filter(
        node,
      ) {
        return (
          node.nodeName === "PRE"
        );
      },

      replacement(
        _content,
        node,
      ) {
        const element =
          node as Element;

        const codeElement =
          findDirectCodeElement(
            element,
          );

        const raw =
          (
            codeElement
              ?.textContent
            ?? element.textContent
            ?? ""
          )
            .replace(
              /^\n/,
              "",
            )
            .replace(
              /\n$/,
              "",
            );

        const language =
          detectCodeLanguage(
            element,
          );

        const fence =
          chooseFence(
            raw,
            preferredFence,
          );

        return (
          `\n\n${fence}${language}\n`
          + `${raw}\n`
          + `${fence}\n\n`
        );
      },
    },
  );

  /**
   * Keep Markdown-friendly semantic containers transparent.
   *
   * Turndown already handles most unknown block containers this way, but
   * an explicit rule prevents custom extraction wrappers from leaking
   * formatting artifacts if their tag names change later.
   */
  service.addRule(
    "semantic-containers",
    {
      filter: [
        "main",
        "article",
        "section",
      ],

      replacement(
        content,
      ) {
        return (
          `\n\n${content}\n\n`
        );
      },
    },
  );
}

export class HtmlToMarkdownConverter
  implements MarkdownConverter {
  readonly name =
    "html-to-markdown";

  private readonly options:
    Required<HtmlToMarkdownOptions>;

  constructor(
    options:
      HtmlToMarkdownOptions = {},
  ) {
    this.options = {
      headingStyle:
        options.headingStyle
        ?? "atx",

      bulletListMarker:
        options.bulletListMarker
        ?? "-",

      emDelimiter:
        options.emDelimiter
        ?? "*",

      strongDelimiter:
        options.strongDelimiter
        ?? "**",

      codeBlockStyle:
        options.codeBlockStyle
        ?? "fenced",

      fence:
        options.fence
        ?? "```",

      linkStyle:
        options.linkStyle
        ?? "inlined",

      br:
        options.br
        ?? "  ",
    };
  }

  supports(
    document: ExtractedDocument,
  ): boolean {
    return isHtmlDocument(
      document,
    );
  }

  async convert(
    document: ExtractedDocument,
    context: MarkdownConversionContext = {},
  ): Promise<NormalizedDocument> {
    if (
      !isHtmlDocument(
        document,
      )
    ) {
      throw new UnsupportedExtractedDocumentError(
        `Converter "${this.name}" supports only HTML documents.`,
      );
    }

    if (
      context.signal?.aborted
    ) {
      throw new MarkdownConversionAbortedError(
        document.metadata.resolvedUrl,
      );
    }

    try {
      const service =
        new TurndownService({
          headingStyle:
            this.options
              .headingStyle,

          bulletListMarker:
            this.options
              .bulletListMarker,

          emDelimiter:
            this.options
              .emDelimiter,

          strongDelimiter:
            this.options
              .strongDelimiter,

          codeBlockStyle:
            this.options
              .codeBlockStyle,

          fence:
            this.options
              .fence,

          linkStyle:
            this.options
              .linkStyle,

          br:
            this.options
              .br,
        });

      service.use(
        gfm,
      );

      installSemanticRules(
        service,
        this.options.fence,
      );

      context.signal
        ?.throwIfAborted();

      const markdown =
        service.turndown(
          document.content,
        );

      context.signal
        ?.throwIfAborted();

      const normalizedMarkdown =
        normalizeMarkdown(
          markdown,
        );

      return {
        markdown:
          normalizedMarkdown,

        metadata:
          document.metadata,

        contentHash:
          hashText(
            "normalized",
            normalizedMarkdown,
            "markdown",
          ),
      };
    } catch (cause) {
      if (
        context.signal?.aborted
      ) {
        throw new MarkdownConversionAbortedError(
          document.metadata
            .resolvedUrl,
        );
      }

      if (
        cause
        instanceof MarkdownConversionAbortedError
        || cause
          instanceof UnsupportedExtractedDocumentError
      ) {
        throw cause;
      }

      throw new MarkdownConversionError(
        this.name,
        document.metadata
          .resolvedUrl,
        { cause },
      );
    }
  }
}
