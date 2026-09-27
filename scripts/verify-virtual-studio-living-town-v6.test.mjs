const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { verifyVirtualStudioLivingTownV6, verifyVirtualStudioNavigationBindings } from "./verify-virtual-studio-living-town-v6.mjs";

test("Virtual Studio living town v6 has complete Image Generation 2.5-directed runtime sheets", async () => {
  const result = await verifyVirtualStudioLivingTownV6();
  assert.equal(result.files, 48);
  assert.equal(result.imagegenFiles, 29);
  assert.ok(result.bytes > 500_000);
  assert.ok(result.imagegenBytes > 200_000);
});

test("경로·가구·NPC 중 하나라도 실제 world 판정에서 이탈하면 거부한다", async () => {
  const runtime = await readFile(new URL("../apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");
  for (const binding of ["studioVirtualDecorationNavigationWorld(manifest,", "findStudioWorldPath(navigationWorld,", "studioWorldCanOccupy(navigationWorld, currentPoint)", "resolveStudioWorldSpawn(navigationWorld, currentPoint)", "npcDirector.updateNavigationWorld(navigationWorld)"]) {
    assert.throws(() => verifyVirtualStudioNavigationBindings(runtime.split(binding).join("disconnected(")), /navigation authority is disconnected/u);
  }
});
