import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  assertBg3dSampleSurface,
  createBg3dCompositorSampler,
  resolveBg3dCompositorClip,
  type Bg3dSampleSurface,
} from "../e2e/studio-bg3d-compositor-sampler";

import {
  BG3D_FRAME_ALIGNMENT_OFFSETS_PX,
  BG3D_FRAME_MAX_ALIGNMENT_PX,
  compareBg3dOriginalFrames,
  resolveBg3dAlignedComparison,
  type Bg3dComparableFrame,
} from "./studio-bg3d-runtime-frame-comparison";

import type { Page } from "@playwright/test";

const filename = "studio-bg3d-production-rotation.runtime.ts";
const config = readFileSync(new URL("../playwright.bg3d-runtime.config.ts", import.meta.url), "utf8");
const runtimeUrl = new URL(`../e2e/${filename}`, import.meta.url);

/** The strict hardware gate is explicit, not an unconditional extra case in headless WebGL runs. */
describe("BG3D hardware gate discovery", () => {
  it("is collected explicitly by the production config, outside normal spec/test suffixes", () => {
    expect(config).toContain(`testMatch: "${filename}"`);
    expect(existsSync(runtimeUrl)).toBe(true);
    expect(filename).not.toMatch(/\.(?:spec|test)\.[cm]?[jt]sx?$/u);
    expect(existsSync(new URL("../e2e/studio-bg3d-production-rotation.spec.ts", import.meta.url)))
      .toBe(false);
  });

  it("keeps real rotation and fatal-error assertions and contains no skip path", () => {
    const source = readFileSync(runtimeUrl, "utf8");
    expect(source).toContain('test("WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다"');
    expect(source).not.toMatch(/\btest\.(?:skip|fixme|fail)\s*\(/u);
    expect(source).toContain("expect(finalPeakTileDelta).toBeLessThan(8)");
    expect(source).toContain("internalDelta < 2");
    expect(source).toContain("expect(fatal).toEqual([])");
    expect(source).toContain("const SETTLE_TIMEOUT_MS = 15_000");
    expect(source).toContain("stableIntervals < 2 || settleMs > SETTLE_TIMEOUT_MS");
    expect(source).toContain("page.locator(CANVAS).screenshot()");
    expect(source).toContain("expect(referenceDelta,");
    expect(source).toContain("await compareBg3dOriginalFrames(");
    expect(source).not.toContain("peakDelta(current.frame, reference)");
  });

  it("keeps the full-frame release oracle while reporting cropped alignment diagnostics", () => {
    const source = readFileSync(runtimeUrl, "utf8");
    // Scene diagnostics may crop overlays, but existing same-session checks must stay full frame.
    expect(source).toContain("BG3D_FRAME_CROP_INSET");
    expect(source).toContain("decodeFrames(page, png, readbackOptimized, [0], 0)");
    // Alignment reports extra diagnostics without replacing the full-frame pass/fail metric.
    expect(source).toContain("resolveBg3dAlignedComparison(");
    expect(source).toContain("BG3D_FRAME_ALIGNMENT_OFFSETS_PX");
    expect(source).toContain("const finalPeakTileDelta = rawFullFramePeakTileDelta;");
    expect(source).toContain("expect(finalPeakTileDelta).toBeLessThan(8)");
    expect(source).toContain("croppedAlignedPeakTileDelta: aligned.peakDelta");
    // The unaligned figure stays in the evidence, so a growing framing drift remains visible.
    expect(source).toContain("unalignedPeakTileDelta");
    expect(source).toContain("rawFullFramePeakTileDelta");
    expect(source).toContain("rawFullFrames: { continuous: rawContinuous, direct: rawDirect }");
  });
});

const SURFACE: Bg3dSampleSurface = {
  x: 50, y: 50, width: 876, height: 766, cssWidth: 876, cssHeight: 766,
  bufferWidth: 876, bufferHeight: 766, viewportWidth: 1440, viewportHeight: 1000, dpr: 1,
};
function samplerHost() {
  const evaluate = vi.fn(async () => ({ ...SURFACE }));
  const send = vi.fn(async () => ({ data: Buffer.from("unaltered-native-png").toString("base64") }));
  const detach = vi.fn(async () => undefined);
  const page = {
    locator: () => ({ evaluate }),
    context: () => ({ newCDPSession: async () => ({ send, detach }) }),
  } as unknown as Page;
  return { page, evaluate, send, detach };
}

describe("BG3D compositor sampler", () => {
  it("captures original surface bytes and releases its CDP session exactly once", async () => {
    const host = samplerHost();
    const sampler = await createBg3dCompositorSampler(host.page, "canvas");
    const sample = await sampler.capture();
    expect(sample.png.toString()).toBe("unaltered-native-png");
    expect(host.send).toHaveBeenCalledExactlyOnceWith("Page.captureScreenshot", {
      format: "png", fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
      clip: { x: 50, y: 50, width: 876, height: 766, scale: 1 },
    });
    await sampler.dispose();
    await sampler.dispose();
    expect(host.detach).toHaveBeenCalledOnce();
    await expect(sampler.capture()).rejects.toThrow("disposed");
  });

  it("uses the original element screenshot pixel bounds for the observed fractional CSS origin", async () => {
    const host = samplerHost();
    const surface = { ...SURFACE, x: 102, y: 123.796875 };
    host.evaluate.mockResolvedValue(surface);
    const sampler = await createBg3dCompositorSampler(host.page, "canvas");
    try {
      const captured = await sampler.capture();
      expect(captured.surface).toEqual(surface);
      expect(captured.png.toString()).toBe("unaltered-native-png");
      expect(host.send).toHaveBeenCalledExactlyOnceWith("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
        clip: { x: 102, y: 123, width: 876, height: 767, scale: 1 },
      });
    } finally {
      await sampler.dispose();
    }
  });

  it.each([
    { patch: {}, clip: { x: 50, y: 50, width: 876, height: 766, scale: 1 } },
    { patch: { x: 50.0000001, y: 49.9999999 },
      clip: { x: 50, y: 50, width: 876, height: 766, scale: 1 } },
    { patch: { x: 102.25, width: 876.5, y: 123.796875 },
      clip: { x: 102, y: 123, width: 877, height: 767, scale: 1 } },
  ])("encloses pixels without changing the CSS surface: $patch", ({ patch, clip }) => {
    const surface = Object.freeze({ ...SURFACE, ...patch });
    expect(resolveBg3dCompositorClip(surface)).toEqual(clip);
    expect(surface).toEqual({ ...SURFACE, ...patch });
  });

  it("rejects a rounded rectangle beyond the viewport instead of clipping pixels", () => {
    expect(() => resolveBg3dCompositorClip({
      ...SURFACE, x: 564.005,
    })).toThrow("outside the viewport");
  });

  it.each([
    { x: -1 }, { width: 0 }, { width: 1400 }, { bufferWidth: 0 }, { dpr: 2 }, { x: NaN },
  ])("refuses an invalid or clipped surface %j", (patch) => {
    expect(() => assertBg3dSampleSurface({ ...SURFACE, ...patch })).toThrow();
  });

  it("refuses drift between observations", () => {
    expect(() => assertBg3dSampleSurface(SURFACE, SURFACE)).not.toThrow();
    expect(() => assertBg3dSampleSurface({ ...SURFACE, x: 51 }, SURFACE)).toThrow("changed");
  });

  it("rejects a resize during the native screenshot", async () => {
    const host = samplerHost();
    host.evaluate.mockResolvedValueOnce(SURFACE).mockResolvedValueOnce(SURFACE)
      .mockResolvedValueOnce({ ...SURFACE, bufferWidth: 900 });
    const sampler = await createBg3dCompositorSampler(host.page, "canvas");
    try {
      await expect(sampler.capture()).rejects.toThrow("changed");
    } finally {
      await sampler.dispose();
    }
    expect(host.detach).toHaveBeenCalledOnce();
  });

  it("does not turn a native screenshot failure into reusable success", async () => {
    const host = samplerHost();
    host.send.mockRejectedValueOnce(new Error("compositor unavailable"));
    const sampler = await createBg3dCompositorSampler(host.page, "canvas");
    try {
      await expect(sampler.capture()).rejects.toThrow("compositor unavailable");
    } finally {
      await sampler.dispose();
    }
    expect(host.detach).toHaveBeenCalledOnce();
  });
});

describe("BG3D homogeneous original-frame comparison", () => {
  const sampledPng = Buffer.from("sampled-original-png");
  const referencePng = Buffer.from("locator-original-png");
  const frame: Bg3dComparableFrame = { width: 876, height: 767, tiles: [10, 100, 250] };

  it("decodes both unchanged originals with default backing even when CPU resampling differs", async () => {
    const decode = vi.fn(async (_png: Buffer, optimized: boolean) => ({
      ...frame, tiles: optimized ? [12.6, 100, 250] : frame.tiles,
    }));
    const result = await compareBg3dOriginalFrames(sampledPng, referencePng, decode);
    expect(decode.mock.calls).toEqual([[sampledPng, false], [referencePng, false]]);
    expect(result.peakDelta).toBe(0);
    expect(result.reference.tiles).toEqual(frame.tiles);
    expect(sampledPng.toString()).toBe("sampled-original-png");
    expect(referencePng.toString()).toBe("locator-original-png");
  });

  it.each([2, 2.6, 8, 30])("preserves a genuine peak delta %s instead of hiding capture drift", async (delta) => {
    const decode = vi.fn(async (png: Buffer) => ({
      ...frame, tiles: png === referencePng ? [10 + delta, 100, 250] : frame.tiles,
    }));
    const result = await compareBg3dOriginalFrames(sampledPng, referencePng, decode);
    expect(result.peakDelta).toBeCloseTo(delta, 10);
    expect(result.peakDelta).toBeGreaterThanOrEqual(2);
    expect(result.sampled.tiles).toEqual(frame.tiles);
  });

  it.each([
    { width: 877 }, { height: 766 }, { width: 0 }, { width: NaN },
    { tiles: [] }, { tiles: [10] }, { tiles: [10, NaN, 250] },
    { tiles: [10, Infinity, 250] },
  ])("rejects malformed or differently sized original frames: %j", async (patch) => {
    const decode = vi.fn(async (png: Buffer) => png === referencePng ? { ...frame, ...patch } : frame);
    await expect(compareBg3dOriginalFrames(sampledPng, referencePng, decode)).rejects.toThrow();
  });

  it("does not turn a blank tile set into a zero-delta match", async () => {
    await expect(compareBg3dOriginalFrames(sampledPng, referencePng, async () => ({
      ...frame, tiles: [],
    }))).rejects.toThrow("empty");
  });

  it.each([1, 2])("propagates a failed decode at position %s", async (failureAt) => {
    const failure = new Error("native PNG decode failed");
    let calls = 0;
    const decode = vi.fn(async () => {
      calls += 1;
      if (calls === failureAt) throw failure;
      return frame;
    });
    await expect(compareBg3dOriginalFrames(sampledPng, referencePng, decode)).rejects.toBe(failure);
    expect(decode).toHaveBeenCalledTimes(failureAt);
  });
});

describe("BG3D inter-session frame alignment", () => {
  const frame = (tiles: number[]): Bg3dComparableFrame => ({ width: 876, height: 767, tiles });
  const base = frame([10, 100, 250]);
  const candidate = (shiftPx: number, tiles: number[]) => ({ shiftPx, frame: frame(tiles) });

  it("always offers the unaligned comparison, so alignment can only lower the judged delta", () => {
    expect(BG3D_FRAME_ALIGNMENT_OFFSETS_PX).toContain(0);
    expect(Math.max(...BG3D_FRAME_ALIGNMENT_OFFSETS_PX.map(Math.abs)))
      .toBe(BG3D_FRAME_MAX_ALIGNMENT_PX);
    expect(BG3D_FRAME_ALIGNMENT_OFFSETS_PX.every(Number.isInteger)).toBe(true);
  });

  it("reports no drift when the unaligned frames already match", () => {
    expect(resolveBg3dAlignedComparison(base, [
      candidate(0, [10, 100, 250]), candidate(6, [10, 100, 250]),
    ])).toEqual({ alignmentPx: 0, peakDelta: 0 });
  });

  it("picks the offset that minimises the judged tile delta, not a proxy", () => {
    // A candidate selected by an unrelated proxy can worsen the actual metric.
    expect(resolveBg3dAlignedComparison(base, [
      candidate(0, [14.75, 100, 250]), candidate(2, [16.57, 100, 250]),
      candidate(10, [10.5, 100, 250]),
    ])).toEqual({ alignmentPx: 10, peakDelta: 0.5 });
  });

  it("never reports more than the unaligned delta", () => {
    const unaligned = 9;
    const result = resolveBg3dAlignedComparison(base, [
      candidate(0, [10 + unaligned, 100, 250]), candidate(4, [40, 100, 250]),
      candidate(-6, [90, 100, 250]),
    ]);
    expect(result.peakDelta).toBeLessThanOrEqual(unaligned);
    expect(result).toEqual({ alignmentPx: 0, peakDelta: unaligned });
  });

  it("cannot align away extra geometry: a retained silhouette stays far above the threshold", () => {
    // Every candidate retains the extra geometry residual; no translation can remove it.
    const result = resolveBg3dAlignedComparison(base, BG3D_FRAME_ALIGNMENT_OFFSETS_PX.map(
      (shiftPx) => candidate(shiftPx, [10 + 27 + Math.abs(shiftPx), 100, 250]),
    ));
    expect(result.peakDelta).toBe(27);
    expect(result.peakDelta).toBeGreaterThan(8);
  });

  it("prefers the smaller offset when two offsets tie", () => {
    expect(resolveBg3dAlignedComparison(base, [
      candidate(0, [20, 100, 250]), candidate(-4, [7, 100, 250]), candidate(12, [13, 100, 250]),
    ]).alignmentPx).toBe(-4);
  });

  it.each([
    { label: "no candidates", candidates: [] },
    { label: "no unaligned candidate", candidates: [candidate(4, [10, 100, 250])] },
    { label: "an offset beyond the band",
      candidates: [candidate(0, [10, 100, 250]), candidate(40, [10, 100, 250])] },
    { label: "a fractional offset",
      candidates: [candidate(0, [10, 100, 250]), candidate(1.5, [10, 100, 250])] },
    { label: "different frame dimensions",
      candidates: [{ shiftPx: 0, frame: { ...base, width: base.width + 1 } }] },
    { label: "different tile counts", candidates: [candidate(0, [10, 100])] },
    { label: "a non-finite tile", candidates: [candidate(0, [10, Number.NaN, 250])] },
  ])("refuses $label", ({ candidates }) => {
    expect(() => resolveBg3dAlignedComparison(base, candidates)).toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses invalid base frame width %s", (width) => {
    expect(() => resolveBg3dAlignedComparison({ ...base, width }, [candidate(0, base.tiles)]))
      .toThrow("dimensions");
  });

  it("refuses an empty base frame", () => {
    expect(() => resolveBg3dAlignedComparison(frame([]), [candidate(0, [])])).toThrow("Empty");
  });
});
