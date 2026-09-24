import test from "node:test";
import assert from "node:assert/strict";

import { verifyVirtualStudioV5Art } from "./verify-virtual-studio-v5-art.mjs";

test("Virtual Studio v5 uses complete independent style packs", async () => {
  const result = await verifyVirtualStudioV5Art();
  assert.equal(result.fileCount, 1872);
  assert.ok(result.bytes > 1_000_000);
});
