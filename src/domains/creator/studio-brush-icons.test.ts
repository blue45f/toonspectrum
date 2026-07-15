import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "./studio-brush";
import { STUDIO_BRUSH_ICON_BY_ID, studioBrushIconId } from "./studio-brush-icons";

describe("studio-brush-icons", () => {
  it("maps every built-in brush preset to a non-default icon key when listed", () => {
    for (const preset of BRUSH_PRESETS) {
      const key = studioBrushIconId(preset.id);
      expect(key.length).toBeGreaterThan(0);
      // Known presets should have explicit keys
      expect(STUDIO_BRUSH_ICON_BY_ID[preset.id]).toBeDefined();
      expect(key).not.toBe("default");
    }
  });

  it("falls back for unknown ids", () => {
    expect(studioBrushIconId("unknown-brush")).toBe("default");
    expect(studioBrushIconId(null)).toBe("default");
  });

  it("uses distinctive icons for fx and paint families", () => {
    expect(studioBrushIconId("glitter")).toBe("star");
    expect(studioBrushIconId("glow")).toBe("sparkles");
    expect(studioBrushIconId("watercolor")).toBe("droplets");
    expect(studioBrushIconId("spray")).toBe("spray-can");
    expect(studioBrushIconId("screentone")).toBe("grid-3x3");
  });
});
