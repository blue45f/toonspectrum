import { describe, expect, it } from "vitest";

import { calibratePressure } from "../input/calibration";
import { DEFAULT_INPUT_CONFIG, InputPipeline } from "../input/input-pipeline";
import { lineStroke, pressureRampStroke } from "../testing/synthetic-strokes";
import { DEFAULT_PAPER_SPEC, generatePaper } from "../texture/paper-grain";

import { friction } from "./friction";
import { createGraphiteState, graphiteFill, stepGraphite } from "./graphite-deposit";
import { DEFAULT_FRICTION_SPEC, DEFAULT_PHYSICS_SPEC, DEFAULT_VELOCITY_SPEC, PhysicsModel } from "./physics-model";
import { velocityDeposit } from "./velocity-deposit";

import type { ContactFootprint } from "../core/types";

/** Spearman 순위 상관(동률 없음 가정). */
function spearman(xs: readonly number[], ys: readonly number[]): number {
  const rank = (v: readonly number[]): number[] => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length).fill(0);
    idx.forEach(([, i], k) => {
      r[i] = k;
    });
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  let d2 = 0;
  for (let i = 0; i < n; i += 1) d2 += ((rx[i] ?? 0) - (ry[i] ?? 0)) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

describe("흑연 침착", () => {
  it("fill은 압력에 단조 증가(동률 없는 구간 Spearman = 1)이고 [0,1]", () => {
    const ps: number[] = [];
    const fills: number[] = [];
    for (let i = 0; i <= 60; i += 1) {
      const p = 0.35 + (0.6 * i) / 60;
      ps.push(p);
      fills.push(graphiteFill(p, 1, 0.3));
    }
    expect(spearman(ps, fills)).toBe(1);
    let prev = 0;
    for (let i = 0; i <= 100; i += 1) {
      const v = graphiteFill(i / 100, 1.6, 0.25);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(graphiteFill(0, 1, 0.3)).toBe(0);
    expect(graphiteFill(1, 1, 0.3)).toBe(1);
  });

  it("stepGraphite: grain = 1 − fill, hardnessScale은 fill에 단조", () => {
    const state = createGraphiteState();
    const lo = stepGraphite(state, { pressure: 0.2 }, 4, { contactGain: 1, bumpThreshold: 0.3 });
    const hi = stepGraphite(state, { pressure: 0.9 }, 4, { contactGain: 1, bumpThreshold: 0.3 });
    expect(lo.grain).toBeGreaterThan(hi.grain);
    expect(lo.hardnessScale).toBeLessThan(hi.hardnessScale);
    expect(hi.grain).toBeCloseTo(1 - hi.fill, 6);
  });
});

describe("속도 의존 도포", () => {
  it("flowScale은 속도에 단조 감소, breakup은 vBreak 이후 시작해 vMax에서 1", () => {
    let prevFlow = 2;
    let prevBreak = -1;
    for (let i = 0; i <= 60; i += 1) {
      const v = (DEFAULT_VELOCITY_SPEC.vMax * i) / 60;
      const out = velocityDeposit(v, DEFAULT_VELOCITY_SPEC);
      expect(out.depositStrength).toBeLessThanOrEqual(prevFlow);
      expect(out.breakup).toBeGreaterThanOrEqual(prevBreak);
      if (v < DEFAULT_VELOCITY_SPEC.vBreak) expect(out.breakup).toBe(0);
      prevFlow = out.depositStrength;
      prevBreak = out.breakup;
    }
    expect(velocityDeposit(0, DEFAULT_VELOCITY_SPEC).depositStrength).toBe(1);
    expect(velocityDeposit(DEFAULT_VELOCITY_SPEC.vMax, DEFAULT_VELOCITY_SPEC).depositStrength).toBe(0);
    expect(velocityDeposit(DEFAULT_VELOCITY_SPEC.vMax, DEFAULT_VELOCITY_SPEC).breakup).toBe(1);
  });

  it("느릴수록 수분 공급이 늘고 waterBase가 바닥이다", () => {
    const spec = { ...DEFAULT_VELOCITY_SPEC, waterBase: 0.3, slowGain: 0.5 };
    expect(velocityDeposit(0, spec).water).toBeCloseTo(0.8, 6);
    expect(velocityDeposit(spec.vSlow, spec).water).toBeCloseTo(0.3, 6);
    expect(velocityDeposit(10, spec).water).toBeCloseTo(0.3, 6);
  });
});

describe("마찰·종이 결", () => {
  it("진행 방향이 결과 나란하면 mu 최대, 수직이면 최소, flowScale 반비례", () => {
    const aligned = friction(1, 0, 0, DEFAULT_FRICTION_SPEC);
    const perpendicular = friction(0, 1, 0, DEFAULT_FRICTION_SPEC);
    const diagonal = friction(Math.SQRT1_2, Math.SQRT1_2, 0, DEFAULT_FRICTION_SPEC);
    expect(aligned.mu).toBeCloseTo(DEFAULT_FRICTION_SPEC.mu0 + DEFAULT_FRICTION_SPEC.muGrain, 6);
    expect(perpendicular.mu).toBeCloseTo(DEFAULT_FRICTION_SPEC.mu0, 6);
    expect(diagonal.mu).toBeGreaterThan(perpendicular.mu);
    expect(diagonal.mu).toBeLessThan(aligned.mu);
    expect(aligned.flowScale).toBeLessThan(perpendicular.flowScale);
    expect(aligned.jitterAmp).toBeGreaterThan(perpendicular.jitterAmp);
    // 결 방향이 π만큼 돌아도 같은 정렬도
    expect(friction(1, 0, Math.PI, DEFAULT_FRICTION_SPEC).mu).toBeCloseTo(aligned.mu, 6);
  });
});

describe("PhysicsModel(고정 dt 1/240)", () => {
  function footprints(model: PhysicsModel, samples: ReturnType<typeof pressureRampStroke>): ContactFootprint[] {
    const input = new InputPipeline();
    const modeled = [...input.push(samples).committed, ...input.finish()];
    const out: ContactFootprint[] = [];
    let lastT: number | null = null;
    for (const s of modeled) {
      const dt = lastT === null ? 1000 / 240 : s.tMs - lastT;
      lastT = s.tMs;
      out.push(model.step(s, dt));
    }
    return out;
  }

  it("압력 램프에서 Hertz 반경이 단조 증가하고 같은 입력이면 같은 발자국이다", () => {
    const samples = pressureRampStroke(0, 0, 400, 0, { durationMs: 1000 });
    const a = footprints(new PhysicsModel(DEFAULT_PHYSICS_SPEC, null, 1, { tipRadiusPx: 8, paperSpec: null }), samples);
    const b = footprints(new PhysicsModel(DEFAULT_PHYSICS_SPEC, null, 1, { tipRadiusPx: 8, paperSpec: null }), samples);
    expect(a).toEqual(b);
    // tail(압력 0으로 수렴) 전 구간만 단조 검사
    const body = a.slice(0, a.length - 3);
    for (let i = 1; i < body.length; i += 1) {
      expect(body[i]?.rx ?? 0).toBeGreaterThanOrEqual((body[i - 1]?.rx ?? 0) - 1e-6);
    }
    expect(a.every((fp) => fp.rx === Math.fround(fp.rx) && fp.rx > 0)).toBe(true);
  });

  it("종이가 있으면 마찰로 도포가 줄고 그레인이 압력에 반비례한다", () => {
    const paper = generatePaper(DEFAULT_PAPER_SPEC, 64);
    const samples = lineStroke(0, 0, 200, 0, 0.3, { durationMs: 500 });
    const withPaper = footprints(new PhysicsModel(DEFAULT_PHYSICS_SPEC, paper, 1, { tipRadiusPx: 8, paperSpec: DEFAULT_PAPER_SPEC }), samples);
    const noPaper = footprints(new PhysicsModel(DEFAULT_PHYSICS_SPEC, null, 1, { tipRadiusPx: 8, paperSpec: null }), samples);
    const mid = Math.floor(samples.length / 2);
    expect(withPaper[mid]?.depositStrength ?? 0).toBeLessThan(noPaper[mid]?.depositStrength ?? 0);
    // 그레인 = 1 − (교정 압력)·pressureInfluence. 교정은 generic 프로파일(deadZone 0.02).
    const pCal = calibratePressure(0.3, DEFAULT_INPUT_CONFIG.profile);
    expect(withPaper[mid]?.grain ?? 0).toBeCloseTo(1 - pCal * DEFAULT_PAPER_SPEC.pressureInfluence, 2);
    expect(noPaper[mid]?.grain).toBe(0);
  });

  it("contact none + graphite 스펙: 반경 고정, 그레인만 압력 응답", () => {
    const spec = { ...DEFAULT_PHYSICS_SPEC, contact: "none" as const, graphite: { contactGain: 1.4, bumpThreshold: 0.2 } };
    const samples = pressureRampStroke(0, 0, 200, 0, { durationMs: 500 });
    const fps = footprints(new PhysicsModel(spec, null, 1, { tipRadiusPx: 0.6, paperSpec: null }), samples);
    const body = fps.slice(0, fps.length - 3);
    expect(body.every((fp) => Math.abs(fp.rx - 0.6) < 1e-6)).toBe(true);
    expect(body[0]?.grain ?? 0).toBeGreaterThan(body[body.length - 1]?.grain ?? 0);
  });
});
