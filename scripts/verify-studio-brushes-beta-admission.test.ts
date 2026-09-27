import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./verify-studio-brushes.mts", import.meta.url),
  "utf8",
);
const readinessSource = readFileSync(
  new URL("./lib/studio-drawing-readiness.ts", import.meta.url),
  "utf8",
);

describe("Studio brush browser beta admission", () => {
  it("베타 안내의 실제 닫기와 문서별 안내 재확인을 준비 helper에 연결한다", () => {
    expect(source).toContain('from "./lib/studio-drawing-readiness"');
    expect(readinessSource).toContain(
      'page.locator(\'[data-studio-beta-notice="true"]\')',
    );
    expect(readinessSource).toContain(
      '[data-studio-beta-notice-acknowledge="true"]',
    );
    // 닫기 순서·가시성 재확인·deadline은 studio-drawing-readiness.test.ts에서 실제 호출로 검증한다.
    const transientChrome = source.slice(
      source.indexOf("async function dismissTransientChrome("),
      source.indexOf("async function clearRecoveryNoticeIfPresent("),
    );
    expect(transientChrome).toContain(
      "await prepareStudioDrawingUi(page, (timeoutMs) => clearRecoveryNoticeIfPresent(page, timeoutMs))",
    );
    expect(transientChrome).toContain("else await waitForStudioDrawingReady(page)");

    const preparePage = source.slice(
      source.indexOf("async function prepareStudioPage("),
      source.indexOf("async function activateDesktopPen("),
    );
    expect(preparePage).toContain("await dismissTransientChrome(page)");
    expect(readinessSource).toContain("await close.click({ timeout: Math.min(1_000, remaining) })");
    expect(readinessSource).not.toContain("force: true");
    expect(readinessSource).not.toContain("dispatchEvent(");
  });
});
