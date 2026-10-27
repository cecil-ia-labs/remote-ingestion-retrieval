import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  SafeRemoteTarget,
  UrlSafetyPolicy,
} from "../../remote/index.js";

import {
  PuppeteerRequestPolicy,
} from "../puppeteer-request-policy.js";

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

    if (
      url.hostname
      === "private.example"
    ) {
      throw new Error(
        "blocked",
      );
    }

    return {
      url,

      address:
        "203.0.113.10",

      family:
        4,

      addresses: [
        {
          address:
            "203.0.113.10",

          family:
            4,
        },
      ],
    };
  }
}

function createPolicy():
  PuppeteerRequestPolicy {
  return new PuppeteerRequestPolicy({
    safetyPolicy:
      new TestSafetyPolicy(),
  });
}

test(
  "blocks images, media and fonts by default",
  async () => {
    for (
      const type
      of [
        "image",
        "media",
        "font",
      ]
    ) {
      const result =
        await createPolicy()
          .evaluate(
            "https://example.com/resource",
            type,
          );

      assert.equal(
        result.action,
        "abort",
      );

      assert.equal(
        result.reason,
        "blocked-resource-type",
      );
    }
  },
);

test(
  "allows public HTTP and HTTPS requests",
  async () => {
    const result =
      await createPolicy()
        .evaluate(
          "https://example.com/api",
          "fetch",
        );

    assert.equal(
      result.action,
      "continue",
    );

    assert.equal(
      result.reason,
      "allowed-network",
    );
  },
);

test(
  "blocks network targets rejected by the URL safety policy",
  async () => {
    const result =
      await createPolicy()
        .evaluate(
          "http://private.example/api",
          "fetch",
        );

    assert.equal(
      result.action,
      "abort",
    );

    assert.equal(
      result.reason,
      "unsafe-network-target",
    );
  },
);

test(
  "allows local data/blob/about schemes but blocks file and websocket schemes",
  async () => {
    for (
      const url
      of [
        "data:text/plain,hello",
        "blob:https://example.com/id",
        "about:blank",
      ]
    ) {
      assert.equal(
        (
          await createPolicy()
            .evaluate(
              url,
              "other",
            )
        ).action,
        "continue",
      );
    }

    for (
      const url
      of [
        "file:///etc/passwd",
        "ws://example.com/socket",
        "wss://example.com/socket",
      ]
    ) {
      assert.equal(
        (
          await createPolicy()
            .evaluate(
              url,
              "other",
            )
        ).action,
        "abort",
      );
    }
  },
);
