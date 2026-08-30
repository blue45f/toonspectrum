import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(new URL("../StudioPage.tsx", import.meta.url), "utf8");

function applyBg3dRenderedImageBody(): string {
  const start = studioPageSource.indexOf("async function applyBg3dRenderedImage(");
  const end = studioPageSource.indexOf("async function addBuiltinRasterAsset", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return studioPageSource.slice(start, end);
}

/**
 * `/studio` publishes a `?room=work-instant-…` jam for every session that has no saved work id,
 * and a saved work opens an ACL document — so `isRealtimeTeamSession` is true on the paths users
 * actually arrive through. When this branch failed closed, that made the 3D background impossible
 * to attach to the canvas anywhere, which is the defect these assertions exist to prevent
 * returning.
 */
describe("Studio BG3D realtime-room insert materialization", () => {
  it("materializes a merged composite in a realtime room instead of failing closed", () => {
    const body = applyBg3dRenderedImageBody();
    const realtimeBranch = body.indexOf("if (isRealtimeTeamSession) {");
    const masterBranch = body.indexOf("if (masterEditMode) {");

    expect(realtimeBranch).toBeGreaterThanOrEqual(0);
    expect(masterBranch).toBeGreaterThan(realtimeBranch);

    const realtime = body.slice(realtimeBranch, masterBranch);
    expect(realtime).toContain("materializeBg3dMergedComposite(");
    expect(realtime).toContain("return true;");
    // The old dead end. A realtime room now gets a real layer, not a refusal.
    expect(realtime).not.toContain("3D Shot·Stage·Canvas");
  });

  it("keeps the separated LT bundle out of a realtime room", () => {
    const body = applyBg3dRenderedImageBody();

    expect(body.indexOf("if (isRealtimeTeamSession) {")).toBeLessThan(
      body.indexOf("const plan = planStudioBg3dLtLayers"),
    );
    expect(body.indexOf("if (isRealtimeTeamSession) {")).toBeLessThan(
      body.indexOf("resolveStudioBg3dLtLinkedScene({"),
    );
  });

  it("publishes only self-contained element state from the merged composite", () => {
    const body = applyBg3dRenderedImageBody();
    const start = body.indexOf("function materializeBg3dMergedComposite(");
    // Stop at the comment that introduces the realtime branch: it names the very identifiers
    // this test asserts the merged element does not carry.
    const end = body.indexOf("// linked3dRender, shared3dStage", start);
    const merged = body.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    // A raster body plus the embedded scene document — both values, resolvable by any peer.
    expect(merged).toContain("src: result.compositePngDataUrl,");
    expect(merged).toContain("bg3dScene: result.bg3dScene,");
    // No id that points at Scene or LT raster bodies living outside the element.
    expect(merged).toContain("bg3dLtBundleId: undefined,");
    expect(merged).toContain("bg3dLtRole: undefined,");
    expect(merged).toContain("bg3dLtRenderMode: undefined,");
    expect(merged).not.toContain("linked3dRender");
    expect(merged).not.toContain("shared3dStage");
    // Fail-closed commit wiring survives the extraction.
    expect(merged).toContain("if (!patchEl(targetElementId, {");
    expect(merged).toContain("if (!addEl({");
  });

  it("reports a merged insert as a neutral notice, not as an error", () => {
    const body = applyBg3dRenderedImageBody();
    const realtime = body.slice(
      body.indexOf("if (isRealtimeTeamSession) {"),
      body.indexOf("if (masterEditMode) {"),
    );

    expect(realtime).toContain("setStatusNotice(");
    expect(realtime).toContain("한 레이어로 합쳐 추가했어요");
    // The status rail renders `error` with the "bad" tone and an "오류 메시지 닫기" control, so a
    // successful insert must never travel that channel.
    expect(realtime).not.toContain("setError(\n        \"실시간 공동 편집이라");
  });

  it("clears a stale notice when a new 3D background insert starts", () => {
    const body = applyBg3dRenderedImageBody();
    const head = body.slice(0, body.indexOf("const anchorLayer"));

    expect(head).toContain("setError(null);");
    expect(head).toContain("setStatusNotice(null);");
  });
});
