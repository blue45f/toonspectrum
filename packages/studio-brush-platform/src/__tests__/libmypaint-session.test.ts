import { describe, expect, it, vi } from "vitest";

import { createLibMypaintIncrementalStrokeSession } from "../libmypaint";

import type { LibMypaintRaw } from "../libmypaint/index";

const document = { settings: {} };
const options = { width: 64, height: 64, seed: 7 };
const sample = { x: 12, y: 18, pressure: 0.7, tiltX: 0, tiltY: 0, tMs: 0 };
function engine() {
  return {
    module: {}, brushNew: vi.fn(() => 1), surfaceNew: vi.fn(() => 2),
    settingCount: () => 64, inputCount: () => 18,
    brushNewStroke: vi.fn(), strokeTo: vi.fn(() => 1),
    surfaceToRgba8: vi.fn((_s: number, w: number, h: number) => new Uint8Array(w * h * 4)),
    surfaceFree: vi.fn(), brushFree: vi.fn(),
  };
}
function start(raw: ReturnType<typeof engine>) {
  return createLibMypaintIncrementalStrokeSession(raw as unknown as LibMypaintRaw, document, options);
}

describe("libmypaint session ownership and failure boundaries", () => {
  it("validates a complete batch before any native paint is applied", () => {
    const raw = engine(), session = start(raw);
    try {
      expect(() => session.append([sample, { ...sample, x: NaN }])).toThrow(/non-finite/);
      expect(raw.strokeTo).not.toHaveBeenCalled();
      expect(() => session.append([{ ...sample, tMs: 2 }, { ...sample, tMs: 1 }])).toThrow(/monotonic/);
      expect(raw.strokeTo).not.toHaveBeenCalled();
      session.append([sample]);
      expect(raw.strokeTo).toHaveBeenCalledTimes(1);
    } finally { session.dispose(); }
  });
  it("captures the last accepted sample rather than retaining caller-owned mutable data", () => {
    const raw = engine(), session = start(raw);
    const mutable = { ...sample };
    try {
      session.append([mutable]);
      mutable.x = 900; mutable.pressure = 0;
      session.finish();
      expect(raw.strokeTo).toHaveBeenLastCalledWith(1, 2, sample.x, sample.y, sample.pressure, 0, 0, 0.016);
      const calls = raw.strokeTo.mock.calls.length;
      session.finish();
      expect(raw.strokeTo).toHaveBeenCalledTimes(calls);
    } finally { session.dispose(); }
  });
  it("prevents shared-WASM RNG interference while allowing independent instances", () => {
    const raw = engine(), first = start(raw);
    const independent = start(engine());
    try {
      expect(() => start(raw)).toThrow(/already has an active stroke/);
      first.finish();
      const next = start(raw);
      next.dispose();
    } finally { first.dispose(); independent.dispose(); }
  });
  it("bounds allocations before entering WASM", () => {
    const raw = engine();
    for (const dimensions of [{ width: 0, height: 64 }, { width: 4097, height: 1 }, { width: 4096, height: 4096 }]) {
      expect(() => createLibMypaintIncrementalStrokeSession(raw as unknown as LibMypaintRaw, document, dimensions)).toThrow(RangeError);
    }
    expect(raw.brushNew).not.toHaveBeenCalled();
  });
  it("does not pass a null brush handle into native functions", () => {
    const raw = engine(); raw.brushNew.mockReturnValueOnce(0);
    expect(() => start(raw)).toThrow(/allocate a brush/);
    expect(raw.surfaceNew).not.toHaveBeenCalled();
    expect(raw.brushFree).not.toHaveBeenCalled();
    start(raw).dispose();
  });
  it("quarantines a native failure and releases both handles and the module lease", () => {
    const raw = engine(), session = start(raw);
    raw.strokeTo.mockImplementationOnce(() => { throw new Error("native failed"); });
    expect(() => session.append([sample])).toThrow("native failed");
    expect(() => session.frame()).toThrow(/failed/);
    expect(raw.surfaceFree).toHaveBeenCalledTimes(1);
    expect(raw.brushFree).toHaveBeenCalledTimes(1);
    session.dispose();
    expect(raw.surfaceFree).toHaveBeenCalledTimes(1);
    start(raw).dispose();
  });
  it("releases the brush and lease even when surface cleanup throws", () => {
    const raw = engine(), session = start(raw);
    raw.surfaceFree.mockImplementationOnce(() => { throw new Error("free failed"); });
    expect(() => session.dispose()).toThrow("free failed");
    expect(raw.brushFree).toHaveBeenCalledTimes(1);
    session.dispose();
    start(raw).dispose();
  });
});
