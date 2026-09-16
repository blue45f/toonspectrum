import assert from "node:assert/strict";

import { test } from "vitest";

import { createKmasReferenceSearch } from "../../../../../../apps/api/src/server/kmas-reference";

test("unlimited mode bypasses ToonStudio's local quota and accepts a server key alias", async () => {
  let calls = 0;
  const search = createKmasReferenceSearch({
    env: { KMAS_API_KEY: "alias-key", KMAS_UNLIMITED: "1" },
    now: () => 1_000_000,
    fetcher: async (input) => {
      calls += 1;
      assert.equal(new URL(String(input)).searchParams.get("prvKey"), "alias-key");
      return new Response(JSON.stringify({ result: { resultState: "success", totalCount: 0 } }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  for (let index = 0; index < 64; index += 1) {
    const result = await search({ field: "title", q: `fixture-${index}`, page: 1 });
    assert.equal(result.items.length, 0);
  }

  assert.equal(calls, 64);
});
