import { describe, expect, it } from "vitest";

import { DAB_FLOATS, DabBatch } from "../core/dab-layout";
import { normalizeProgram } from "../presets/program-schema";
import { lineStroke } from "../testing/synthetic-strokes";

import { ADAPTIVE_RADIUS_JUMP, DabEmitter, MIN_SPACING_PX } from "./dab-emitter";
import { StrokePipeline } from "./stroke-pipeline";

import type { ContactFootprint, DabInstance, ModeledSample } from "../core/types";
import type { BrushProgram, BrushProgramInput } from "../presets/program-schema";

const BASE: BrushProgramInput = {
  id: "emit-test",
  name: "emit test",
  family: "ink",
  tip: { kind: "round", sizePx: 10, hardness: 1 },
  paper: { enabled: false },
  deposition: { model: "dry-stamp", flow: 1, opacity: 1, spacing: 0.5 },
  physics: { contact: "none" },
  input: { prediction: { enabled: true, horizonMs: 8 } },
};

function program(over: Partial<BrushProgramInput> = {}): BrushProgram {
  return normalizeProgram({ ...BASE, ...over });
}

const FP: ContactFootprint = { rx: 5, ry: 5, angle: 0, depositStrength: 1, breakup: 0, grain: 0, water: 0, asymmetry: 0, nibGap: 0 };

function sample(x: number, y: number, tMs: number, dirX = 1, dirY = 0, pressure = 0.5): ModeledSample {
  return {
    x,
    y,
    tMs,
    inputTMs: tMs,
    pressure,
    velocity: 0.5,
    altitudeDeg: 90,
    azimuthDeg: 0,
    dirX,
    dirY,
    curvature: 0,
    phase: "move",
    source: "raw",
    sourceIndex: 0,
  };
}

/** (x0,y0)→(x1,y1)를 1 px 간격으로 잇는 정본 표본. */
function lineSamples(x0: number, y0: number, x1: number, y1: number, stepPx = 1, dtMs = 2): ModeledSample[] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / stepPx));
  const dx = (x1 - x0) / len;
  const dy = (y1 - y0) / len;
  const out: ModeledSample[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push(sample(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, i * dtMs, dx, dy));
  }
  return out;
}

function run(prog: BrushProgram, samples: ModeledSample[], fps: ContactFootprint[], seed = 1, finish = false): { batch: DabBatch; dabs: DabInstance[] } {
  const emitter = new DabEmitter(prog, seed);
  const batch = new DabBatch(4096);
  emitter.emit(samples, fps, batch);
  if (finish) emitter.end(batch);
  const dabs: DabInstance[] = [];
  for (let i = 0; i < batch.count; i += 1) dabs.push(batch.at(i));
  return { batch, dabs };
}

describe("DabEmitter", () => {
  it("직선 fixture에서 dab 간격 = spacing·r ± 0.5%, 첫 dab은 시작점, 배치 stride 16", () => {
    const prog = program();
    const samples = lineSamples(10, 10, 110, 10);
    const { batch, dabs } = run(prog, samples, samples.map(() => FP));
    expect(batch.view().length).toBe(batch.count * DAB_FLOATS);
    expect(dabs[0]?.x).toBe(10);
    expect(dabs[0]?.y).toBe(10);
    const expected = prog.deposition.spacing * 5;
    for (let i = 1; i < dabs.length; i += 1) {
      const d = Math.hypot((dabs[i]?.x ?? 0) - (dabs[i - 1]?.x ?? 0), (dabs[i]?.y ?? 0) - (dabs[i - 1]?.y ?? 0));
      expect(Math.abs(d / expected - 1)).toBeLessThan(0.005);
    }
    expect(dabs.length).toBe(Math.floor(100 / expected) + 1);
    expect(MIN_SPACING_PX).toBe(0.25);
  });

  it("rotationFollow direction: dab 각도 = 접선 각(대각선 π/4), none이면 발자국 각도", () => {
    const follow = program({ strokeDynamics: { rotationFollow: "direction" } });
    const samples = lineSamples(0, 0, 50, 50);
    const { dabs } = run(follow, samples, samples.map(() => FP));
    for (const d of dabs) expect(d.angle).toBeCloseTo(Math.PI / 4, 5);
    const none = program();
    const tilted = run(none, samples, samples.map(() => ({ ...FP, angle: 0.3 })));
    for (const d of tilted.dabs) expect(d.angle).toBeCloseTo(0.3, 5);
  });

  it("산포: 같은 시드는 바이트 동일, 시드가 다르면 상이, 산포 반경 안", () => {
    const prog = program({ strokeDynamics: { scatter: { positionPx: 3, angleRad: 0.5, scale: 0.2, countJitter: 0 } } });
    const samples = lineSamples(10, 10, 110, 10);
    const a = run(prog, samples, samples.map(() => FP), 1);
    const b = run(prog, samples, samples.map(() => FP), 1);
    const c = run(prog, samples, samples.map(() => FP), 2);
    expect(Array.from(a.batch.view())).toEqual(Array.from(b.batch.view()));
    expect(Array.from(a.batch.view())).not.toEqual(Array.from(c.batch.view()));
    for (const d of a.dabs) {
      expect(Math.abs(d.y - 10)).toBeLessThanOrEqual(3 + 1e-4);
      expect(Math.abs(d.angle)).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(d.rx).toBeGreaterThanOrEqual(5 * 0.8 - 1e-4);
      expect(d.rx).toBeLessThanOrEqual(5 * 1.2 + 1e-4);
    }
  });

  it("dual tip: dab 수 2배, 짝수 번째가 dualTip 플래그·보조 팁 종류", () => {
    const single = program();
    const dual = program({ deposition: { ...BASE.deposition, dual: { kind: "noise", sizePx: 6, hardness: 0.5 } } });
    const samples = lineSamples(10, 10, 110, 10);
    const s = run(single, samples, samples.map(() => FP));
    const d = run(dual, samples, samples.map(() => FP));
    expect(d.dabs.length).toBe(s.dabs.length * 2);
    for (let i = 0; i < d.dabs.length; i += 1) {
      const dab = d.dabs[i];
      if (!dab) throw new Error("missing dab");
      expect(dab.dualTip).toBe(i % 2 === 1);
      if (i % 2 === 1) {
        expect(dab.tipKind).toBe("noise");
        expect(dab.x).toBe(d.dabs[i - 1]?.x);
        expect(dab.rx).toBeCloseTo(5 * 0.6, 4);
      }
    }
  });

  it("끝 테이퍼: taperEndPx 구간의 dab는 end()에서 축소돼 마지막 반경 → 0, 시작 테이퍼는 smoothstep", () => {
    const prog = program({ edge: { taperStartPx: 10, taperEndPx: 20 } });
    const samples = lineSamples(0, 0, 100, 0);
    const emitter = new DabEmitter(prog, 1);
    const batch = new DabBatch(1024);
    const before = emitter.emit(samples, samples.map(() => FP), batch);
    const pending = batch.count;
    const released = emitter.end(batch);
    expect(released).toBeGreaterThan(0);
    expect(before + released).toBe(batch.count);
    const dabs: DabInstance[] = [];
    for (let i = 0; i < batch.count; i += 1) dabs.push(batch.at(i));
    // 시작: 첫 dab 반경 ≈ 0(smoothstep(0)), 10 px 뒤에는 5
    expect(dabs[0]?.rx).toBeLessThanOrEqual(0.011);
    const mid = dabs.find((d) => d.x >= 40 && d.x <= 60);
    expect(mid?.rx).toBeCloseTo(5, 4);
    // 끝: 마지막 dab 반경 ≈ 0, 끝으로 갈수록 단조 감소
    const last = dabs[dabs.length - 1];
    expect(last?.x).toBeCloseTo(100, 3);
    expect(last?.rx).toBeLessThanOrEqual(0.011);
    for (let i = pending + 1; i < dabs.length; i += 1) {
      expect(dabs[i]?.rx ?? 0).toBeLessThanOrEqual((dabs[i - 1]?.rx ?? 0) + 1e-6);
    }
    expect(emitter.end(batch)).toBe(0);
  });

  it("적응 간격: 발자국 반경이 10% 넘게 바뀌는 구간은 간격이 절반", () => {
    expect(ADAPTIVE_RADIUS_JUMP).toBe(0.1);
    const prog = program();
    const samples = [sample(0, 0, 0), sample(100, 0, 100)];
    const steady = run(prog, samples, [FP, { ...FP, rx: 5.4, ry: 5.4 }]);
    const jump = run(prog, samples, [FP, { ...FP, rx: 8, ry: 8 }]);
    // 정상: 간격 0.5·(5..5.4) ≈ 2.6 → 약 39개, 급변: 0.25·(5..8) ≈ 1.6 → 약 62개
    expect(jump.dabs.length).toBeGreaterThan(steady.dabs.length * 1.4);
  });

  it("시간 기반 dab: 정지 상태에서 timeDabsPerSecond만큼 쌓이고, 0이면 거리 기반만", () => {
    const timed = program({ deposition: { ...BASE.deposition, timeDabsPerSecond: 30 } });
    const samples = Array.from({ length: 11 }, (_, i) => sample(10, 10, i * 100));
    const t = run(timed, samples, samples.map(() => FP));
    expect(t.dabs.length).toBeGreaterThanOrEqual(29);
    expect(t.dabs.length).toBeLessThanOrEqual(32);
    for (const d of t.dabs) {
      expect(d.x).toBe(10);
      expect(d.y).toBe(10);
    }
    const plain = run(program(), samples, samples.map(() => FP));
    expect(plain.dabs.length).toBe(1);
  });

  it("dryBreakup: 끊김 확률은 breakup·dryBreakup이고 시드에 결정적", () => {
    const prog = program({ edge: { dryBreakup: 1 } });
    const samples = lineSamples(10, 10, 210, 10);
    const full = run(prog, samples, samples.map(() => FP));
    const broken = run(prog, samples, samples.map(() => ({ ...FP, breakup: 0.5 })));
    const again = run(prog, samples, samples.map(() => ({ ...FP, breakup: 0.5 })));
    expect(broken.dabs.length).toBeLessThan(full.dabs.length * 0.7);
    expect(broken.dabs.length).toBeGreaterThan(full.dabs.length * 0.3);
    expect(Array.from(broken.batch.view())).toEqual(Array.from(again.batch.view()));
  });

  it("압력 매핑: size 곡선이 반경을, flow 곡선이 flow를 바꾼다", () => {
    const prog = program({
      strokeDynamics: {
        size: [{ input: "pressure", curve: [0.2, 1], min: 0, max: 1 }],
        flow: [{ input: "pressure", curve: [0, 1], min: 0, max: 1 }],
      },
    });
    const lo = [sample(0, 0, 0, 1, 0, 0.2), sample(10, 0, 20, 1, 0, 0.2)];
    const hi = [sample(0, 0, 0, 1, 0, 1), sample(10, 0, 20, 1, 0, 1)];
    const a = run(prog, lo, lo.map(() => FP));
    const b = run(prog, hi, hi.map(() => FP));
    expect(a.dabs[0]?.rx).toBeCloseTo(5 * (0.2 + 0.8 * 0.2), 4);
    expect(b.dabs[0]?.rx).toBeCloseTo(5, 4);
    expect(a.dabs[0]?.flow).toBeCloseTo(0.2, 4);
    expect(b.dabs[0]?.flow).toBeCloseTo(1, 4);
  });
});

describe("StrokePipeline", () => {
  it("raw → dab 배치, finish가 tail을 방출하고 stats가 맞는다", () => {
    const prog = program();
    const pipeline = new StrokePipeline(prog, 1);
    const raw = lineStroke(0, 0, 200, 0, 0.6, { durationMs: 200 });
    const first = pipeline.push(raw.slice(0, 20));
    expect(first.count).toBeGreaterThan(0);
    expect(pipeline.preview().length).toBeGreaterThan(0);
    const second = pipeline.push(raw.slice(20));
    const tail = pipeline.finish();
    const stats = pipeline.stats();
    expect(stats.samplesIn).toBe(raw.length);
    expect(stats.samplesCommitted).toBe(raw.length - 1 + 3);
    expect(stats.dabsEmitted).toBe(first.count + second.count + tail.count);
    expect(stats.latency.length).toBe(stats.samplesCommitted);
    // 마지막 dab은 raw up 좌표 근처
    const last = tail.at(tail.count - 1);
    expect(last.x).toBeCloseTo(200, 0);
  });

  it("같은 입력·시드면 바이트 동일, 시드가 다르면 산포가 있을 때 상이", () => {
    const prog = program({ strokeDynamics: { scatter: { positionPx: 2, angleRad: 0, scale: 0, countJitter: 0 } } });
    const raw = lineStroke(0, 0, 100, 30, 0.6, { durationMs: 150 });
    const runOnce = (seed: number): number[] => {
      const p = new StrokePipeline(prog, seed);
      const out: number[] = [];
      out.push(...p.push(raw).view());
      out.push(...p.finish().view());
      return out;
    };
    expect(runOnce(3)).toEqual(runOnce(3));
    expect(runOnce(3)).not.toEqual(runOnce(4));
  });
});
