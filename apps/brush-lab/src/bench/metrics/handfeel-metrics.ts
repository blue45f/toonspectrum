import {
  bilinearAlpha,
  linearFit,
  mean,
  MIN_INK_ALPHA,
  normalProfile,
  pathStations,
  percentile,
  polyEval,
  polyFit,
  profilePeak,
  profileWidth,
  spearman,
  std,
} from "./lab-math";

import type { PathStation } from "./lab-math";
import type { RawSample } from "../../engine/core/types";
import type { LatencyRecord } from "../../engine/input/input-pipeline";
import type { DabBatchReceipt } from "../../lanes/lane";

/**
 * 필기감 지표(순수 함수, 필기감 설계 §3). 시간은 모두 인자로 받고 전역 시계를 쓰지 않는다.
 */

export type Point = readonly [number, number];

export interface LatencyStats {
  p50: number;
  p95: number;
  max: number;
}

export function latencyStats(values: readonly number[]): LatencyStats | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  let max = 0;
  for (const v of finite) if (v > max) max = v;
  return { p50: percentile(finite, 50), p95: percentile(finite, 95), max };
}

/**
 * 입력→픽셀 지연: 필터 지연(modeledTMs − inputTMs)에 프레임 렌더 시간을 더한다.
 * 기록 i는 프레임 floor(i·F/N)에 비례 배정한다(둘 다 시간 순). 기록이 없으면 null.
 */
export function inputToPixelLatency(
  latency: readonly LatencyRecord[],
  frameTimes: readonly number[],
): LatencyStats | null {
  if (latency.length === 0) return null;
  const n = latency.length;
  const f = frameTimes.length;
  const values = latency.map((rec, i) => {
    const frame = f > 0 ? (frameTimes[Math.min(f - 1, Math.floor((i * f) / n))] ?? 0) : 0;
    return rec.modeledTMs - rec.inputTMs + frame;
  });
  return latencyStats(values);
}

/** 레인 영수증 기반 지연: 프레임별 inputToSubmitMs + 프레임 시간. 측정 가능한 프레임이 없으면 null. */
export function frameLatency(
  frames: readonly DabBatchReceipt[],
  frameTimes: readonly number[],
): LatencyStats | null {
  const values: number[] = [];
  frames.forEach((fr, i) => {
    if (fr.inputToSubmitMs === null || !Number.isFinite(fr.inputToSubmitMs)) return;
    values.push(fr.inputToSubmitMs + (frameTimes[i] ?? 0));
  });
  return latencyStats(values);
}

export interface PressureResponse {
  /** 상승 구간 선폭의 스피어만 단조성(1 = 완전 단조). */
  monotonicity: number;
  /** 선폭 ~ p^γ 거듭제곱 적합 R²(상승 구간). */
  linearityR2: number;
  /** 적합된 지수 γ. */
  gamma: number;
  /** 상승/하강 루프 면적 / (wMax·Δp). 하강 구간이 없으면 0. */
  hysteresisWidth: number;
}

const HYSTERESIS_BINS = 32;

/** 압력 삼각파(0→1→0)에 대한 선폭 응답. pressures·widths는 같은 길이의 시간순 배열. */
export function pressureResponse(pressures: readonly number[], widths: readonly number[]): PressureResponse {
  const n = Math.min(pressures.length, widths.length);
  if (n < 2) return { monotonicity: 0, linearityR2: 0, gamma: 0, hysteresisWidth: 0 };
  let iMax = 0;
  let pMax = Number.NEGATIVE_INFINITY;
  let pMin = Number.POSITIVE_INFINITY;
  let wMax = 0;
  for (let i = 0; i < n; i += 1) {
    const p = pressures[i] ?? 0;
    if (p > pMax) {
      pMax = p;
      iMax = i;
    }
    if (p < pMin) pMin = p;
    if ((widths[i] ?? 0) > wMax) wMax = widths[i] ?? 0;
  }
  const upP = pressures.slice(0, iMax + 1);
  const upW = widths.slice(0, iMax + 1);
  const monotonicity = spearman(upP, upW);
  const lx: number[] = [];
  const ly: number[] = [];
  for (let i = 0; i <= iMax; i += 1) {
    const p = pressures[i] ?? 0;
    const w = widths[i] ?? 0;
    if (p > 0.05 && w > 0) {
      lx.push(Math.log(p));
      ly.push(Math.log(w));
    }
  }
  const fit = lx.length >= 3 ? linearFit(lx, ly) : { slope: 0, intercept: 0, r2: 0 };
  let hysteresisWidth = 0;
  const downCount = n - 1 - iMax;
  if (downCount >= 2 && wMax > 0 && pMax > pMin) {
    const upSum = new Float64Array(HYSTERESIS_BINS);
    const upCnt = new Uint32Array(HYSTERESIS_BINS);
    const downSum = new Float64Array(HYSTERESIS_BINS);
    const downCnt = new Uint32Array(HYSTERESIS_BINS);
    const binOf = (p: number): number =>
      Math.min(HYSTERESIS_BINS - 1, Math.floor(((p - pMin) / (pMax - pMin)) * HYSTERESIS_BINS));
    for (let i = 0; i < n; i += 1) {
      const b = binOf(pressures[i] ?? 0);
      if (i <= iMax) {
        upSum[b] = (upSum[b] ?? 0) + (widths[i] ?? 0);
        upCnt[b] = (upCnt[b] ?? 0) + 1;
      } else {
        downSum[b] = (downSum[b] ?? 0) + (widths[i] ?? 0);
        downCnt[b] = (downCnt[b] ?? 0) + 1;
      }
    }
    let area = 0;
    let span = 0;
    const dp = (pMax - pMin) / HYSTERESIS_BINS;
    for (let b = 0; b < HYSTERESIS_BINS; b += 1) {
      const uc = upCnt[b] ?? 0;
      const dc = downCnt[b] ?? 0;
      if (uc === 0 || dc === 0) continue;
      area += Math.abs((upSum[b] ?? 0) / uc - (downSum[b] ?? 0) / dc) * dp;
      span += dp;
    }
    hysteresisWidth = span > 0 ? area / (wMax * span) : 0;
  }
  return { monotonicity, linearityR2: fit.r2, gamma: fit.slope, hysteresisWidth };
}

/** 선폭 측정 범위(px). 캔버스 1/4까지. */
function reachFor(width: number, height: number): number {
  return Math.max(16, Math.min(width, height) / 4);
}

const WIDTH_STEP = 0.5;

/** 의도 경로 정류장(stations개)에서 법선 방향 선폭 곡선(px). */
export function lineWidthCurve(
  img: { width: number; height: number; data: Uint8ClampedArray },
  intendedPath: readonly Point[],
  stations: number,
): number[] {
  const reach = reachFor(img.width, img.height);
  return pathStations(intendedPath, stations).map((st) =>
    profileWidth(normalProfile(img, st, reach, WIDTH_STEP), WIDTH_STEP),
  );
}

/** 엔진 테이퍼 규약: 반경 × smoothstep(진행/taperPx). 다른 레인도 같은 프로그램 규약을 따라야 한다. */
export function taperSmoothstep(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * 호 길이 s(0..total)에서 기대 선폭: 시작 taperStartPx·끝 taperEndPx 구간은 wMax·smoothstep, 그 밖은 wMax.
 */
export function expectedTaperWidth(s: number, total: number, wMax: number, taperStartPx: number, taperEndPx: number): number {
  let scale = 1;
  if (taperStartPx > 0) scale = Math.min(scale, taperSmoothstep(s / taperStartPx));
  if (taperEndPx > 0) scale = Math.min(scale, taperSmoothstep((total - s) / taperEndPx));
  return wMax * scale;
}

/** 테이퍼 품질: 1 − RMS(w − expected)/max(expected), [0, 1]. */
export function taperQuality(widths: readonly number[], expected: readonly number[]): number {
  const n = Math.min(widths.length, expected.length);
  if (n === 0) return 0;
  let eMax = 0;
  for (let i = 0; i < n; i += 1) if ((expected[i] ?? 0) > eMax) eMax = expected[i] ?? 0;
  let ss = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (widths[i] ?? 0) - (expected[i] ?? 0);
    ss += d * d;
  }
  const rms = Math.sqrt(ss / n);
  if (eMax === 0) return rms === 0 ? 1 : 0;
  return Math.max(0, Math.min(1, 1 - rms / eMax));
}

export interface TaperShape {
  peakIndex: number;
  /** 마지막 선폭 / 최대 선폭. */
  endWidthRatio: number;
  /** 피크 이후 재상승 최대폭 / wMax. */
  overshoot: number;
  /** 피크 이후 단조 감소 위반 횟수(허용 오차 1e-3·wMax). */
  monotoneViolations: number;
}

/** 끝 테이퍼 형태(필기감 설계 §3: 피크 후 단조 감소, 끝 폭 ≤ 15 %, 오버슈트 ≤ 5 %). */
export function taperShape(widths: readonly number[]): TaperShape {
  if (widths.length === 0) return { peakIndex: 0, endWidthRatio: 0, overshoot: 0, monotoneViolations: 0 };
  let wMax = 0;
  let peakIndex = 0;
  widths.forEach((w, i) => {
    if (w > wMax) {
      wMax = w;
      peakIndex = i;
    }
  });
  if (wMax === 0) return { peakIndex, endWidthRatio: 0, overshoot: 0, monotoneViolations: 0 };
  let runningMin = wMax;
  let overshoot = 0;
  let violations = 0;
  for (let i = peakIndex + 1; i < widths.length; i += 1) {
    const w = widths[i] ?? 0;
    const prev = widths[i - 1] ?? 0;
    if (w > prev + 1e-3 * wMax) violations += 1;
    if (w - runningMin > overshoot) overshoot = w - runningMin;
    if (w < runningMin) runningMin = w;
  }
  return {
    peakIndex,
    endWidthRatio: (widths[widths.length - 1] ?? 0) / wMax,
    overshoot: overshoot / wMax,
    monotoneViolations: violations,
  };
}

/** 경로의 누적 호 길이. */
function arcLengths(path: readonly Point[]): number[] {
  const s: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    s.push((s[i - 1] ?? 0) + (a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0));
  }
  return s;
}

/** 저속 지터: 호 길이 매개변수의 3차 다항식으로 x·y를 detrend한 잔차 RMS(px). */
export function slowSpeedJitterRms(path: readonly Point[]): number {
  if (path.length < 5) return 0;
  const s = arcLengths(path);
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const fx = polyFit(s, xs, 3);
  const fy = polyFit(s, ys, 3);
  let ss = 0;
  for (let i = 0; i < path.length; i += 1) {
    const dx = (xs[i] ?? 0) - polyEval(fx, s[i] ?? 0);
    const dy = (ys[i] ?? 0) - polyEval(fy, s[i] ?? 0);
    ss += dx * dx + dy * dy;
  }
  return Math.sqrt(ss / path.length);
}

/** 프로파일에서 중앙을 포함하는 연속 잉크 구간 [lo, hi](인덱스). 중앙이 비면 null. */
function inkRunAround(profile: Float32Array, center: number, threshold: number): [number, number] | null {
  if ((profile[center] ?? 0) < threshold) return null;
  let lo = center;
  while (lo > 0 && (profile[lo - 1] ?? 0) >= threshold) lo -= 1;
  let hi = center;
  while (hi < profile.length - 1 && (profile[hi + 1] ?? 0) >= threshold) hi += 1;
  return [lo, hi];
}

const CENTERLINE_INK = 8 / 255;

/**
 * 이미지에서 중심선 추출: 의도 경로 정류장마다 법선 방향 알파 가중 무게중심.
 * 무게중심 창은 (1) 중앙을 포함하는 연속 잉크 구간, (2) ±(0.75·선폭 중앙값 + 1 px)로 제한해 모서리에서
 * 이웃 변의 잉크가 창에 들어와 중심이 끌려가는 것을 막는다. 중앙에 잉크가 없는 정류장은 가장 가까운 잉크 구간을 쓰고,
 * 창 안에 잉크가 전혀 없으면 건너뛴다.
 */
export function centerlineFromImage(
  img: { width: number; height: number; data: Uint8ClampedArray },
  intendedPath: readonly Point[],
  stations: number,
): Point[] {
  const reach = reachFor(img.width, img.height);
  const sts = pathStations(intendedPath, stations);
  const profiles = sts.map((st) => normalProfile(img, st, reach, WIDTH_STEP));
  const widths = profiles.map((p) => profileWidth(p, WIDTH_STEP)).filter((w) => w > 0);
  const medianWidth = widths.length > 0 ? percentile(widths, 50) : 0;
  const halfWindow = Math.max(1, Math.ceil((0.75 * medianWidth + 1) / WIDTH_STEP));
  const out: Point[] = [];
  profiles.forEach((profile, i) => {
    const st = sts[i];
    if (!st) return;
    const half = Math.floor(profile.length / 2);
    let center = half;
    if ((profile[half] ?? 0) < CENTERLINE_INK) {
      let best = -1;
      for (let k = 0; k < profile.length; k += 1) {
        if ((profile[k] ?? 0) >= CENTERLINE_INK && (best < 0 || Math.abs(k - half) < Math.abs(best - half))) best = k;
      }
      if (best < 0 || Math.abs(best - half) > halfWindow) return;
      center = best;
    }
    const run = inkRunAround(profile, center, CENTERLINE_INK);
    if (!run) return;
    const lo = Math.max(run[0], center - halfWindow);
    const hi = Math.min(run[1], center + halfWindow);
    let wsum = 0;
    let dsum = 0;
    for (let k = lo; k <= hi; k += 1) {
      const a = profile[k] ?? 0;
      wsum += a;
      dsum += a * (k - half) * WIDTH_STEP;
    }
    if (wsum <= 0) return;
    const d = dsum / wsum;
    out.push([st.x - st.ty * d, st.y + st.tx * d]);
  });
  return out;
}

export interface CornerDeviation {
  /** 각 모서리 정점에서 경로까지의 최소 거리 중 최대(px). 정점이 없으면 0. */
  maxPx: number;
  /** 정점을 지나 진입 방향으로 뻗은 길이 중 최대(px). */
  overshootPx: number;
}

const OVERSHOOT_LATERAL_PX = 2;

/** 점 → 선분 거리. */
function pointSegmentDistance(px: number, py: number, a: Point, b: Point): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / len2));
  return Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t));
}

/**
 * 모서리 정확도: intended의 내부 정점(1..n−2)에 대해
 * - maxPx: 정점에서 경로(점·선분)까지의 최소 거리 중 최대
 * - overshootPx: 정점을 지나 진입 방향으로 뻗은 경로 점의 투영 길이 중 최대(측면 2 px 이내, 다음 변 길이의 절반 미만)
 */
export function cornerDeviation(path: readonly Point[], intended: readonly Point[]): CornerDeviation {
  if (path.length === 0 || intended.length < 3) return { maxPx: 0, overshootPx: 0 };
  let maxPx = 0;
  let overshootPx = 0;
  for (let k = 1; k + 1 < intended.length; k += 1) {
    const v = intended[k];
    const prev = intended[k - 1];
    const next = intended[k + 1];
    if (!v || !prev || !next) continue;
    const inLen = Math.hypot(v[0] - prev[0], v[1] - prev[1]) || 1;
    const outLen = Math.hypot(next[0] - v[0], next[1] - v[1]) || 1;
    const ux = (v[0] - prev[0]) / inLen;
    const uy = (v[1] - prev[1]) / inLen;
    let dmin = Number.POSITIVE_INFINITY;
    for (let i = 0; i < path.length; i += 1) {
      const p = path[i];
      if (!p) continue;
      const dx = p[0] - v[0];
      const dy = p[1] - v[1];
      const d = i + 1 < path.length ? pointSegmentDistance(v[0], v[1], p, path[i + 1] ?? p) : Math.hypot(dx, dy);
      if (d < dmin) dmin = d;
      const proj = dx * ux + dy * uy;
      const lateral = Math.abs(dx * -uy + dy * ux);
      if (proj > 0 && lateral <= OVERSHOOT_LATERAL_PX && proj < Math.min(inLen, outLen) / 2 && proj > overshootPx) {
        overshootPx = proj;
      }
    }
    if (Number.isFinite(dmin) && dmin > maxPx) maxPx = dmin;
  }
  return { maxPx, overshootPx };
}

/** 직선 (origin + dir·t) 위 알파 프로파일(t ∈ [−reach, reach], step px). 중앙 인덱스가 origin. */
function rayProfile(
  img: { width: number; height: number; data: Uint8ClampedArray },
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  reach: number,
  step: number,
): Float32Array {
  const half = Math.ceil(reach / step);
  const out = new Float32Array(half * 2 + 1);
  for (let i = -half; i <= half; i += 1) {
    const t = i * step;
    out[i + half] = bilinearAlpha(img, ox + dx * t, oy + dy * t);
  }
  return out;
}

/** 프로파일에서 중앙(또는 가장 가까운) 잉크 구간의 [시작, 끝] 거리(px). 피크 50 % 기준. 잉크 없으면 null. */
function inkRunDistances(profile: Float32Array, step: number): { start: number; end: number } | null {
  const thr = Math.max(MIN_INK_ALPHA, 0.5 * profilePeak(profile));
  const half = Math.floor(profile.length / 2);
  let center = half;
  if ((profile[half] ?? 0) < thr) {
    let best = -1;
    for (let i = 0; i < profile.length; i += 1) {
      if ((profile[i] ?? 0) >= thr && (best < 0 || Math.abs(i - half) < Math.abs(best - half))) best = i;
    }
    if (best < 0) return null;
    center = best;
  }
  let lo = center;
  while (lo > 0 && (profile[lo - 1] ?? 0) >= thr) lo -= 1;
  let hi = center;
  while (hi < profile.length - 1 && (profile[hi + 1] ?? 0) >= thr) hi += 1;
  const edge = (i: number, dir: -1 | 1): number => {
    const a = profile[i] ?? 0;
    const b = profile[i + dir] ?? 0;
    const j = i + dir;
    if (j < 0 || j >= profile.length || a <= b) return i;
    return i + dir * ((a - thr) / (a - b));
  };
  return { start: (edge(lo, -1) - half) * step, end: (edge(hi, 1) - half) * step };
}

export interface CornerAccuracy {
  /** 모서리 정점에서 그려진 중심선 꼭짓점까지의 거리 최대(px). 둥글어진 모서리는 안쪽으로 물러난다. */
  maxPx: number;
  /** 진입 변이 정점을 지나 뻗은 길이 최대(px, 둥근 캡 반경 보정). 둔각 모서리는 측정하지 않는다(null). */
  overshootPx: number | null;
  /** 측정한 모서리 수. */
  corners: number;
}

const CORNER_STEP = 0.25;

/**
 * 이미지 기반 모서리 정확도(필기감 설계 §3). 정점 v, 진입 방향 u_in, 진출 방향 u_out에 대해
 * - 편차: 바깥쪽 이등분선(−b, b = normalize(u_out − u_in))을 따라 잉크 경계까지의 거리 e를 재고
 *   꼭짓점 = e − w/2 (둥근 캡의 날카로운 모서리는 e = w/2 → 0, 중심선이 반경 r로 둥글면 r(√2−1)).
 *   정점에 잉크가 없으면 가장 가까운 잉크 구간 시작까지 거리 + w/2.
 * - 오버슈트: 진입 변의 바깥쪽으로 w/4 비껴난 평행선을 따라 정점 너머 잉크 길이 − √(w²/4 − w²/16)
 *   (캡 반경 보정). 진출 변이 이 선을 가로지르는 둔각(u_in·u_out > 0)은 측정하지 않는다.
 * halfWidth(w/2)는 호출자가 선폭 곡선 중앙값으로 준다.
 */
export function cornerAccuracyFromImage(
  img: { width: number; height: number; data: Uint8ClampedArray },
  intended: readonly Point[],
  halfWidth: number,
): CornerAccuracy {
  if (intended.length < 3 || !(halfWidth > 0)) return { maxPx: 0, overshootPx: null, corners: 0 };
  const reach = Math.max(8, halfWidth * 6);
  let maxPx = 0;
  let overshootPx: number | null = null;
  let corners = 0;
  for (let k = 1; k + 1 < intended.length; k += 1) {
    const v = intended[k];
    const prev = intended[k - 1];
    const next = intended[k + 1];
    if (!v || !prev || !next) continue;
    const inLen = Math.hypot(v[0] - prev[0], v[1] - prev[1]);
    const outLen = Math.hypot(next[0] - v[0], next[1] - v[1]);
    if (inLen === 0 || outLen === 0) continue;
    const uix = (v[0] - prev[0]) / inLen;
    const uiy = (v[1] - prev[1]) / inLen;
    const uox = (next[0] - v[0]) / outLen;
    const uoy = (next[1] - v[1]) / outLen;
    let bx = uox - uix;
    let by = uoy - uiy;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-6) continue; // 직진(모서리 아님)
    bx /= bl;
    by /= bl;
    corners += 1;
    // 편차: 안쪽 이등분선 방향 +b, 바깥쪽 −b. 프로파일 t>0 = 안쪽.
    const bis = rayProfile(img, v[0], v[1], bx, by, reach, CORNER_STEP);
    const run = inkRunDistances(bis, CORNER_STEP);
    let dev: number;
    if (!run) dev = reach;
    else if (run.start <= 0 && run.end >= 0) dev = Math.max(0, run.start + halfWidth);
    else dev = Math.min(Math.abs(run.start), Math.abs(run.end)) + halfWidth;
    if (dev > maxPx) maxPx = dev;
    // 오버슈트(둔각 제외): 진입 변 바깥쪽(진출 변 반대편)으로 w/4 비껴난 평행선.
    if (uix * uox + uiy * uoy > 1e-6) continue;
    const side = uix * uoy - uiy * uox; // > 0: 왼쪽으로 꺾음(y-down 좌표계)
    const nx = side > 0 ? uiy : -uiy;
    const ny = side > 0 ? -uix : uix;
    const off = halfWidth / 4;
    const ox = v[0] + nx * off;
    const oy = v[1] + ny * off;
    const along = rayProfile(img, ox, oy, uix, uiy, reach, CORNER_STEP);
    const ar = inkRunDistances(along, CORNER_STEP);
    const capReach = Math.sqrt(Math.max(0, halfWidth * halfWidth - off * off));
    const over = ar && ar.start <= 0 ? Math.max(0, ar.end - capReach) : 0;
    overshootPx = Math.max(overshootPx ?? 0, over);
  }
  return { maxPx, overshootPx, corners };
}

export interface SpeedBucketCoverage {
  /** 구간 대표 속도(px/ms, 기하 평균). */
  speeds: number[];
  /** 구간별 단면 잉크 질량 평균(알파 합 · step). */
  coverage: number[];
}

/**
 * 속도 구간별 도포: 표본 구간 중점에서 법선 알파 프로파일의 적분(잉크 질량)을 속도 로그 구간으로 묶는다.
 * 채워진 구간만 돌려준다(속도 범위가 좁으면 1개).
 */
export function speedBucketCoverage(
  img: { width: number; height: number; data: Uint8ClampedArray },
  samples: readonly RawSample[],
  buckets = 3,
): SpeedBucketCoverage {
  const reach = reachFor(img.width, img.height);
  const speeds: number[] = [];
  const masses: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a || !b) continue;
    const dt = b.tMs - a.tMs;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dt <= 0 || dist <= 0) continue;
    const st: PathStation = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      tx: (b.x - a.x) / dist,
      ty: (b.y - a.y) / dist,
      s: 0,
    };
    const profile = normalProfile(img, st, reach, WIDTH_STEP);
    let m = 0;
    for (let k = 0; k < profile.length; k += 1) m += (profile[k] ?? 0) * WIDTH_STEP;
    speeds.push(dist / dt);
    masses.push(m);
  }
  if (speeds.length === 0) return { speeds: [], coverage: [] };
  const logs = speeds.map((v) => Math.log(v));
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of logs) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const nb = Math.max(1, Math.floor(buckets));
  const sum = new Float64Array(nb);
  const cnt = new Uint32Array(nb);
  const spd = new Float64Array(nb);
  for (let i = 0; i < logs.length; i += 1) {
    const l = logs[i] ?? 0;
    const b = hi > lo ? Math.min(nb - 1, Math.floor(((l - lo) / (hi - lo)) * nb)) : 0;
    sum[b] = (sum[b] ?? 0) + (masses[i] ?? 0);
    spd[b] = (spd[b] ?? 0) + l;
    cnt[b] = (cnt[b] ?? 0) + 1;
  }
  const outSpeeds: number[] = [];
  const outCov: number[] = [];
  for (let b = 0; b < nb; b += 1) {
    const c = cnt[b] ?? 0;
    if (c === 0) continue;
    outSpeeds.push(Math.exp((spd[b] ?? 0) / c));
    outCov.push((sum[b] ?? 0) / c);
  }
  return { speeds: outSpeeds, coverage: outCov };
}

/** 속도별 도포 일관성: 구간 도포의 변동계수(std/mean). 구간이 2개 미만이거나 평균 0이면 0. */
export function speedConsistency(coverageBySpeedBucket: readonly number[]): number {
  if (coverageBySpeedBucket.length < 2) return 0;
  const m = mean(coverageBySpeedBucket);
  if (m <= 0) return 0;
  return std(coverageBySpeedBucket) / m;
}

/** 표본 좌표 경로. */
export function samplePath(samples: readonly RawSample[]): Point[] {
  return samples.map((s) => [s.x, s.y] as const);
}

/** 정류장에서 알파 존재 여부(잉크가 그려졌는지). */
export function inkAt(img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number): boolean {
  return bilinearAlpha(img, x, y) > 0;
}

/**
 * 표본 위치별 선폭(px): 각 표본에서 이웃(i−1 → i+1) 접선의 법선 프로파일 폭. 정지 표본(접선 0)은 직전 접선을 쓴다.
 * 압력 응답(`pressureResponse`)의 widths 입력으로 쓴다(압력 배열과 같은 길이·순서).
 */
export function widthsAtSamples(
  img: { width: number; height: number; data: Uint8ClampedArray },
  samples: readonly RawSample[],
): number[] {
  const reach = reachFor(img.width, img.height);
  const out: number[] = [];
  let tx = 1;
  let ty = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s) continue;
    const prev = samples[Math.max(0, i - 1)] ?? s;
    const next = samples[Math.min(samples.length - 1, i + 1)] ?? s;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      tx = dx / len;
      ty = dy / len;
    }
    const st: PathStation = { x: s.x, y: s.y, tx, ty, s: 0 };
    out.push(profileWidth(normalProfile(img, st, reach, WIDTH_STEP), WIDTH_STEP));
  }
  return out;
}
