import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./verify-studio-brushes.mts", import.meta.url),
  "utf8",
);

describe("Studio brush browser beta admission", () => {
  it("캔버스 수화 후 시작 안내를 실제로 닫은 다음 아래의 빠른 시작 UI를 조작한다", () => {
    const start = source.indexOf("async function dismissTransientChrome");
    const end = source.indexOf("async function prepareStudioPage", start);
    const admission = source.slice(start, end);
    const hydrated = admission.indexOf('page.locator(".konvajs-content")');
    const dismissWelcome = admission.indexOf("await dismissCinematicCanvasWelcome(page)");
    const quickstart = admission.indexOf("const quickstart = page.locator");
    expect(hydrated).toBeGreaterThan(-1);
    expect(dismissWelcome).toBeGreaterThan(hydrated);
    expect(quickstart).toBeGreaterThan(dismissWelcome);
    const welcomeStart = source.indexOf("async function dismissCinematicCanvasWelcome");
    const welcomeEnd = source.indexOf("async function dismissQuickStartOverlay", welcomeStart);
    const welcome = source.slice(welcomeStart, welcomeEnd);
    expect(welcome).toContain('getByRole("button", { name: "시작 안내 닫기", exact: true }).click()');
    expect(welcome).toContain('welcome.waitFor({ state: "hidden" })');
    expect(welcome).not.toMatch(/force:\s*true|dispatchEvent|evaluate/u);
  });

  it("도형의 캔버스 수신과 제스처 전후 동일 좌표계를 검증한다", () => {
    const start = source.indexOf("async function runSmartShapeMatrix");
    const end = source.indexOf("async function openMobileBrushSettings", start);
    const shapes = source.slice(start, end);
    expect(shapes).toContain('document.elementFromPoint(x, y)');
    expect(shapes).toContain('target?.closest(".konvajs-content")');
    expect(shapes).toContain("blockedPoints.length === 0");
    expect(shapes).toContain("Math.abs(releasedFrame[key] - gestureFrame[key]) < 0.5");
    expect(shapes).toContain("const calibrationFrame = fixtureStageFrames[1]!");
    expect(shapes).toContain("calibrationFrame.height");
  });

  it("dismisses the beta notice through the stable product selector before transient chrome", () => {
    expect(source).toContain(
      'page.locator(\'[data-studio-beta-notice="true"]\')',
    );
    expect(source).toContain(
      '[data-studio-beta-notice-acknowledge="true"]',
    );
    expect(source).toContain(
      'acknowledge.click({ timeout: 30_000, noWaitAfter: true })',
    );
    expect(source).toContain(
      'notice.waitFor({ state: "hidden", timeout: 30_000 })',
    );

    const transientChrome = source.indexOf(
      "async function dismissTransientChrome",
    );
    const admission = source.indexOf(
      "await acknowledgeStudioBetaNoticeIfPresent(page);",
      transientChrome,
    );
    const quickstart = source.indexOf(
      "const quickstart = page.locator",
      transientChrome,
    );

    expect(transientChrome).toBeGreaterThan(-1);
    expect(admission).toBeGreaterThan(transientChrome);
    expect(quickstart).toBeGreaterThan(admission);
  });
});
