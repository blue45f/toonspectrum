import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioLift3dPage.tsx", import.meta.url), "utf8");

describe("Studio Lift3D preview touch targets", () => {
  it("keeps all semantic preview tabs keyboard-visible and at least 44px tall", () => {
    const tabsStart = source.indexOf("{PREVIEW_TABS.map((candidate) => (");
    const tabsEnd = source.indexOf("</button>", tabsStart);

    expect(tabsStart).toBeGreaterThan(-1);
    expect(tabsEnd).toBeGreaterThan(tabsStart);

    const tabButton = source.slice(tabsStart, tabsEnd);
    expect(tabButton).toContain('role="tab"');
    expect(tabButton).toContain("aria-selected={tab === candidate}");
    expect(tabButton).toContain('className={`min-h-11 flex-1 rounded-md');
    expect(tabButton).toContain("focus-visible:outline-accent");
    expect(tabButton).not.toContain('className={`min-h-9 flex-1 rounded-md');
  });
});
