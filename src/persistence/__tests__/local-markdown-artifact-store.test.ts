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
  relative,
} from "node:path";

import {
  test,
} from "node:test";

import {
  LocalMarkdownArtifactStore,
  MarkdownArtifactHashMismatchError,
  MarkdownArtifactPathError,
} from "../index.js";

async function createStore(): Promise<{
  directory:
    string;

  store:
    LocalMarkdownArtifactStore;
}> {
  const directory =
    await mkdtemp(
      join(
        tmpdir(),
        "markdown-artifacts-",
      ),
    );

  return {
    directory,

    store:
      new LocalMarkdownArtifactStore({
        rootDirectory:
          directory,
      }),
  };
}

test(
  "saves exact canonical Markdown to a local .md file",
  async () => {
    const {
      directory,
      store,
    } =
      await createStore();

    try {
      const markdown =
        "# Authentication\n\nUse **OAuth**.";

      const artifact =
        await store.save({
          sourceId:
            "docs/site",

          documentId:
            "webdoc_123",

          canonicalUrl:
            "https://example.com/docs/authentication",

          markdown,
        });

      assert.equal(
        artifact.storage,
        "local",
      );

      assert.match(
        artifact.filename,
        /^authentication--[a-f0-9]{12}\.md$/,
      );

      assert.equal(
        await readFile(
          artifact.absolutePath,
          "utf8",
        ),
        markdown,
      );

      assert.equal(
        await store.read(
          artifact,
        ),
        markdown,
      );

      assert.equal(
        await store.exists(
          artifact,
        ),
        true,
      );

      assert.equal(
        relative(
          directory,
          artifact.absolutePath,
        ),
        artifact.relativePath,
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

test(
  "uses stable path for repeated saves of the same document",
  async () => {
    const {
      directory,
      store,
    } =
      await createStore();

    try {
      const input = {
        sourceId:
          "site-1",

        documentId:
          "webdoc_abc",

        canonicalUrl:
          "https://example.com/docs/api",

        markdown:
          "# API",
      };

      const first =
        await store.save(
          input,
        );

      const second =
        await store.save({
          ...input,

          markdown:
            "# API\n\nUpdated.",
        });

      assert.equal(
        first.absolutePath,
        second.absolutePath,
      );

      assert.equal(
        await store.read(
          second,
        ),
        "# API\n\nUpdated.",
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

test(
  "sanitizes source identifiers instead of treating them as filesystem paths",
  async () => {
    const {
      directory,
      store,
    } =
      await createStore();

    try {
      const artifact =
        await store.save({
          sourceId:
            "../../etc/passwd",

          documentId:
            "../document",

          canonicalUrl:
            "https://example.com/../../unsafe",

          markdown:
            "# Safe",
        });

      assert.equal(
        artifact.absolutePath
          .startsWith(
            directory,
          ),
        true,
      );

      assert.equal(
        artifact.relativePath
          .includes(
            "..",
          ),
        false,
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

test(
  "verifies a supplied content hash",
  async () => {
    const {
      directory,
      store,
    } =
      await createStore();

    try {
      await assert.rejects(
        () =>
          store.save({
            sourceId:
              "site",

            documentId:
              "document",

            canonicalUrl:
              "https://example.com",

            markdown:
              "# Document",

            contentHash:
              "incorrect",
          }),
        MarkdownArtifactHashMismatchError,
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

test(
  "remove deletes the persisted Markdown file",
  async () => {
    const {
      directory,
      store,
    } =
      await createStore();

    try {
      const artifact =
        await store.save({
          sourceId:
            "site",

          documentId:
            "document",

          canonicalUrl:
            "https://example.com",

          markdown:
            "# Document",
        });

      await store.remove(
        artifact,
      );

      assert.equal(
        await store.exists(
          artifact,
        ),
        false,
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

test(
  "rejects manipulated artifact paths on read",
  async () => {
    const {
      directory,
      store,
    } =
      await createStore();

    try {
      const artifact =
        await store.save({
          sourceId:
            "site",

          documentId:
            "document",

          canonicalUrl:
            "https://example.com",

          markdown:
            "# Document",
        });

      await assert.rejects(
        () =>
          store.read({
            ...artifact,

            absolutePath:
              "/etc/passwd",
          }),
        MarkdownArtifactPathError,
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
