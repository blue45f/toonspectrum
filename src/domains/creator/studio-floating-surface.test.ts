import { describe, expect, it } from "vitest";

import {
  createStudioFloatingSurfaceLayout,
  loadStudioFloatingSurfaceLayout,
  moveStudioFloatingSurfaceRect,
  normalizeStudioFloatingSurfaceLayout,
  resizeStudioFloatingSurfaceRect,
  resolveStudioFloatingSurfaceRect,
  saveStudioFloatingSurfaceLayout,
  studioFloatingSurfaceLayoutsEqual,
  STUDIO_FLOATING_SURFACE_MAX_SERIALIZED_LENGTH,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceStorage,
} from "./studio-floating-surface";

const VIEWPORT = {
  width: 1_000,
  height: 800,
  insetTop: 60,
  insetRight: 10,
  insetBottom: 10,
  insetLeft: 10,
} as const;

const CONSTRAINTS: StudioFloatingSurfaceConstraints = {
  minWidth: 240,
  minHeight: 200,
  maxWidth: 600,
  maxHeight: 700,
  snapDistance: 12,
};

const FALLBACK = Object.freeze({
  version: 1 as const,
  xRatio: 1,
  yRatio: 0,
  width: 300,
  height: 400,
});

function memoryStorage(initial: Record<string, string> = {}):
  StudioFloatingSurfaceStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe("studio floating surface geometry", () => {
  it("rebuilds an exact bounded allowlist from untrusted input", () => {
    const normalized = normalizeStudioFloatingSurfaceLayout({
      version: 1,
      xRatio: 7,
      yRatio: -3,
      width: 412.7,
      height: Number.POSITIVE_INFINITY,
      providerToken: "must-drop",
    }, FALLBACK);

    expect(normalized).toEqual({
      version: 1,
      xRatio: 1,
      yRatio: 0,
      width: 413,
      height: 400,
    });
    expect(Object.keys(normalized)).toEqual([
      "version",
      "xRatio",
      "yRatio",
      "width",
      "height",
    ]);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it("restores the default right-top placement inside viewport insets", () => {
    expect(resolveStudioFloatingSurfaceRect(
      FALLBACK,
      VIEWPORT,
      CONSTRAINTS,
      FALLBACK,
    )).toEqual({
      x: 690,
      y: 60,
      width: 300,
      height: 400,
    });
  });

  it("round-trips pixels through ratios and survives viewport changes", () => {
    const layout = createStudioFloatingSurfaceLayout({
      x: 350,
      y: 210,
      width: 320,
      height: 420,
    }, VIEWPORT, CONSTRAINTS);

    expect(resolveStudioFloatingSurfaceRect(
      layout,
      VIEWPORT,
      CONSTRAINTS,
      FALLBACK,
    )).toEqual({
      x: 350,
      y: 210,
      width: 320,
      height: 420,
    });

    const wider = resolveStudioFloatingSurfaceRect(
      layout,
      { ...VIEWPORT, width: 1_400 },
      CONSTRAINTS,
      FALLBACK,
    );
    expect(wider.x).toBeGreaterThan(350);
    expect(wider.y).toBe(210);
  });

  it("keeps moves visible and snaps near every safe viewport edge", () => {
    const start = { x: 20, y: 70, width: 300, height: 400 };
    expect(moveStudioFloatingSurfaceRect(
      start,
      -4,
      -5,
      VIEWPORT,
      CONSTRAINTS,
      true,
    )).toEqual({ x: 10, y: 60, width: 300, height: 400 });

    expect(moveStudioFloatingSurfaceRect(
      start,
      10_000,
      10_000,
      VIEWPORT,
      CONSTRAINTS,
      true,
    )).toEqual({ x: 690, y: 390, width: 300, height: 400 });
  });

  it("resizes from the bottom-right while enforcing panel and viewport bounds", () => {
    expect(resizeStudioFloatingSurfaceRect(
      { x: 650, y: 300, width: 300, height: 300 },
      500,
      500,
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 650,
      y: 300,
      width: 340,
      height: 490,
    });

    expect(resizeStudioFloatingSurfaceRect(
      { x: 100, y: 100, width: 300, height: 300 },
      -500,
      -500,
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 100,
      y: 100,
      width: 240,
      height: 200,
    });
  });

  it("compares normalized layout values without relying on identity", () => {
    const clone = { ...FALLBACK };
    expect(studioFloatingSurfaceLayoutsEqual(FALLBACK, clone)).toBe(true);
    expect(studioFloatingSurfaceLayoutsEqual(
      FALLBACK,
      { ...clone, xRatio: 0.5 },
    )).toBe(false);
    expect(studioFloatingSurfaceLayoutsEqual(undefined, undefined)).toBe(true);
  });
});

describe("studio floating surface bounded storage adapter", () => {
  it("writes and reads only the exact UI layout fields", () => {
    const storage = memoryStorage();
    expect(saveStudioFloatingSurfaceLayout(storage, "surface", {
      ...FALLBACK,
      xRatio: 0.432145,
    })).toBe(true);

    const encoded = storage.values.get("surface")!;
    expect(JSON.parse(encoded)).toEqual({
      version: 1,
      xRatio: 0.4321,
      yRatio: 0,
      width: 300,
      height: 400,
    });
    expect(loadStudioFloatingSurfaceLayout(
      storage,
      "surface",
      FALLBACK,
    )).toEqual({
      version: 1,
      xRatio: 0.4321,
      yRatio: 0,
      width: 300,
      height: 400,
    });
  });

  it("fails closed for malformed, oversized, and unavailable storage", () => {
    const storage = memoryStorage({
      malformed: "{bad-json",
      oversized: "x".repeat(STUDIO_FLOATING_SURFACE_MAX_SERIALIZED_LENGTH + 1),
    });
    expect(loadStudioFloatingSurfaceLayout(storage, "malformed", FALLBACK))
      .toEqual(FALLBACK);
    expect(loadStudioFloatingSurfaceLayout(storage, "oversized", FALLBACK))
      .toEqual(FALLBACK);
    expect(loadStudioFloatingSurfaceLayout(null, "surface", FALLBACK))
      .toEqual(FALLBACK);
    expect(saveStudioFloatingSurfaceLayout({
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    }, "surface", FALLBACK)).toBe(false);
  });
});
