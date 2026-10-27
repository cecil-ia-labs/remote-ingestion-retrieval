import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  TextualExtractedDocument,
} from "../../extraction/index.js";

import {
  HtmlToMarkdownConverter,
  MarkdownConversionAbortedError,
  UnsupportedExtractedDocumentError,
  normalizeMarkdown,
} from "../index.js";

function createHtmlDocument(
  html: string,
): TextualExtractedDocument {
  return {
    content:
      html,

    contentFormat:
      "html",

    metadata: {
      requestedUrl:
        "https://example.com/docs/page",

      resolvedUrl:
        "https://example.com/docs/page",

      resourceType:
        "html",

      contentType:
        "text/html",

      fetchedAt:
        new Date(
          "2026-09-15T20:00:00.000Z",
        ),

      extractedAt:
        new Date(
          "2026-09-15T20:00:01.000Z",
        ),

      byteLength:
        Buffer.byteLength(
          html,
        ),
    },
  };
}

test(
  "converts headings, paragraphs, emphasis and links to canonical Markdown",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <main>
              <h1>Authentication</h1>
              <p>
                Use <strong>OAuth</strong>
                with <em>short-lived</em> tokens.
              </p>
              <p>
                See
                <a href="https://example.com/api">
                  the API
                </a>.
              </p>
            </main>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /^# Authentication/m,
    );

    assert.match(
      result.markdown,
      /\*\*OAuth\*\*/,
    );

    assert.match(
      result.markdown,
      /\*short-lived\*/,
    );

    assert.match(
      result.markdown,
      /\[the API\]\(https:\/\/example\.com\/api\)/,
    );
  },
);

test(
  "preserves unordered and ordered lists",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <main>
              <ul>
                <li>First</li>
                <li>Second</li>
              </ul>

              <ol>
                <li>One</li>
                <li>Two</li>
              </ol>
            </main>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /- First/,
    );

    assert.match(
      result.markdown,
      /- Second/,
    );

    assert.match(
      result.markdown,
      /1\. One/,
    );

    assert.match(
      result.markdown,
      /2\. Two/,
    );
  },
);

test(
  "preserves GFM tables",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cedar</td>
                  <td>OpenAI</td>
                </tr>
                <tr>
                  <td>Marin</td>
                  <td>OpenAI</td>
                </tr>
              </tbody>
            </table>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /\|\s*Name\s*\|\s*Provider\s*\|/,
    );

    assert.match(
      result.markdown,
      /\|\s*-+\s*\|\s*-+\s*\|/,
    );

    assert.match(
      result.markdown,
      /\|\s*Cedar\s*\|\s*OpenAI\s*\|/,
    );
  },
);

test(
  "preserves fenced code blocks and language hints",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <main>
              <h2>Example</h2>
              <pre><code class="language-typescript">const value: number = 42;
console.log(value);</code></pre>
            </main>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /```typescript\nconst value: number = 42;\nconsole\.log\(value\);\n```/,
    );
  },
);

test(
  "uses a longer fence when source code already contains the preferred fence",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <pre><code class="language-markdown">before
\`\`\`
inside
\`\`\`
after</code></pre>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /````markdown/,
    );

    assert.match(
      result.markdown,
      /\n````$/,
    );
  },
);

test(
  "preserves Readability title restored by Phase 5",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <h1 data-extractor-title="readability">
              Reader Article
            </h1>
            <div>
              <p>Article body.</p>
            </div>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /^# Reader Article/m,
    );

    assert.match(
      result.markdown,
      /Article body\./,
    );
  },
);

test(
  "keeps source metadata unchanged",
  async () => {
    const document =
      createHtmlDocument(
        "<h1>Hello</h1>",
      );

    document.metadata.title =
      "Hello";

    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          document,
        );

    assert.equal(
      result.metadata,
      document.metadata,
    );

    assert.equal(
      result.metadata.title,
      "Hello",
    );
  },
);

test(
  "rejects non-HTML extracted documents",
  async () => {
    const document =
      createHtmlDocument(
        "plain",
      );

    document.contentFormat =
      "text";

    await assert.rejects(
      () =>
        new HtmlToMarkdownConverter()
          .convert(
            document,
          ),
      UnsupportedExtractedDocumentError,
    );
  },
);

test(
  "honors an already-aborted signal",
  async () => {
    const controller =
      new AbortController();

    controller.abort();

    await assert.rejects(
      () =>
        new HtmlToMarkdownConverter()
          .convert(
            createHtmlDocument(
              "<h1>Hello</h1>",
            ),
            {
              signal:
                controller.signal,
            },
          ),
      MarkdownConversionAbortedError,
    );
  },
);

test(
  "normalizer reduces excessive blank lines but preserves code block whitespace",
  () => {
    const markdown =
      [
        "# Title",
        "",
        "",
        "",
        "Paragraph",
        "",
        "",
        "```text",
        "line 1",
        "",
        "",
        "line 4  ",
        "```",
        "",
        "",
        "",
        "End",
      ].join("\n");

    const normalized =
      normalizeMarkdown(
        markdown,
      );

    assert.equal(
      normalized,
      [
        "# Title",
        "",
        "Paragraph",
        "",
        "```text",
        "line 1",
        "",
        "",
        "line 4  ",
        "```",
        "",
        "End",
      ].join("\n"),
    );
  },
);


test(
  "preserves GFM task list items",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <ul>
              <li>
                <input type="checkbox" checked>
                Indexed
              </li>
              <li>
                <input type="checkbox">
                Pending
              </li>
            </ul>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /- \[x\]\s+Indexed/i,
    );

    assert.match(
      result.markdown,
      /- \[ \]\s+Pending/,
    );
  },
);

test(
  "preserves blockquotes, inline code and strikethrough",
  async () => {
    const result =
      await new HtmlToMarkdownConverter()
        .convert(
          createHtmlDocument(
            `
            <blockquote>
              Prefer <code>fetch()</code>
              over <del>legacy()</del>.
            </blockquote>
            `,
          ),
        );

    assert.match(
      result.markdown,
      /> .*fetch\(\).*/s,
    );

    assert.match(
      result.markdown,
      /`fetch\(\)`/,
    );

    assert.match(
      result.markdown,
      /~~legacy\(\)~~/,
    );
  },
);


test(
  "recognizes highlight-source-* code language classes without treating generic classes as languages",
  async () => {
    const converter =
      new HtmlToMarkdownConverter();

    const highlighted =
      await converter.convert(
        createHtmlDocument(
          `
          <pre class="highlight">
            <code class="highlight-source-python">print("hello")</code>
          </pre>
          `,
        ),
      );

    assert.match(
      highlighted.markdown,
      /```python\nprint\("hello"\)\n```/,
    );

    const generic =
      await converter.convert(
        createHtmlDocument(
          `
          <pre class="example">
            <code class="code-block">hello</code>
          </pre>
          `,
        ),
      );

    assert.match(
      generic.markdown,
      /```\nhello\n```/,
    );

    assert.doesNotMatch(
      generic.markdown,
      /```(?:example|code-block)/,
    );
  },
);


test(
  "normalizer canonicalizes Turndown list and task-list padding",
  () => {
    const markdown =
      [
        "-   First",
        "-   [x]  Indexed",
        "1.  One",
        "    -   Nested",
      ].join("\n");

    assert.equal(
      normalizeMarkdown(
        markdown,
      ),
      [
        "- First",
        "- [x] Indexed",
        "1. One",
        "    - Nested",
      ].join("\n"),
    );
  },
);
