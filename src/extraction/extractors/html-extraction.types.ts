export type HtmlExtractionStrategy =
  | "main"
  | "role-main"
  | "article"
  | "readability"
  | "body";

export interface HtmlExtractionOptions {
  /**
   * Minimum visible text length for a semantic DOM candidate (`main`,
   * `[role="main"]` or `article`) to be considered meaningful.
   *
   * This threshold is not applied to the final body fallback.
   */
  minSemanticTextLength?: number;

  /**
   * Whether Mozilla Readability should be attempted after semantic
   * selectors fail.
   *
   * Recommended default: true.
   */
  useReadability?: boolean;

  /**
   * Additional selectors removed from the selected content subtree.
   */
  removeSelectors?: readonly string[];

  /**
   * Convert relative links and media URLs into absolute URLs using the
   * final fetched resource URL as base.
   *
   * Recommended default: true.
   */
  absolutizeUrls?: boolean;
}
