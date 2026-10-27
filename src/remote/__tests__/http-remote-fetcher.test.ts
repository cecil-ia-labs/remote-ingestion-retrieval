import assert from "node:assert/strict";

import {
  createServer,
} from "node:http";

import type {
  AddressInfo,
} from "node:net";

import {
  gzipSync,
} from "node:zlib";

import {
  after,
  before,
  test,
} from "node:test";

import {
  HttpRemoteFetcher,
} from "../http-remote-fetcher.js";

import {
  RemoteFetchAbortedError,
  RemoteFetchTooLargeError,
} from "../remote-fetcher.errors.js";

import type {
  RemoteResource,
} from "../remote-resource.js";

import type {
  SafeRemoteTarget,
  UrlSafetyPolicy,
} from "../url-safety-policy.js";

class LocalTestSafetyPolicy
  implements UrlSafetyPolicy {
  async validateAndResolve(
    value: string | URL,
  ): Promise<SafeRemoteTarget> {
    const url =
      value instanceof URL
        ? new URL(value)
        : new URL(value);

    return {
      url,
      address: "127.0.0.1",
      family: 4,
      addresses: [
        {
          address: "127.0.0.1",
          family: 4,
        },
      ],
    };
  }
}

const server =
  createServer(
    (request, response) => {
      const pathname =
        new URL(
          request.url ?? "/",
          "http://localhost",
        ).pathname;

      if (pathname === "/plain") {
        const body =
          Buffer.from(
            "hello remote fetcher",
          );

        response.writeHead(
          200,
          {
            "Content-Type":
              "text/plain; charset=utf-8",

            "Content-Length":
              body.byteLength,
          },
        );

        response.end(body);

        return;
      }

      if (pathname === "/redirect") {
        response.writeHead(
          302,
          {
            Location: "/plain",
          },
        );

        response.end();

        return;
      }

      if (pathname === "/gzip") {
        const body =
          gzipSync(
            Buffer.from(
              "compressed payload",
            ),
          );

        response.writeHead(
          200,
          {
            "Content-Type":
              "text/plain",

            "Content-Encoding":
              "gzip",

            "Content-Length":
              body.byteLength,
          },
        );

        response.end(body);

        return;
      }

      if (
        pathname
        === "/too-large-declared"
      ) {
        response.writeHead(
          200,
          {
            "Content-Type":
              "application/octet-stream",

            "Content-Length":
              "1024",
          },
        );

        response.end(
          Buffer.alloc(1024),
        );

        return;
      }

      if (
        pathname
        === "/too-large-streamed"
      ) {
        response.writeHead(
          200,
          {
            "Content-Type":
              "application/octet-stream",

            "Transfer-Encoding":
              "chunked",
          },
        );

        response.write(
          Buffer.alloc(64),
        );

        response.write(
          Buffer.alloc(64),
        );

        response.end();

        return;
      }

      response.writeHead(404);
      response.end();
    },
  );

let baseUrl = "";

before(
  async () => {
    await new Promise<void>(
      (resolve) => {
        server.listen(
          0,
          "127.0.0.1",
          resolve,
        );
      },
    );

    const address =
      server.address() as AddressInfo;

    baseUrl =
      `http://127.0.0.1:${address.port}`;
  },
);

after(
  async () => {
    await new Promise<void>(
      (resolve, reject) => {
        server.close(
          (error) => {
            if (error) {
              reject(error);

              return;
            }

            resolve();
          },
        );
      },
    );
  },
);

function createResource(
  pathname: string,
): RemoteResource {
  const url =
    `${baseUrl}${pathname}`;

  return {
    requestedUrl: url,
    resolvedUrl: url,
    redirectChain: [],

    statusCode: 200,

    headers: {},

    resourceType: "auto",

    resourceTypeDetectedBy:
      "unknown",

    resolvedAddress:
      "127.0.0.1",

    resolvedAddressFamily:
      4,
  };
}

function createFetcher(): HttpRemoteFetcher {
  return new HttpRemoteFetcher({
    safetyPolicy:
      new LocalTestSafetyPolicy(),
  });
}

test(
  "downloads a remote body",
  async () => {
    const fetched =
      await createFetcher().fetch(
        createResource("/plain"),
      );

    assert.equal(
      fetched.body.toString(),
      "hello remote fetcher",
    );

    assert.equal(
      fetched.byteLength,
      Buffer.byteLength(
        "hello remote fetcher",
      ),
    );

    assert.equal(
      fetched.resource.resourceType,
      "text",
    );

    assert.equal(
      fetched.resource.contentType,
      "text/plain",
    );
  },
);

test(
  "follows redirects and updates final resource metadata",
  async () => {
    const fetched =
      await createFetcher().fetch(
        createResource("/redirect"),
      );

    assert.equal(
      fetched.resource.resolvedUrl,
      `${baseUrl}/plain`,
    );

    assert.deepEqual(
      fetched.resource.redirectChain,
      [`${baseUrl}/redirect`],
    );

    assert.equal(
      fetched.body.toString(),
      "hello remote fetcher",
    );
  },
);

test(
  "transparently decompresses gzip bodies",
  async () => {
    const fetched =
      await createFetcher().fetch(
        createResource("/gzip"),
      );

    assert.equal(
      fetched.body.toString(),
      "compressed payload",
    );

    assert.equal(
      fetched.contentEncoding,
      "gzip",
    );

    assert.equal(
      fetched.byteLength,
      Buffer.byteLength(
        "compressed payload",
      ),
    );
  },
);

test(
  "rejects resources whose declared size exceeds maxBytes",
  async () => {
    await assert.rejects(
      () =>
        createFetcher().fetch(
          createResource(
            "/too-large-declared",
          ),
          {
            maxBytes: 100,
          },
        ),
      RemoteFetchTooLargeError,
    );
  },
);

test(
  "enforces maxBytes while streaming when Content-Length is absent",
  async () => {
    await assert.rejects(
      () =>
        createFetcher().fetch(
          createResource(
            "/too-large-streamed",
          ),
          {
            maxBytes: 100,
          },
        ),
      RemoteFetchTooLargeError,
    );
  },
);

test(
  "honors an already aborted signal",
  async () => {
    const controller =
      new AbortController();

    controller.abort();

    await assert.rejects(
      () =>
        createFetcher().fetch(
          createResource("/plain"),
          {
            signal:
              controller.signal,
          },
        ),
      RemoteFetchAbortedError,
    );
  },
);
