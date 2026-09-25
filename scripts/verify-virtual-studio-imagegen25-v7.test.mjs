import test from "node:test";
import assert from "node:assert/strict";

import { verifyVirtualStudioImagegen25V7 } from "./verify-virtual-studio-imagegen25-v7.mjs";

test("Virtual Studio ImageGen 2.5 v7 ships places, backdrops and terrain with provenance", async () => {
  const result = await verifyVirtualStudioImagegen25V7();
  assert.equal(result.files, 19);
  assert.equal(result.places, 14);
  assert.ok(result.bytes > 500_000);
});
