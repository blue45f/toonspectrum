import { Pcg32 } from "../core/rng";

import type { RawSample } from "../core/types";

/**
 * 엔진 단위 테스트 전용 합성 획 생성기. bench/fixtures를 import하지 않고(엔진 경계)
 * 같은 규약(첫 표본 down, 마지막 up, 나머지 move, source raw)으로 결정적 표본을 만든다.
 */

export interface SyntheticStrokeOptions {
  /** 표본율(Hz). 기본 240. */
  sampleRateHz?: number;
  /** 지속 시간(ms). */
  durationMs?: number;
  pointerType?: RawSample["pointerType"];
}

export interface SyntheticPoint {
  x: number;
  y: number;
  pressure?: number;
  tiltXDeg?: number;
  tiltYDeg?: number;
  twistDeg?: number;
}

function sampleAt(
  pt: SyntheticPoint,
  index: number,
  count: number,
  dtMs: number,
  pointerType: RawSample["pointerType"],
): RawSample {
  return {
    x: pt.x,
    y: pt.y,
    tMs: index * dtMs,
    pressure: pt.pressure ?? 0.5,
    tiltXDeg: pt.tiltXDeg ?? 0,
    tiltYDeg: pt.tiltYDeg ?? 0,
    twistDeg: pt.twistDeg ?? 0,
    pointerType,
    phase: index === 0 ? "down" : index === count - 1 ? "up" : "move",
    source: "raw",
  };
}

/** 매개변수 t ∈ [0,1] → 점 함수로 획을 만든다. */
export function parametricStroke(
  point: (t: number) => SyntheticPoint,
  opts: SyntheticStrokeOptions = {},
): RawSample[] {
  const rate = opts.sampleRateHz ?? 240;
  const duration = opts.durationMs ?? 500;
  const dt = 1000 / rate;
  const count = Math.max(2, Math.round((duration * rate) / 1000) + 1);
  const out: RawSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    out.push(sampleAt(point(t), i, count, dt, opts.pointerType ?? "pen"));
  }
  return out;
}

/** 직선 (x0,y0)→(x1,y1), 압력 일정. */
export function lineStroke(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pressure = 0.6,
  opts: SyntheticStrokeOptions = {},
): RawSample[] {
  return parametricStroke((t) => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, pressure }), opts);
}

/** 압력 램프 0.05→1 직선. */
export function pressureRampStroke(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: SyntheticStrokeOptions = {},
): RawSample[] {
  return parametricStroke(
    (t) => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, pressure: 0.05 + 0.95 * t }),
    opts,
  );
}

/** 압력 삼각파 0.05→1→0.05 직선(히스테리시스 측정). */
export function pressureTriangleStroke(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: SyntheticStrokeOptions = {},
): RawSample[] {
  return parametricStroke(
    (t) => ({
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      pressure: 0.05 + 0.95 * (t < 0.5 ? t * 2 : 2 - t * 2),
    }),
    opts,
  );
}

/** 지그재그(폴리라인 4구간) — 카탈로그 썸네일 공용. size는 정사각 캔버스 한 변. */
export function zigzagStroke(size: number, opts: SyntheticStrokeOptions = {}): RawSample[] {
  const m = size * 0.15;
  const pts: [number, number][] = [
    [m, size - m],
    [size * 0.35, m],
    [size * 0.5, size - m],
    [size * 0.7, m],
    [size - m, size - m],
  ];
  return polylineStroke(pts, (t) => 0.3 + 0.7 * Math.sin(Math.PI * t), opts);
}

/** L자 코너(모서리 보존 검사). */
export function cornerStroke(size: number, opts: SyntheticStrokeOptions = {}): RawSample[] {
  const m = size * 0.2;
  return polylineStroke(
    [
      [m, m],
      [size - m, m],
      [size - m, size - m],
    ],
    () => 0.6,
    opts,
  );
}

/** 폴리라인을 등속으로 따라가는 획. 각 꼭짓점이 정확히 한 표본으로 들어가도록 구간별 표본 수를 맞춘다. */
export function polylineStroke(
  points: readonly [number, number][],
  pressure: (t: number) => number,
  opts: SyntheticStrokeOptions = {},
): RawSample[] {
  const rate = opts.sampleRateHz ?? 240;
  const duration = opts.durationMs ?? 600;
  const dt = 1000 / rate;
  const segs = points.length - 1;
  if (segs < 1) return [];
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(l);
    total += l;
  }
  const totalSamples = Math.max(segs + 1, Math.round((duration * rate) / 1000) + 1);
  const pts: SyntheticPoint[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const n = Math.max(1, Math.round(((lens[i] ?? 0) / total) * (totalSamples - 1)));
    for (let k = 0; k < n; k += 1) {
      const u = k / n;
      const x = a[0] + (b[0] - a[0]) * u;
      const y = a[1] + (b[1] - a[1]) * u;
      pts.push({ x, y });
    }
  }
  const last = points[points.length - 1];
  if (last) pts.push({ x: last[0], y: last[1] });
  const count = pts.length;
  return pts.map((p, i) =>
    sampleAt({ ...p, pressure: pressure(i / (count - 1)) }, i, count, dt, opts.pointerType ?? "pen"),
  );
}

/** 저속 직선 + 가우시안 위치 잡음(손떨림). */
export function tremorStroke(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  noisePx: number,
  seed = 1,
  opts: SyntheticStrokeOptions = {},
): RawSample[] {
  const rng = new Pcg32(seed, 0x7e3);
  const gaussian = (): number => {
    const u1 = Math.max(1e-7, rng.nextF32());
    const u2 = rng.nextF32();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  return parametricStroke(
    (t) => ({
      x: x0 + (x1 - x0) * t + gaussian() * noisePx,
      y: y0 + (y1 - y0) * t + gaussian() * noisePx,
      pressure: 0.5,
    }),
    { durationMs: 2000, ...opts },
  );
}

/** 획 중 예측 표본을 섞는다(파이프라인이 폐기해야 한다). */
export function withPredicted(samples: readonly RawSample[], every = 4): RawSample[] {
  const out: RawSample[] = [];
  samples.forEach((s, i) => {
    out.push(s);
    if (i > 0 && i % every === 0 && s.phase === "move") {
      out.push({ ...s, x: s.x + 50, y: s.y - 50, tMs: s.tMs + 1, source: "predicted" });
    }
  });
  return out;
}
