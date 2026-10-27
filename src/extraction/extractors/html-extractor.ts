import {
  Readability,
} from "@mozilla/readability";

import {
  JSDOM,
} from "jsdom";

import type {
  FetchedResource,
} from "../../remote/index.js";

import type {
  ContentExtractionContext,
  ContentExtractor,
} from "../content-extractor.js";

import {
  createDocumentMetadata,
} from "../document-metadata.js";

import type {
  TextualExtractedDocument,
} from "../extracted-document.js";

import {
  cleanHtmlSubtree,
  normalizedTextLength,
} from "./html-dom-cleaner.js";

import type {
  HtmlExtractionOptions,
  HtmlExtractionStrategy,
} from "./html-extraction.types.js";

import {
  extractHtmlPageMetadata,
} from "./html-metadata.js";

import {
  supportsResourceType,
} from "./resource-support.js";

interface HtmlCandidate {
  element: Element;

  strategy:
    Exclude<
      HtmlExtractionStrategy,
      "readability" | "body"
    >;
}

interface ExtractedHtml {
  html: string;

  strategy:
    HtmlExtractionStrategy;

  textLength:
    number;

  readability?: {
    byline?: string | null;
    dir?: string | null;
    excerpt?: string | null;
    siteName?: string | null;
  };
}

function firstMeaningful(
  elements:
    Iterable<Element>,
  minTextLength: number,
): Element | undefined {
  for (
    const element
    of elements
  ) {
    if (
      normalizedTextLength(
        element,
      )
      >= minTextLength
    ) {
      return element;
    }
  }

  return undefined;
}

export class HtmlExtractor
  implements ContentExtractor {
  readonly name =
    "html";

  private readonly options:
    Required<
      Pick<
        HtmlExtractionOptions,
        | "minSemanticTextLength"
        | "useReadability"
        | "absolutizeUrls"
      >
    >
    & Pick<
      HtmlExtractionOptions,
      "removeSelectors"
    >;

  constructor(
    options:
      HtmlExtractionOptions = {},
  ) {
    this.options = {
      minSemanticTextLength:
        options.minSemanticTextLength
        ?? 80,

      useReadability:
        options.useReadability
        ?? true,

      removeSelectors:
        options.removeSelectors,

      absolutizeUrls:
        options.absolutizeUrls
        ?? true,
    };
  }

  supports(
    resource: FetchedResource,
  ): boolean {
    return supportsResourceType(
      resource,
      "html",
      [
        "text/html",
        "application/xhtml+xml",
      ],
    );
  }

  async extract(
    resource: FetchedResource,
    context: ContentExtractionContext = {},
  ): Promise<TextualExtractedDocument> {
    context.signal?.throwIfAborted();

    const baseUrl =
      resource.resource.resolvedUrl;

    const dom =
      new JSDOM(
        resource.body,
        {
          url:
            baseUrl,

          contentType:
            this.getJsdomContentType(
              resource,
            ),

          /**
           * Scripts are not executed and external resources are not loaded:
           * both are JSDOM defaults, so we intentionally do not enable them.
           */
          includeNodeLocations:
            false,
        },
      );

    try {
      const document =
        dom.window.document;

      const pageMetadata =
        extractHtmlPageMetadata(
          document,
          baseUrl,
        );

      const extracted =
        this.extractMainContent(
          document,
          baseUrl,
          context,
        );

      const attributes = {
        ...pageMetadata.attributes,

        extractionStrategy:
          extracted.strategy,

        extractedTextLength:
          extracted.textLength,

        ...(extracted.readability
          ?.byline
          ? {
              byline:
                extracted.readability
                  .byline,
            }
          : {}),

        ...(extracted.readability
          ?.dir
          ? {
              direction:
                extracted.readability
                  .dir,
            }
          : {}),

        ...(extracted.readability
          ?.excerpt
          ? {
              readabilityExcerpt:
                extracted.readability
                  .excerpt,
            }
          : {}),

        ...(extracted.readability
          ?.siteName
          ? {
              readabilitySiteName:
                extracted.readability
                  .siteName,
            }
          : {}),
      };

      return {
        content:
          extracted.html,

        contentFormat:
          "html",

        metadata:
          createDocumentMetadata(
            resource,
            {
              canonicalUrl:
                pageMetadata
                  .canonicalUrl,

              title:
                pageMetadata
                  .title,

              description:
                pageMetadata
                  .description,

              language:
                pageMetadata
                  .language,

              attributes,
            },
          ),
      };
    } finally {
      dom.window.close();
    }
  }

  private extractMainContent(
    document: Document,
    baseUrl: string,
    context:
      ContentExtractionContext,
  ): ExtractedHtml {
    const semantic =
      this.selectSemanticCandidate(
        document,
      );

    if (semantic) {
      context.signal
        ?.throwIfAborted();

      const cleaned =
        cleanHtmlSubtree(
          semantic.element,
          {
            baseUrl,

            removeSelectors:
              this.options
                .removeSelectors,

            absolutizeUrls:
              this.options
                .absolutizeUrls,
          },
        );

      return {
        html:
          cleaned.outerHTML,

        strategy:
          semantic.strategy,

        textLength:
          normalizedTextLength(
            cleaned,
          ),
      };
    }

    if (
      this.options.useReadability
    ) {
      context.signal
        ?.throwIfAborted();

      const readability =
        this.extractWithReadability(
          document,
          baseUrl,
        );

      if (readability) {
        return readability;
      }
    }

    context.signal
      ?.throwIfAborted();

    return this.extractBody(
      document,
      baseUrl,
    );
  }

  private selectSemanticCandidate(
    document: Document,
  ): HtmlCandidate | undefined {
    const minTextLength =
      this.options
        .minSemanticTextLength;

    const main =
      firstMeaningful(
        Array.from(
          document.querySelectorAll(
            "main",
          ),
        ),
        minTextLength,
      );

    if (main) {
      return {
        element:
          main,

        strategy:
          "main",
      };
    }

    const roleMain =
      firstMeaningful(
        Array.from(
          document.querySelectorAll(
            '[role="main"]',
          ),
        ),
        minTextLength,
      );

    if (roleMain) {
      return {
        element:
          roleMain,

        strategy:
          "role-main",
      };
    }

    const article =
      firstMeaningful(
        Array.from(
          document.querySelectorAll(
            "article",
          ),
        ),
        minTextLength,
      );

    if (article) {
      return {
        element:
          article,

        strategy:
          "article",
      };
    }

    return undefined;
  }

  private extractWithReadability(
    document: Document,
    baseUrl: string,
  ): ExtractedHtml | undefined {
    const clonedDocument =
      document.cloneNode(
        true,
      ) as Document;

    const article =
      new Readability(
        clonedDocument,
      ).parse();

    if (
      !article
      || !article.content
        ?.trim()
    ) {
      return undefined;
    }

    const containerDom =
      new JSDOM(
        `<main data-extractor="readability">${article.content}</main>`,
        {
          url:
            baseUrl,
        },
      );

    try {
      const main =
        containerDom
          .window
          .document
          .querySelector(
            "main",
          );

      if (!main) {
        return undefined;
      }

      /**
       * Readability intentionally returns the article title separately from
       * `article.content`. Semantic extraction paths such as <main> and
       * <article> usually preserve their <h1>, so keep the HTML output shape
       * consistent by restoring the Readability title when no primary
       * heading survived inside the extracted content.
       */
      const readabilityTitle =
        article.title
          ?.trim();

      if (
        readabilityTitle
        && !main.querySelector(
          "h1",
        )
      ) {
        const heading =
          containerDom
            .window
            .document
            .createElement(
              "h1",
            );

        heading.setAttribute(
          "data-extractor-title",
          "readability",
        );

        heading.textContent =
          readabilityTitle;

        main.prepend(
          heading,
        );
      }

      const cleaned =
        cleanHtmlSubtree(
          main,
          {
            baseUrl,

            removeSelectors:
              this.options
                .removeSelectors,

            absolutizeUrls:
              this.options
                .absolutizeUrls,
          },
        );

      const textLength =
        normalizedTextLength(
          cleaned,
        );

      if (textLength === 0) {
        return undefined;
      }

      return {
        html:
          cleaned.innerHTML,

        strategy:
          "readability",

        textLength,

        readability: {
          byline:
            article.byline,

          dir:
            article.dir,

          excerpt:
            article.excerpt,

          siteName:
            article.siteName,
        },
      };
    } finally {
      containerDom.window.close();
    }
  }

  private extractBody(
    document: Document,
    baseUrl: string,
  ): ExtractedHtml {
    const body =
      document.body;

    const cleaned =
      cleanHtmlSubtree(
        body,
        {
          baseUrl,

          removeSelectors:
            this.options
              .removeSelectors,

          absolutizeUrls:
            this.options
              .absolutizeUrls,
        },
      );

    return {
      html:
        cleaned.innerHTML,

      strategy:
        "body",

      textLength:
        normalizedTextLength(
          cleaned,
        ),
    };
  }

  private getJsdomContentType(
    resource: FetchedResource,
  ): string {
    const raw =
      resource.headers[
        "content-type"
      ];

    if (
      raw
      && (
        raw.toLowerCase()
          .startsWith(
            "text/html",
          )
        || raw.toLowerCase()
          .startsWith(
            "application/xhtml+xml",
          )
      )
    ) {
      return raw;
    }

    return (
      resource.resource
        .contentType
      ?? "text/html"
    );
  }
}
