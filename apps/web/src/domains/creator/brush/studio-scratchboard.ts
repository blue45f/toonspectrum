/**
 * 스크래치보드 (scratchboard) 브러시 런타임 모델.
 *
 * 감산식 브러시: 어두운 잉크층을 긁어내 밑의 밝은 종이(또는 흰색)를 드러낸다.
 * 일반 지우개와 다른 점:
 * - 긁힌 자국은 종이결(grain)에 따라 끊어지며, 잉크 잔여물(halo)이 가장자리에 남는다
 * - 필압이 셀수록 깊게 긁혀 더 밝게 드러난다
 *
 * 순수 함수. 렌더러는 `scratchboardRevealAlpha`로 destination-out 알파를 구하고,
 * `scratchboardGrainBreakup`으로 종이결 변조를 적용한다.
 */

export interface StudioScratchboardOptions {
  /** 밑색 밝기 0..1 (1 = 흰 종이). */
  readonly underlayerBrightness: number;
  /** 종이결 강도 0..1 — 높을수록 자국이 끊어진다. */
  readonly grainStrength: number;
  /** 잉크층 두께 0..1 — 두꺼울수록 완전히 드러나려면 강한 필압 필요. */
  readonly inkThickness: number;
}

export const DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS: StudioScratchboardOptions = Object.freeze({
  underlayerBrightness: 1,
  grainStrength: 0.55,
  inkThickness: 0.6,
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** dab 인덱스 기반 결정적 해시 [0,1). */
export function studioScratchboardHash(index: number, salt: number): number {
  let hash = (Math.imul(index + 233, 0x9e3779b1) ^ Math.imul(salt + 17, 0x85ebca6b)) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c5d) >>> 0;
  hash ^= hash >>> 12;
  return (hash >>> 0) / 4294967296;
}

/**
 * 필압에서 긁기 너비를 구한다. 가벼운 터치는 표면만 스치고,
 * 강한 필압은 잉크층을 완전히 제거한다.
 */
export function studioScratchboardWidth(
  baseWidth: number,
  pressure: number,
  options: StudioScratchboardOptions = DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
): number {
  const safeBase = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 0;
  if (safeBase === 0) return 0;
  const safePressure = clamp01(pressure);
  const depth = safePressure / Math.max(0.2, options.inkThickness);
  const widthFactor = 0.35 + 0.65 * clamp01(depth);
  return safeBase * widthFactor;
}

/**
 * dab의 노출 알파 0..1. 중심은 완전히 드러나고 가장자리는 잉크 잔여물로 페이드한다.
 * grainPhase는 종이결 위상 (0..1) — 렌더러가 위치 기반으로 공급한다.
 */
export function studioScratchboardRevealAlpha(
  radial01: number,
  pressure: number,
  grainPhase: number,
  options: StudioScratchboardOptions = DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
): number {
  const radial = clamp01(radial01);
  const safePressure = clamp01(pressure);
  const grain = clamp01(grainPhase);
  const depth = safePressure / Math.max(0.2, options.inkThickness);
  // 종이결 변조: 결이 강하면 자국이 끊어진다
  const grainModulation = 1 - options.grainStrength * 0.6 * grain;
  // 가장자리 잉크 잔여물 halo: radial 0.7~1.0에서 급격히 감소
  const edge = radial <= 0.7 ? 1 : 1 - (radial - 0.7) / 0.3;
  const reveal = clamp01(depth) * grainModulation * clamp01(edge);
  return reveal * options.underlayerBrightness;
}

/**
 * 종이결 끊어짐 계수 0..1. dab 인덱스와 위치로 결정적 계산.
 * 1에 가까울수록 깨끗한 긁힘, 0에 가까울수록 결에 막혀 잉크가 남는다.
 */
export function studioScratchboardGrainBreakup(
  dabIndex: number,
  x: number,
  y: number,
  grainStrength: number,
): number {
  const safeGrain = clamp01(grainStrength);
  if (safeGrain === 0) return 1;
  // 위치 기반 결 + dab별 미세 지터
  const positionGrain = studioScratchboardHash(
    Math.floor(x * 0.35) * 73856093 ^ Math.floor(y * 0.35) * 19349663,
    5,
  );
  const dabJitter = studioScratchboardHash(dabIndex, 91);
  const combined = positionGrain * 0.7 + dabJitter * 0.3;
  // 결이 강한 곳(combined 높음)에서 끊어진다
  return clamp01(1 - safeGrain * combined);
}

/** 긁기 스트로크의 한 dab에 대한 최종 노출량을 계산한다. */
export function studioScratchboardDabReveal(
  dabIndex: number,
  x: number,
  y: number,
  radial01: number,
  pressure: number,
  options: StudioScratchboardOptions = DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
): number {
  const grainPhase = studioScratchboardHash(
    Math.floor(x * 0.5) * 83492791 ^ Math.floor(y * 0.5) * 2971215073 % 4294967296,
    13,
  );
  const breakup = studioScratchboardGrainBreakup(dabIndex, x, y, options.grainStrength);
  const alpha = studioScratchboardRevealAlpha(radial01, pressure, grainPhase, {
    ...options,
    grainStrength: options.grainStrength * breakup,
  });
  return alpha;
}

/** 옵션을 정규화한다. */
export function normalizeStudioScratchboardOptions(
  options: Partial<StudioScratchboardOptions>,
): StudioScratchboardOptions {
  return Object.freeze({
    underlayerBrightness: clamp01(options.underlayerBrightness ?? 1),
    grainStrength: clamp01(options.grainStrength ?? 0.55),
    inkThickness: clamp01(options.inkThickness ?? 0.6),
  });
}
