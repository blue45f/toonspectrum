import { describe, expect, it } from "vitest";

import {
  createConcentrationLines,
  createFlashPolygon,
  createSeededRandom,
  createSpeedLines,
  DEFAULT_EFFECT_STROKE,
  effectLineLength,
  effectLinesToSvgPath,
  isAngleExcluded,
  normalizeDegrees,
  type ConcentrationLineOptions,
} from "./effect-lines";

const BASE: ConcentrationLineOptions = {
  ...DEFAULT_EFFECT_STROKE,
  cx: 100,
  cy: 100,
  innerRadius: 20,
  angleJitter: 0,
  excludeFrom: 0,
  excludeTo: 0,
};

describe("createSeededRandom", () => {
  it("같은 시드는 같은 수열을 만든다", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    for (let i = 0; i < 10; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it("0~1 범위의 값을 만든다", () => {
    const rng = createSeededRandom(1);
    for (let i = 0; i < 100; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("isAngleExcluded / normalizeDegrees", () => {
  it("정규화가 -180~180 범위 안에 들어간다", () => {
    expect(normalizeDegrees(270)).toBeCloseTo(-90, 6);
    expect(normalizeDegrees(-270)).toBeCloseTo(90, 6);
  });

  it("범위가 없으면 false", () => {
    expect(isAngleExcluded(45, 0, 0)).toBe(false);
  });

  it("범위 안 각도는 true, 밖은 false", () => {
    expect(isAngleExcluded(45, 30, 60)).toBe(true);
    expect(isAngleExcluded(10, 30, 60)).toBe(false);
  });
});

describe("createConcentrationLines", () => {
  it("요청한 개수만큼 선분을 만든다", () => {
    const lines = createConcentrationLines({ ...BASE, count: 24 });
    expect(lines).toHaveLength(24);
  });

  it("선분이 innerRadius에서 시작해 길이 범위 안에 있다", () => {
    const lines = createConcentrationLines({ ...BASE, count: 30, length: 100, lengthJitter: 0.2 });
    for (const line of lines) {
      const startDist = Math.hypot(line.x1 - BASE.cx, line.y1 - BASE.cy);
      expect(startDist).toBeCloseTo(BASE.innerRadius, 4);
      const len = effectLineLength(line);
      expect(len).toBeGreaterThanOrEqual(100 * 0.8 - 1e-6);
      expect(len).toBeLessThanOrEqual(100 * 1.2 + 1e-6);
    }
  });

  it("같은 시드는 같은 결과를 만든다", () => {
    const a = createConcentrationLines({ ...BASE, seed: 7, lengthJitter: 0.5, angleJitter: 10 });
    const b = createConcentrationLines({ ...BASE, seed: 7, lengthJitter: 0.5, angleJitter: 10 });
    expect(a).toEqual(b);
  });

  it("제외 각도 범위에 들어가는 선은 생성하지 않는다 (guard 통과)", () => {
    // 각도 지터 0 → 균등 분포, 제외 범위를 넓게 잡아 선이 줄어드는지 확인
    const all = createConcentrationLines({ ...BASE, count: 36, angleJitter: 0 });
    const excluded = createConcentrationLines({
      ...BASE,
      count: 36,
      angleJitter: 0,
      excludeFrom: -45,
      excludeTo: 45,
    });
    expect(all).toHaveLength(36);
    expect(excluded.length).toBeLessThan(36);
    // 제외된 선들의 각도를 직접 검증
    for (const line of excluded) {
      const degrees = (Math.atan2(line.y1 - BASE.cy, line.x1 - BASE.cx) * 180) / Math.PI;
      expect(isAngleExcluded(degrees, -45, 45)).toBe(false);
    }
  });

  it("count가 0이면 빈 배열이다", () => {
    expect(createConcentrationLines({ ...BASE, count: 0 })).toEqual([]);
  });
});

describe("createSpeedLines", () => {
  it("요청한 개수만큼 평행 선분을 만든다", () => {
    const lines = createSpeedLines({
      ...DEFAULT_EFFECT_STROKE,
      count: 10,
      length: 80,
      lengthJitter: 0,
      positionJitter: 0,
      x: 0,
      y: 0,
      direction: 0,
      spacing: 12,
    });
    expect(lines).toHaveLength(10);
    // direction 0 → 모두 x축 평행
    for (const line of lines) {
      expect(line.y2).toBeCloseTo(line.y1, 6);
      expect(effectLineLength(line)).toBeCloseTo(80, 6);
    }
    // 수직 간격이 spacing과 일치
    const ys = lines.map((l) => l.y1).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]! - ys[i - 1]!).toBeCloseTo(12, 6);
    }
  });

  it("방향 90도면 수직 방향으로 뻗는다", () => {
    const lines = createSpeedLines({
      ...DEFAULT_EFFECT_STROKE,
      count: 5,
      length: 60,
      lengthJitter: 0,
      positionJitter: 0,
      x: 10,
      y: 20,
      direction: 90,
      spacing: 10,
    });
    for (const line of lines) {
      expect(line.x2).toBeCloseTo(line.x1, 6);
      expect(effectLineLength(line)).toBeCloseTo(60, 6);
    }
  });

  it("같은 시드는 같은 결과를 만든다", () => {
    const opts = {
      ...DEFAULT_EFFECT_STROKE,
      count: 8,
      lengthJitter: 0.5,
      positionJitter: 6,
      x: 0,
      y: 0,
      direction: 30,
      spacing: 10,
    };
    expect(createSpeedLines({ ...opts, seed: 3 })).toEqual(createSpeedLines({ ...opts, seed: 3 }));
  });
});

describe("createFlashPolygon", () => {
  it("2 * spikes 개의 정점을 시계 순서로 만든다", () => {
    const points = createFlashPolygon({
      cx: 50,
      cy: 50,
      innerRadius: 20,
      outerRadius: 80,
      spikes: 12,
      spikeJitter: 0,
      rotation: 0,
      seed: 1,
    });
    expect(points).toHaveLength(24);
    // 짝수 인덱스는 바깥쪽, 홀수는 안쪽
    points.forEach((p, i) => {
      const dist = Math.hypot(p.x - 50, p.y - 50);
      if (i % 2 === 0) {
        expect(dist).toBeCloseTo(80, 4);
      } else {
        expect(dist).toBeCloseTo(20, 4);
      }
    });
  });

  it("spikeJitter가 0이 아니면 바깥 반경이 지터 범위 안에 있다", () => {
    const points = createFlashPolygon({
      cx: 0,
      cy: 0,
      innerRadius: 20,
      outerRadius: 100,
      spikes: 8,
      spikeJitter: 0.2,
      rotation: 0,
      seed: 5,
    });
    points.forEach((p, i) => {
      if (i % 2 === 0) {
        const dist = Math.hypot(p.x, p.y);
        expect(dist).toBeGreaterThanOrEqual(80);
        expect(dist).toBeLessThanOrEqual(120);
      }
    });
  });
});

describe("effectLinesToSvgPath", () => {
  it("선분 목록을 M/L path로 변환한다", () => {
    const d = effectLinesToSvgPath([
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 0, y1: 5, x2: 10, y2: 5 },
    ]);
    expect(d).toBe("M 0 0 L 10 0 M 0 5 L 10 5");
  });

  it("빈 목록은 빈 문자열이다", () => {
    expect(effectLinesToSvgPath([])).toBe("");
  });
});
