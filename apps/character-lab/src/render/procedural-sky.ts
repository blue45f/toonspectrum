/**
 * 절차적 스카이 환경맵(순수). 외부 HDR 없이 하늘 그라디언트 + 태양 디스크 + 지면 반사를
 * 6면 큐브(선형 RGBA float)로 만든다. Babylon에서는 RawCubeTexture → HDRFiltering.prefilter → environmentTexture.
 * 큐브 면 순서는 +X, -X, +Y, -Y, +Z, -Z(Babylon/WebGL 규약).
 */
import { clamp, smoothstep, v3Dot, v3Normalize } from "../shared/math";

import type { Vec3 } from "../contracts";

export interface SkyParams {
  readonly zenith: Vec3;
  readonly horizon: Vec3;
  readonly ground: Vec3;
  /** 태양을 향하는 단위 벡터 */
  readonly sunDirection: Vec3;
  readonly sunColor: Vec3;
  /** 태양 디스크 반각(cos) */
  readonly sunCos: number;
  readonly sunIntensity: number;
}

export const DEFAULT_SKY: SkyParams = Object.freeze<SkyParams>({
  zenith: [0.22, 0.38, 0.72],
  horizon: [0.78, 0.84, 0.92],
  ground: [0.26, 0.22, 0.18],
  sunDirection: v3Normalize([0.4, 0.8, 0.45]),
  sunColor: [1, 0.96, 0.9],
  sunCos: 0.998,
  sunIntensity: 18,
});

export const CUBE_FACE_COUNT = 6;

/** 면 인덱스와 텍셀 좌표(0..1)에서 월드 방향(단위) */
export function cubeDirection(face: number, u: number, v: number): Vec3 {
  const a = u * 2 - 1;
  const b = 1 - v * 2; // 위쪽 행이 +방향
  switch (face) {
    case 0:
      return v3Normalize([1, b, -a]);
    case 1:
      return v3Normalize([-1, b, a]);
    case 2:
      return v3Normalize([a, 1, -b]);
    case 3:
      return v3Normalize([a, -1, b]);
    case 4:
      return v3Normalize([a, b, 1]);
    case 5:
      return v3Normalize([-a, b, -1]);
    default:
      throw new Error(`cubeDirection: face(${face})는 0..5여야 합니다.`);
  }
}

/** 방향에 대한 선형 복사(radiance) */
export function skyRadiance(direction: Vec3, params: SkyParams = DEFAULT_SKY): Vec3 {
  const d = v3Normalize(direction);
  const up = clamp(d[1], -1, 1);
  const out: [number, number, number] = [0, 0, 0];
  if (up >= 0) {
    const t = Math.pow(up, 0.6);
    for (let i = 0; i < 3; i += 1) out[i] = params.horizon[i] * (1 - t) + params.zenith[i] * t;
  } else {
    const t = Math.pow(-up, 0.5);
    for (let i = 0; i < 3; i += 1) out[i] = params.horizon[i] * (1 - t) * 0.6 + params.ground[i] * t;
  }
  const cosSun = v3Dot(d, params.sunDirection);
  const disk = smoothstep(params.sunCos - 0.0015, params.sunCos + 0.0005, cosSun);
  const halo = Math.pow(clamp(cosSun, 0, 1), 64) * 0.25;
  for (let i = 0; i < 3; i += 1) out[i] += params.sunColor[i] * (disk * params.sunIntensity + halo);
  return out;
}

/** size×size RGBA float 6면 */
export function generateSkyFaces(size: number, params: SkyParams = DEFAULT_SKY): Float32Array[] {
  if (!Number.isInteger(size) || size < 2 || size > 1024) throw new Error(`generateSkyFaces: size(${size})는 2..1024 정수여야 합니다.`);
  const faces: Float32Array[] = [];
  for (let face = 0; face < CUBE_FACE_COUNT; face += 1) {
    const data = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const radiance = skyRadiance(cubeDirection(face, (x + 0.5) / size, (y + 0.5) / size), params);
        const i = (y * size + x) * 4;
        data[i] = radiance[0];
        data[i + 1] = radiance[1];
        data[i + 2] = radiance[2];
        data[i + 3] = 1;
      }
    }
    faces.push(data);
  }
  return faces;
}

/** 태양 디스크를 제외한 평균 복사(툰 모드 ambient용) */
export function skyAverageColor(params: SkyParams = DEFAULT_SKY, samples = 64): Vec3 {
  const sum: [number, number, number] = [0, 0, 0];
  let count = 0;
  const noSun: SkyParams = { ...params, sunIntensity: 0 };
  for (let i = 0; i < samples; i += 1) {
    // 피보나치 구면 샘플(결정적)
    const y = 1 - (2 * (i + 0.5)) / samples;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * 2.399963229728653;
    const radiance = skyRadiance([r * Math.cos(phi), y, r * Math.sin(phi)], noSun);
    sum[0] += radiance[0];
    sum[1] += radiance[1];
    sum[2] += radiance[2];
    count += 1;
  }
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}
