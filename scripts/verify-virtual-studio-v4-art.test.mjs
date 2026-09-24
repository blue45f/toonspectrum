import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyVirtualStudioV4Art } from "./verify-virtual-studio-v4-art.mjs";

test("verifies the generated Virtual Studio v4 campus and NPC package", async () => {
  const result = await verifyVirtualStudioV4Art();
  assert.ok(result.assetCount >= 400);
  assert.ok(result.totalBytes > 1_000_000);
});
