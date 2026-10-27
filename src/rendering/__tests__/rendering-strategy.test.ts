import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  RemoteSource,
} from "../../domain/index.js";

import {
  getSourceRenderingStrategy,
} from "../rendering-strategy.js";

function createSource(
  strategy?:
    "auto"
    | "http"
    | "browser",
): RemoteSource {
  return {
    id:
      "source-1",

    type:
      "url",

    url:
      "https://example.com",

    options:
      strategy
        ? {
            rendering: {
              strategy,
            },
          }
        : undefined,

    createdAt:
      new Date(),

    updatedAt:
      new Date(),
  };
}

test(
  "source rendering strategy defaults to auto",
  () => {
    assert.equal(
      getSourceRenderingStrategy(
        createSource(),
      ),
      "auto",
    );
  },
);

test(
  "source rendering strategy preserves explicit browser mode",
  () => {
    assert.equal(
      getSourceRenderingStrategy(
        createSource(
          "browser",
        ),
      ),
      "browser",
    );
  },
);
