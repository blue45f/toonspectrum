import assert from "node:assert/strict";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import { verifyVirtualStudioV3Art } from "./verify-virtual-studio-v3-art.mjs";

test("Virtual Studio v3 NPC and style-pack manifests exactly verify checked-in art", async () => {
  const result = await verifyVirtualStudioV3Art();
  assert.equal(result.npc.files.length, 69);
  assert.deepEqual(result.styles.map((item) => item.style), ["sky-island", "pastel", "retro", "ink", "neon"]);
  assert.ok(result.styles.every((item) => item.files.length === 142));
  assert.equal(result.assetCount, 779);
  assert.ok(result.totalBytes > 100_000_000);
});
