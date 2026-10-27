import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ExistingMarkdownSplitterAdapter,
} from "../existing-markdown-splitter-adapter.js";

const context = {
  sourceId:
    "source-1",

  documentId:
    "webdoc_1",

  canonicalUrl:
    "https://example.com/docs",

  title:
    "Docs",

  documentContentHash:
    "abc",
};

test(
  "adapts an existing splitter that returns strings",
  async () => {
    const splitter =
      new ExistingMarkdownSplitterAdapter({
        name:
          "fixture-string-splitter",

        split:
          (markdown) =>
            markdown.split(
              "---",
            ),
      });

    const result =
      await splitter.split(
        "one---two",
        context,
      );

    assert.deepEqual(
      result,
      [
        {
          markdown:
            "one",
        },
        {
          markdown:
            "two",
        },
      ],
    );
  },
);

test(
  "adapts object chunks through toMarkdown",
  async () => {
    const splitter =
      new ExistingMarkdownSplitterAdapter<{
        content:
          string;
      }>({
        split:
          () => [
            {
              content:
                "alpha",
            },
            {
              content:
                "beta",
            },
          ],

        toMarkdown:
          (chunk) =>
            chunk.content,
      });

    const result =
      await splitter.split(
        "ignored",
        context,
      );

    assert.deepEqual(
      result.map(
        (item) =>
          item.markdown,
      ),
      [
        "alpha",
        "beta",
      ],
    );
  },
);


test(
  "forwards splitter-specific metadata through toMetadata",
  async () => {
    const adapter =
      new ExistingMarkdownSplitterAdapter<{
        content: string;
        kind: string;
      }>({
        split: () => [
          {
            content: "# Heading",
            kind: "section",
          },
        ],
        toMarkdown: (chunk) =>
          chunk.content,
        toMetadata: (chunk) => ({
          headingPath: [
            "Heading",
          ],
          headingLevels: [1],
          attributes: {
            kind:
              chunk.kind,
          },
        }),
      });

    const result =
      await adapter.split(
        "# Heading",
        {
          sourceId:
            "source",
          documentId:
            "document",
          canonicalUrl:
            "https://example.com/",
          documentContentHash:
            "hash",
        },
      );

    assert.equal(
      result[0]
        ?.metadata
        ?.attributes
        ?.kind,
      "section",
    );
  },
);
