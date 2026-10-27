import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  FetchedResource,
  RemoteResource,
} from "../../remote/index.js";

import type {
  BrowserHtmlRenderer,
} from "../browser-html-renderer.js";

import {
  BrowserRendererUnavailableError,
  HtmlRenderingAbortedError,
  UnsupportedHtmlRenderingResourceError,
} from "../html-rendering.errors.js";

import {
  HtmlRenderingOrchestrator,
} from "../html-rendering-orchestrator.js";

function createHtmlResource(
  html:
    string,

  url =
    "https://example.com/docs",
): FetchedResource {
  const body =
    Buffer.from(
      html,
      "utf8",
    );

  return {
    resource: {
      requestedUrl:
        url,

      resolvedUrl:
        url,

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

      contentLength:
        body.byteLength,

      resourceType:
        "html",

      resourceTypeDetectedBy:
        "content-type",

      resolvedAddress:
        "203.0.113.10",

      resolvedAddressFamily:
        4,
    },

    body,

    byteLength:
      body.byteLength,

    headers: {
      "content-type":
        "text/html",
    },

    fetchedAt:
      new Date(
        "2026-09-15T20:30:00.000Z",
      ),
  };
}

function createBrowserRenderer(
  html:
    string,
): {
  renderer:
    BrowserHtmlRenderer;

  getCalls:
    () => number;
} {
  let calls =
    0;

  const renderer:
    BrowserHtmlRenderer = {
    async render(
      resource:
        RemoteResource,
    ) {
      calls += 1;

      const fetched =
        createHtmlResource(
          html,
          resource.resolvedUrl,
        );

      return {
        ...fetched,

        resource: {
          ...fetched.resource,

          requestedUrl:
            resource.requestedUrl,
        },
      };
    },
  };

  return {
    renderer,

    getCalls:
      () => calls,
  };
}

test(
  "forced http returns the original fetched resource without browser rendering",
  async () => {
    const browser =
      createBrowserRenderer(
        "<html><body>browser</body></html>",
      );

    const http =
      createHtmlResource(
        "<html><body>http</body></html>",
      );

    const result =
      await new HtmlRenderingOrchestrator({
        browserRenderer:
          browser.renderer,
      }).render(
        http,
        "http",
      );

    assert.equal(
      result.resource,
      http,
    );

    assert.equal(
      result.decision.reason,
      "forced-http",
    );

    assert.equal(
      browser.getCalls(),
      0,
    );
  },
);

test(
  "forced browser delegates to BrowserHtmlRenderer",
  async () => {
    const browser =
      createBrowserRenderer(
        `
        <html>
          <body>
            <main>
              <h1>Rendered</h1>
            </main>
          </body>
        </html>
        `,
      );

    const result =
      await new HtmlRenderingOrchestrator({
        browserRenderer:
          browser.renderer,
      }).render(
        createHtmlResource(
          "<html><body>HTTP shell</body></html>",
        ),
        "browser",
      );

    assert.equal(
      result.decision.reason,
      "forced-browser",
    );

    assert.equal(
      browser.getCalls(),
      1,
    );

    assert.match(
      result.resource
        .body
        .toString(
          "utf8",
        ),
      /Rendered/,
    );
  },
);

test(
  "auto keeps sufficiently rich static HTML",
  async () => {
    const browser =
      createBrowserRenderer(
        "<html><body>browser</body></html>",
      );

    const http =
      createHtmlResource(
        `
        <html>
          <body>
            <main>
              <h1>Static documentation</h1>
              <p>
                This static page already contains enough server-rendered
                content for extraction and should not require Chromium.
                It includes meaningful explanatory text for retrieval.
              </p>
              <p>
                Additional content makes the semantic region comfortably
                exceed the automatic sufficiency threshold.
              </p>
            </main>
          </body>
        </html>
        `,
      );

    const result =
      await new HtmlRenderingOrchestrator({
        browserRenderer:
          browser.renderer,
      }).render(
        http,
        "auto",
      );

    assert.equal(
      result.decision
        .resolvedStrategy,
      "http",
    );

    assert.equal(
      result.decision.reason,
      "static-html-sufficient",
    );

    assert.equal(
      browser.getCalls(),
      0,
    );
  },
);

test(
  "auto falls back to browser for an empty application shell",
  async () => {
    const browser =
      createBrowserRenderer(
        `
        <html>
          <body>
            <main>
              <h1>Rendered application</h1>
              <p>The browser produced the real content.</p>
            </main>
          </body>
        </html>
        `,
      );

    const result =
      await new HtmlRenderingOrchestrator({
        browserRenderer:
          browser.renderer,
      }).render(
        createHtmlResource(
          `
          <html>
            <body>
              <div id="root"></div>
              <script src="/app.js"></script>
            </body>
          </html>
          `,
        ),
        "auto",
      );

    assert.equal(
      result.decision
        .resolvedStrategy,
      "browser",
    );

    assert.equal(
      result.decision.reason,
      "static-html-insufficient",
    );

    assert.equal(
      browser.getCalls(),
      1,
    );

    assert.ok(
      result.decision.analysis
        ?.reasons.includes(
          "app-shell",
        ),
    );
  },
);

test(
  "throws when browser rendering is required but no renderer is configured",
  async () => {
    await assert.rejects(
      () =>
        new HtmlRenderingOrchestrator()
          .render(
            createHtmlResource(
              `
              <html>
                <body>
                  <div id="root"></div>
                  <script src="/app.js"></script>
                </body>
              </html>
              `,
            ),
            "auto",
          ),
      BrowserRendererUnavailableError,
    );
  },
);

test(
  "rejects non-HTML resources",
  async () => {
    const fetched =
      createHtmlResource(
        "plain",
      );

    fetched.resource
      .resourceType =
        "text";

    fetched.resource
      .contentType =
        "text/plain";

    await assert.rejects(
      () =>
        new HtmlRenderingOrchestrator()
          .render(
            fetched,
          ),
      UnsupportedHtmlRenderingResourceError,
    );
  },
);

test(
  "honors an already aborted signal",
  async () => {
    const controller =
      new AbortController();

    controller.abort();

    await assert.rejects(
      () =>
        new HtmlRenderingOrchestrator()
          .render(
            createHtmlResource(
              "<html><body>hello</body></html>",
            ),
            "http",
            {
              signal:
                controller.signal,
            },
          ),
      HtmlRenderingAbortedError,
    );
  },
);
