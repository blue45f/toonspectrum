/**
 * 툰 셰이딩 CPU 기준 구현(순수). `shader-sources.ts`의 GLSL·WGSL 툰 프래그먼트와 NodeMaterial 툰 그래프(`babylon/materials/node-toon-material.ts`)가
 * 같은 `ToonParams` 의미를 갖는지 Node에서 수치로 비교하는 기준이다. 식 구조는 MToon 1.0(N·L 음영 → linearstep → mix(shade, base))과
 * lilToon의 fwidth 밴드 AA 개념을 따른다(코드 복제 아님).
 *
 *   albedo   = mix(base, paint, paint.a·[hasPaint]),  base = baseColor·(hasAlbedo ? albedoTex : 1)
 *   shading  = mix(N·L·½+½, faceShade(sdf ≥ threshold), [faceSdf])
 *   band     = Σ_{j=1..steps-1} smoothstep(j/steps − w, j/steps + w, shading) / (steps − 1),  w = fwidth(shading) + ε
 *   color    = mix(albedo·shadeTint, albedo, band)·lightColor + albedo·ambientColor + rimColor·rim
 *   rim      = smoothstep(0.55, 0.65, (1 − max(N·V, 0))³)·[rim]
 *
 * 화면 미분 `fwidth(shading)`은 CPU에서 구할 수 없으므로 호출자가 값을 넣는다(`derivativeWidth`).
 */
import { lerp, smoothstep, v3Dot, v3Normalize } from "../shared/math";

import type { Vec3 } from "../contracts";

/** 툰 파라미터(= 셰이딩 프로파일 `toon` + 장면에서 정해지는 색·광원 + 얼굴 SDF·페인트 상태). ShaderMaterial uniform과 NodeMaterial 입력이 같은 값을 쓴다. */
export interface ToonParams {
  readonly baseColor: readonly [number, number, number];
  readonly shadeTint: readonly [number, number, number];
  readonly lightColor: readonly [number, number, number];
  readonly ambientColor: readonly [number, number, number];
  readonly toLight: readonly [number, number, number];
  readonly rimColor: readonly [number, number, number];
  readonly rampSteps: 2 | 3 | 4;
  readonly rim: boolean;
  readonly faceSdf: boolean;
  readonly hasPaint: boolean;
  readonly faceThreshold: number;
  readonly flipU: 0 | 1;
  readonly sdfOffset: number;
  readonly hasAlbedo: boolean;
}

/** 셰이더 상수(소스 문자열과 같은 값 — `toon-reference.test.ts`가 소스에서 확인한다) */
export const TOON_FACE_DARK_SHADE = 0.25;
export const TOON_FACE_LIT_SHADE = 0.85;
export const TOON_RIM_EDGE0 = 0.55;
export const TOON_RIM_EDGE1 = 0.65;
export const TOON_FRESNEL_POWER = 3;
export const TOON_BAND_EPSILON = 0.002;
/** 램프 항 수(2~4단계 = 경계 1~3개) */
export const TOON_MAX_BOUNDARIES = 3;

/**
 * 광원색 + 환경색을 같은 비율로 줄여 채널 합이 1을 넘지 않게 한다. 툰 색은 톤맵 없이 `albedo × (광원 + 환경)`이라 합이 1을 넘으면
 * 밝은 알베도(피부·흰 상의)가 흰색으로 날아간다(실브라우저 실측: SwiftShader, 기본 장면에서 피부·상의 과노출). 합이 1 이하면 그대로 둔다.
 * 가장 밝은 밴드가 알베도 자체가 되도록(노출 1) 맞추는 정규화이며 광원 대 환경 비율은 보존한다.
 */
export function normalizeToonLighting(light: readonly [number, number, number], ambient: readonly [number, number, number]): { readonly light: readonly [number, number, number]; readonly ambient: readonly [number, number, number] } {
  const total = Math.max(light[0] + ambient[0], light[1] + ambient[1], light[2] + ambient[2]);
  if (!(total > 1)) return { light, ambient };
  return { light: [light[0] / total, light[1] / total, light[2] / total], ambient: [ambient[0] / total, ambient[1] / total, ambient[2] / total] };
}

/** 프래그먼트별 입력(보간된 값과 텍스처 샘플) */
export interface ToonFragmentInput {
  readonly normalW: readonly [number, number, number];
  readonly positionW: readonly [number, number, number];
  readonly cameraPosition: readonly [number, number, number];
  readonly uv: readonly [number, number];
  readonly albedoTex: readonly [number, number, number, number];
  readonly paint: readonly [number, number, number, number];
  /** 얼굴 SDF 임계 맵 샘플(R, 0..1). 인자는 flipU가 반영된 (u, v). */
  readonly sampleSdf: (u: number, v: number) => number;
  /** `fwidth(shading)` 대체값 */
  readonly derivativeWidth: number;
}

export { smoothstep };

/** GLSL step(edge, x) */
export function step(edge: number, x: number): number {
  return x < edge ? 0 : 1;
}

/** GLSL mix */
const mix = lerp;

/** 얼굴 SDF 샘플 좌표: flipU가 1이면 u를 뒤집는다 */
export function toonSdfCoordinate(params: Pick<ToonParams, "flipU">, uv: readonly [number, number]): readonly [number, number] {
  return [mix(uv[0], 1 - uv[0], step(0.5, params.flipU)), uv[1]];
}

/** 알베도(밑색 × 알베도 텍스처, 페인트 합성) */
export function toonAlbedo(params: ToonParams, fragment: Pick<ToonFragmentInput, "albedoTex" | "paint">): readonly [number, number, number] {
  const hasAlbedo = step(0.5, params.hasAlbedo ? 1 : 0);
  const hasPaint = step(0.5, params.hasPaint ? 1 : 0);
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const base = mix(params.baseColor[c] ?? 0, (params.baseColor[c] ?? 0) * (fragment.albedoTex[c] ?? 0), hasAlbedo);
    out[c] = mix(base, mix(base, fragment.paint[c] ?? 0, fragment.paint[3]), hasPaint);
  }
  return out;
}

/** 툰 음영값(0..1, 램프 입력) */
export function toonShading(params: ToonParams, fragment: ToonFragmentInput): number {
  const n = v3Normalize(fragment.normalW as Vec3);
  const lambert = v3Dot(n, v3Normalize(params.toLight as Vec3)) * 0.5 + 0.5;
  const [sdfU, sdfV] = toonSdfCoordinate(params, fragment.uv);
  const sdf = fragment.sampleSdf(sdfU, sdfV);
  const faceLit = step(params.faceThreshold, sdf + params.sdfOffset);
  const faceShading = mix(TOON_FACE_DARK_SHADE, TOON_FACE_LIT_SHADE, faceLit);
  return mix(lambert, faceShading, step(0.5, params.faceSdf ? 1 : 0));
}

/** 툰 프래그먼트 색(선형이 아니라 셰이더가 쓰는 값 그대로, 0..∞) */
export function evaluateToon(params: ToonParams, fragment: ToonFragmentInput): readonly [number, number, number] {
  const n = v3Normalize(fragment.normalW as Vec3);
  const albedo = toonAlbedo(params, fragment);
  const shading = toonShading(params, fragment);
  const steps = Math.max(2, params.rampSteps);
  const w = fragment.derivativeWidth + TOON_BAND_EPSILON;
  let acc = 0;
  for (let j = 1; j <= TOON_MAX_BOUNDARIES; j += 1) {
    if (j < steps) acc += smoothstep(j / steps - w, j / steps + w, shading);
  }
  const band = acc / (steps - 1);
  const view = v3Normalize([fragment.cameraPosition[0] - fragment.positionW[0], fragment.cameraPosition[1] - fragment.positionW[1], fragment.cameraPosition[2] - fragment.positionW[2]]);
  const fresnel = Math.pow(1 - Math.max(v3Dot(n, view), 0), TOON_FRESNEL_POWER);
  const rim = smoothstep(TOON_RIM_EDGE0, TOON_RIM_EDGE1, fresnel) * step(0.5, params.rim ? 1 : 0);
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const a = albedo[c] ?? 0;
    const shade = a * (params.shadeTint[c] ?? 0);
    out[c] = mix(shade, a, band) * (params.lightColor[c] ?? 0) + a * (params.ambientColor[c] ?? 0) + (params.rimColor[c] ?? 0) * rim;
  }
  return out;
}
