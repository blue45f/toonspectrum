import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "./studio-brush";
import { STUDIO_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import {
  listStudioBrushTrayItems,
  listStudioQuickBrushTrayItems,
  STUDIO_BEGINNER_BRUSH_IDS,
  STUDIO_CREATIVE_STARTER_CARDS,
  studioBrushTrayItem,
} from "./studio-creative-ux";

describe("studio creative ux", () => {
  it("orders beginner brushes first for Canva/Express-style kits", () => {
    const beginner = listStudioBrushTrayItems("beginner");
    expect(beginner.map((item) => item.id)).toEqual([...STUDIO_BEGINNER_BRUSH_IDS]);
    expect(beginner.every((item) => item.category === "beginner")).toBe(true);
    expect(beginner.slice(0, 2).map((item) => item.id)).toEqual(["pen", "gpen"]);
  });

  it("covers every BRUSH_PRESETS entry exactly once in the full tray", () => {
    const all = listStudioBrushTrayItems("all");
    expect(all).toHaveLength(BRUSH_PRESETS.length);
    expect(new Set(all.map((item) => item.id)).size).toBe(BRUSH_PRESETS.length);
  });

  it("keeps the Pro pack out of the eager core tray so its full dynamics stay lazy", () => {
    expect(listStudioBrushTrayItems("pro")).toEqual([]);
    expect(listStudioBrushTrayItems("all")).toHaveLength(93);
  });

  it("filters Picsart-style media groups", () => {
    const markers = listStudioBrushTrayItems("marker");
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((item) => item.mediaGroup === "marker")).toBe(true);
    expect(markers.some((item) => item.id === "neon")).toBe(true);
    const fx = listStudioBrushTrayItems("fx");
    expect(fx.some((item) => item.id === "glow")).toBe(true);
    expect(fx.some((item) => item.id === "glitter")).toBe(true);
    expect(fx.every((item) => item.mediaGroup === "fx")).toBe(true);
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
    expect(studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "liner")!).previewStyle).toBe("calligraphy");
    expect(studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "marker-bold")!).previewStyle).toBe("solid");
    expect(studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "highlighter")!).previewStyle).toBe("solid");
    expect(studioBrushTrayItem(BRUSH_PRESETS.find((p) => p.id === "spray")!).previewStyle).toBe("dots");
  });

  it("builds a deduplicated favorite and recent quick shelf with beginner fallback", () => {
    const quick = listStudioQuickBrushTrayItems({
      favoriteIds: ["glow", "missing", "pen"],
      recentIds: ["marker", "glow", "gpen"],
      limit: 8,
    });

    expect(quick.map((item) => item.id)).toEqual([
      "glow",
      "pen",
      "marker",
      "gpen",
      "watercolor",
      "airbrush",
      "fineliner",
      "pencil",
    ]);
    expect(quick.map((item) => item.quickSource)).toEqual([
      "favorite",
      "favorite",
      "recent",
      "recent",
      "starter",
      "starter",
      "starter",
      "starter",
    ]);
    expect(new Set(quick.map((item) => item.id)).size).toBe(quick.length);
  });

  it("uses the beginner kit when quick brush history is empty and respects zero limit", () => {
    const quickIds = listStudioQuickBrushTrayItems().map((item) => item.id);
    expect(quickIds).toEqual([...STUDIO_BEGINNER_BRUSH_IDS.slice(0, 8)]);
    // Wash + air must stay on the empty-history shelf so bleed brushes are one tap away.
    expect(quickIds).toContain("watercolor");
    expect(quickIds).toContain("airbrush");
    expect(listStudioQuickBrushTrayItems({ limit: 0 })).toEqual([]);
  });

  it("resolves Pro favorites and recent brushes from the expanded 253-item catalogue", () => {
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(253);

    const quick = listStudioQuickBrushTrayItems({
      catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
      favoriteIds: ["heart-stamp"],
      recentIds: ["hair-fiber", "heart-stamp", "pen"],
      limit: 4,
    });

    expect(quick.map((item) => item.id)).toEqual([
      "heart-stamp",
      "hair-fiber",
      "pen",
      "gpen",
    ]);
    expect(quick.map((item) => item.quickSource)).toEqual([
      "favorite",
      "recent",
      "recent",
      "starter",
    ]);
    expect(quick[0]?.name).toBe("하트 도장");
    expect(quick[1]?.name).toBe("머리카락 결");
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
