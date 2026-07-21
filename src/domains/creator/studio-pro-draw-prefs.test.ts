import { describe, expect, it } from "vitest";

import {
  applyBrushPresetWithLocks,
  cycleStudioStabilizerStrength,
  loadStudioProDrawPrefs,
  normalizeStudioProDrawPrefs,
  rememberRecentBrushId,
  saveStudioProDrawPrefs,
  toggleFavoriteBrushId,
} from "./studio-pro-draw-prefs";

describe("studio pro draw prefs", () => {
  it("applies Procreate-style size and opacity locks when switching brushes", () => {
    const preset = { id: "marker", defaultWidth: 16, defaultOpacity: 0.6, defaultColor: "#112233" };
    const current = { strokeWidth: 4, brushOpacity: 0.9, color: "#abcdef" };

    expect(applyBrushPresetWithLocks(preset, { sizeLocked: false, opacityLocked: false }, current)).toEqual({
      brushId: "marker",
      strokeWidth: 16,
      brushOpacity: 0.6,
      color: "#abcdef",
    });
    expect(applyBrushPresetWithLocks(preset, { sizeLocked: true, opacityLocked: true }, current)).toEqual({
      brushId: "marker",
      strokeWidth: 4,
      brushOpacity: 0.9,
      color: "#abcdef",
    });
  });

  it("treats a special brush default color as preview metadata only", () => {
    expect(
      applyBrushPresetWithLocks(
        { id: "star-dust", defaultWidth: 18, defaultOpacity: 0.9, defaultColor: "#f8fafc" },
        { sizeLocked: false, opacityLocked: false },
        { strokeWidth: 6, brushOpacity: 1, color: "#7c3aed" }
      ).color
    ).toBe("#7c3aed");
  });

  it("remembers recent and favorite built-in brushes", () => {
    let prefs = normalizeStudioProDrawPrefs(null);
    prefs = rememberRecentBrushId(prefs, "pen");
    prefs = rememberRecentBrushId(prefs, "marker");
    prefs = rememberRecentBrushId(prefs, "pen");
    expect(prefs.recentBrushIds[0]).toBe("pen");
    expect(prefs.recentBrushIds[1]).toBe("marker");

    prefs = toggleFavoriteBrushId(prefs, "watercolor");
    expect(prefs.favoriteBrushIds).toContain("watercolor");
    prefs = toggleFavoriteBrushId(prefs, "watercolor");
    expect(prefs.favoriteBrushIds).not.toContain("watercolor");
  });

  it("keeps optional procedural pack identities in recent and favorites", () => {
    let prefs = normalizeStudioProDrawPrefs({
      recentBrushIds: ["heart-stamp", "unknown-pack-brush"],
      favoriteBrushIds: ["hair-fiber", "not-a-brush"],
    });

    expect(prefs.recentBrushIds).toEqual(["heart-stamp"]);
    expect(prefs.favoriteBrushIds).toEqual(["hair-fiber"]);

    prefs = rememberRecentBrushId(prefs, "checker-grid");
    prefs = toggleFavoriteBrushId(prefs, "footstep-stamp");
    expect(prefs.recentBrushIds[0]).toBe("checker-grid");
    expect(prefs.favoriteBrushIds).toContain("footstep-stamp");
  });

  it("cycles SAI/CSP-style stabilizer steps", () => {
    expect(cycleStudioStabilizerStrength(0)).toBe(3);
    expect(cycleStudioStabilizerStrength(3)).toBe(6);
    expect(cycleStudioStabilizerStrength(6)).toBe(10);
    expect(cycleStudioStabilizerStrength(10)).toBe(0);
    expect(cycleStudioStabilizerStrength(4)).toBe(6);
  });

  it("round-trips through storage", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    expect(
      saveStudioProDrawPrefs(storage, {
        sizeLocked: true,
        opacityLocked: false,
        recentBrushIds: ["pen", "gpen"],
        favoriteBrushIds: ["marker"],
      })
    ).toBe(true);
    expect(loadStudioProDrawPrefs(storage)).toMatchObject({
      sizeLocked: true,
      recentBrushIds: ["pen", "gpen"],
      favoriteBrushIds: ["marker"],
    });
  });
});
