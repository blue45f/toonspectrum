const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";

import { verifyVirtualStudioImagegen25V7, verifyVirtualStudioRuntimeBackdrops } from "./verify-virtual-studio-imagegen25-v7.mjs";

test("Virtual Studio ImageGen 2.5 v7 ships places, backdrops and terrain with provenance", async () => {
  const result = await verifyVirtualStudioImagegen25V7();
  assert.equal(result.files, 19);
  assert.equal(result.places, 14);
  assert.equal(result.runtimeBackdrops, 24);
  assert.ok(result.bytes > 500_000);
});

test("배경 이관 후에도 동일 파일 재사용·미등록 경로·팩 탈출을 거부한다", async () => {
  await assert.rejects(verifyVirtualStudioRuntimeBackdrops(() => "/assets/virtual-studio/experience-v8/sky.png"), /independent assets/u);
  await assert.rejects(verifyVirtualStudioRuntimeBackdrops(() => "/assets/virtual-studio/experience-v8/missing.png"), /absent from the source manifest/u);
  await assert.rejects(verifyVirtualStudioRuntimeBackdrops(() => "/assets/virtual-studio/experience-v8/../sky.png"), /unsafe runtime backdrop path/u);
  await assert.rejects(verifyVirtualStudioRuntimeBackdrops(() => "/assets/virtual-studio/imagegen25-v7/backgrounds/sky.webp"), /declared v8 pack/u);
});
