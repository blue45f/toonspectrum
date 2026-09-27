import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appEntry = readFileSync(new URL("../../app/main.tsx", import.meta.url), "utf8");
const saveCenter = readFileSync(new URL("./StudioDraftSaveCenterImpl.tsx", import.meta.url), "utf8");
const overlayCss = readFileSync(new URL("../../app/styles/studio-overlay-stacking.css", import.meta.url), "utf8");
const mobileInspectorCss = readFileSync(new URL("./studio-inspector-responsive.css", import.meta.url), "utf8");

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

  it("열린 모바일 브러시 시트의 지우개 선택을 저장 런처가 가로채지 않는다", () => {
    expect(mobileInspectorCss).toMatch(
      /body:has\(\[data-studio-mobile-sheet="draw"\]:not\(\[aria-hidden="true"\]\)\) \[data-studio-draft-save-center\]\s*\{\s*z-index:\s*0\s*!important;/u,
    );
    expect(mobileInspectorCss).not.toContain("pointer-events: none");
    expect(saveCenter).toContain('open ? "z-[58]" : "z-[52]"');
  });
});
