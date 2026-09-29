import { describe, expect, it } from "vitest";

import {
  STABILIZER_PRESETS,
  StrokeStabilizer,
  ibisPaintStabilizerToLevel,
  normalizeStabilizerSettings,
  type StabilizerSample,
} from "./stroke-stabilizer";

function realisticTremor(n: number): StabilizerSample[] {
  // 현실적인 손떨림: 10.4Hz, 진폭 3px, x는 250px/s로 전진
  const pts: StabilizerSample[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      x: i * 4,
      y: 3 * Math.sin((2 * Math.PI * i) / 6),
      t: i * 16,
    });
  }
  return pts;
}

/** 이상 직선(y=0)에서의 RMS 편차 */
function rmsDeviation(outputs: Array<{ x: number; y: number }>): number {
  const mean =
    outputs.reduce((acc, p) => acc + p.y, 0) / Math.max(1, outputs.length);
  const variance =
    outputs.reduce((acc, p) => acc + (p.y - mean) ** 2, 0) /
    Math.max(1, outputs.length);
  return Math.sqrt(variance);
}

describe("normalizeStabilizerSettings", () => {
  it("빈 입력에 안전한 기본값을 반환한다", () => {
    expect(normalizeStabilizerSettings(undefined)).toEqual({
      mode: "smooth",
      level: 0,
      predictionMs: 0,
    });
  });

  it("레벨 범위를 0–100으로 클램핑한다", () => {
    expect(normalizeStabilizerSettings({ level: 999 }).level).toBe(100);
    expect(normalizeStabilizerSettings({ level: -5 }).level).toBe(0);
  });

  it("예측 시간을 0–120ms로 클램핑한다", () => {
    expect(normalizeStabilizerSettings({ predictionMs: 500 }).predictionMs).toBe(
      120,
    );
    expect(normalizeStabilizerSettings({ predictionMs: -1 }).predictionMs).toBe(
      0,
    );
  });
});

describe("ibisPaintStabilizerToLevel", () => {
  it("0–10 스케일을 0–100으로 변환한다", () => {
    expect(ibisPaintStabilizerToLevel(0)).toBe(0);
    expect(ibisPaintStabilizerToLevel(10)).toBe(100);
    expect(ibisPaintStabilizerToLevel(5)).toBe(50);
  });

  it("범위를 벗어난 값과 비숫자를 처리한다", () => {
    expect(ibisPaintStabilizerToLevel(99)).toBe(100);
    expect(ibisPaintStabilizerToLevel(-3)).toBe(0);
    expect(ibisPaintStabilizerToLevel(NaN)).toBe(0);
  });
});

describe("StrokeStabilizer", () => {
  it("off 모드에서는 입력을 그대로 반환한다", () => {
    const s = new StrokeStabilizer(STABILIZER_PRESETS.none);
    const samples = realisticTremor(10);
    for (const sample of samples) {
      expect(s.push(sample)).toEqual({ x: sample.x, y: sample.y });
    }
  });

  it("level 0이면 smooth 모드라도 패스스루한다", () => {
    const s = new StrokeStabilizer({ mode: "smooth", level: 0 });
    const sample = { x: 10, y: 20, t: 0 };
    expect(s.push(sample)).toEqual({ x: 10, y: 20 });
  });

  it("smooth 모드가 지터를 줄인다", () => {
    const raw = realisticTremor(60);
    const stabilized = new StrokeStabilizer({
      mode: "smooth",
      level: 80,
      predictionMs: 0,
    });
    const outputs = raw.map((p) => stabilized.push(p));
    // 앞쪽 과도 구간 제외하고 비교
    const tail = outputs.slice(10);
    expect(rmsDeviation(tail)).toBeLessThan(rmsDeviation(raw.slice(10)));
  });

  it("level이 높을수록 더 강하게 스무딩한다", () => {
    const raw = realisticTremor(80);
    const weak = new StrokeStabilizer({ mode: "smooth", level: 15 });
    const strong = new StrokeStabilizer({ mode: "smooth", level: 95 });
    const weakOut = raw.map((p) => weak.push(p)).slice(15);
    const strongOut = raw.map((p) => strong.push(p)).slice(15);
    expect(rmsDeviation(strongOut)).toBeLessThanOrEqual(
      rmsDeviation(weakOut) + 0.1,
    );
  });

  it("string 모드의 출력은 목표 지점에서 줄 길이 안에 머문다", () => {
    const s = new StrokeStabilizer({ mode: "string", level: 50 });
    const leash = 34; // level 50 → 4 + 0.5*60
    let last = { x: 0, y: 0 };
    for (let i = 0; i < 40; i++) {
      // 갑자기 멀리 점프
      const target =
        i < 20 ? { x: i * 5, y: 0, t: i * 16 } : { x: 200, y: 0, t: i * 16 };
      last = s.push(target);
      const dist = Math.hypot(last.x - target.x, last.y - target.y);
      // 앵커가 줄 안에서 따라오므로 거리는 줄 길이 이하
      expect(dist).toBeLessThanOrEqual(leash + 0.001);
    }
    // 끈 방식은 목표에서 줄 길이만큼 뒤에 수렴한다 (정상 동작)
    expect(Math.abs(last.x - (200 - leash))).toBeLessThan(2);
  });

  it("prediction은 직선에서 출력을 진행 방향으로 앞당긴다", () => {
    const mk = (predictionMs: number) =>
      new StrokeStabilizer({ mode: "smooth", level: 60, predictionMs });
    const plain = mk(0);
    const predicted = mk(24);
    let plainLast = { x: 0, y: 0 };
    let predLast = { x: 0, y: 0 };
    for (let i = 0; i < 40; i++) {
      const p = { x: i * 10, y: 0, t: i * 16 };
      plainLast = plain.push(p);
      predLast = predicted.push(p);
    }
    // 예측이 켜지면 진행 방향(x+)으로 출력이 더 앞서 나간다
    expect(predLast.x).toBeGreaterThan(plainLast.x);
  });

  it("reset 후 새 스트로크를 깨끗하게 시작한다", () => {
    const s = new StrokeStabilizer({ mode: "smooth", level: 70 });
    for (const p of realisticTremor(30)) s.push(p);
    s.reset();
    const first = s.push({ x: 100, y: 100, t: 1000 });
    expect(first).toEqual({ x: 100, y: 100 });
  });
});
