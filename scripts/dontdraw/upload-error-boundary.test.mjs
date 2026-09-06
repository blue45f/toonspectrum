import assert from "node:assert/strict";
import { inspect } from "node:util";

import { requestUploadApi } from "../upload-toonstudio-3d-assets.mts";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const SECRET = "synthetic-error-boundary-secret";

async function rejectsUntrustedFetchFailure(failure) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw failure; };
  try {
    await assert.rejects(
      requestUploadApi("http://127.0.0.1:1", "/api/test", {}, { "x-user-id": SECRET }),
      (error) => {
        assert.equal(error.message, "Upload API transport failed; server outcome may be unknown");
        assert.equal(Object.hasOwn(error, "cause"), false);
        assert.equal(inspect(error, { depth: null }).includes(SECRET), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("transport error redaction covers nested causes, not only the outer message", async () => {
  const failure = new Error("upstream error", { cause: new Error(SECRET) });
  failure.requestHeaders = { "x-user-id": SECRET };
  await rejectsUntrustedFetchFailure(failure);
});

test("untrusted failures cannot impersonate locally generated diagnostics", async () => {
  await rejectsUntrustedFetchFailure(new Error("Upload API redirect refused", { cause: SECRET }));
});

test("transport redaction never reads an untrusted error message accessor", async () => {
  let reads = 0;
  const failure = new Error();
  Object.defineProperty(failure, "message", { get() { reads += 1; throw new Error(SECRET); } });
  await rejectsUntrustedFetchFailure(failure);
  assert.equal(reads, 0);
});
