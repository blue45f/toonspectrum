import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { importMybBrush } from "../../../studio-format-gateway/src/myb";
import { applyMybSettings, createLibMypaintIncrementalStrokeSession } from "../libmypaint";
import { loadLibMypaint } from "../libmypaint/index";
import { standardZigzagStrokeSamples } from "../raster-compile";

import type { LibMypaintDirtyFrame, LibMypaintRaw } from "../libmypaint/index";

let lmp: LibMypaintRaw;
beforeAll(async () => { lmp = await loadLibMypaint(); });
function document(id = "wash-soft") {
  const bytes = readFileSync(new URL(`../../../../tests/corpus/brushes/myb/${id}.myb`, import.meta.url));
  return importMybBrush(bytes, id, id).document;
}
function replace(target: Uint8Array, width: number, patch: LibMypaintDirtyFrame | null): number {
  if (!patch) return 0;
  for (let row = 0; row < patch.height; row += 1) {
    target.set(patch.pixels.subarray(row * patch.width * 4, (row + 1) * patch.width * 4),
      ((patch.y + row) * width + patch.x) * 4);
  }
  return patch.pixels.byteLength;
}
function samePixels(a: Uint8Array, b: Uint8Array) {
  expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
}

describe("libmypaint real-WASM packed dirty frames", () => {
  it("loads an independent module from explicit bytes without altering the default cache", async () => {
    const bytes = readFileSync(new URL("../libmypaint/mypaint-wasm.wasm", import.meta.url));
    const separate = await loadLibMypaint({ wasmBinary: bytes });
    expect(separate.module === lmp.module).toBe(false);
    expect(separate.version()).toBe(lmp.version());
    expect(await loadLibMypaint() === lmp).toBe(true);
  });

  it("rejects invalid explicit WASM bytes instead of leaving initialization pending", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try { await expect(loadLibMypaint({ wasmBinary: new Uint8Array([0, 1, 2]) })).rejects.toThrow(); }
    finally { errors.mockRestore(); warnings.mockRestore(); }
  }, 5_000);

  it.each(["wash-soft", "ink-crisp"])("reconstructs %s exactly, including every translucent prefix and finish tail", (id) => {
    const width = 512, height = 384;
    const session = createLibMypaintIncrementalStrokeSession(lmp, document(id), { width, height, seed: 7 });
    const assembled = new Uint8Array(width * height * 4);
    const samples = standardZigzagStrokeSamples(width, height, 64);
    let bytes = 0, frames = 0;
    try {
      expect(session.takeDirtyFrame()).toBeNull();
      for (let at = 0; at < samples.length; at += 4) {
        session.append(samples.slice(at, at + 4));
        const patch = session.takeDirtyFrame();
        bytes += replace(assembled, width, patch); frames += 1;
        expect(session.takeDirtyFrame()).toBeNull();
        samePixels(assembled, session.frame());
      }
      bytes += replace(assembled, width, session.finishDirty()); frames += 1;
      samePixels(assembled, session.finish());
      expect(session.finishDirty()).toBeNull();
      expect(bytes).toBeLessThan(frames * width * height * 4 * 0.5);
    } finally { session.dispose(); }
  });

  it("clips native dirty bounds and reads partial tiles on non-multiple surface edges", () => {
    const width = 127, height = 95;
    const session = createLibMypaintIncrementalStrokeSession(lmp, document("ink-crisp"), { width, height });
    const assembled = new Uint8Array(width * height * 4);
    try {
      const samples = Array.from({ length: 40 }, (_, i) => ({
        x: -10 + i * 4, y: -10 + i * 3, pressure: 0.7, tiltX: 0.2, tiltY: -0.3, tMs: i * 8,
      }));
      for (const sample of samples) {
        session.append([sample]);
        const patch = session.takeDirtyFrame();
        if (patch) {
          expect(patch.x).toBeGreaterThanOrEqual(0); expect(patch.y).toBeGreaterThanOrEqual(0);
          expect(patch.x + patch.width).toBeLessThanOrEqual(width);
          expect(patch.y + patch.height).toBeLessThanOrEqual(height);
        }
        replace(assembled, width, patch);
      }
      replace(assembled, width, session.finishDirty());
      samePixels(assembled, session.frame());
    } finally { session.dispose(); }
  });

  it("has a full-readback-free append/finish path and returns independently transferable pixels", () => {
    const session = createLibMypaintIncrementalStrokeSession(lmp, document(), { width: 192, height: 96 });
    const fullFrame = vi.spyOn(lmp, "surfaceToRgba8");
    try {
      session.append(standardZigzagStrokeSamples(192, 96, 32));
      const patch = session.finishDirty();
      expect(patch).not.toBeNull();
      if (!patch) throw new Error("Expected paint");
      const transferred = structuredClone(patch, { transfer: [patch.pixels.buffer as ArrayBuffer] });
      expect(patch.pixels.byteLength).toBe(0);
      expect(transferred.pixels.length).toBe(transferred.width * transferred.height * 4);
      expect(session.takeDirtyFrame()).toBeNull();
      expect(fullFrame).not.toHaveBeenCalled();
    } finally { fullFrame.mockRestore(); session.dispose(); }
  });

  it("does not acknowledge dirty pixels when allocation fails; a later raw read can retry", () => {
    const brush = lmp.brushNew(), surface = lmp.surfaceNew(192, 96);
    try {
      applyMybSettings(lmp, brush, document()); lmp.brushNewStroke(brush, 7);
      for (const sample of standardZigzagStrokeSamples(192, 96, 32)) {
        lmp.strokeTo(brush, surface, sample.x, sample.y, sample.pressure, 0, 0, 0.008);
      }
      const originalMalloc = lmp.module._malloc.bind(lmp.module);
      const allocation = vi.spyOn(lmp.module, "_malloc")
        .mockImplementationOnce(originalMalloc).mockReturnValueOnce(0);
      try { expect(() => lmp.surfaceTakeDirtyFrame(surface)).toThrow(/allocation failed/); }
      finally { allocation.mockRestore(); }
      expect(lmp.surfaceTakeDirtyFrame(surface)).not.toBeNull();
      expect(lmp.surfaceTakeDirtyFrame(surface)).toBeNull();
    } finally { lmp.surfaceFree(surface); lmp.brushFree(brush); }
  });

  it("replaces erased/translucent pixels instead of accumulating them with source-over", () => {
    const width = 192, height = 96;
    const brush = lmp.brushNew(), surface = lmp.surfaceNew(width, height);
    const assembled = new Uint8Array(width * height * 4);
    const points = standardZigzagStrokeSamples(width, height, 64).map((sample) => ({ ...sample, pressure: 1 }));
    const feed = () => {
      lmp.brushNewStroke(brush, 7);
      for (const sample of points) lmp.strokeTo(brush, surface, sample.x, sample.y, sample.pressure, 0, 0, 0.008);
      replace(assembled, width, lmp.surfaceTakeDirtyFrame(surface));
    };
    const mass = () => assembled.reduce((sum, value, index) => index % 4 === 3 ? sum + value : sum, 0);
    try {
      applyMybSettings(lmp, brush, document("ink-crisp")); feed();
      const before = mass();
      const eraser = lmp.settingId("eraser");
      expect(eraser).toBeGreaterThanOrEqual(0); expect(eraser).toBeLessThan(lmp.settingCount());
      lmp.brushSetBaseValue(brush, eraser, 1); feed();
      expect(mass()).toBeLessThan(before);
      samePixels(assembled, lmp.surfaceToRgba8(surface, width, height));
    } finally { lmp.surfaceFree(surface); lmp.brushFree(brush); }
  });

  it("rejects overreads and released handles without calling the native pixel reader", () => {
    const surface = lmp.surfaceNew(127, 95);
    expect(() => lmp.surfaceToRgba8(surface, 128, 95)).toThrow(/dimensions/);
    expect(() => lmp.surfaceToRgba8Region(surface, 126, 0, 2, 1)).toThrow(/region/);
    expect(() => lmp.surfaceToRgba8Region(surface, -1, 0, 1, 1)).toThrow(/region/);
    lmp.surfaceFree(surface);
    expect(() => lmp.surfaceTakeDirtyFrame(surface)).toThrow(/released/);
    expect(() => lmp.surfaceNew(4096, 4096)).toThrow(RangeError);
  });
});
