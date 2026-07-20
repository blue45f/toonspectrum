import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

describe("shared asset lazy-content integration boundary", () => {
  it("click insert가 await 이전 page/master scope를 캡처하고 같은 scope일 때만 커밋한다", () => {
    const start = source.indexOf("async function onUseSharedAsset(");
    const end = source.indexOf("async function onDeleteSharedAsset(", start);
    const handler = source.slice(start, end);
    const targetPageIndex = handler.indexOf("const targetPageId = activePage.id;");
    const targetMasterIndex = handler.indexOf("const targetMasterEditMode = masterEditMode;");
    const awaitIndex = handler.indexOf("await loadCommunityAssetContent(asset)");

    expect(targetPageIndex).toBeGreaterThan(0);
    expect(targetMasterIndex).toBeGreaterThan(targetPageIndex);
    expect(awaitIndex).toBeGreaterThan(targetMasterIndex);
    expect(handler).toContain("isStudioPasteScopeCurrent({");
    expect(handler).toContain("currentPageId: currentPageIdRef.current");
    expect(handler).toContain("currentMasterEditMode: masterEditModeRef.current");
    expect(handler.indexOf("recordCommunityAssetUse(asset.id)")).toBeGreaterThan(
      handler.indexOf("addRenderedImage(content.dataUrl")
    );
  });

  it("community drop은 네트워크 전에 문서 좌표를 고정하고 성공 삽입 뒤에만 사용을 집계한다", () => {
    const start = source.indexOf('if (payload.source === "community")');
    const end = source.indexOf('if (payload.source === "local")', start);
    const branch = source.slice(start, end);
    const pointIndex = branch.indexOf("const communityDropPoint = dropStagePoint();");
    const awaitIndex = branch.indexOf("await loadCommunityAssetContent(asset)");

    expect(pointIndex).toBeGreaterThan(0);
    expect(awaitIndex).toBeGreaterThan(pointIndex);
    expect(branch).toContain("}, communityDropPoint);");
    expect(branch).toContain("if (inserted) recordCommunityAssetUse(asset.id)");
  });
});
