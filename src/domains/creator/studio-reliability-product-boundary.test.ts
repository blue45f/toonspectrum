import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * "조용한 실패 부재" 계약 — Wave E 의 존재 이유를 소스로 고정한다.
 *
 * 실패 경로가 사용자 표면에 닿는지는 런타임 테스트로도 확인하지만, **회귀로 다시
 * 무음이 되는 것**은 호출부가 배선을 떼어낼 때 일어난다. 그래서 접합점 자체를 고정한다.
 */

const studioPage = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const statusRail = readFileSync(
  new URL("./StudioCanvasStatusRail.tsx", import.meta.url),
  "utf8",
);
const autosaveSession = readFileSync(
  new URL("./studio-autosave-opfs-session.ts", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = studioPage.indexOf(start);
  expect(startIndex, `missing anchor: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = studioPage.indexOf(end, startIndex + start.length);
  expect(endIndex, `missing anchor: ${end}`).toBeGreaterThan(startIndex);
  return studioPage.slice(startIndex, endIndex);
}

describe("Studio reliability product boundary", () => {
  it("routes the main-canvas GPU demotion to the recovery machine and the status rail", () => {
    const handler = sourceBetween(
      "function onWebGpuDeviceLost()",
      "function onWebGpuFrameReady",
    );

    expect(handler).toContain("failOverGpuAuthorityAfterSurfaceLoss()");
    expect(handler).toContain("announceStudioGpuDeviceLoss(");
  });

  it("routes autosave failure and durable-authority demotion to the user", () => {
    const autosave = sourceBetween(
      "// 오토세이브 임시저장 리스너",
      "// 서버 자동저장",
    );

    expect(autosave).toContain("onDurableAuthorityDegraded: reportStudioSaveAuthorityDegraded");
    expect(autosave).toContain("reportStudioAutosaveFailure(cause)");
    // 폴백으로 성공한 저장이 강등 고지를 지우지 못하도록 권위를 함께 넘긴다.
    expect(autosave).toContain("noteStudioSaveSucceeded(receipt.authority)");

    const failureIndex = autosave.indexOf("reportStudioAutosaveFailure(cause)");
    const consoleIndex = autosave.indexOf('console.error("Auto-save failed:"');
    // 고지가 콘솔 진단보다 먼저다 — 진단만 남기고 끝나는 경로를 만들지 않는다.
    expect(failureIndex).toBeGreaterThanOrEqual(0);
    expect(consoleIndex).toBeGreaterThan(failureIndex);
  });

  it("keeps the OPFS fallback observable instead of an empty catch", () => {
    expect(autosaveSession).toContain("onDurableAuthorityDegraded");
    expect(autosaveSession).not.toMatch(
      /catch \{\n\s*\/\/ The synchronous browser slot remains a bounded compatibility and lifecycle fallback\.\n\s*\}/,
    );
  });

  it("mounts the reliability notices inside the existing canvas status rail", () => {
    expect(statusRail).toContain(
      'import { StudioReliabilityStatusRail } from "./StudioReliabilityStatusRail"',
    );
    expect(statusRail).toContain("<StudioReliabilityStatusRail />");
    const railIndex = statusRail.indexOf("<StudioReliabilityStatusRail />");
    const autosaveBannerIndex = statusRail.indexOf("{hasAutosave && (");
    // 세션 복구 배너와 같은 레일에, 그 위에 산다.
    expect(railIndex).toBeGreaterThan(0);
    expect(autosaveBannerIndex).toBeGreaterThan(railIndex);
  });

  it("actually enforces the safe-mode quality drop instead of only flagging it", () => {
    const guard = sourceBetween(
      "function beginStudioLivingInkStroke(",
      "const fieldScale",
    );

    // 문서 의미는 그대로 — 라이브 잉크만 멈추고 보통 획 경로로 계속 그린다.
    expect(guard).toContain("studioSafeModeQuality().livingInkSuspended");
  });

  it("has no native confirm left in the studio page", () => {
    expect(studioPage).not.toContain("globalThis.confirm(");
    expect(studioPage).not.toContain("window.confirm(");
  });

  it("routes every destructive command through the preview catalog", () => {
    for (const factory of [
      "studioQuickComicReplaceRequest",
      "studioSceneSnapshotReplaceRequest",
      "studioStartFromExampleRequest",
      "studioRemoveEmeresUnderlaysRequest",
      "studioApplyTemplateRequest",
      "studioApplyPanelLayoutRequest",
      "studioApplyCollageRequest",
      "studioRestoreCheckpointRequest",
      "studioDeleteCheckpointRequest",
      "studioClearLivingInkRequest",
    ]) {
      expect(studioPage, `${factory} is not wired`).toContain(`${factory}(`);
    }
    const confirms = studioPage.match(/confirmStudioDestructiveAction\(/g) ?? [];
    expect(confirms.length).toBe(10);
  });

  it("settles every approved destruction so a refused commit cannot vanish", () => {
    const settles = studioPage.match(/settleStudioDestructiveCommit\(/g) ?? [];
    // 승인 10건 중 이메레스·콜라주 등 분기가 있는 곳은 커밋 지점이 여러 개라 승인 수보다 많다.
    expect(settles.length).toBeGreaterThanOrEqual(10);
  });
});
