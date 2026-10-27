import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import {
  StaticHtmlSufficiencyAnalyzer,
} from "../static-html-sufficiency-analyzer.js";

function paragraph(
  label:
    string,
): string {
  return (
    `${label} contains enough meaningful textual content to represent `
    + "a server-rendered documentation page without requiring browser "
    + "execution for the primary knowledge payload."
  );
}

test(
  "accepts semantic server-rendered documentation",
  () => {
    const analyzer =
      new StaticHtmlSufficiencyAnalyzer();

    const report =
      analyzer.analyze(
        `
        <html>
          <body>
            <main>
              <h1>Authentication</h1>
              <p>${paragraph("OAuth")}</p>
              <p>${paragraph("Tokens")}</p>
              <pre><code>curl https://example.com</code></pre>
            </main>
          </body>
        </html>
        `,
      );

    assert.equal(
      report.sufficient,
      true,
    );

    assert.ok(
      report.reasons.includes(
        "semantic-content",
      ),
    );

    assert.ok(
      report.metrics
        .semanticTextLength
      > 120,
    );
  },
);

test(
  "rejects an empty React-style application shell",
  () => {
    const analyzer =
      new StaticHtmlSufficiencyAnalyzer();

    const report =
      analyzer.analyze(
        `
        <html>
          <body>
            <div id="root"></div>
            <script src="/assets/app.js"></script>
          </body>
        </html>
        `,
      );

    assert.equal(
      report.sufficient,
      false,
    );

    assert.ok(
      report.reasons.includes(
        "app-shell",
      ),
    );
  },
);

test(
  "rejects explicit JavaScript-required placeholder pages",
  () => {
    const analyzer =
      new StaticHtmlSufficiencyAnalyzer();

    const report =
      analyzer.analyze(
        `
        <html>
          <body>
            <div id="app">
              Please enable JavaScript to continue.
            </div>
            <script src="/app.js"></script>
          </body>
        </html>
        `,
      );

    assert.equal(
      report.sufficient,
      false,
    );

    assert.ok(
      report.reasons.includes(
        "javascript-required-hint",
      ),
    );
  },
);

test(
  "accepts useful body content even without main/article",
  () => {
    const analyzer =
      new StaticHtmlSufficiencyAnalyzer();

    const body =
      Array.from(
        {
          length:
            5,
        },
        (
          _,
          index,
        ) =>
          `<p>${paragraph(`Paragraph ${index + 1}`)}</p>`,
      ).join("");

    const report =
      analyzer.analyze(
        `<html><body>${body}</body></html>`,
      );

    assert.equal(
      report.sufficient,
      true,
    );

    assert.ok(
      report.reasons.includes(
        "body-text",
      ),
    );
  },
);


test(
  "does not treat JavaScript bundle text as a JavaScript-required placeholder",
  () => {
    const analyzer =
      new StaticHtmlSufficiencyAnalyzer();

    const report =
      analyzer.analyze(
        `
        <html>
          <body>
            <main>
              <h1>Server rendered</h1>
              <p>${paragraph("Static content")}</p>
              <p>${paragraph("More content")}</p>
            </main>
            <script>
              const message = "Please enable JavaScript to continue.";
            </script>
          </body>
        </html>
        `,
      );

    assert.equal(
      report.sufficient,
      true,
    );

    assert.equal(
      report.reasons.includes(
        "javascript-required-hint",
      ),
      false,
    );
  },
);
