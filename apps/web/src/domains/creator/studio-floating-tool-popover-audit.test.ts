import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const creatorDir = dirname(fileURLToPath(import.meta.url));
const source = (name: string): string => readFileSync(join(creatorDir, name), "utf8");

describe("studio long-lived tool popover audit", () => {
  it("routes every major desktop tool popover through movable window chrome", () => {
    const groups = source("StudioToolBeltCreateModeGroups.tsx");
    const insert = source("StudioToolBeltCreateModeInsertTools.tsx");

    expect(groups.match(/desktopWindow=\{\{/g)).toHaveLength(4);
    expect(groups).toContain("STUDIO_FLOATING_MENU_LAYOUTS.asset");
    expect(groups).toContain("STUDIO_FLOATING_MENU_LAYOUTS.scene");
    expect(groups).toContain("STUDIO_FLOATING_MENU_LAYOUTS.style");
    expect(groups).toContain("STUDIO_FLOATING_MENU_LAYOUTS.ai");
    expect(insert).toContain('surfaceId: "toolbar-bubble"');
    expect(insert).toContain("STUDIO_FLOATING_MENU_LAYOUTS.bubble");
  });
});
