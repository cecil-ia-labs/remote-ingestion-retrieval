import type {
  Page,
} from "puppeteer";

export interface PuppeteerPageSession {
  page: Page;

  /**
   * Closes the isolated browser context that owns this page.
   */
  close(): Promise<void>;
}

export interface PuppeteerPageSessionFactory {
  create(
    signal?: AbortSignal,
  ): Promise<PuppeteerPageSession>;

  /**
   * Optional lifecycle hook for shared browser implementations.
   */
  close?(): Promise<void>;
}
