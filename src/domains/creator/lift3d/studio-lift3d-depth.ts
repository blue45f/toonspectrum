/**
 * Studio Lift 3D — 실루엣과 명암에서 깊이장을 세우는 단계.
 *
 * 두 가지 단서를 쓴다.
 * 1) 실루엣 거리장: 윤곽에서 멀수록 두껍다. 팔·머리카락처럼 가는 부위는 얇게, 몸통은 두껍게
 *    부풀어 캐릭터 리프트의 기본 볼륨이 된다(Teddy 계열 inflation).
 * 2) 명암(relief): 밝은 면이 앞으로 나온다는 표준 shape-from-shading 가정. 배경 원화의
 *    창틀·벽돌·계단 같은 요철을 부조로 살릴 때 쓴다.
 *
 * 순수 함수만 두고, 결과는 항상 0..1 로 정규화된 높이장이다. 실제 두께(scene unit)는
 * 메시 빌더가 곱한다.
 */

import type { StudioLift3dDepthProfile } from "./studio-lift3d-contract";
import type { StudioLift3dMask, StudioLift3dSampleGrid } from "./studio-lift3d-mask";

/** 오르토고날 3 / 대각 4 가중치의 정수 chamfer. 두 번의 스캔으로 끝난다. */
const CHAMFER_ORTHOGONAL = 3;
const CHAMFER_DIAGONAL = 4;
const SLAB_BEVEL = 0.18;

export interface StudioLift3dDepthField {
  readonly width: number;
  readonly height: number;
  /** 0..1. 실루엣 경계에서 0(=inflate 봉합선), 가장 두꺼운 곳에서 1. */
  readonly heights: Float64Array;
  /** 픽셀 단위 최대 실루엣 내접 거리. 얇은 피사체 판정에 쓴다. */
  readonly maxDistance: number;
}

export interface StudioLift3dDepthOptions {
  readonly profile?: StudioLift3dDepthProfile;
  /** relief 프로파일의 명암 대비(감마). 1 = 선형. */
  readonly reliefGamma?: number;
  /** true 면 어두운 면이 앞으로 나온다(역광/실루엣 배경). */
  readonly invertRelief?: boolean;
  /** relief 높이를 실루엣 거리로 얼마나 깎을지(0..1). 잘라낸 배경 조각을 봉합할 때 쓴다. */
  readonly edgeTaper?: number;
  /** 라플라시안 평활 반복 횟수. chamfer 특유의 능선을 지운다. */
  readonly smoothing?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 마스크 내부 각 셀의 윤곽까지 거리(픽셀 근사)를 구한다.
 * 격자 밖은 배경으로 본다 — 화면에 잘린 피사체도 그 변에서 닫히게 하려는 것이다.
 */
export function studioLift3dDistanceField(
  cells: Uint8Array,
  width: number,
  height: number,
): Float64Array {
  const size = width * height;
  const far = (width + height) * CHAMFER_DIAGONAL;
  const distance = new Int32Array(size);
  for (let index = 0; index < size; index += 1) {
    distance[index] = cells[index] === 1 ? far : 0;
  }
  const at = (x: number, y: number): number => (
    x < 0 || y < 0 || x >= width || y >= height ? 0 : distance[y * width + x]!
  );

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let best = distance[index]!;
      best = Math.min(best, at(x - 1, y - 1) + CHAMFER_DIAGONAL);
      best = Math.min(best, at(x, y - 1) + CHAMFER_ORTHOGONAL);
      best = Math.min(best, at(x + 1, y - 1) + CHAMFER_DIAGONAL);
      best = Math.min(best, at(x - 1, y) + CHAMFER_ORTHOGONAL);
      distance[index] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let best = distance[index]!;
      best = Math.min(best, at(x + 1, y + 1) + CHAMFER_DIAGONAL);
      best = Math.min(best, at(x, y + 1) + CHAMFER_ORTHOGONAL);
      best = Math.min(best, at(x - 1, y + 1) + CHAMFER_DIAGONAL);
      best = Math.min(best, at(x + 1, y) + CHAMFER_ORTHOGONAL);
      distance[index] = best;
    }
  }

  const pixels = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    pixels[index] = distance[index]! / CHAMFER_ORTHOGONAL;
  }
  return pixels;
}

/**
 * 마스크 내부의 휘도를 0..1 로 정규화한다. 정규화 범위를 피사체 안쪽으로 제한해야
 * 배경의 흰 여백이 대비를 다 잡아먹지 않는다.
 */
export function studioLift3dShadingField(
  grid: StudioLift3dSampleGrid,
  cells: Uint8Array,
): Float64Array {
  const size = grid.width * grid.height;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < size; index += 1) {
    if (cells[index] === 0) continue;
    const value = grid.luminance[index]!;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const shading = new Float64Array(size);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-6) {
    for (let index = 0; index < size; index += 1) {
      shading[index] = cells[index] === 1 ? 0.5 : 0;
    }
    return shading;
  }
  const inverse = 1 / (max - min);
  for (let index = 0; index < size; index += 1) {
    shading[index] = cells[index] === 1 ? clamp01((grid.luminance[index]! - min) * inverse) : 0;
  }
  return shading;
}

/**
 * 마스크 내부만 4-이웃 평균으로 평활한다. 윤곽에 맞닿은 셀은 고정해 봉합선 높이 0 을 지킨다.
 */
export function smoothStudioLift3dHeights(
  heights: Float64Array,
  cells: Uint8Array,
  width: number,
  height: number,
  iterations: number,
  pinRim: boolean,
): Float64Array {
  if (iterations <= 0) return heights;
  let current = heights;
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = new Float64Array(current);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (cells[index] === 0) continue;
        let sum = 0;
        let count = 0;
        let rim = x === 0 || y === 0 || x + 1 === width || y + 1 === height;
        if (x > 0) {
          if (cells[index - 1] === 1) { sum += current[index - 1]!; count += 1; } else rim = true;
        }
        if (x + 1 < width) {
          if (cells[index + 1] === 1) { sum += current[index + 1]!; count += 1; } else rim = true;
        }
        if (y > 0) {
          if (cells[index - width] === 1) { sum += current[index - width]!; count += 1; } else rim = true;
        }
        if (y + 1 < height) {
          if (cells[index + width] === 1) { sum += current[index + width]!; count += 1; } else rim = true;
        }
        if (pinRim && rim) continue;
        if (count === 0) continue;
        next[index] = (current[index]! + sum / count) / 2;
      }
    }
    current = next;
  }
  return current;
}

function applyProfile(
  profile: StudioLift3dDepthProfile,
  normalizedDistance: number,
): number {
  const t = clamp01(normalizedDistance);
  switch (profile) {
    case "round":
      // 원형 단면. 윤곽에서 접선이 수직이라 옆에서 봐도 납작해 보이지 않는다.
      return Math.sqrt(Math.max(0, 2 * t - t * t));
    case "soft":
      return t * t * (3 - 2 * t);
    case "slab":
      return Math.min(1, t / SLAB_BEVEL);
    case "relief":
      return t;
    default:
      return t;
  }
}

/**
 * 실루엣(과 선택적으로 명암)에서 0..1 높이장을 만든다.
 *
 * `relief` 프로파일은 거리장을 두께가 아니라 테두리 테이퍼로만 쓰고, 높이는 명암이 정한다.
 * 나머지 프로파일은 명암을 무시하고 거리장만 쓴다 — 캐릭터 원화의 밝기는 조명이지 두께가 아니다.
 */
export function buildStudioLift3dDepthField(
  mask: StudioLift3dMask,
  grid: StudioLift3dSampleGrid,
  options: StudioLift3dDepthOptions = {},
): StudioLift3dDepthField {
  const { cells, width, height } = mask;
  const size = width * height;
  const profile = options.profile ?? "round";
  const distance = studioLift3dDistanceField(cells, width, height);
  let maxDistance = 0;
  for (let index = 0; index < size; index += 1) {
    if (distance[index]! > maxDistance) maxDistance = distance[index]!;
  }
  // 윤곽에 맞닿은 셀의 거리는 1 이다. 그 1 을 0 으로 옮겨야 앞뒤 껍질이 정확히 만난다.
  const span = Math.max(maxDistance - 1, 1e-6);
  const heights = new Float64Array(size);

  if (profile === "relief") {
    const shading = studioLift3dShadingField(grid, cells);
    const gamma = Math.max(0.2, Math.min(4, options.reliefGamma ?? 1));
    const taper = clamp01(options.edgeTaper ?? 0);
    for (let index = 0; index < size; index += 1) {
      if (cells[index] === 0) continue;
      const lit = options.invertRelief === true ? 1 - shading[index]! : shading[index]!;
      const base = Math.pow(clamp01(lit), gamma);
      const edge = clamp01((distance[index]! - 1) / span);
      heights[index] = base * (1 - taper) + base * taper * edge;
    }
  } else {
    for (let index = 0; index < size; index += 1) {
      if (cells[index] === 0) continue;
      heights[index] = applyProfile(profile, (distance[index]! - 1) / span);
    }
  }

  const smoothed = smoothStudioLift3dHeights(
    heights,
    cells,
    width,
    height,
    Math.max(0, Math.min(24, Math.round(options.smoothing ?? 0))),
    profile !== "relief",
  );

  return { width, height, heights: smoothed, maxDistance };
}
