import puppeteer from "puppeteer";

import type {
  Browser,
  LaunchOptions,
} from "puppeteer";

import type {
  PuppeteerPageSession,
  PuppeteerPageSessionFactory,
} from "./puppeteer-page-session.js";

export interface PuppeteerBrowserManagerOptions {
  launchOptions?: LaunchOptions;
}

/**
 * Lazily launches one browser process and creates an isolated BrowserContext
 * for every render operation.
 *
 * Browser processes are expensive; contexts are cheap and keep cookies,
 * localStorage, cache and other page state separated between sources.
 */
export class PuppeteerBrowserManager
  implements PuppeteerPageSessionFactory {
  private browserPromise?:
    Promise<Browser>;

  private readonly launchOptions:
    LaunchOptions;

  constructor(
    options:
      PuppeteerBrowserManagerOptions = {},
  ) {
    this.launchOptions = {
      headless: true,
      ...options.launchOptions,
    };
  }

  async create(
    signal?: AbortSignal,
  ): Promise<PuppeteerPageSession> {
    this.assertNotAborted(
      signal,
    );

    const browser =
      await this.getBrowser();

    this.assertNotAborted(
      signal,
    );

    const context =
      await browser
        .createBrowserContext();

    try {
      const page =
        await context.newPage();

      return {
        page,

        async close() {
          try {
            await context.close();
          } catch {
            // The browser may already be disconnected during process shutdown.
          }
        },
      };
    } catch (cause) {
      await context
        .close()
        .catch(
          () => undefined,
        );

      throw cause;
    }
  }

  async close(): Promise<void> {
    const promise =
      this.browserPromise;

    this.browserPromise =
      undefined;

    if (!promise) {
      return;
    }

    const browser =
      await promise.catch(
        () => undefined,
      );

    if (!browser) {
      return;
    }

    await browser
      .close()
      .catch(
        () => undefined,
      );
  }

  private getBrowser():
    Promise<Browser> {
    if (
      this.browserPromise
    ) {
      return this.browserPromise;
    }

    const promise =
      puppeteer.launch(
        this.launchOptions,
      );

    this.browserPromise =
      promise;

    void promise.then(
      (browser) => {
        browser.once(
          "disconnected",
          () => {
            if (
              this.browserPromise
              === promise
            ) {
              this.browserPromise =
                undefined;
            }
          },
        );
      },
      () => {
        if (
          this.browserPromise
          === promise
        ) {
          this.browserPromise =
            undefined;
        }
      },
    );

    return promise;
  }

  private assertNotAborted(
    signal:
      AbortSignal | undefined,
  ): void {
    if (
      signal?.aborted
    ) {
      throw signal.reason
        ?? new Error(
          "Puppeteer browser session creation aborted.",
        );
    }
  }
}
