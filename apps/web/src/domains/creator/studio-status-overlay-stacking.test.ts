import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appEntry = readFileSync(new URL("../../app/main.tsx", import.meta.url), "utf8");
const saveCenter = readFileSync(new URL("./StudioDraftSaveCenterImpl.tsx", import.meta.url), "utf8");
const overlayCss = readFileSync(new URL("../../app/styles/studio-overlay-stacking.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("./studio-inspector-responsive.css", import.meta.url), "utf8");
const offlinePanel = readFileSync(new URL("./offline/StudioOfflinePanel.tsx", import.meta.url), "utf8");

describe("Studio global status overlay stacking", () => {
  it("loads the narrowly scoped Studio overlay boundary", () => {
    expect(appEntry).toContain('import "./styles/studio-overlay-stacking.css";');
    expect(overlayCss).toContain('[data-studio-status-notice-dismiss="true"]');
    expect(overlayCss).toContain('[role="status"]:has(>');
  });

  it("sequences the beta notice before the quick-start coach", () => {
    expect(overlayCss).toContain(
      'html:has([data-studio-beta-notice-host="true"]) [data-studio-creative-starter="true"]',
    );
    expect(overlayCss).toMatch(
      /data-studio-creative-starter="true"\]\s*\{\s*display:\s*none\s*!important;/u,
    );
  });

  it("keeps a dismissible notice above the fixed Draft Save Center", () => {
    const saveCenterZ = saveCenter.match(/data-studio-draft-save-center[\s\S]{0,800}?z-\[(\d+)\]/)?.[1]
      ?? saveCenter.match(/z-\[(58)\]/)?.[1];
    const noticeZ = overlayCss.match(/z-index:\s*(\d+)/)?.[1];

    expect(saveCenterZ).toBeTruthy();
    expect(noticeZ).toBeTruthy();
    expect(Number(noticeZ)).toBeGreaterThan(Number(saveCenterZ));
  });

  it("does not weaken pointer handling on the save control", () => {
    expect(saveCenter).toContain("pointer-events-auto fixed");
    expect(overlayCss).not.toContain("pointer-events: none");
  });

  it("keeps the passive save launcher below the isolated drawing sheet only while it is open", () => {
    const drawingRule = responsiveCss.match(
      /body:has\(\[data-studio-mobile-sheet="draw"\]:not\(\[aria-hidden="true"\]\)\) \[data-studio-draft-save-center\]\s*\{([^}]+)\}/u,
    )?.[1];
    expect(drawingRule).toBeDefined();
    expect(drawingRule).toMatch(/z-index:\s*0\s*!important/u);
    expect(drawingRule).not.toMatch(/display|visibility|pointer-events/u);
    expect(saveCenter).toContain('aria-live="polite"');
    expect(saveCenter).toContain('open ? "z-[58]" : "z-[52]"');
  });

  it("keeps offline recovery controls below an open drawing sheet without disabling the warning", () => {
    const drawingRule = responsiveCss.match(
      /body:has\(\[data-studio-mobile-sheet="draw"\]:not\(\[aria-hidden="true"\]\)\) \[data-studio-shell-floating-target="offline-readiness"\]\s*\{([^}]+)\}/u,
    )?.[1];

    expect(drawingRule).toBeDefined();
    expect(drawingRule).toMatch(/z-index:\s*0\s*!important/u);
    expect(drawingRule).not.toMatch(/display|visibility|pointer-events/u);
    expect(responsiveCss).toContain('@media (max-width: 63.999rem)');
    expect(offlinePanel).toContain('data-studio-shell-floating-target="offline-readiness"');
    expect(offlinePanel).toContain('data-studio-shell-force-visible="true"');
    expect(offlinePanel).toContain('<summary');
    expect(offlinePanel).toContain('z-40');
  });
  it("서비스 알림을 숨기지 않고 실제 높이 위로 베타 확인 버튼을 올린다", () => {
    expect(overlayCss).toContain("var(--service-status-overlay-clearance, 0px)");
    expect(overlayCss).toMatch(/bottom: max\(1rem, var\(--service-status-overlay-clearance, 0px\)\)/u);
    expect(overlayCss).toContain("bottom: max(calc(5.75rem + env(safe-area-inset-bottom))");
    expect(overlayCss).not.toMatch(/data-service-degraded-banner[^}]+display:\s*none/u);
  });

  it("lifts the canvas status bar above the fixed service banner", () => {
    expect(overlayCss).toContain(
      'html:has([data-service-degraded-banner="degraded"]) [data-studio-status-bar="true"]',
    );
    expect(overlayCss).toMatch(
      /\[data-studio-status-bar="true"\]\s*\{\s*bottom:\s*max\(0\.875rem, var\(--service-status-overlay-clearance, 0px\)\)/u,
    );
  });

  it("stops the service banner from intercepting clicks while a modal owns the viewport", () => {
    // 360x640 에서 배너가 필터 다이얼로그 버튼을 가로막아 브라우저 게이트가 실패했다.
    const modalOpenBannerRule = overlayCss.match(
      /html:has\(\[role="dialog"\]\[aria-modal="true"\]\) \[data-service-degraded-banner\]\s*\{([^}]+)\}/u,
    )?.[1];
    expect(modalOpenBannerRule).toBeDefined();
    // 모달(z-80) 아래로 내려야 배너가 클릭을 가로채지 않는다. 배너의 기본 층은 confirm(90)이다.
    expect(modalOpenBannerRule).toMatch(/z-index:\s*70/u);
    // 이 파일은 배너를 숨기지도, 포인터 처리도 건드리지 않는다(전역 불변식).
    expect(modalOpenBannerRule).not.toMatch(/display|visibility|pointer-events/u);
  });

});
