import { describe, expect, it, vi } from "vitest";

import {
  refreshStudioRasterPresentationCaches,
  registerStudioRasterPresentationCache,
} from "./studio-raster-presentation-cache";

import type Konva from "konva";

function node(parent: Konva.Node | null = null, cached = false): Konva.Node {
  return { getParent: () => parent, isCached: () => cached } as unknown as Konva.Node;
}

describe("raster presentation cache owners", () => {
  it("rebuilds nested blend/mask owners inside out, including temporarily uncached owners", () => {
    const calls: string[] = [];
    const outer = node(null, true);
    const inner = node(outer);
    const image = node(inner);
    const releaseOuter = registerStudioRasterPresentationCache(outer, () => {
      calls.push("outer mask");
      return true;
    });
    const releaseInner = registerStudioRasterPresentationCache(inner, () => {
      calls.push("inner blend");
      return true;
    });
    expect(refreshStudioRasterPresentationCaches(image)).toBe(true);
    expect(calls).toEqual(["inner blend", "outer mask"]);
    releaseInner();
    releaseOuter();
  });

  it("refuses an unknown cached ancestor and stops after a failed inner rebuild", () => {
    const outer = node(null, true);
    const inner = node(outer, true);
    expect(refreshStudioRasterPresentationCaches(node(inner))).toBe(false);
    const outerRefresh = vi.fn(() => true);
    const releaseOuter = registerStudioRasterPresentationCache(outer, outerRefresh);
    const releaseInner = registerStudioRasterPresentationCache(inner, () => false);
    expect(refreshStudioRasterPresentationCaches(node(inner))).toBe(false);
    expect(outerRefresh).not.toHaveBeenCalled();
    releaseInner();
    releaseOuter();
  });

  it("does not unregister a replacement owner when an older lifecycle is cleaned up", () => {
    const parent = node(null, true);
    const releaseOld = registerStudioRasterPresentationCache(parent, () => false);
    const refresh = vi.fn(() => true);
    const releaseCurrent = registerStudioRasterPresentationCache(parent, refresh);
    releaseOld();
    expect(refreshStudioRasterPresentationCaches(node(parent))).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    releaseCurrent();
    expect(refreshStudioRasterPresentationCaches(node(parent))).toBe(false);
  });

  it("keeps a throwing cache owner from claiming a successful presentation", () => {
    const parent = node(null, true);
    const release = registerStudioRasterPresentationCache(parent, () => {
      throw new Error("canvas context lost");
    });
    expect(refreshStudioRasterPresentationCaches(node(parent))).toBe(false);
    release();
  });
});
