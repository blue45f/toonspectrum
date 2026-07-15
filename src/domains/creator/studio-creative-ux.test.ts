import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "./studio-brush";
import {
  listStudioBrushTrayItems,
  STUDIO_BEGINNER_BRUSH_IDS,
  STUDIO_CREATIVE_STARTER_CARDS,
  studioBrushTrayItem,
} from "./studio-creative-ux";

describe("studio creative ux", () => {
  it("orders beginner brushes first for Canva/Express-style kits", () => {
    const beginner = listStudioBrushTrayItems("beginner");
    expect(beginner.map((item) => item.id)).toEqual([...STUDIO_BEGINNER_BRUSH_IDS]);
    expect(beginner.every((item) => item.category === "beginner")).toBe(true);
  });

  it("covers every BRUSH_PRESETS entry exactly once in the full tray", () => {
    const all = listStudioBrushTrayItems("all");
    expect(all).toHaveLength(BRUSH_PRESETS.length);
    expect(new Set(all.map((item) => item.id)).size).toBe(BRUSH_PRESETS.length);
  });

  it("filters Picsart-style media groups", () => {
    const markers = listStudioBrushTrayItems("marker");
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((item) => item.mediaGroup === "marker")).toBe(true);
    expect(markers.some((item) => item.id === "neon")).toBe(true);
  });

  it("builds short labels and preview weights for tray chips", () => {
    const pen = studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "pen")!);
    expect(pen.shortName).toBe("펜");
    expect(pen.previewWeight).toBeGreaterThan(0);
    expect(pen.hint.length).toBeGreaterThan(4);
    expect(pen.previewStyle).toBe("solid");
    const neon = studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "neon")!);
    expect(neon.previewStyle).toBe("neon");
    const tone = studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "screentone")!);
    expect(tone.previewStyle).toBe("tone");
    const gpen = studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "gpen")!);
    expect(gpen.previewStyle).toBe("calligraphy");
  });

  it("exposes drawing-first starter cards without publish marketing", () => {
    const ids = STUDIO_CREATIVE_STARTER_CARDS.map((card) => card.id);
    expect(ids).toContain("smart-shape");
    expect(ids).toContain("brush-kit");
    expect(ids).toContain("collab-focus");
    expect(ids).toContain("draw");
    expect(ids).not.toContain("publish");
    expect(STUDIO_CREATIVE_STARTER_CARDS.every((card) => card.label && card.hint)).toBe(true);
  });
});
