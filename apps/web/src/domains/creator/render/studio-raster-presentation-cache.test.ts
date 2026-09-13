import { describe, expect, it, vi } from "vitest";

import {
  refreshStudioRasterPresentationCaches,
  registerStudioRasterCapturePreparation,
  prepareStudioRasterCapture,
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


describe("stage-scoped output density", () => {
  it("rebuilds and restores nested caches inside-out, without touching another stage", () => {
    const stage = {}; const calls: string[] = [];
    const parent = { ...node(), getStage: () => stage, isVisible: () => true } as unknown as Konva.Node;
    const child = { ...node(parent), getStage: () => stage, isVisible: () => true } as unknown as Konva.Node;
    const releaseParent = registerStudioRasterCapturePreparation(parent, (density) => { calls.push(`parent:${density}`); return () => { calls.push("restore-parent"); }; });
    const releaseChild = registerStudioRasterCapturePreparation(child, (density) => { calls.push(`child:${density}`); return () => { calls.push("restore-child"); }; });
    prepareStudioRasterCapture({}, 2)();
    expect(calls).toEqual([]);
    const restore = prepareStudioRasterCapture(stage, 2); restore();
    expect(calls).toEqual(["child:2", "parent:2", "restore-child", "restore-parent"]);
    releaseChild(); releaseParent();
    prepareStudioRasterCapture(stage, 3)();
    expect(calls).toHaveLength(4);
  });
  it("rolls back prepared children before propagating a failed parent", () => {
    const stage = {}; const rollback = vi.fn();
    const parent = { ...node(), getStage: () => stage, isVisible: () => true } as unknown as Konva.Node;
    const child = { ...node(parent), getStage: () => stage, isVisible: () => true } as unknown as Konva.Node;
    const releaseParent = registerStudioRasterCapturePreparation(parent, () => { throw new Error("parent unavailable"); });
    const releaseChild = registerStudioRasterCapturePreparation(child, () => rollback);
    expect(() => prepareStudioRasterCapture(stage, 2)).toThrow("parent unavailable");
    expect(rollback).toHaveBeenCalledOnce();
    releaseChild(); releaseParent();
  });
});
