import { describe, expect, it } from "vitest";

import {
  createStudioPointerVelocityState,
  createStudioStrokeStabilizerState,
  describeStudioStabilizerLatency,
  flushStudioStrokeStabilizerEndpoint,
  normalizeStudioStabilizerMode,
  sampleStudioPointerVelocity,
  stabilizeStudioStrokeSample,
} from "./studio-stroke-stabilizer";

describe("studio stroke stabilizer", () => {
  it("describes zero-strength input as immediate in every mode", () => {
    for (const mode of ["standard", "adaptive", "precision"] as const) {
      expect(describeStudioStabilizerLatency(mode, 0)).toEqual({
        kind: "instant",
        label: "즉시",
        description: "입력 보정을 우회해 펜 위치를 바로 반영합니다.",
        estimatedMs: 0,
      });
    }
  });

  it("matches the fixed-rate standard filter's conservative 90% response", () => {
    expect(describeStudioStabilizerLatency("standard", 1)).toMatchObject({
      kind: "estimated",
      label: "약 30ms",
      estimatedMs: 30,
    });
    expect(describeStudioStabilizerLatency("standard", 2)).toMatchObject({
      label: "약 40ms",
      estimatedMs: 40,
    });
    expect(describeStudioStabilizerLatency("standard", 3)).toMatchObject({
      label: "약 55ms",
      estimatedMs: 55,
    });
    expect(describeStudioStabilizerLatency("standard", 10)).toMatchObject({
      label: "약 535ms",
      estimatedMs: 535,
    });
  });

  it("uses honest categorical latency copy for adaptive and precision modes", () => {
    expect(describeStudioStabilizerLatency("adaptive", 6)).toMatchObject({
      kind: "variable",
      label: "가변 반응",
      estimatedMs: null,
    });
    expect(describeStudioStabilizerLatency("precision", 6)).toMatchObject({
      kind: "guided",
      label: "의도적 후행",
      estimatedMs: null,
    });
  });

  it("normalizes modes without accepting arbitrary persisted values", () => {
    expect(normalizeStudioStabilizerMode("standard")).toBe("standard");
    expect(normalizeStudioStabilizerMode("adaptive")).toBe("adaptive");
    expect(normalizeStudioStabilizerMode("precision")).toBe("precision");
    expect(normalizeStudioStabilizerMode("unknown")).toBe("adaptive");
  });

  it("creates a finite deterministic state from malformed input", () => {
    expect(createStudioStrokeStabilizerState({ x: Number.NaN, y: Infinity, timeStamp: -2 })).toEqual({
      rawX: 0,
      rawY: 0,
      outputX: 0,
      outputY: 0,
      timeStamp: 0,
    });
  });

  it("measures pointer velocity in CSS pixels per millisecond", () => {
    const start = createStudioPointerVelocityState({ clientX: 10, clientY: 20, timeStamp: 100 });
    const result = sampleStudioPointerVelocity(start, { clientX: 22, clientY: 25, timeStamp: 110 });
    expect(result.distance).toBe(13);
    expect(result.elapsedMs).toBe(10);
    expect(result.speed).toBe(1.3);
    expect(result.state).toEqual({ clientX: 22, clientY: 25, timeStamp: 110 });
  });

  it("normalizes non-monotonic pointer timing without producing infinities", () => {
    const start = createStudioPointerVelocityState({ clientX: 0, clientY: 0, timeStamp: 30 });
    const result = sampleStudioPointerVelocity(start, {
      clientX: Number.NaN,
      clientY: Infinity,
      timeStamp: 20,
    });
    expect(result.distance).toBe(0);
    expect(result.elapsedMs).toBeCloseTo(1000 / 60, 10);
    expect(Object.values(result.state).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(result.speed)).toBe(true);
  });

  it("keeps standard mode compatible with the fixed live stabilizer", () => {
    const state = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
    const result = stabilizeStudioStrokeSample(state, { x: 100, y: 0, timeStamp: 16 }, {
      strength: 6,
      mode: "standard",
    });
    expect(result.point[0]).toBeGreaterThan(0);
    expect(result.point[0]).toBeLessThan(100);
    expect(result.point[1]).toBe(0);
    expect(result.effectiveStrength).toBe(6);
  });

  it("keeps a moving standard EMA stroke stable across pointer sample rates", () => {
    const followRampFor = (sampleCount: number) => {
      const durationMs = 100;
      let state = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
      let output = 0;
      for (let index = 1; index <= sampleCount; index++) {
        const progress = index / sampleCount;
        const result = stabilizeStudioStrokeSample(
          state,
          { x: 100 * progress, y: 0, timeStamp: durationMs * progress },
          { strength: 7, mode: "standard" }
        );
        state = result.state;
        output = result.point[0];
      }
      return output;
    };

    const at60Hz = followRampFor(6);
    expect(at60Hz).toBeCloseTo(followRampFor(12), 10);
    expect(at60Hz).toBeCloseTo(followRampFor(24), 10);
  });

  it("reduces lag for a fast adaptive sample and increases stability for a slow one", () => {
    const state = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
    const slow = stabilizeStudioStrokeSample(state, { x: 1, y: 0, timeStamp: 16 }, {
      strength: 8,
      mode: "adaptive",
    });
    const fast = stabilizeStudioStrokeSample(state, { x: 64, y: 0, timeStamp: 16 }, {
      strength: 8,
      mode: "adaptive",
    });
    expect(slow.effectiveStrength).toBeGreaterThan(8);
    expect(fast.effectiveStrength).toBeLessThan(8);
    expect(fast.point[0] / 64).toBeGreaterThan(slow.point[0]);
  });

  it("normalizes adaptive speed and precision radius to CSS pixels across zoom levels", () => {
    const state = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
    const adaptiveAt1x = stabilizeStudioStrokeSample(
      state,
      { x: 40, y: 0, timeStamp: 16 },
      { strength: 8, mode: "adaptive", coordinateScale: 1 }
    );
    const adaptiveAt2x = stabilizeStudioStrokeSample(
      state,
      { x: 20, y: 0, timeStamp: 16 },
      { strength: 8, mode: "adaptive", coordinateScale: 2 }
    );
    expect(adaptiveAt1x.effectiveStrength).toBeCloseTo(adaptiveAt2x.effectiveStrength, 10);
    expect(adaptiveAt1x.point[0]).toBeCloseTo(adaptiveAt2x.point[0] * 2, 10);

    const precisionAt1x = stabilizeStudioStrokeSample(
      state,
      { x: 40, y: 0, timeStamp: 16 },
      { strength: 8, mode: "precision", coordinateScale: 1 }
    );
    const precisionAt2x = stabilizeStudioStrokeSample(
      state,
      { x: 20, y: 0, timeStamp: 16 },
      { strength: 8, mode: "precision", coordinateScale: 2 }
    );
    expect(precisionAt1x.point[0]).toBeCloseTo(precisionAt2x.point[0] * 2, 10);
  });

  it("uses a virtual guide radius in precision mode", () => {
    const state = createStudioStrokeStabilizerState({ x: 10, y: 20, timeStamp: 0 });
    const inside = stabilizeStudioStrokeSample(state, { x: 12, y: 20, timeStamp: 16 }, {
      strength: 8,
      mode: "precision",
    });
    expect(inside.point).toEqual([10, 20]);

    const outside = stabilizeStudioStrokeSample(state, { x: 80, y: 20, timeStamp: 16 }, {
      strength: 8,
      mode: "precision",
    });
    expect(outside.point[0]).toBeGreaterThan(10);
    expect(outside.point[0]).toBeLessThan(80);
    expect(outside.point[1]).toBe(20);
  });

  it("updates raw timing even when precision output stays in its dead-zone", () => {
    const initial = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
    const first = stabilizeStudioStrokeSample(initial, { x: 2, y: 1, timeStamp: 10 }, {
      strength: 10,
      mode: "precision",
    });
    expect(first.point).toEqual([0, 0]);
    expect(first.state.rawX).toBe(2);
    expect(first.state.rawY).toBe(1);
    expect(first.state.timeStamp).toBe(10);
  });

  it("returns raw points when strength is zero in every mode", () => {
    for (const mode of ["standard", "adaptive", "precision"] as const) {
      const state = createStudioStrokeStabilizerState({ x: 1, y: 2, timeStamp: 0 });
      const result = stabilizeStudioStrokeSample(state, { x: 30, y: 40, timeStamp: 20 }, { strength: 0, mode });
      expect(result.point).toEqual([30, 40]);
    }
  });

  it("flushes a lagging live filter to the finite raw endpoint on pointer release", () => {
    const initial = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
    const lagging = stabilizeStudioStrokeSample(
      initial,
      { x: 100, y: 35, timeStamp: 16 },
      { strength: 9, mode: "standard" }
    );
    expect(lagging.point[0]).toBeLessThan(100);

    const flushed = flushStudioStrokeStabilizerEndpoint(lagging.state);
    expect(flushed.point).toEqual([100, 35]);
    expect(flushed.state).toEqual({
      rawX: 100,
      rawY: 35,
      outputX: 100,
      outputY: 35,
      timeStamp: 16,
    });
  });

  it("sanitizes malformed endpoint state without producing non-finite coordinates", () => {
    const flushed = flushStudioStrokeStabilizerEndpoint({
      rawX: Number.NaN,
      rawY: Infinity,
      outputX: 7,
      outputY: 9,
      timeStamp: -1,
    });
    expect(flushed.point).toEqual([7, 9]);
    expect(Object.values(flushed.state).every(Number.isFinite)).toBe(true);
  });

  it("sanitizes malformed samples and remains deterministic", () => {
    const state = {
      rawX: Number.NaN,
      rawY: Infinity,
      outputX: 5,
      outputY: 7,
      timeStamp: Number.NaN,
    };
    const input = { x: Number.NaN, y: Infinity, timeStamp: Number.NaN };
    const options = { strength: Number.POSITIVE_INFINITY, mode: "adaptive" as const };
    const first = stabilizeStudioStrokeSample(state, input, options);
    const second = stabilizeStudioStrokeSample(state, input, options);
    expect(first).toEqual(second);
    expect(Object.values(first.state).every(Number.isFinite)).toBe(true);
    expect(first.point.every(Number.isFinite)).toBe(true);
  });
});
