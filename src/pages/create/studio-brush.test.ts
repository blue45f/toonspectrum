import { describe, expect, it } from "vitest";
import {
  BRUSH_PRESETS,
  STABILIZER_MAX,
  gpenSegmentWidths,
  processFreehandPoints,
  processPencilPoints,
  screentoneDotRadius,
  screentoneDotsForStroke,
  smoothStrokePoints,
  stabilizePoint,
} from "./studio-brush";

describe("BRUSH_PRESETS", () => {
  it("includes the new G-pen and screentone brushes while keeping legacy ids", () => {
    const ids = BRUSH_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const required of ["pen", "gpen", "marker", "highlighter", "brush", "pencil", "screentone"]) {
      expect(ids).toContain(required);
    }
  });

  it("defines sane defaults for every preset", () => {
    for (const preset of BRUSH_PRESETS) {
      expect(preset.name.trim().length).toBeGreaterThan(0);
      expect(preset.defaultWidth).toBeGreaterThan(0);
      expect(preset.defaultOpacity).toBeGreaterThan(0);
      expect(preset.defaultOpacity).toBeLessThanOrEqual(1);
    }
  });
});

describe("stabilizePoint (입력 시점 손떨림 보정)", () => {
  it("returns the raw point when strength is 0", () => {
    expect(stabilizePoint(0, 0, 10, 20, 0)).toEqual([10, 20]);
  });

  it("pulls the point toward the previous point as strength grows", () => {
    const weak = stabilizePoint(0, 0, 100, 0, 2);
    const strong = stabilizePoint(0, 0, 100, 0, 10);
    expect(weak[0]).toBeGreaterThan(strong[0]);
    expect(strong[0]).toBeGreaterThan(0);
    expect(strong[0]).toBeLessThan(weak[0]);
    expect(weak[0]).toBeLessThan(100);
  });

  it("clamps strength outside the 0~10 range", () => {
    expect(stabilizePoint(0, 0, 100, 0, -5)).toEqual([100, 0]);
    expect(stabilizePoint(0, 0, 100, 0, 999)).toEqual(stabilizePoint(0, 0, 100, 0, STABILIZER_MAX));
    expect(stabilizePoint(0, 0, 100, 0, Number.NaN)).toEqual([100, 0]);
  });
});

describe("smoothStrokePoints (커밋 시점 이동평균 스무딩)", () => {
  const jittery = (): number[] => {
    // x는 등간격 증가, y는 불규칙 고주파 떨림(결정적 의사 노이즈)
    const pts: number[] = [];
    for (let i = 0; i < 30; i++) pts.push(i * 8, Math.sin(i * 2.39996) * 12);
    return pts;
  };

  // 떨림 정도: y의 2차 차분 절대합(작을수록 매끈)
  const roughness = (arr: number[]) => {
    let sum = 0;
    for (let i = 3; i < arr.length - 2; i += 2) {
      sum += Math.abs(arr[i - 2]! - 2 * arr[i]! + arr[i + 2]!);
    }
    return sum;
  };

  it("returns the original array reference for strength 0", () => {
    const pts = jittery();
    expect(smoothStrokePoints(pts, 0)).toBe(pts);
  });

  it("preserves point count and both endpoints", () => {
    const pts = jittery();
    const out = smoothStrokePoints(pts, 7);
    expect(out.length).toBe(pts.length);
    expect(out[0]).toBe(pts[0]);
    expect(out[1]).toBe(pts[1]);
    expect(out[out.length - 2]).toBe(pts[pts.length - 2]);
    expect(out[out.length - 1]).toBe(pts[pts.length - 1]);
  });

  it("reduces high-frequency jitter, more with higher strength", () => {
    const pts = jittery();
    const raw = roughness(pts);
    const soft = roughness(smoothStrokePoints(pts, 3));
    const hard = roughness(smoothStrokePoints(pts, 10));
    expect(soft).toBeLessThan(raw);
    expect(hard).toBeLessThan(soft);
  });

  it("keeps a straight line straight (no distortion)", () => {
    const line: number[] = [];
    for (let i = 0; i < 12; i++) line.push(i * 5, 100);
    const out = smoothStrokePoints(line, 8);
    for (let i = 1; i < out.length; i += 2) expect(out[i]).toBeCloseTo(100, 8);
  });

  it("passes through tiny strokes untouched", () => {
    const tiny = [0, 0, 4, 4];
    expect(smoothStrokePoints(tiny, 9)).toBe(tiny);
  });
});

describe("gpenSegmentWidths (G펜 필압 굵기)", () => {
  it("maps each pressure to one width", () => {
    const widths = gpenSegmentWidths([0.2, 0.5, 0.9], 8);
    expect(widths).toHaveLength(3);
    for (const w of widths) expect(w).toBeGreaterThan(0);
  });

  it("makes higher pressure strokes thicker", () => {
    const widths = gpenSegmentWidths([0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1], 10);
    const middleLow = widths[4]!; // 중앙(테이퍼 영향 없음) 비교를 위해 양쪽에 동일 인덱스 사용
    const before = gpenSegmentWidths([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2], 10)[4]!;
    expect(middleLow).toBeGreaterThan(before);
  });

  it("tapers both stroke ends thinner than the middle", () => {
    const widths = gpenSegmentWidths(Array(12).fill(0.7), 10);
    expect(widths[0]!).toBeLessThan(widths[6]!);
    expect(widths[widths.length - 1]!).toBeLessThan(widths[6]!);
  });

  it("clamps pressures outside 0..1 and stays positive", () => {
    const widths = gpenSegmentWidths([-1, 2, 0.5], 6);
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(0.4);
      expect(Number.isFinite(w)).toBe(true);
    }
    expect(gpenSegmentWidths([], 6)).toEqual([]);
  });
});

describe("screentoneDotsForStroke (스크린톤 도트 브러시)", () => {
  const PITCH = 8;
  const RADIUS = 12;

  it("stamps dots aligned to the global lattice", () => {
    const dots = screentoneDotsForStroke([0, 0, 100, 0], RADIUS, PITCH);
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.length % 2).toBe(0);
    for (let i = 0; i < dots.length; i += 2) {
      const y = dots[i + 1]!;
      const iy = Math.round(y / PITCH);
      expect(Math.abs(iy * PITCH - y)).toBeLessThan(1e-9);
      const rowOffset = iy % 2 === 0 ? 0 : PITCH / 2;
      const xResidue = Math.abs((dots[i]! - rowOffset) / PITCH - Math.round((dots[i]! - rowOffset) / PITCH));
      expect(xResidue).toBeLessThan(1e-9);
    }
  });

  it("deduplicates overlapping stamps (no duplicate lattice dots)", () => {
    const dots = screentoneDotsForStroke([0, 0, 4, 0, 8, 0, 8, 0, 12, 0], RADIUS, PITCH);
    const keys = new Set<string>();
    for (let i = 0; i < dots.length; i += 2) {
      const key = `${dots[i]}:${dots[i + 1]}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it("keeps every dot within brush radius of the polyline", () => {
    const pts = [0, 0, 60, 40, 120, 0];
    const dots = screentoneDotsForStroke(pts, RADIUS, PITCH);
    const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const vx = x2 - x1;
      const vy = y2 - y1;
      const lenSq = vx * vx + vy * vy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / lenSq));
      return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
    };
    for (let i = 0; i < dots.length; i += 2) {
      const x = dots[i]!;
      const y = dots[i + 1]!;
      const dist = Math.min(distToSegment(x, y, 0, 0, 60, 40), distToSegment(x, y, 60, 40, 120, 0));
      expect(dist).toBeLessThanOrEqual(RADIUS + 1e-6);
    }
  });

  it("is deterministic and handles degenerate input", () => {
    const a = screentoneDotsForStroke([10, 10, 90, 60], RADIUS, PITCH);
    const b = screentoneDotsForStroke([10, 10, 90, 60], RADIUS, PITCH);
    expect(a).toEqual(b);
    expect(screentoneDotsForStroke([], RADIUS, PITCH)).toEqual([]);
    expect(screentoneDotsForStroke([5], RADIUS, PITCH)).toEqual([]);
  });

  it("derives a positive dot radius from pitch", () => {
    expect(screentoneDotRadius(PITCH)).toBeGreaterThan(0);
    expect(screentoneDotRadius(0)).toBeGreaterThan(0);
  });
});

describe("legacy point processors stay intact", () => {
  it("processFreehandPoints thins dense points and keeps endpoints", () => {
    const pts: number[] = [];
    for (let i = 0; i <= 50; i++) pts.push(i, 0); // 1px 간격 → 3px 미만은 솎아짐
    const out = processFreehandPoints(pts);
    expect(out.length).toBeLessThan(pts.length);
    expect(out[0]).toBe(0);
    expect(out[out.length - 2]).toBe(50);
  });

  it("processPencilPoints applies bounded deterministic jitter", () => {
    const pts = [0, 0, 10, 10, 20, 20];
    const a = processPencilPoints(pts);
    const b = processPencilPoints(pts);
    expect(a).toEqual(b);
    for (let i = 0; i < pts.length; i++) {
      expect(Math.abs(a[i]! - pts[i]!)).toBeLessThanOrEqual(0.75 + 1e-9);
    }
  });
});
