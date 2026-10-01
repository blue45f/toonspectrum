import { describe, expect, it } from "vitest";

import { Pcg32 } from "../core/rng";

import { createNibFlexState, nibTarget, stepNibFlex } from "./nib-flex";
import { DEFAULT_NIB_SPEC } from "./physics-model";

import type { NibSpec } from "./physics-model";

const DT = 1000 / 240;

function stepResponse(spec: NibSpec, pressure: number, ms: number): number[] {
  const state = createNibFlexState(spec, 0);
  const out: number[] = [];
  for (let t = 0; t < ms; t += DT) out.push(stepNibFlex(state, { pressure }, DT, spec).nibGap);
  return out;
}

describe("닙 2차계", () => {
  it("임계 감쇠(ζ=1) 계단 응답: 오버슈트 ≤ 1%, 정착 ≤ 60 ms", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, stiffness: 180, damping: 1 };
    const target = nibTarget(1, spec);
    const gaps = stepResponse(spec, 1, 200);
    const peak = Math.max(...gaps);
    expect(peak).toBeLessThanOrEqual(target * 1.01);
    const settleIndex = gaps.findIndex((g, i) => gaps.slice(i).every((v) => Math.abs(v - target) <= 0.02 * target));
    expect(settleIndex).toBeGreaterThanOrEqual(0);
    expect(settleIndex * DT).toBeLessThanOrEqual(60);
  });

  it("G펜(ζ=0.65) 계단 응답 오버슈트는 4–10% 범위", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, stiffness: 180, damping: 0.65 };
    const target = nibTarget(1, spec);
    const peak = Math.max(...stepResponse(spec, 1, 200));
    const overshoot = peak / target - 1;
    expect(overshoot).toBeGreaterThan(0.04);
    expect(overshoot).toBeLessThan(0.1);
  });

  it("임계 압력 아래에서는 gap 0, 폭 = baseWidth", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, threshold: 0.05, baseWidth: 0.6 };
    const state = createNibFlexState(spec, 0.03);
    for (let i = 0; i < 100; i += 1) {
      const out = stepNibFlex(state, { pressure: 0.03 }, DT, spec);
      expect(out.nibGap).toBe(0);
      expect(out.rx).toBeCloseTo(0.3, 6);
    }
    expect(nibTarget(0.05, spec)).toBe(0);
    expect(nibTarget(1.05, spec)).toBe(spec.gapMax);
  });

  it("획 시작 압력으로 초기화하면 첫 틱부터 정상 상태다", () => {
    const spec = DEFAULT_NIB_SPEC;
    const state = createNibFlexState(spec, 0.5);
    const out = stepNibFlex(state, { pressure: 0.5 }, DT, spec);
    expect(out.nibGap).toBeCloseTo(nibTarget(0.5, spec), 5);
  });

  it("dt 가변(1..30 ms)에서도 발산하지 않고 gapMax를 넘지 않는다", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, stiffness: 320, damping: 0.9, gapMax: 2 };
    const state = createNibFlexState(spec, 0);
    const rng = new Pcg32(3, 3);
    for (let i = 0; i < 2000; i += 1) {
      const dt = 1 + rng.nextF32() * 29;
      const p = rng.nextF32();
      const out = stepNibFlex(state, { pressure: p }, dt, spec);
      expect(Number.isFinite(out.nibGap)).toBe(true);
      expect(out.nibGap).toBeGreaterThanOrEqual(0);
      expect(out.nibGap).toBeLessThanOrEqual(spec.gapMax * 1.15);
    }
  });

  it("폭 = baseWidth + gap·widthGain, ry = 폭·aspect/2", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, baseWidth: 1, widthGain: 2, aspect: 0.5 };
    const state = createNibFlexState(spec, 1);
    const out = stepNibFlex(state, { pressure: 1 }, DT, spec);
    const width = 1 + out.nibGap * 2;
    expect(out.rx).toBeCloseTo(width / 2, 5);
    expect(out.ry).toBeCloseTo((width * 0.5) / 2, 5);
  });
});
