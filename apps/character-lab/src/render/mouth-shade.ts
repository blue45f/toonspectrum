/**
 * 입 안 어둡게(순수). 절차 휴머노이드의 입 안(관 + 안쪽 캡)은 역할 `head` 파츠(스킨 재질)의 UV 섬이라 그대로 두면 입 안이 피부색으로 보인다
 * (humanoid 요청 §4.3). 그 섬에서만 어두운 붉은색이 되도록 곱하는 **알베도 마스크 텍스처**를 만든다 — PBR(albedoTexture × albedoColor)과
 * 툰(albedoSampler × baseColor)이 모두 이미 알베도 텍스처를 곱하므로 셰이더를 바꾸지 않고 두 모드가 같은 결과를 낸다.
 *
 * UV 사각형은 humanoid `geometry/uv-layout.ts`의 `MOUTH_TUBE_RECT`·`MOUTH_CAP_RECT`와 같은 값이다(영역 간 import 금지라 값을 복제;
 * `app/render-humanoid-link.integration.test.ts`가 두 상수의 일치를 확인한다).
 * 관 부분은 입술(v 작음) → 안쪽 벽(v 큼) 순서라 안쪽으로 갈수록 어둡게, 캡은 가장 어둡게 칠한다.
 */

export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** humanoid `MOUTH_TUBE_RECT`(관: 입술 → 안쪽 벽, v 0.225~0.285) */
export const MOUTH_TUBE_UV: UvRect = { u0: 0.35, v0: 0.225, u1: 0.5, v1: 0.285 };
/** humanoid `MOUTH_CAP_RECT`(안쪽 끝 캡, v 0.285~0.3) */
export const MOUTH_CAP_UV: UvRect = { u0: 0.405, v0: 0.285, u1: 0.445, v1: 0.3 };

/** 마스크가 곱하는 색(sRGB 0..1). 입술 쪽은 붉은 기가 남고 안쪽으로 갈수록 거의 검붉다. */
export const MOUTH_RIM_TINT: readonly [number, number, number] = [0.55, 0.26, 0.28];
export const MOUTH_DEEP_TINT: readonly [number, number, number] = [0.14, 0.05, 0.07];
export const MOUTH_CAP_TINT: readonly [number, number, number] = [0.08, 0.03, 0.05];

/** 기본 마스크 해상도(정사각). 관 섬 높이가 0.06 UV라 512에서 약 30행이다. */
export const MOUTH_MASK_SIZE = 512;

/** 사각형을 `texels` 텍셀만큼 넓힌다(이중선형 보간이 섬 가장자리에서 흰색과 섞이지 않게 번짐 영역을 둔다). */
function inflate(rect: UvRect, texels: number, size: number): UvRect {
  const pad = texels / size;
  return { u0: rect.u0 - pad, v0: rect.v0 - pad, u1: rect.u1 + pad, v1: rect.v1 + pad };
}

function contains(rect: UvRect, u: number, v: number): boolean {
  return u >= rect.u0 && u <= rect.u1 && v >= rect.v0 && v <= rect.v1;
}

/** (u, v)가 입 안 섬(관 또는 캡)에 속하는지 */
export function isMouthInteriorUv(u: number, v: number): boolean {
  return contains(MOUTH_TUBE_UV, u, v) || contains(MOUTH_CAP_UV, u, v);
}

function mixTint(a: readonly [number, number, number], b: readonly [number, number, number], t: number): readonly [number, number, number] {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** UV 한 점의 마스크 색(sRGB 0..1). 입 안 밖은 흰색(곱해도 변하지 않음). */
export function mouthMaskColor(u: number, v: number): readonly [number, number, number] {
  if (contains(MOUTH_CAP_UV, u, v)) return MOUTH_CAP_TINT;
  if (contains(MOUTH_TUBE_UV, u, v)) {
    const depth = (v - MOUTH_TUBE_UV.v0) / (MOUTH_TUBE_UV.v1 - MOUTH_TUBE_UV.v0);
    return mixTint(MOUTH_RIM_TINT, MOUTH_DEEP_TINT, depth);
  }
  return [1, 1, 1];
}

/**
 * 입 안 마스크 RGBA8(행 0 = UV v 0, `invertY=false` 텍스처용). 섬 가장자리는 1.5텍셀 번지게 칠한다.
 * 결정적이며 난수를 쓰지 않는다.
 */
export function generateMouthMask(size = MOUTH_MASK_SIZE): Uint8Array {
  if (!Number.isInteger(size) || size < 8) throw new Error(`입 마스크 크기 ${size}는 8 이상의 정수여야 합니다.`);
  const data = new Uint8Array(size * size * 4);
  const tube = inflate(MOUTH_TUBE_UV, 1.5, size);
  const cap = inflate(MOUTH_CAP_UV, 1.5, size);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      let color: readonly [number, number, number] = [1, 1, 1];
      if (contains(cap, u, v)) {
        color = MOUTH_CAP_TINT;
      } else if (contains(tube, u, v)) {
        // 번짐 영역은 섬 안쪽으로 클램프한 좌표의 색을 쓴다.
        const cu = Math.min(MOUTH_TUBE_UV.u1, Math.max(MOUTH_TUBE_UV.u0, u));
        const cv = Math.min(MOUTH_TUBE_UV.v1, Math.max(MOUTH_TUBE_UV.v0, v));
        color = mouthMaskColor(cu, cv);
      }
      const index = (y * size + x) * 4;
      data[index] = Math.round(color[0] * 255);
      data[index + 1] = Math.round(color[1] * 255);
      data[index + 2] = Math.round(color[2] * 255);
      data[index + 3] = 255;
    }
  }
  return data;
}
