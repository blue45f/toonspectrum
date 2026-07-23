/**
 * Studio Wet Mix — "혼색 브러시" 순수 코어(CSP 색혼합 브러시 재현).
 * 기존 스머지는 바닥 픽셀을 밀기만 하고 새 안료를 얹지 못한다 — 혼색 브러시는 현재 그리기 색을
 * 칠하면서 지나가는 자리의 바닥색을 계속 샘플링해 붓에 머금고(묻힘), 머금은 색과 현재 색을
 * 섞어(혼색) 얹는다. 드래그가 길어질수록 앞서 지나온 색이 꼬리처럼 묻어나는 CSP 물감 감각.
 *
 * studio-smudge.ts / studio-dodge-burn.ts 의 관례를 그대로 따른다:
 *   - 픽셀 공간(원본 자연 해상도) 좌표·in-place 변형·같은 참조 반환(smudgeStroke 계약).
 *   - 경로 리샘플은 resampleSmudgePath 재사용, 하드니스 감쇠는 dodgeBurnBrushFalloff 재사용
 *     (중복 금지 — dodge-burn 이 smudge 헬퍼를 재사용하는 것과 동일 정신).
 *
 * 도장(dab) 1개당 모델:
 *   1) 도장 발자국 아래 바닥색 평균을 샘플(감쇠×알파 가중 — 투명 픽셀은 색에 기여하지 않는다).
 *   2) well = lerp(well, sampled, pickup) — 붓이 바닥색을 머금는다(묻힘율). 첫 도장은 샘플로
 *      초기화하고, 발자국 전체가 투명이면 well 을 유지한다(머금을 것이 없다).
 *   3) deposit = lerp(paintColor, well, wetness) — 혼색율. 0=순수 현재 색, 1=머금은 색 그대로.
 *   4) deposit 을 소스-오버로 얹는다: 픽셀별 소스 알파 = strength × 감쇠(하드니스 페더).
 *
 * 알파 규칙(소스-오버 합성에서 자동으로 따라온다):
 *   - 완전 투명(a=0) 픽셀엔 deposit 색이 감쇠 알파(strength×falloff)로 새로 얹힌다 — 빈 곳에도
 *     안료를 깔 수 있다(스머지가 못 하는 것).
 *   - 반투명 픽셀은 얹힌 만큼 불투명해진다(outA = srcA + destA(1-srcA) — 알파는 절대 줄지 않는다).
 *   - 완전 불투명(a=255) 픽셀은 불투명을 유지하고 색만 섞인다.
 *
 * DOM 의존성 없음 — 이 파일 전체가 순수·결정적이다(Math.random/Date.now 금지). 캔버스/Image
 * 오케스트레이션(이미지 로드 → getImageData → wetMixStroke → PNG 재인코딩)은 호출부(StudioPage 의
 * applyWetMixStroke)가 담당한다 — applyDodgeBurnStroke 와 동일 분리.
 */
import { dodgeBurnBrushFalloff } from "./studio-dodge-burn";
import { resampleSmudgePath, type SmudgePixelPoint } from "./studio-smudge";

// 픽셀 공간(원본 자연 해상도) 좌표 — smudge/dodge-burn 과 같은 개념이라 타입을 공유한다.
export type WetMixPixelPoint = SmudgePixelPoint;

/** 0..255 정수 채널 RGB — StudioPage 가 hexToRgb(studio-filters)로 만들어 넘긴다. */
export type WetMixColor = { r: number; g: number; b: number };

export type WetMixSettings = {
  /** 브러시 반경(px, 자연 해상도). */
  radiusPx: number;
  /** 0..1 — 1=하드 엣지, 0=최대 페더(DODGE_BURN_HARDNESS_RANGE 와 동일 규약). */
  hardness: number;
  /** 도포량 0..1 — 도장 중심에서 얹히는 소스 알파(1=완전 덮음). */
  strength: number;
  /** 혼색율 0..1 — 0=현재 색만, 1=붓이 머금은 바닥색만 얹는다. */
  wetness: number;
  /** 묻힘율 0..1 — 도장마다 붓이 바닥색을 새로 머금는 비율(0=첫 샘플 고정, 1=즉시 교체). */
  pickup: number;
  /** 현재 그리기 색(안료). */
  paintColor: WetMixColor;
};

// 표시 px 기준 범위 — DODGE_BURN_RADIUS_RANGE 와 동일 관례(자연 해상도 환산은 호출자 몫).
export const WET_MIX_RADIUS_RANGE = { min: 6, max: 160, step: 1 } as const;
export const WET_MIX_RADIUS_DEFAULT = 32;
export const WET_MIX_HARDNESS_RANGE = { min: 0, max: 1, step: 0.05 } as const;
export const WET_MIX_HARDNESS_DEFAULT = 0.5;
// %(UI) — 코어엔 /100 한 0..1 로 넘긴다(SMUDGE_STRENGTH_RANGE 와 동일 관례).
export const WET_MIX_STRENGTH_RANGE = { min: 1, max: 100, step: 1 } as const;
export const WET_MIX_STRENGTH_DEFAULT = 60;
export const WET_MIX_WETNESS_RANGE = { min: 0, max: 100, step: 1 } as const;
export const WET_MIX_WETNESS_DEFAULT = 55;
export const WET_MIX_PICKUP_RANGE = { min: 0, max: 100, step: 1 } as const;
export const WET_MIX_PICKUP_DEFAULT = 45;

// 리샘플 간격 = radiusPx * 이 비율(SMUDGE_STEP_RATIO/DODGE_BURN_STEP_RATIO 와 동일값 — 도장
// 겹침 밀도 통일).
const WET_MIX_STEP_RATIO = 0.35;
// 병적으로 긴 스트로크 방어 상한 — SMUDGE_MAX_RESAMPLED_POINTS 와 같은 정신.
const WET_MIX_MAX_DABS = 2000;
// 샘플 가중 합이 이보다 작으면 "발자국 전체가 투명" 으로 본다(0 나눗셈 방어).
const WET_MIX_SAMPLE_EPSILON = 1e-6;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clampChannel(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * 도장 발자국 아래 바닥색의 가중 평균(0..255 float 채널) — 가중치는 브러시 감쇠 × 알파.
 * 알파 가중이라 투명 픽셀은 평균을 끌어내리지 않는다(투명 배경 위 선 옆을 지나도 검정이 섞여
 * 들지 않는다). 발자국 전체가 (사실상) 투명이면 null — 머금을 색이 없다. 순수, 결정적.
 */
export function sampleWetMixDabAverage(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  center: WetMixPixelPoint,
  radiusPx: number,
  hardness: number,
): WetMixColor | null {
  const R = Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : 0;
  if (R <= 0 || w <= 0 || h <= 0) return null;
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;

  const minX = clampInt(Math.floor(center.x - R), 0, w - 1);
  const maxX = clampInt(Math.ceil(center.x + R), 0, w - 1);
  const minY = clampInt(Math.floor(center.y - R), 0, h - 1);
  const maxY = clampInt(Math.ceil(center.y + R), 0, h - 1);
  if (minX > maxX || minY > maxY) return null;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumW = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const falloff = dodgeBurnBrushFalloff(Math.hypot(x - center.x, y - center.y), R, hardness);
      if (falloff <= 0) continue;
      const idx = (y * w + x) * 4;
      const a = data[idx + 3]!;
      if (a === 0) continue; // 투명 — 보이지 않는 저장색(대개 검정)을 섞지 않는다.
      const weight = falloff * (a / 255);
      sumR += data[idx]! * weight;
      sumG += data[idx + 1]! * weight;
      sumB += data[idx + 2]! * weight;
      sumW += weight;
    }
  }
  if (sumW <= WET_MIX_SAMPLE_EPSILON) return null;
  return { r: sumR / sumW, g: sumG / sumW, b: sumB / sumW };
}

/**
 * 도장(dab) 1개 적용 — deposit 색을 소스-오버로 얹는다. 각 픽셀:
 *   srcA = strength × dodgeBurnBrushFalloff(dist, radiusPx, hardness)
 *   outA = srcA + destA(1-srcA),  outC = (deposit×srcA + dest×destA(1-srcA)) / outA
 * destA=0(완전 투명)이면 out = deposit 그대로(감쇠 알파로 새 안료) — 파일 헤더의 알파 규칙 참조.
 * 이미지 경계 밖은 클램프된 박스로 안전하게 무시된다(크래시 없음). 순수, 결정적, 픽셀 루프는
 * 지역 변수만 사용(추가 할당 없음).
 */
export function applyWetMixDab(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  center: WetMixPixelPoint,
  deposit: WetMixColor,
  radiusPx: number,
  hardness: number,
  strength: number,
): void {
  const R = Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : 0;
  const S = clamp01(strength);
  if (R <= 0 || S <= 0 || w <= 0 || h <= 0) return;
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return;

  const depR = clampChannel(deposit.r);
  const depG = clampChannel(deposit.g);
  const depB = clampChannel(deposit.b);

  const minX = clampInt(Math.floor(center.x - R), 0, w - 1);
  const maxX = clampInt(Math.ceil(center.x + R), 0, w - 1);
  const minY = clampInt(Math.floor(center.y - R), 0, h - 1);
  const maxY = clampInt(Math.ceil(center.y + R), 0, h - 1);
  if (minX > maxX || minY > maxY) return;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const falloff = dodgeBurnBrushFalloff(Math.hypot(x - center.x, y - center.y), R, hardness);
      if (falloff <= 0) continue;
      const srcA = S * falloff;
      if (srcA <= 0) continue;
      const idx = (y * w + x) * 4;
      const destA = data[idx + 3]! / 255;
      const outA = srcA + destA * (1 - srcA);
      if (outA <= 0) continue;
      const destW = (destA * (1 - srcA)) / outA;
      const srcW = srcA / outA;
      data[idx] = depR * srcW + data[idx]! * destW;
      data[idx + 1] = depG * srcW + data[idx + 1]! * destW;
      data[idx + 2] = depB * srcW + data[idx + 2]! * destW;
      data[idx + 3] = outA * 255; // Uint8ClampedArray 대입이 반올림+클램프한다.
    }
  }
}

/**
 * 혼색 스트로크 적용 — data(RGBA Uint8ClampedArray, w*h*4)를 제자리에서 변형하고 같은 참조를
 * 반환한다(smudgeStroke/dodgeBurnStroke 계약과 동일 — 호출부가 imageData.data 를 그대로 넘기고
 * 그대로 쓴다).
 *
 * points 는 리샘플 전 원시 스트로크(자연 픽셀 좌표, 화면 반전이 이미 걷힌 상태 — 반전 처리는
 * wrapper 책임, smudgeStroke 와 동일 규약). dodge/burn 과 동일하게 점 1개(탭)도 유효하다 —
 * 탭 한 번 = 도장 1개. points 가 비었거나 strength <= 0 이면 무변화로 data 를 그대로 반환한다.
 *
 * 알고리즘: resampleSmudgePath 로 radius*0.35 간격 도장 위치를 얻은 뒤(상한 WET_MIX_MAX_DABS)
 * 각 위치에 파일 헤더의 도장 모델(샘플 → 묻힘 → 혼색 → 소스-오버)을 적용한다. 뒤 도장은 앞
 * 도장이 얹어 놓은 색을 다시 샘플할 수 있다(제자리 누적) — 젖은 물감이 서로 섞이는 감각.
 */
export function wetMixStroke(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  points: readonly WetMixPixelPoint[],
  settings: WetMixSettings,
): Uint8ClampedArray {
  if (points.length < 1 || w <= 0 || h <= 0) return data;
  const strength = clamp01(settings.strength);
  if (strength <= 0) return data;
  // sanitizePositive(studio-node-edit.ts)와 동일한 정신 — 비양수/NaN 반경은 최소 1px 로.
  const safeRadius = Number.isFinite(settings.radiusPx) ? Math.max(1, settings.radiusPx) : 1;
  const hardness = clamp01(settings.hardness);
  const wetness = clamp01(settings.wetness);
  const pickup = clamp01(settings.pickup);
  const paintR = clampChannel(settings.paintColor.r);
  const paintG = clampChannel(settings.paintColor.g);
  const paintB = clampChannel(settings.paintColor.b);

  const step = safeRadius * WET_MIX_STEP_RATIO;
  const resampled = resampleSmudgePath(points, step).slice(0, WET_MIX_MAX_DABS);

  // 붓이 머금은 색(well) — 첫 유효 샘플로 초기화, 이후 도장마다 pickup 비율로 갱신.
  let wellR = 0;
  let wellG = 0;
  let wellB = 0;
  let hasWell = false;

  for (const p of resampled) {
    const sampled = sampleWetMixDabAverage(data, w, h, p, safeRadius, hardness);
    if (sampled !== null) {
      if (!hasWell) {
        wellR = sampled.r;
        wellG = sampled.g;
        wellB = sampled.b;
        hasWell = true;
      } else {
        wellR += (sampled.r - wellR) * pickup;
        wellG += (sampled.g - wellG) * pickup;
        wellB += (sampled.b - wellB) * pickup;
      }
    }
    // 머금은 색이 아직 없으면(투명 캔버스 시작) 현재 색만 얹는다 — deposit = paint.
    const depR = hasWell ? paintR + (wellR - paintR) * wetness : paintR;
    const depG = hasWell ? paintG + (wellG - paintG) * wetness : paintG;
    const depB = hasWell ? paintB + (wellB - paintB) * wetness : paintB;
    applyWetMixDab(
      data, w, h, p,
      { r: depR, g: depG, b: depB },
      safeRadius, hardness, strength,
    );
  }

  return data;
}
