import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appEntry = readFileSync(new URL("../../app/main.tsx", import.meta.url), "utf8");
const saveCenter = readFileSync(new URL("./StudioDraftSaveCenterImpl.tsx", import.meta.url), "utf8");
const overlayCss = readFileSync(new URL("../../styles/studio-overlay-stacking.css", import.meta.url), "utf8");

describe("Studio global status overlay stacking", () => {
  it("loads the narrowly scoped Studio overlay boundary", () => {
    expect(appEntry).toContain('import "../styles/studio-overlay-stacking.css";');
    expect(overlayCss).toContain('[data-studio-status-notice-dismiss="true"]');
    expect(overlayCss).toContain('[role="status"]:has(>');
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
});
