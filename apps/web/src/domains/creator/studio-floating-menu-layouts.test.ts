import { describe, expect, it } from "vitest";

import { STUDIO_FLOATING_MENU_LAYOUTS } from "./studio-floating-menu-layouts";

const TOOL_MENUS = [
  STUDIO_FLOATING_MENU_LAYOUTS.asset,
  STUDIO_FLOATING_MENU_LAYOUTS.bubble,
  STUDIO_FLOATING_MENU_LAYOUTS.scene,
  STUDIO_FLOATING_MENU_LAYOUTS.style,
  STUDIO_FLOATING_MENU_LAYOUTS.ai,
] as const;

describe("studio floating menu first-open layouts", () => {
  it("gives dense desktop tool menus enough room for their grids and controls", () => {
    for (const layout of TOOL_MENUS) {
      expect(layout.width).toBeGreaterThanOrEqual(420);
      expect(layout.height).toBeGreaterThanOrEqual(580);
      expect(layout.positionLocked).toBe(false);
      expect(layout.sizeLocked).toBe(false);
    }
  });

  it("opens view options at a comfortable panel size near an edge", () => {
    const layout = STUDIO_FLOATING_MENU_LAYOUTS.viewOptions;
    expect(layout.width).toBeGreaterThanOrEqual(520);
    expect(layout.height).toBeGreaterThanOrEqual(680);
    expect(layout.dock).toBe("left");
  });
});
