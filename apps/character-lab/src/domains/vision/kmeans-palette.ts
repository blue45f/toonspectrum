/**
 * 결정적 k-means 팔레트 추출(순수). RGBA 픽셀을 OKLab(기본) 또는 선형 sRGB 공간으로 옮겨
 * k-means++ 초기화(mulberry32 고정 시드) + Lloyd 반복으로 대표색 k개와 비중(weight)을 돌려준다.
 *
 * - 같은 입력·같은 시드 → 같은 결과(바이트 단위). `Math.random`은 쓰지 않는다.
 * - 빈 군집은 자기 중심에서 가장 먼 점으로 재배치하고, 끝까지 비어 있으면 결과에서 뺀다.
 * - 알파가 `alphaMin` 미만인 픽셀(투명 배경)은 표본에서 제외한다.
 * - 표본은 `maxSamples` 이하가 되도록 결정적 stride로 줄인다.
 */
import { formatHex, linearRgbToOklab, linearToSrgb, oklabToLinearRgb, srgbToLinear } from "../../shared/color";
import { mulberry32 } from "../../shared/prng";

import type { Oklab } from "../../shared/color";

export type PaletteSpace = "oklab" | "linear-srgb";

export interface PaletteOptions {
  /** 군집 수(기본 5). 표본의 서로 다른 색 수보다 크면 그만큼 줄어든다. */
  readonly k?: number;
  /** PRNG 시드(기본 1) */
  readonly seed?: number;
  /** Lloyd 반복 상한(기본 16). 배정이 바뀌지 않으면 조기 종료. */
  readonly iterations?: number;
  readonly space?: PaletteSpace;
  /** 이 값 미만 알파는 표본 제외(기본 128) */
  readonly alphaMin?: number;
  /** 표본 상한(기본 4096) */
  readonly maxSamples?: number;
}

export interface PaletteEntry {
  /** 소문자 #rrggbb */
  readonly hex: string;
  /** 표본 비중 0..1(합 1) */
  readonly weight: number;
  /** 군집 중심(OKLab) */
  readonly oklab: Oklab;
  /** 군집에 속한 표본 수 */
  readonly count: number;
}

type Vec3 = readonly [number, number, number];

const DEFAULT_OPTIONS: Required<PaletteOptions> = { k: 5, seed: 1, iterations: 16, space: "oklab", alphaMin: 128, maxSamples: 4096 };

function toSpace(r: number, g: number, b: number, space: PaletteSpace): Vec3 {
  const linear: Vec3 = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  return space === "oklab" ? linearRgbToOklab(linear) : linear;
}

function fromSpace(point: Vec3, space: PaletteSpace): { hex: string; oklab: Oklab } {
  const linear: Vec3 = space === "oklab" ? oklabToLinearRgb(point) : point;
  const clamped: Vec3 = [Math.min(1, Math.max(0, linear[0])), Math.min(1, Math.max(0, linear[1])), Math.min(1, Math.max(0, linear[2]))];
  const hex = formatHex([linearToSrgb(clamped[0]) * 255, linearToSrgb(clamped[1]) * 255, linearToSrgb(clamped[2]) * 255]);
  const oklab: Oklab = space === "oklab" ? point : linearRgbToOklab(clamped);
  return { hex, oklab };
}

function distanceSq(a: Vec3, b: Vec3): number {
  const d0 = a[0] - b[0];
  const d1 = a[1] - b[1];
  const d2 = a[2] - b[2];
  return d0 * d0 + d1 * d1 + d2 * d2;
}

/** RGBA 바이트 열에서 표본 점을 모은다(알파 필터 + 결정적 stride). */
export function samplePixels(rgba: Uint8ClampedArray | Uint8Array, options: Pick<Required<PaletteOptions>, "alphaMin" | "maxSamples" | "space">): Vec3[] {
  const pixelCount = Math.floor(rgba.length / 4);
  if (pixelCount === 0) return [];
  let opaque = 0;
  for (let p = 0; p < pixelCount; p += 1) if ((rgba[p * 4 + 3] ?? 0) >= options.alphaMin) opaque += 1;
  if (opaque === 0) return [];
  const stride = Math.max(1, Math.ceil(opaque / Math.max(1, options.maxSamples)));
  const samples: Vec3[] = [];
  let seen = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const base = p * 4;
    if ((rgba[base + 3] ?? 0) < options.alphaMin) continue;
    if (seen % stride === 0) samples.push(toSpace(rgba[base] ?? 0, rgba[base + 1] ?? 0, rgba[base + 2] ?? 0, options.space));
    seen += 1;
  }
  return samples;
}

function distinctCount(samples: readonly Vec3[]): number {
  const keys = new Set<string>();
  for (const sample of samples) keys.add(`${sample[0].toFixed(5)}|${sample[1].toFixed(5)}|${sample[2].toFixed(5)}`);
  return keys.size;
}

/** k-means++ 초기화(D² 가중 추출, 고정 시드) */
function initializeCenters(samples: readonly Vec3[], k: number, seed: number): Vec3[] {
  const random = mulberry32(seed);
  const centers: Vec3[] = [];
  const first = samples[Math.floor(random() * samples.length)];
  if (!first) return centers;
  centers.push(first);
  const nearest = samples.map((sample) => distanceSq(sample, first));
  while (centers.length < k) {
    let total = 0;
    for (const d of nearest) total += d;
    if (total <= 0) break;
    let threshold = random() * total;
    let chosen = samples.length - 1;
    for (let i = 0; i < samples.length; i += 1) {
      threshold -= nearest[i] ?? 0;
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    const center = samples[chosen];
    if (!center) break;
    centers.push(center);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      if (!sample) continue;
      nearest[i] = Math.min(nearest[i] ?? Number.POSITIVE_INFINITY, distanceSq(sample, center));
    }
  }
  return centers;
}

/**
 * 팔레트를 추출한다. 결과는 비중 내림차순(동률이면 hex 오름차순)으로 정렬돼 있다.
 */
export function extractPalette(rgba: Uint8ClampedArray | Uint8Array, options: PaletteOptions = {}): PaletteEntry[] {
  const resolved: Required<PaletteOptions> = { ...DEFAULT_OPTIONS, ...options };
  const samples = samplePixels(rgba, resolved);
  if (samples.length === 0) return [];
  const k = Math.max(1, Math.min(Math.floor(resolved.k), distinctCount(samples)));
  const centers = initializeCenters(samples, k, resolved.seed >>> 0);
  const assignment = new Int32Array(samples.length).fill(-1);

  for (let iteration = 0; iteration < Math.max(1, resolved.iterations); iteration += 1) {
    let changed = false;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      if (!sample) continue;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c += 1) {
        const center = centers[c];
        if (!center) continue;
        const distance = distanceSq(sample, center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        changed = true;
      }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      const bucket = sums[assignment[i] ?? 0];
      if (!sample || !bucket) continue;
      bucket[0] += sample[0];
      bucket[1] += sample[1];
      bucket[2] += sample[2];
      bucket[3] += 1;
    }
    for (let c = 0; c < centers.length; c += 1) {
      const bucket = sums[c];
      if (!bucket) continue;
      if (bucket[3] > 0) {
        centers[c] = [bucket[0] / bucket[3], bucket[1] / bucket[3], bucket[2] / bucket[3]];
        continue;
      }
      // 빈 군집: 현재 배정에서 자기 중심과 가장 먼 표본으로 재배치(결정적: 첫 최대값)
      let farthest = -1;
      let farthestDistance = -1;
      for (let i = 0; i < samples.length; i += 1) {
        const sample = samples[i];
        const owner = centers[assignment[i] ?? 0];
        if (!sample || !owner) continue;
        const distance = distanceSq(sample, owner);
        if (distance > farthestDistance) {
          farthestDistance = distance;
          farthest = i;
        }
      }
      const replacement = farthest >= 0 ? samples[farthest] : undefined;
      if (replacement) {
        centers[c] = replacement;
        changed = true;
      }
    }
    if (!changed && iteration > 0) break;
  }

  const counts = new Array<number>(centers.length).fill(0);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (!sample) continue;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let c = 0; c < centers.length; c += 1) {
      const center = centers[c];
      if (!center) continue;
      const distance = distanceSq(sample, center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = c;
      }
    }
    counts[best] = (counts[best] ?? 0) + 1;
  }

  const entries: PaletteEntry[] = [];
  for (let c = 0; c < centers.length; c += 1) {
    const center = centers[c];
    const count = counts[c] ?? 0;
    if (!center || count === 0) continue;
    const { hex, oklab } = fromSpace(center, resolved.space);
    entries.push({ hex, weight: count / samples.length, oklab, count });
  }
  entries.sort((a, b) => (b.weight === a.weight ? (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0) : b.weight - a.weight));
  return entries;
}

/** OKLab 채도(크로마) */
export function oklabChroma(lab: Oklab): number {
  return Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
}

/** OKLab 색상각(도, 0..360) */
export function oklabHueDeg(lab: Oklab): number {
  const hue = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  return hue < 0 ? hue + 360 : hue;
}
