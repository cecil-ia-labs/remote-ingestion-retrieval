import assert from "node:assert/strict";
import test from "node:test";

import {
  DefaultUrlSafetyPolicy,
} from "../default-url-safety-policy.js";

import {
  InvalidRemoteUrlError,
  UnsafeRemoteUrlError,
} from "../remote-resource-resolver.errors.js";

const policy =
  new DefaultUrlSafetyPolicy();

test(
  "rejects unsupported protocols",
  async () => {
    await assert.rejects(
      () =>
        policy.validateAndResolve(
          "file:///etc/passwd",
        ),
      InvalidRemoteUrlError,
    );
  },
);

test(
  "rejects localhost",
  async () => {
    await assert.rejects(
      () =>
        policy.validateAndResolve(
          "http://localhost:8080",
        ),
      UnsafeRemoteUrlError,
    );
  },
);

test(
  "rejects private IPv4 literals",
  async () => {
    await assert.rejects(
      () =>
        policy.validateAndResolve(
          "http://192.168.1.50",
        ),
      UnsafeRemoteUrlError,
    );
  },
);

test(
  "rejects embedded credentials",
  async () => {
    await assert.rejects(
      () =>
        policy.validateAndResolve(
          "https://user:pass@example.com",
        ),
      InvalidRemoteUrlError,
    );
  },
);
