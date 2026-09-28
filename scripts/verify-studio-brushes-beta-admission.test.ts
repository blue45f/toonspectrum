import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./verify-studio-brushes.mts", import.meta.url),
  "utf8",
);
const readiness = readFileSync(
  new URL("./lib/studio-drawing-readiness.ts", import.meta.url),
  "utf8",
);

describe("Studio brush browser beta admission", () => {
  it("도형의 캔버스 수신과 제스처 전후 동일 좌표계를 검증한다", () => {
    const start = source.indexOf("async function runSmartShapeMatrix");
    const end = source.indexOf("async function openMobileBrushSettings", start);
    const shapes = source.slice(start, end);
    expect(shapes).toContain("document.elementFromPoint(x, y)");
    expect(shapes).toContain('target?.closest(".konvajs-content")');
    expect(shapes).toContain("blockedPoints.length === 0");
    expect(shapes).toContain("Math.abs(releasedFrame[key] - gestureFrame[key]) < 0.5");
    expect(shapes).toContain("const calibrationFrame = fixtureStageFrames[1]!");
    expect(shapes).toContain("calibrationFrame.height");
  });
  it("브러시 검증은 문서별 안내 닫기를 소유한 공통 준비 경계를 호출한다", () => {
    expect(source).toContain('} from "./lib/studio-drawing-readiness";');
    const start = source.indexOf("async function dismissTransientChrome");
    const end = source.indexOf("async function clearRecoveryNoticeIfPresent", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const transientChrome = source.slice(start, end);
    expect(transientChrome).toContain(
      "await prepareStudioDrawingUi(page, (timeoutMs) => clearRecoveryNoticeIfPresent(page, timeoutMs))",
    );
    expect(transientChrome).toContain("await waitForStudioDrawingReady(page)");
    expect(source).toContain("await dismissTransientChrome(page);");
    expect(readiness).toContain("documentReset || !welcomeDismissed");
  });

  it("베타 안내의 안정된 선택자와 정상 닫기, 후속 안내 순서 및 가시성 재검사를 보존한다", () => {
    expect(readiness).toContain('page.locator(\'[data-studio-beta-notice="true"]\')');
    expect(readiness).toContain('[data-studio-beta-notice-acknowledge="true"]');
    expect(readiness).toContain("await close.click({ timeout: Math.min(1_000, remaining) })");
    expect(readiness).not.toMatch(/force:\s*true/u);
    const beta = readiness.indexOf("{ surface: beta,");
    const welcome = readiness.indexOf("{ surface: welcome,");
    const quickstart = readiness.indexOf("{ surface: quickstart,");
    expect(beta).toBeGreaterThan(-1);
    expect(welcome).toBeGreaterThan(beta);
    expect(quickstart).toBeGreaterThan(welcome);
    expect(readiness).toContain("if (!(await surface.isVisible())) continue;");
    expect(readiness).toContain("Promise.all(overlays.map(({ surface }) => surface.isVisible()))");
    expect(readiness).toContain("!blocked.some(Boolean)");
  });

  it("저장된 복구 사본 삭제를 현재 문서 초기화로 보고하지 않는다", () => {
    const start = source.indexOf("async function clearRecoveryNoticeIfPresent");
    const end = source.indexOf("async function clearStudioVerifierOriginStorage", start);
    const clearRecovery = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(clearRecovery).toContain('name: "이전 그림 영구 삭제", exact: true');
    expect(clearRecovery).toContain('await confirmation.waitFor({ state: "hidden", timeout: remaining() })');
    expect(clearRecovery).toContain('await recovery.waitFor({ state: "hidden", timeout: remaining() })');
    expect(clearRecovery).not.toContain("return true;");
    expect(clearRecovery).toMatch(/return false;\s*\}\s*$/u);

    const autosaveRuntime = readFileSync(
      new URL("../apps/web/src/domains/creator/studio-page-autosave-runtime.ts", import.meta.url), "utf8",
    );
    const clearStart = autosaveRuntime.indexOf("export async function clearStudioAutosaveRecord");
    const clearEnd = autosaveRuntime.indexOf("export interface StudioClearAutosaveContext", clearStart);
    const clearRecord = autosaveRuntime.slice(clearStart, clearEnd);
    expect(clearStart).toBeGreaterThan(-1);
    expect(clearEnd).toBeGreaterThan(clearStart);
    expect(clearRecord).toContain("await clearAutosaveDurableAuthority()");
    expect(clearRecord).toContain("setHasAutosave(false)");
    expect(clearRecord).not.toMatch(/setPages|setCurrentPageId|replaceDocument|resetDocument/u);
  });
});
