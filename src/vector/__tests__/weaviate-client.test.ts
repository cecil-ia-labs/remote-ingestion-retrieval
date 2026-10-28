import assert from "node:assert/strict";
import { test } from "node:test";

import { WeaviateRestClient } from "../weaviate-client.js";

function clientWithBatchResponse(body: unknown): WeaviateRestClient {
  return new WeaviateRestClient({
    url: "https://example.weaviate.cloud/v1",
    fetch: async () => new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  });
}

const objects = [{ class: "IncresoSite", id: "chunk-0" }];

test("Weaviate accepts successful batch objects with absent or empty errors", async () => {
  for (const errors of [undefined, null, {}, { error: [] }]) {
    const result = { result: { status: "SUCCESS", ...(errors === undefined ? {} : { errors }) } };
    await assert.doesNotReject(clientWithBatchResponse([result]).writeBatch(objects));
  }
});

test("Weaviate reports failed object status and the original embedding failure message", async () => {
  const client = clientWithBatchResponse([{
    result: {
      status: "FAILED",
      errors: { error: [{ message: "vectorizer: model request was rate limited" }] },
    },
  }]);
  await assert.rejects(
    client.writeBatch(objects),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Weaviate batch object 0 failed \(status: FAILED/);
      assert.match(error.message, /vectorizer: model request was rate limited/);
      assert.match(error.message, /partially persisted/);
      return true;
    },
  );
});

test("Weaviate fails on a nonempty error list even when status reports SUCCESS", async () => {
  const client = clientWithBatchResponse([{
    result: { status: "SUCCESS", errors: { error: [{ message: "schema mismatch" }] } },
  }]);
  await assert.rejects(client.writeBatch(objects), /schema mismatch/);
});

test("Weaviate identifies the failing index after a partially successful batch", async () => {
  const client = clientWithBatchResponse([
    { result: { status: "SUCCESS", errors: { error: [] } } },
    { result: { status: "FAILED", errors: { error: [{ message: "invalid property" }] } } },
  ]);
  await assert.rejects(
    client.writeBatch([...objects, { class: "IncresoSite", id: "chunk-1" }]),
    /batch object 1 failed.*invalid property/,
  );
});

test("Weaviate retains a meaningful fallback for malformed responses and failures without details", async () => {
  await assert.rejects(clientWithBatchResponse([{}]).writeBatch(objects), /returned an invalid result/);
  await assert.rejects(
    clientWithBatchResponse([{ result: { status: "FAILED" } }]).writeBatch(objects),
    /status: FAILED; no error details returned/,
  );
  await assert.rejects(
    clientWithBatchResponse([]).writeBatch(objects),
    /invalid object count/,
  );
});
