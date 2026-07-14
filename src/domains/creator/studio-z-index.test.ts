import { describe, expect, it } from "vitest";

import { STUDIO_Z, STUDIO_Z_CLASS } from "./studio-z-index";

describe("studio z-index scale", () => {
  it("orders chrome so menubar outranks options, and menus outrank chrome", () => {
    expect(STUDIO_Z.canvasHud).toBeLessThan(STUDIO_Z.toolRail);
    expect(STUDIO_Z.toolRail).toBeLessThan(STUDIO_Z.toolBelt);
    expect(STUDIO_Z.toolBelt).toBeLessThan(STUDIO_Z.optionsStrip);
    expect(STUDIO_Z.optionsStrip).toBeLessThan(STUDIO_Z.menubar);
    expect(STUDIO_Z.menubar).toBeLessThan(STUDIO_Z.menubarMenu);
    expect(STUDIO_Z.menubarMenu).toBeLessThan(STUDIO_Z.toolPopover);
    expect(STUDIO_Z.toolPopover).toBeLessThan(STUDIO_Z.modal);
    expect(STUDIO_Z.modal).toBeLessThan(STUDIO_Z.confirm);
    expect(STUDIO_Z.confirm).toBeLessThan(STUDIO_Z.workspace);
    expect(STUDIO_Z.workspace).toBeLessThan(STUDIO_Z.help);
    expect(STUDIO_Z.help).toBeLessThan(STUDIO_Z.legal);
  });

  it("exposes matching Tailwind arbitrary class tokens", () => {
    expect(STUDIO_Z_CLASS.menubar).toBe("z-[50]");
    expect(STUDIO_Z_CLASS.menubarMenu).toBe("z-[60]");
    expect(STUDIO_Z_CLASS.toolPopover).toBe("z-[70]");
    expect(STUDIO_Z_CLASS.modal).toBe("z-[80]");
    expect(STUDIO_Z_CLASS.workspace).toBe("z-[100]");
  });
});
