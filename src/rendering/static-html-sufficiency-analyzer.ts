import {
  JSDOM,
} from "jsdom";

import type {
  HtmlSufficiencyAnalyzer,
  HtmlSufficiencyMetrics,
  HtmlSufficiencyReason,
  HtmlSufficiencyReport,
  StaticHtmlSufficiencyAnalyzerOptions,
} from "./html-sufficiency.types.js";

const SEMANTIC_SELECTORS =
  [
    "main",
    '[role="main"]',
    "article",
  ] as const;

const SHELL_SELECTORS =
  [
    "#root",
    "#app",
    "#__next",
    "#__nuxt",
    "[data-reactroot]",
    "[data-react-root]",
    "[data-v-app]",
  ] as const;

const NOISE_SELECTOR =
  [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
  ].join(",");

const JAVASCRIPT_REQUIRED_PATTERNS =
  [
    /enable\s+javascript/i,
    /javascript\s+(?:is\s+)?required/i,
    /requires?\s+javascript/i,
    /please\s+turn\s+on\s+javascript/i,
    /you\s+need\s+to\s+enable\s+javascript/i,
  ] as const;

function normalizeText(
  value: string | null | undefined,
): string {
  return (
    value
      ?.replace(
        /\s+/g,
        " ",
      )
      .trim()
    ?? ""
  );
}

function visibleTextLength(
  element: Element,
): number {
  const clone =
    element.cloneNode(
      true,
    ) as Element;

  for (
    const noise
    of Array.from(
      clone.querySelectorAll(
        NOISE_SELECTOR,
      ),
    )
  ) {
    noise.remove();
  }

  return normalizeText(
    clone.textContent,
  ).length;
}

function clampScore(
  score: number,
): number {
  return Math.max(
    0,
    Math.min(
      100,
      score,
    ),
  );
}

export class StaticHtmlSufficiencyAnalyzer
  implements HtmlSufficiencyAnalyzer {
  private readonly options:
    Required<
      StaticHtmlSufficiencyAnalyzerOptions
    >;

  constructor(
    options:
      StaticHtmlSufficiencyAnalyzerOptions = {},
  ) {
    this.options = {
      minSemanticTextLength:
        options.minSemanticTextLength
        ?? 120,

      minBodyTextLength:
        options.minBodyTextLength
        ?? 350,

      lowTextThreshold:
        options.lowTextThreshold
        ?? 80,

      minContentElementCount:
        options.minContentElementCount
        ?? 4,

      scriptHeavyThreshold:
        options.scriptHeavyThreshold
        ?? 5,

      sufficientScore:
        options.sufficientScore
        ?? 50,
    };
  }

  analyze(
    html: string | Buffer,
    baseUrl =
      "https://example.invalid/",
  ): HtmlSufficiencyReport {
    const dom =
      new JSDOM(
        html,
        {
          url:
            baseUrl,

          includeNodeLocations:
            false,
        },
      );

    try {
      const document =
        dom.window.document;

      const body =
        document.body;

      const bodyTextLength =
        body
          ? visibleTextLength(
              body,
            )
          : 0;

      let semanticTextLength =
        0;

      for (
        const selector
        of SEMANTIC_SELECTORS
      ) {
        for (
          const element
          of Array.from(
            document.querySelectorAll(
              selector,
            ),
          )
        ) {
          semanticTextLength =
            Math.max(
              semanticTextLength,
              visibleTextLength(
                element,
              ),
            );
        }
      }

      const shellRoots =
        SHELL_SELECTORS.flatMap(
          (selector) =>
            Array.from(
              document.querySelectorAll(
                selector,
              ),
            ),
        );

      const shellRootTextLength =
        shellRoots.reduce(
          (
            maximum,
            element,
          ) =>
            Math.max(
              maximum,
              visibleTextLength(
                element,
              ),
            ),
          0,
        );

      const headingCount =
        document.querySelectorAll(
          "h1,h2,h3,h4,h5,h6",
        ).length;

      const paragraphCount =
        document.querySelectorAll(
          "p",
        ).length;

      const listItemCount =
        document.querySelectorAll(
          "li",
        ).length;

      const codeBlockCount =
        document.querySelectorAll(
          "pre,code",
        ).length;

      const tableCount =
        document.querySelectorAll(
          "table",
        ).length;

      const contentElementCount =
        headingCount
        + paragraphCount
        + listItemCount
        + codeBlockCount
        + tableCount;

      const scriptCount =
        document.querySelectorAll(
          "script",
        ).length;

      const metrics:
        HtmlSufficiencyMetrics = {
        bodyTextLength,

        semanticTextLength,

        headingCount,

        paragraphCount,

        listItemCount,

        codeBlockCount,

        tableCount,

        contentElementCount,

        scriptCount,

        shellRootCount:
          shellRoots.length,

        shellRootTextLength,
      };

      const reasons:
        HtmlSufficiencyReason[] = [];

      let score =
        0;

      if (
        semanticTextLength
        >= this.options
          .minSemanticTextLength
      ) {
        reasons.push(
          "semantic-content",
        );

        score += 60;
      }

      if (
        bodyTextLength
        >= this.options
          .minBodyTextLength
      ) {
        reasons.push(
          "body-text",
        );

        score += 35;
      }

      if (
        contentElementCount
        >= this.options
          .minContentElementCount
      ) {
        reasons.push(
          "content-structure",
        );

        score += 20;
      }

      if (
        bodyTextLength === 0
      ) {
        reasons.push(
          "empty-body",
        );

        score -= 80;
      } else if (
        bodyTextLength
        < this.options
          .lowTextThreshold
      ) {
        reasons.push(
          "low-text",
        );

        score -= 35;
      }

      const hasAppShell =
        shellRoots.length > 0
        && shellRootTextLength
          < this.options
            .lowTextThreshold
        && bodyTextLength
          < this.options
            .minBodyTextLength;

      if (hasAppShell) {
        reasons.push(
          "app-shell",
        );

        score -= 55;
      }

      /**
       * Inspect user-visible fallback text and <noscript>, but never script
       * source text. A JavaScript bundle may itself contain phrases such as
       * "enable JavaScript", which must not trigger browser rendering.
       */
      const hintText =
        [
          body
            ? (() => {
                const clone =
                  body.cloneNode(
                    true,
                  ) as Element;

                for (
                  const element
                  of Array.from(
                    clone.querySelectorAll(
                      "script,style,template,svg,canvas",
                    ),
                  )
                ) {
                  element.remove();
                }

                return normalizeText(
                  clone.textContent,
                );
              })()
            : "",

          ...Array.from(
            document.querySelectorAll(
              "noscript",
            ),
          ).map(
            (element) =>
              normalizeText(
                element.textContent,
              ),
          ),
        ].join(" ");

      const javascriptRequired =
        JAVASCRIPT_REQUIRED_PATTERNS
          .some(
            (pattern) =>
              pattern.test(
                hintText,
              ),
          );

      if (javascriptRequired) {
        reasons.push(
          "javascript-required-hint",
        );

        score -= 45;
      }

      if (
        scriptCount
        >= this.options
          .scriptHeavyThreshold
        && bodyTextLength
          < this.options
            .minBodyTextLength
      ) {
        reasons.push(
          "script-heavy-low-text",
        );

        score -= 25;
      }

      const normalizedScore =
        clampScore(
          score,
        );

      return {
        sufficient:
          normalizedScore
          >= this.options
            .sufficientScore,

        score:
          normalizedScore,

        reasons:
          Object.freeze([
            ...reasons,
          ]),

        metrics,
      };
    } finally {
      dom.window.close();
    }
  }
}
