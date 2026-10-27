import assert from "node:assert/strict";

import {
  EventEmitter,
} from "node:events";

import {
  test,
} from "node:test";

import type {
  Frame,
  HTTPResponse,
  Page,
} from "puppeteer";

import type {
  RemoteResource,
  SafeRemoteTarget,
  UrlSafetyPolicy,
} from "../../remote/index.js";

import {
  HtmlRenderingAbortedError,
} from "../html-rendering.errors.js";

import {
  PuppeteerBrowserHtmlRenderer,
} from "../puppeteer-browser-html-renderer.js";

import type {
  PuppeteerPageSessionFactory,
} from "../puppeteer-page-session.js";

class TestSafetyPolicy
  implements UrlSafetyPolicy {
  async validateAndResolve(
    value:
      string | URL,
  ): Promise<SafeRemoteTarget> {
    const url =
      value instanceof URL
        ? new URL(
            value,
          )
        : new URL(
            value,
          );

    return {
      url,

      address:
        "203.0.113.20",

      family:
        4,

      addresses: [
        {
          address:
            "203.0.113.20",

          family:
            4,
        },
      ],
    };
  }
}

class FakePage
  extends EventEmitter {
  private currentUrl =
    "about:blank";

  setDefaultNavigationTimeout(
    _timeout:
      number,
  ): void {}

  setDefaultTimeout(
    _timeout:
      number,
  ): void {}

  async setViewport(
    _viewport: {
      width: number;
      height: number;
    },
  ): Promise<void> {}

  async setRequestInterception(
    _enabled:
      boolean,
  ): Promise<void> {}

  mainFrame():
    Frame {
    return {} as Frame;
  }

  async goto(
    url:
      string,
  ): Promise<HTTPResponse> {
    this.currentUrl =
      "https://example.com/rendered";

    return {
      status:
        () => 200,

      headers:
        () => ({
          "content-type":
            "text/html; charset=utf-8",

          etag:
            '"rendered"',
        }),

      request:
        () => ({
          redirectChain:
            () => [
              {
                url:
                  () => url,
              },
            ],
        }),
    } as unknown as HTTPResponse;
  }

  async waitForSelector(
    _selector:
      string,
  ): Promise<null> {
    return null;
  }

  async waitForNetworkIdle():
    Promise<void> {}

  async content():
    Promise<string> {
    return (
      "<!doctype html>"
      + "<html><body>"
      + "<main><h1>Rendered</h1></main>"
      + "</body></html>"
    );
  }

  url():
    string {
    return this.currentUrl;
  }

}

function createResource():
  RemoteResource {
  return {
    requestedUrl:
      "https://example.com/app",

    resolvedUrl:
      "https://example.com/app",

    redirectChain:
      [],

    statusCode:
      200,

    headers: {
      "content-type":
        "text/html",
    },

    contentType:
      "text/html",

    resourceType:
      "html",

    resourceTypeDetectedBy:
      "content-type",

    resolvedAddress:
      "203.0.113.10",

    resolvedAddressFamily:
      4,
  };
}

test(
  "renders HTML through an injected Puppeteer page session",
  async () => {
    const page =
      new FakePage();

    let closed =
      false;

    const sessionFactory:
      PuppeteerPageSessionFactory = {
      async create() {
        return {
          page:
            page as unknown as Page,

          async close() {
            closed =
              true;
          },
        };
      },
    };

    const renderer =
      new PuppeteerBrowserHtmlRenderer({
        sessionFactory,

        safetyPolicy:
          new TestSafetyPolicy(),

        waitForNetworkIdle:
          false,
      });

    const result =
      await renderer.render(
        createResource(),
      );

    assert.match(
      result.body.toString(
        "utf8",
      ),
      /<h1>Rendered<\/h1>/,
    );

    assert.equal(
      result.resource
        .resolvedUrl,
      "https://example.com/rendered",
    );

    assert.equal(
      result.resource
        .resourceType,
      "html",
    );

    assert.equal(
      result.resource
        .transport,
      "browser",
    );

    assert.equal(
      result.resource
        .networkSafety,
      "dns-validated",
    );

    assert.equal(
      closed,
      true,
    );
  },
);

test(
  "honors an already aborted signal before creating a page",
  async () => {
    let created =
      false;

    const sessionFactory:
      PuppeteerPageSessionFactory = {
      async create() {
        created =
          true;

        throw new Error(
          "should not run",
        );
      },
    };

    const controller =
      new AbortController();

    controller.abort();

    await assert.rejects(
      () =>
        new PuppeteerBrowserHtmlRenderer({
          sessionFactory,

          safetyPolicy:
            new TestSafetyPolicy(),
        }).render(
          createResource(),
          {
            signal:
              controller.signal,
          },
        ),
      HtmlRenderingAbortedError,
    );

    assert.equal(
      created,
      false,
    );
  },
);
