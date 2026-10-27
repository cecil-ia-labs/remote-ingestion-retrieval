import assert from "node:assert/strict";

import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  test,
} from "node:test";

import type {
  WebsiteSource,
} from "../../domain/index.js";

import type {
  NormalizedDocument,
} from "../../normalization/index.js";

import {
  LocalMarkdownArtifactStore,
} from "../../persistence/index.js";

import {
  WebsiteDocumentService,
} from "../website-document-service.js";

function createSource():
  WebsiteSource {
  return {
    id:
      "docs-site",

    type:
      "website",

    url:
      "https://example.com/docs",

    createdAt:
      new Date(),

    updatedAt:
      new Date(),
  };
}

function createNormalized():
  NormalizedDocument {
  return {
    markdown:
      "# Authentication\n\nUse OAuth.",

    metadata: {
      requestedUrl:
        "https://example.com/docs/auth",

      resolvedUrl:
        "https://example.com/docs/auth",

      canonicalUrl:
        "https://example.com/docs/auth",

      title:
        "Authentication",

      resourceType:
        "html",

      contentType:
        "text/html",

      fetchedAt:
        new Date(),

      extractedAt:
        new Date(),

      byteLength:
        100,
    },
  };
}

test(
  "WebsiteDocumentService persists canonical Markdown and returns its artifact",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "website-doc-service-",
        ),
      );

    try {
      const service =
        new WebsiteDocumentService({
          artifactStore:
            new LocalMarkdownArtifactStore({
              rootDirectory:
                directory,
            }),
        });

      const normalized =
        createNormalized();

      const document =
        await service.materialize(
          createSource(),
          normalized,
        );

      assert.ok(
        document.artifact,
      );

      const content =
        await readFile(
          document.artifact!
            .absolutePath,
          "utf8",
        );

      assert.equal(
        content,
        normalized.markdown,
      );

      assert.equal(
        document.artifact!
          .contentHash,
        document.contentHash,
      );
    } finally {
      await rm(
        directory,
        {
          recursive:
            true,

          force:
            true,
        },
      );
    }
  },
);
