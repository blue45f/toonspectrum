import { deltaE76 } from "../../engine/core/color";
import { fnv1a64, sha256Hex } from "../../engine/core/hash";

import { alphaMask, imageToLab, normalProfile, pathStations, percentile } from "./lab-math";

import type { LabImage } from "../../engine/core/types";

/**
 * 렌더 품질 지표(순수 함수). 레인에 의존하지 않고 LabImage·Float32Array만 받는다.
 */

const EDGE_NEIGHBOR_DELTA = 16;
/** 직접 전이 판정: 한쪽 ≤ 5 %·αmax, 다른 쪽 ≥ 95 %·αmax. */
const DIRECT_LO = 0.05;
const DIRECT_HI = 0.95;

/**
 * 에지 계단(앨리어싱) 에너지 ∈ [0, 1].
 * 4-이웃 쌍 중 알파 차 ≥ 16인 "경계 전이"를 모아, 중간 커버리지 없이 빈 픽셀(≤ 5 %)에서 꽉 찬 픽셀(≥ 95 %)로
 * 바로 건너뛰는 직접 전이의 비율을 돌려준다. 해석적 AA 경계는 전이마다 부분 커버리지 픽셀을 거치므로 → 0에 가깝고,
 * 이진(계단) 경계는 → 1이다. 경계 전이가 없으면(빈 이미지·단색) 0.
 */
export function edgeStaircaseEnergy(img: LabImage): number {
  const { width, height, data } = img;
  const n = width * height;
  let aMax = 0;
  for (let i = 0; i < n; i += 1) {
    const a = data[i * 4 + 3] ?? 0;
    if (a > aMax) aMax = a;
  }
  if (aMax === 0) return 0;
  const lo = DIRECT_LO * aMax;
  const hi = DIRECT_HI * aMax;
  let direct = 0;
  let total = 0;
  const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3] ?? 0;
  const visit = (a: number, b: number): void => {
    if (Math.abs(a - b) < EDGE_NEIGHBOR_DELTA) return;
    total += 1;
    if (Math.min(a, b) <= lo && Math.max(a, b) >= hi) direct += 1;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = alphaAt(x, y);
      if (x + 1 < width) visit(a, alphaAt(x + 1, y));
      if (y + 1 < height) visit(a, alphaAt(x, y + 1));
    }
  }
  return total === 0 ? 0 : direct / total;
}

/**
 * 불투명도 누적 오차: 같은 자리에 flow로 layers회 도포했을 때 이론값
 * opacity·(1 − (1 − flow)^layers) 대비 측정 최대 알파의 절대 오차(0..1).
 */
export function opacityAccumulationError(
  img: LabImage,
  flow: number,
  layers: number,
  opacity = 1,
): number {
  const expected = opacity * (1 - Math.pow(1 - flow, layers));
  let aMax = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i += 1) {
    const a = img.data[i * 4 + 3] ?? 0;
    if (a > aMax) aMax = a;
  }
  return Math.abs(aMax / 255 - expected);
}

/** 커버리지 IoU(알파 ≥ threshold). 둘 다 비어 있으면 1. */
export function coverageIoU(a: LabImage, b: LabImage, alphaThreshold = 8): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError(
      `coverageIoU: size mismatch ${a.width}×${a.height} vs ${b.width}×${b.height}`,
    );
  }
  const ma = alphaMask(a, alphaThreshold);
  const mb = alphaMask(b, alphaThreshold);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ma.length; i += 1) {
    const x = ma[i] ?? 0;
    const y = mb[i] ?? 0;
    if (x && y) inter += 1;
    if (x || y) union += 1;
  }
  return union === 0 ? 1 : inter / union;
}

export interface DeltaEStats {
  mean: number;
  p99: number;
  max: number;
}

/** 픽셀당 CIE76 ΔE 통계. 입력은 `imageToLab`/`linearPremulToLab`의 (L,a,b)×N 버퍼. */
export function deltaEStats(labA: Float32Array, labB: Float32Array): DeltaEStats {
  const n = Math.floor(Math.min(labA.length, labB.length) / 3);
  if (n === 0) return { mean: 0, p99: 0, max: 0 };
  const d = new Float32Array(n);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    const o = i * 3;
    const v = deltaE76(
      [labA[o] ?? 0, labA[o + 1] ?? 0, labA[o + 2] ?? 0],
      [labB[o] ?? 0, labB[o + 1] ?? 0, labB[o + 2] ?? 0],
    );
    d[i] = v;
    sum += v;
    if (v > max) max = v;
  }
  return { mean: sum / n, p99: percentile(d, 99), max };
}

/** 두 LabImage의 ΔE 통계(흰 배경 위 합성). */
export function deltaEStatsImages(a: LabImage, b: LabImage): DeltaEStats {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError(
      `deltaEStatsImages: size mismatch ${a.width}×${a.height} vs ${b.width}×${b.height}`,
    );
  }
  return deltaEStats(imageToLab(a), imageToLab(b));
}

export const DEFAULT_FUZZY_DELTA = 48;

function directionalMismatches(
  from: Uint8Array | Uint8ClampedArray,
  to: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  delta: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const other = (ny * width + nx) * 4;
          let channelMax = 0;
          for (let c = 0; c < 4; c += 1) {
            const diff = Math.abs((from[base + c] ?? 0) - (to[other + c] ?? 0));
            if (diff > channelMax) channelMax = diff;
          }
          if (channelMax <= delta) matched = true;
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

/**
 * δ48 퍼지 불일치율(%). 픽셀이 상대 이미지의 체비쇼프 반경 1 이웃 중 하나와 채널별 |Δ| ≤ delta로
 * 일치하면 통과. 양방향으로 검사해 잉크 과잉·누락 모두 잡는다(AA 위상 이동은 통과).
 * 서비스 엔진 레지스트리 패키지의 `createFuzzyNeighborhoodGate`와 같은 정의(render-metrics.test에서 교차 검증).
 */
export function fuzzyMismatchPct(
  candidate: Uint8Array | Uint8ClampedArray,
  reference: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  delta = DEFAULT_FUZZY_DELTA,
): number {
  const expected = width * height * 4;
  if (candidate.length !== expected || reference.length !== expected) {
    throw new RangeError(
      `fuzzyMismatchPct: expected ${expected} bytes, got candidate=${candidate.length} reference=${reference.length}`,
    );
  }
  if (width === 0 || height === 0) return 0;
  const worst = Math.max(
    directionalMismatches(candidate, reference, width, height, delta),
    directionalMismatches(reference, candidate, width, height, delta),
  );
  return (worst / (width * height)) * 100;
}

function imageBytes(img: LabImage): Uint8Array {
  const out = new Uint8Array(8 + img.data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, img.width, true);
  view.setUint32(4, img.height, true);
  out.set(img.data, 8);
  return out;
}

/** 결정성 해시(fnv1a64, 크기 헤더 포함). */
export function pixelHash(img: LabImage): string {
  return fnv1a64(imageBytes(img));
}

/** 리포트용 SHA-256(64자리 hex). */
export function pixelSha256(img: LabImage): Promise<string> {
  return sha256Hex(imageBytes(img));
}

const TRANSITION_STEP = 0.25;
const TRANSITION_REACH = 48;

function interpolateCrossing(profile: Float32Array, from: number, dir: 1 | -1, level: number): number | null {
  let i = from;
  while (i + dir >= 0 && i + dir < profile.length) {
    const a = profile[i] ?? 0;
    const b = profile[i + dir] ?? 0;
    if (a >= level && b < level) {
      const t = a > b ? (a - level) / (a - b) : 0;
      return i + dir * t;
    }
    i += dir;
  }
  return null;
}

/**
 * 에지 전이폭(px): 의도 경로 정류장마다 법선 알파 프로파일에서 피크 A*의 90 %→10 % 하강 구간 폭을
 * 양쪽에서 재어 평균한다. 잉크가 없는 정류장은 제외하며 전부 비면 null.
 */
export function edgeTransitionWidthPx(
  img: LabImage,
  path: readonly (readonly [number, number])[],
  stations = 12,
): number | null {
  const widths: number[] = [];
  for (const st of pathStations(path, stations)) {
    const profile = normalProfile(img, st, TRANSITION_REACH, TRANSITION_STEP);
    let peak = 0;
    let peakIdx = -1;
    for (let i = 0; i < profile.length; i += 1) {
      const v = profile[i] ?? 0;
      if (v > peak) {
        peak = v;
        peakIdx = i;
      }
    }
    if (peakIdx < 0 || peak < 8 / 255) continue;
    for (const dir of [1, -1] as const) {
      const y90 = interpolateCrossing(profile, peakIdx, dir, 0.9 * peak);
      const y10 = interpolateCrossing(profile, peakIdx, dir, 0.1 * peak);
      if (y90 === null || y10 === null) continue;
      widths.push(Math.abs(y10 - y90) * TRANSITION_STEP);
    }
  }
  if (widths.length === 0) return null;
  let s = 0;
  for (const w of widths) s += w;
  return s / widths.length;
}
