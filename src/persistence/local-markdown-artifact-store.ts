import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  constants as fsConstants,
} from "node:fs";

import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import type {
  MarkdownArtifact,
  SaveMarkdownArtifactInput,
} from "./markdown-artifact.js";

import {
  MarkdownArtifactHashMismatchError,
  MarkdownArtifactPathError,
} from "./markdown-artifact.errors.js";

import type {
  MarkdownArtifactStore,
} from "./markdown-artifact-store.js";

export interface LocalMarkdownArtifactStoreOptions {
  /**
   * Root directory under which all generated Markdown artifacts are stored.
   *
   * Example:
   *   /var/lib/my-app/websources
   *   ./data/websources
   */
  rootDirectory:
    string;

  /**
   * Directory name containing per-document Markdown files.
   */
  documentsDirectoryName?:
    string;
}

function sha256(
  value:
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function slugify(
  value:
    string,

  fallback:
    string,
): string {
  const normalized =
    value
      .normalize(
        "NFKD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .slice(
        0,
        64,
      );

  return normalized
    || fallback;
}

function shortHash(
  value:
    string,

  length =
    12,
): string {
  return sha256(
    value,
  ).slice(
    0,
    length,
  );
}

function createSourceDirectoryName(
  sourceId:
    string,
): string {
  return (
    `${slugify(sourceId, "source")}`
    + `--${shortHash(sourceId)}`
  );
}

function createDocumentFilename(
  canonicalUrl:
    string,

  documentId:
    string,
): string {
  let base =
    "index";

  try {
    const url =
      new URL(
        canonicalUrl,
      );

    const pathParts =
      url.pathname
        .split("/")
        .filter(Boolean);

    const last =
      pathParts[
        pathParts.length - 1
      ];

    if (last) {
      base =
        last.replace(
          /\.[A-Za-z0-9]{1,8}$/,
          "",
        )
        || "index";
    } else if (
      url.hostname
    ) {
      base =
        url.hostname;
    }
  } catch {
    // canonicalUrl has already been validated by earlier phases in normal use.
    // Keep the deterministic fallback if an external caller supplies bad data.
  }

  return (
    `${slugify(base, "document")}`
    + `--${shortHash(documentId)}`
    + ".md"
  );
}

export class LocalMarkdownArtifactStore
  implements MarkdownArtifactStore {
  readonly rootDirectory:
    string;

  private readonly documentsDirectoryName:
    string;

  constructor(
    options:
      LocalMarkdownArtifactStoreOptions,
  ) {
    this.rootDirectory =
      resolve(
        options.rootDirectory,
      );

    this.documentsDirectoryName =
      slugify(
        options.documentsDirectoryName
        ?? "documents",
        "documents",
      );
  }

  async save(
    input:
      SaveMarkdownArtifactInput,
  ): Promise<MarkdownArtifact> {
    const actualHash =
      sha256(
        input.markdown,
      );

    if (
      input.contentHash
      && input.contentHash
        !== actualHash
    ) {
      throw new MarkdownArtifactHashMismatchError(
        `Provided Markdown hash does not match content for document `
        + `"${input.documentId}".`,
      );
    }

    const sourceDirectory =
      createSourceDirectoryName(
        input.sourceId,
      );

    const filename =
      createDocumentFilename(
        input.canonicalUrl,
        input.documentId,
      );

    const relativePath =
      join(
        sourceDirectory,
        this.documentsDirectoryName,
        filename,
      );

    const absolutePath =
      this.resolveInsideRoot(
        relativePath,
      );

    await mkdir(
      dirname(
        absolutePath,
      ),
      {
        recursive:
          true,
      },
    );

    const temporaryPath =
      join(
        dirname(
          absolutePath,
        ),
        `.${basename(absolutePath)}.${randomUUID()}.tmp`,
      );

    try {
      await writeFile(
        temporaryPath,
        input.markdown,
        {
          encoding:
            "utf8",
        },
      );

      await rename(
        temporaryPath,
        absolutePath,
      );
    } catch (cause) {
      await rm(
        temporaryPath,
        {
          force:
            true,
        },
      ).catch(
        () => undefined,
      );

      throw cause;
    }

    return {
      storage:
        "local",

      sourceId:
        input.sourceId,

      documentId:
        input.documentId,

      canonicalUrl:
        input.canonicalUrl,

      relativePath,

      absolutePath,

      filename,

      byteLength:
        Buffer.byteLength(
          input.markdown,
          "utf8",
        ),

      contentHash:
        actualHash,

      persistedAt:
        new Date(),
    };
  }

  async read(
    artifact:
      MarkdownArtifact,
  ): Promise<string> {
    const path =
      this.validateArtifactPath(
        artifact,
      );

    return readFile(
      path,
      "utf8",
    );
  }

  async exists(
    artifact:
      MarkdownArtifact,
  ): Promise<boolean> {
    const path =
      this.validateArtifactPath(
        artifact,
      );

    try {
      await access(
        path,
        fsConstants.F_OK,
      );

      return true;
    } catch {
      return false;
    }
  }

  async remove(
    artifact:
      MarkdownArtifact,
  ): Promise<void> {
    const path =
      this.validateArtifactPath(
        artifact,
      );

    await rm(
      path,
      {
        force:
          true,
      },
    );
  }

  private validateArtifactPath(
    artifact:
      MarkdownArtifact,
  ): string {
    if (
      artifact.storage
      !== "local"
    ) {
      throw new MarkdownArtifactPathError(
        "LocalMarkdownArtifactStore received a non-local artifact.",
      );
    }

    const absolute =
      resolve(
        artifact.absolutePath,
      );

    const expected =
      this.resolveInsideRoot(
        artifact.relativePath,
      );

    if (
      absolute
      !== expected
    ) {
      throw new MarkdownArtifactPathError(
        `Artifact path is inconsistent with the configured root: `
        + artifact.absolutePath,
      );
    }

    return absolute;
  }

  private resolveInsideRoot(
    relativePath:
      string,
  ): string {
    if (
      isAbsolute(
        relativePath,
      )
    ) {
      throw new MarkdownArtifactPathError(
        `Artifact relative path must not be absolute: ${relativePath}`,
      );
    }

    const absolute =
      resolve(
        this.rootDirectory,
        relativePath,
      );

    const childRelative =
      relative(
        this.rootDirectory,
        absolute,
      );

    if (
      childRelative === ".."
      || childRelative
        .startsWith(
          `..${sep}`,
        )
      || isAbsolute(
        childRelative,
      )
    ) {
      throw new MarkdownArtifactPathError(
        `Artifact path escapes the configured root: ${relativePath}`,
      );
    }

    return absolute;
  }
}
