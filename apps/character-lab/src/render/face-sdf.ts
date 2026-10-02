/**
 * 얼굴 SDF 그림자 임계 맵(순수 생성)과 런타임 비교식.
 *
 * 베이크 파이프라인(각도별 마스크 → JFA 거리 변환 → 쌍별 보간, akasaki1211 MIT 알고리즘 개념)을
 * 브라우저 GPU 없이 재현하기 위해 정면 대칭 얼굴에 대한 해석적 임계 맵을 만든다.
 * 규약: 텍스처 u축은 "광원에서 먼 쪽"이 0, 가까운 쪽이 1이 되도록 런타임이 `flipU`로 뒤집는다.
 * 런타임: shadow = step(map(u, v) + offset, 0.5 · (1 − fdotl)), fdotl = dot(머리 forward(xz), 광원(xz)).
 * (URPSimpleGenshinShaders MIT의 비교식 개념을 재구현, 코드 복제 아님)
 */
import { clamp, smoothstep, v3Dot, v3Normalize } from "../shared/math";

import type { Vec3 } from "../contracts";

export interface FaceSdfMap {
  readonly size: number;
  /** size*size, R8(0..255) = 임계값 × 255 */
  readonly data: Uint8Array;
}

export interface FaceSdfOptions {
  /** 상하 방향(코·광대) 변조 강도 0..0.3 */
  readonly verticalModulation?: number;
  /** 최소 임계값(정면광에서 그림자 0 보장용, > 0) */
  readonly floor?: number;
}

/** 임계값 함수(연속). u: 0=광원 반대편 가장자리, 1=광원 쪽 가장자리. v: 0=턱, 1=이마 */
export function faceSdfThreshold(u: number, v: number, options: FaceSdfOptions = {}): number {
  const vertical = clamp(options.verticalModulation ?? 0.12, 0, 0.3);
  const floor = clamp(options.floor ?? 0.02, 0.001, 0.2);
  const lateral = smoothstep(0, 1, clamp(u, 0, 1));
  // 코·광대 부근(v≈0.45)은 그늘이 늦게 들어오고 턱·이마는 빨리 들어온다.
  const bulge = 1 - Math.abs(clamp(v, 0, 1) - 0.45) * 2;
  const modulated = lateral * (1 - vertical) + lateral * vertical * clamp(bulge, 0, 1);
  return clamp(floor + (1 - floor) * modulated, 0, 1);
}

/** size×size R8 임계 맵 생성(결정적) */
export function generateFaceSdf(size: number, options: FaceSdfOptions = {}): FaceSdfMap {
  if (!Number.isInteger(size) || size < 2 || size > 4096) throw new Error(`generateFaceSdf: size(${size})는 2..4096 정수여야 합니다.`);
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      data[y * size + x] = Math.round(faceSdfThreshold(u, v, options) * 255);
    }
  }
  return { size, data };
}

/** 최근접 샘플(0..1) */
export function sampleFaceSdf(map: FaceSdfMap, u: number, v: number): number {
  const x = Math.min(map.size - 1, Math.max(0, Math.floor(clamp(u, 0, 1) * map.size)));
  const y = Math.min(map.size - 1, Math.max(0, Math.floor(clamp(v, 0, 1) * map.size)));
  return (map.data[y * map.size + x] ?? 0) / 255;
}

export interface FaceSdfUniforms {
  /** dot(forward_xz, light_xz) ∈ [-1, 1] */
  readonly fdotl: number;
  /** 광원이 머리 right 쪽이면 1(u 뒤집기), 아니면 0 */
  readonly flipU: 0 | 1;
  /** 비교 임계 = 0.5·(1 − fdotl) */
  readonly threshold: number;
}

/**
 * 머리 forward/right(월드)와 "광원을 향하는" 방향 벡터로 셰이더 유니폼을 만든다.
 * y 성분은 버리고 xz 평면에서 비교한다(SDF 베이크 규약).
 */
export function faceSdfUniforms(headForward: Vec3, headRight: Vec3, toLight: Vec3): FaceSdfUniforms {
  const f = v3Normalize([headForward[0], 0, headForward[2]]);
  const r = v3Normalize([headRight[0], 0, headRight[2]]);
  const l = v3Normalize([toLight[0], 0, toLight[2]]);
  const fdotl = clamp(v3Dot(f, l), -1, 1);
  const lr = v3Dot(r, l);
  return { fdotl, flipU: lr > 0 ? 1 : 0, threshold: 0.5 * (1 - fdotl) };
}

/** CPU 참조: 해당 텍셀이 그늘이면 1 */
export function faceShadowAt(map: FaceSdfMap, u: number, v: number, uniforms: FaceSdfUniforms, offset = 0): number {
  const uu = uniforms.flipU === 1 ? 1 - u : u;
  return sampleFaceSdf(map, uu, v) + offset <= uniforms.threshold ? 1 : 0;
}
