import test from "node:test";
import assert from "node:assert/strict";

import { verifyVirtualStudioLivingTownV6 } from "./verify-virtual-studio-living-town-v6.mjs";

test("Virtual Studio living town v6 has complete Image Generation 2.5-directed runtime sheets", async () => {
  const result = await verifyVirtualStudioLivingTownV6();
  assert.equal(result.files, 48);
  assert.equal(result.imagegenFiles, 29);
  assert.ok(result.bytes > 500_000);
  assert.ok(result.imagegenBytes > 200_000);
});
