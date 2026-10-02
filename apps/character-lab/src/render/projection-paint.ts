/**
 * 투영 페인트(MeshUVSpaceRenderer 베타)의 순수 계약·수학. 엔진(`babylon/projection-paint.ts`)이 이 포트를 구현하고, 드로잉 드라이버
 * (`app/shell/panels/projection-paint-driver.ts`)가 paint 도메인과 이어 붙인다 — render는 paint 도메인을 import할 수 없어서 포트는 순수 타입으로만 만난다.
 *
 * 흐름: 포인터 → `stamp(ndc)`가 표면을 pick해 브러시를 그 위치·법선 방향으로 UV 공간 렌더 타깃(RTT)에 투영(GPU) → `flush()`가 RTT를 읽어
 * **overlay**(premultiplied sRGB RGBA, 행 0 = UV v 0 = `PaintLayer` 규약)를 돌려주고 RTT를 비운다 → 드라이버가 overlay를 `PaintLayer`에
 * 합성하고 타일 단위 undo 토큰을 만든다(스트로크당 `paint/stroke` 1개, CPU 스탬프 경로와 같은 계약). 최종 결과는 항상 같은 `PaintLayer` RGBA다.
 *
 * 규약·한계
 * - overlay는 GPU 블렌딩(premultiplied porter-duff, sRGB 바이트 공간) 결과다. CPU 경로는 선형 공간 합성이라 겹치는 곳에서 미세하게 다르다.
 * - MeshUVSpaceRenderer 셰이더는 스키닝·morph를 포함하므로 포즈를 바꾼 표면에도 투영된다(브라우저에서 확인 필요 — docs/parity/render.md).
 * - 투영 방향 기준 뒷면 삼각형은 셰이더가 잘라내므로(법선·투영 방향 내적) 얇은 부위의 반대편은 칠하지 않는다.
 */
import type { PartRole, Vec3 } from "../contracts";

/** 브러시 비트맵: premultiplied sRGB RGBA8, 정사각, 행 0 = 위 */
export interface ProjectionBrushBitmap {
  readonly size: number;
  readonly rgba: Uint8Array;
  /** 내용이 바뀔 때 같이 바뀌는 키(엔진이 텍스처 갱신 여부를 판단) */
  readonly key: string;
}

/** `flush()`가 돌려주는 누적 overlay */
export interface ProjectionOverlay {
  readonly part: PartRole;
  readonly width: number;
  readonly height: number;
  /** premultiplied sRGB RGBA8, 행 0 = UV v 0(= PaintLayer 첫 행) */
  readonly rgba: Uint8Array;
}

export interface ProjectionStampOutcome {
  readonly hit: boolean;
  /** 투영 크기(월드 m). hit가 아니면 0 */
  readonly worldSizeM: number;
  /**
   * 투영 한 변이 화면(NDC)에서 차지하는 가로·세로 크기(카메라 오른쪽·위 방향). 드라이버가 포인터 이동을 브러시 간격(`spacing`)으로 나눠
   * 스탬프를 보간하는 데 쓴다. hit가 아니면 [0, 0].
   */
  readonly screenSizeNdc: readonly [number, number];
}

/** 화면 크기를 알 수 없을 때(카메라 행렬 퇴화) 쓰는 NDC 대체 크기 */
export const PROJECTION_FALLBACK_SCREEN_NDC: readonly [number, number] = [0.05, 0.05];

/** 엔진이 구현하는 투영 페인트 포트(베타가 켜졌을 때만 `projectionPaint()`가 돌려준다) */
export interface ProjectionPaintPort {
  /** 스트로크 시작: 부위의 UV 공간 렌더 타깃을 레이어 크기로 준비한다. 부위에 메시가 없으면 false. */
  begin(part: PartRole, layerWidth: number, layerHeight: number): boolean;
  /** 브러시 비트맵과 반지름(레이어 px)을 정한다. */
  setBrush(bitmap: ProjectionBrushBitmap, radiusPx: number): void;
  /** NDC 위치의 표면에 브러시를 투영한다. 활성 부위 표면이 아니면 hit=false. */
  stamp(ndcX: number, ndcY: number): ProjectionStampOutcome;
  /** 지금까지 누적된 overlay를 읽고 RTT를 비운다(칠한 것이 없으면 null). 비동기(GPU readback). */
  flush(): Promise<ProjectionOverlay | null>;
  /** 스트로크 취소: RTT를 비우고 버린다. */
  cancel(): void;
}

/** 엔진이 투영 페인트 포트를 제공하는지(구조적 판별) */
export interface ProjectionPaintHost {
  /** 베타가 켜져 있고 능력이 되면 포트, 아니면 null */
  projectionPaint(): ProjectionPaintPort | null;
}

export function hasProjectionPaint(value: unknown): value is ProjectionPaintHost {
  return typeof value === "object" && value !== null && typeof (value as { projectionPaint?: unknown }).projectionPaint === "function";
}

/** 엔진에서 포트를 읽는다(없으면 null). */
export function readProjectionPaint(engine: unknown): ProjectionPaintPort | null {
  return hasProjectionPaint(engine) ? engine.projectionPaint() : null;
}

/** 투영 크기 하한·상한(월드 m): 너무 작으면 텍셀보다 작아지고 너무 크면 몸 전체에 번진다 */
export const PROJECTION_MIN_SIZE_M = 0.002;
export const PROJECTION_MAX_SIZE_M = 0.4;

function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * 삼각형의 텍셀 하나가 덮는 월드 길이(m/텍셀) = √(월드 넓이 / UV 넓이(텍셀²)). UV가 퇴화(넓이 0)면 null.
 * 브러시 반지름(레이어 px)을 월드 크기로 바꾸는 데 쓴다 — UV가 늘어난 곳에서도 표면 위 브러시 크기가 같게 보이도록.
 */
export function metersPerTexel(worldA: Vec3, worldB: Vec3, worldC: Vec3, uvA: readonly [number, number], uvB: readonly [number, number], uvC: readonly [number, number], layerWidth: number, layerHeight: number): number | null {
  const world = triangleArea(worldA, worldB, worldC);
  const du1 = (uvB[0] - uvA[0]) * layerWidth;
  const dv1 = (uvB[1] - uvA[1]) * layerHeight;
  const du2 = (uvC[0] - uvA[0]) * layerWidth;
  const dv2 = (uvC[1] - uvA[1]) * layerHeight;
  const texels = 0.5 * Math.abs(du1 * dv2 - du2 * dv1);
  if (!(texels > 1e-9) || !(world > 1e-12)) return null;
  return Math.sqrt(world / texels);
}

/** 브러시 지름(레이어 px)과 m/텍셀에서 투영 한 변의 월드 길이(m)를 구한다(상·하한 적용). */
export function projectionSizeM(radiusPx: number, texelM: number): number {
  const size = 2 * Math.max(0.5, radiusPx) * texelM;
  return Math.min(PROJECTION_MAX_SIZE_M, Math.max(PROJECTION_MIN_SIZE_M, size));
}

/** overlay에 칠해진 픽셀(알파 > 0)이 있는지 */
export function overlayHasPaint(overlay: Pick<ProjectionOverlay, "rgba">): boolean {
  for (let i = 3; i < overlay.rgba.length; i += 4) if ((overlay.rgba[i] ?? 0) > 0) return true;
  return false;
}

/** premultiplied sRGB 픽셀 → straight sRGB(0..255)·알파(0..1). 알파 0이면 null. */
export function unpremultiplyPixel(r: number, g: number, b: number, a: number): { readonly rgb: readonly [number, number, number]; readonly alpha: number } | null {
  if (!(a > 0)) return null;
  const scale = 255 / a;
  return { rgb: [Math.min(255, r * scale), Math.min(255, g * scale), Math.min(255, b * scale)], alpha: a / 255 };
}

/**
 * 브러시 비트맵의 한 픽셀(premultiplied sRGB RGBA8 값)을 만든다. `mask`는 0..1 커버리지, `color`는 straight sRGB 0..255, `strength`는 불투명도×압력.
 * 드라이버가 paint 도메인의 `dabMask`로 mask를 구해 이 함수로 바이트를 만든다.
 */
export function premultipliedPixel(color: readonly [number, number, number], mask: number, strength: number): readonly [number, number, number, number] {
  const alpha = Math.min(1, Math.max(0, mask * strength));
  return [Math.round(color[0] * alpha), Math.round(color[1] * alpha), Math.round(color[2] * alpha), Math.round(alpha * 255)];
}
