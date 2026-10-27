import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  FetchedResource,
} from "../../remote/index.js";

import {
  HtmlExtractor,
  createDefaultExtractorRegistry,
} from "../extractors/index.js";

function createHtmlResource(
  html: string,
  url =
    "https://example.com/docs/page",
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

      redirectChain: [],

      statusCode:
        200,

      headers: {
        "content-type":
          "text/html; charset=utf-8",
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
        "text/html; charset=utf-8",
    },

    fetchedAt:
      new Date(
        "2026-09-15T19:30:00.000Z",
      ),
  };
}

function longText(
  label: string,
): string {
  return (
    `${label} `
    + "This paragraph contains enough semantic content for the extractor "
    + "to recognize it as the primary document area instead of falling "
    + "through to the next extraction strategy."
  );
}

test(
  "HtmlExtractor prefers main and removes common noise",
  async () => {
    const extractor =
      new HtmlExtractor();

    const result =
      await extractor.extract(
        createHtmlResource(
          `
          <!doctype html>
          <html lang="en">
            <head>
              <title>Documentation</title>
            </head>
            <body>
              <nav>Global navigation</nav>
              <main>
                <h1>Authentication</h1>
                <p>${longText("OAuth")}</p>
                <nav>Local table of contents</nav>
                <script>alert("bad")</script>
                <footer>Page footer</footer>
              </main>
            </body>
          </html>
          `,
        ),
      );

    assert.equal(
      result.contentFormat,
      "html",
    );

    assert.equal(
      result.metadata
        .attributes
        ?.extractionStrategy,
      "main",
    );

    assert.match(
      result.content,
      /Authentication/,
    );

    assert.doesNotMatch(
      result.content,
      /Global navigation/,
    );

    assert.doesNotMatch(
      result.content,
      /Local table of contents/,
    );

    assert.doesNotMatch(
      result.content,
      /alert/,
    );

    assert.doesNotMatch(
      result.content,
      /Page footer/,
    );
  },
);

test(
  "HtmlExtractor uses role=main when main is absent",
  async () => {
    const result =
      await new HtmlExtractor()
        .extract(
          createHtmlResource(
            `
            <html>
              <body>
                <div role="main">
                  <h1>API</h1>
                  <p>${longText("REST")}</p>
                </div>
              </body>
            </html>
            `,
          ),
        );

    assert.equal(
      result.metadata
        .attributes
        ?.extractionStrategy,
      "role-main",
    );
  },
);

test(
  "HtmlExtractor uses article when main selectors are absent",
  async () => {
    const result =
      await new HtmlExtractor()
        .extract(
          createHtmlResource(
            `
            <html>
              <body>
                <article>
                  <h1>Article</h1>
                  <p>${longText("Editorial")}</p>
                </article>
              </body>
            </html>
            `,
          ),
        );

    assert.equal(
      result.metadata
        .attributes
        ?.extractionStrategy,
      "article",
    );
  },
);

test(
  "HtmlExtractor falls back to Readability for editorial body content",
  async () => {
    const paragraphs =
      Array.from(
        { length: 8 },
        (
          _,
          index,
        ) =>
          `<p>${longText(`Paragraph ${index + 1}`)}</p>`,
      ).join("");

    const result =
      await new HtmlExtractor({
        minSemanticTextLength:
          10_000,
      }).extract(
        createHtmlResource(
          `
          <html>
            <head>
              <title>Reader Article</title>
            </head>
            <body>
              <div class="page">
                <h1>Reader Article</h1>
                ${paragraphs}
              </div>
            </body>
          </html>
          `,
        ),
      );

    assert.equal(
      result.metadata
        .attributes
        ?.extractionStrategy,
      "readability",
    );

    assert.match(
      result.content,
      /Reader Article/,
    );
  },
);

test(
  "HtmlExtractor can disable Readability and use body fallback",
  async () => {
    const result =
      await new HtmlExtractor({
        useReadability:
          false,

        minSemanticTextLength:
          10_000,
      }).extract(
        createHtmlResource(
          `
          <html>
            <body>
              <div>Short fallback content</div>
            </body>
          </html>
          `,
        ),
      );

    assert.equal(
      result.metadata
        .attributes
        ?.extractionStrategy,
      "body",
    );

    assert.match(
      result.content,
      /Short fallback content/,
    );
  },
);

test(
  "HtmlExtractor extracts canonical metadata and language",
  async () => {
    const result =
      await new HtmlExtractor()
        .extract(
          createHtmlResource(
            `
            <!doctype html>
            <html lang="pt-BR">
              <head>
                <title>Fallback title</title>
                <meta
                  name="description"
                  content="Descrição da página"
                />
                <meta
                  property="og:title"
                  content="Título Open Graph"
                />
                <link
                  rel="canonical"
                  href="/canonical"
                />
              </head>
              <body>
                <main>
                  <h1>Título</h1>
                  <p>${longText("Conteúdo")}</p>
                </main>
              </body>
            </html>
            `,
          ),
        );

    assert.equal(
      result.metadata.title,
      "Título Open Graph",
    );

    assert.equal(
      result.metadata.description,
      "Descrição da página",
    );

    assert.equal(
      result.metadata.language,
      "pt-BR",
    );

    assert.equal(
      result.metadata.canonicalUrl,
      "https://example.com/canonical",
    );
  },
);

test(
  "HtmlExtractor absolutizes relative links and strips unsafe attributes",
  async () => {
    const result =
      await new HtmlExtractor()
        .extract(
          createHtmlResource(
            `
            <html>
              <body>
                <main>
                  <h1>Links</h1>
                  <p>${longText("Links")}</p>
                  <a
                    href="../api"
                    onclick="steal()"
                  >
                    API
                  </a>
                  <a
                    href="javascript:steal()"
                  >
                    Unsafe
                  </a>
                  <img
                    src="./diagram.png"
                    onerror="steal()"
                  />
                </main>
              </body>
            </html>
            `,
          ),
        );

    assert.match(
      result.content,
      /href="https:\/\/example\.com\/api"/,
    );

    assert.match(
      result.content,
      /src="https:\/\/example\.com\/docs\/diagram\.png"/,
    );

    assert.doesNotMatch(
      result.content,
      /onclick=/,
    );

    assert.doesNotMatch(
      result.content,
      /onerror=/,
    );

    assert.doesNotMatch(
      result.content,
      /javascript:/,
    );
  },
);

test(
  "default registry includes HTML extractor",
  () => {
    const registry =
      createDefaultExtractorRegistry();

    assert.deepEqual(
      registry
        .registeredExtractors
        .map(
          (extractor) =>
            extractor.name,
        ),
      [
        "markdown",
        "json",
        "csv",
        "html",
        "text",
      ],
    );
  },
);


test(
  "HtmlExtractor does not duplicate an existing Readability h1",
  async () => {
    const paragraphs =
      Array.from(
        { length: 8 },
        (
          _,
          index,
        ) =>
          `<p>${longText(`Paragraph ${index + 1}`)}</p>`,
      ).join("");

    const result =
      await new HtmlExtractor({
        minSemanticTextLength:
          10_000,
      }).extract(
        createHtmlResource(
          `
          <html>
            <head>
              <title>Existing Heading</title>
            </head>
            <body>
              <div class="page">
                <h1>Existing Heading</h1>
                ${paragraphs}
              </div>
            </body>
          </html>
          `,
        ),
      );

    assert.equal(
      result.metadata
        .attributes
        ?.extractionStrategy,
      "readability",
    );

    const headings =
      result.content.match(
        /<h1\b[^>]*>/g,
      )
      ?? [];

    assert.equal(
      headings.length,
      1,
    );

    assert.match(
      result.content,
      /Existing Heading/,
    );
  },
);


test(
  "HtmlExtractor preserves task-list checkboxes but removes ordinary inputs",
  async () => {
    const result =
      await new HtmlExtractor()
        .extract(
          createHtmlResource(
            `
            <html>
              <body>
                <main>
                  <h1>Tasks</h1>
                  <p>${longText("Tasks")}</p>
                  <ul>
                    <li>
                      <input type="checkbox" checked>
                      Indexed
                    </li>
                  </ul>
                  <input type="text" value="noise">
                </main>
              </body>
            </html>
            `,
          ),
        );

    assert.match(
      result.content,
      /type="checkbox"/,
    );

    assert.match(
      result.content,
      /checked/,
    );

    assert.doesNotMatch(
      result.content,
      /type="text"/,
    );
  },
);
