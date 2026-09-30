/**
 * 마스킹액 (masking fluid) 브러시 런타임 모델.
 *
 * 실제 마스킹액 워크플로우를 재현한다:
 * 1. 마스킹액으로 보호할 영역을 칠한다 (마스크 필드에 침착)
 * 2. 그 위를 자유롭게 채색한다 — 마스크된 영역은 물감 침착을 차단
 * 3. 마스크를 벗겨내면 (lift) 흰 종이가 드러난다
 *
 * 기존 `wax-resist`(왁스 리지스트 수채 — 수채 브러시 + 왁스 회피)와 달리,
 * 이 모듈은 마스크 자체를 그리는 도구의 마스크 필드 의미를 정의한다.
 *
 * 순수 함수 + 불변 필드. 렌더러는 `queryMaskingFluid`로 dab 침착을 스킵한다.
 */

export interface StudioMaskingFluidField {
  readonly cellSize: number;
  /** 양자화 셀 키(`${cx},${cy}`) → 마스크 강도 0..1 */
  readonly cells: ReadonlyMap<string, number>;
}

export const STUDIO_MASKING_FLUID_DEFAULT_CELL_SIZE = 4 as const;
export const STUDIO_MASKING_FLUID_BLOCK_THRESHOLD = 0.5 as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** 빈 마스크 필드를 만든다. */
export function createStudioMaskingFluidField(
  cellSize: number = STUDIO_MASKING_FLUID_DEFAULT_CELL_SIZE,
): StudioMaskingFluidField {
  const safeCellSize = Number.isFinite(cellSize) && cellSize >= 1 ? cellSize : STUDIO_MASKING_FLUID_DEFAULT_CELL_SIZE;
  return Object.freeze({ cellSize: safeCellSize, cells: new Map<string, number>() });
}

/** 셀 좌표로 양자화한다. */
export function studioMaskingFluidCellAt(
  field: StudioMaskingFluidField,
  x: number,
  y: number,
): { readonly cx: number; readonly cy: number } {
  return {
    cx: Math.floor(x / field.cellSize),
    cy: Math.floor(y / field.cellSize),
  };
}

/**
 * (x,y) 반경 radius 안에 마스크를 침착한다. 강도는 누적되며 1로 클램프된다.
 * 가장자리는 부드럽게 폴오프한다 (반경의 70% 안쪽은 최대 강도).
 *
 * 셀 커버리지: 셀 중심이 아닌 "셀의 가장 가까운 점"까지의 유효 거리로 판정한다.
 * 셀 중심 양자화로 반경 경계의 셀이 0 강도로 저장되는 문제를 막는다 —
 * 반경 안에 일부라도 들어오는 셀은 양의 강도를 받는다.
 */
export function depositStudioMaskingFluid(
  field: StudioMaskingFluidField,
  x: number,
  y: number,
  radius: number,
  strength: number,
): StudioMaskingFluidField {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const safeStrength = clamp01(strength);
  if (safeRadius === 0 || safeStrength === 0) return field;
  const next = new Map(field.cells);
  const minCx = Math.floor((x - safeRadius) / field.cellSize);
  const maxCx = Math.floor((x + safeRadius) / field.cellSize);
  const minCy = Math.floor((y - safeRadius) / field.cellSize);
  const maxCy = Math.floor((y + safeRadius) / field.cellSize);
  const innerRadius = safeRadius * 0.7;
  // 셀 중심에서 셀 모서리까지의 최대 거리 — 이만큼 안쪽을 유효 거리로 본다.
  const halfDiagonal = field.cellSize * Math.SQRT1_2;
  for (let cx = minCx; cx <= maxCx; cx += 1) {
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      const cellX = (cx + 0.5) * field.cellSize;
      const cellY = (cy + 0.5) * field.cellSize;
      const effectiveDistance = Math.hypot(cellX - x, cellY - y) - halfDiagonal;
      if (effectiveDistance > safeRadius) continue;
      const falloff = effectiveDistance <= innerRadius
        ? 1
        : 1 - (effectiveDistance - innerRadius) / (safeRadius - innerRadius);
      const key = cellKey(cx, cy);
      const current = next.get(key) ?? 0;
      next.set(key, clamp01(current + safeStrength * falloff));
    }
  }
  return Object.freeze({ cellSize: field.cellSize, cells: next });
}

/** 마스크를 벗겨낸다 (peel-off). 반경 안의 마스크 강도를 제거한다. */
export function liftStudioMaskingFluid(
  field: StudioMaskingFluidField,
  x: number,
  y: number,
  radius: number,
): StudioMaskingFluidField {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  if (safeRadius === 0 || field.cells.size === 0) return field;
  const next = new Map<string, number>();
  for (const [key, strength] of field.cells) {
    const separator = key.indexOf(",");
    const cx = Number(key.slice(0, separator));
    const cy = Number(key.slice(separator + 1));
    const cellX = (cx + 0.5) * field.cellSize;
    const cellY = (cy + 0.5) * field.cellSize;
    if (Math.hypot(cellX - x, cellY - y) > safeRadius) {
      next.set(key, strength);
    }
  }
  return Object.freeze({ cellSize: field.cellSize, cells: next });
}

/** (x,y)의 마스크 강도 0..1을 조회한다. */
export function queryStudioMaskingFluid(
  field: StudioMaskingFluidField,
  x: number,
  y: number,
): number {
  const { cx, cy } = studioMaskingFluidCellAt(field, x, y);
  return field.cells.get(cellKey(cx, cy)) ?? 0;
}

/** 물감 침착을 차단할지 여부. */
export function isStudioMaskingFluidBlocked(
  field: StudioMaskingFluidField,
  x: number,
  y: number,
  threshold: number = STUDIO_MASKING_FLUID_BLOCK_THRESHOLD,
): boolean {
  return queryStudioMaskingFluid(field, x, y) >= threshold;
}

/** 마스크된 셀 수. */
export function studioMaskingFluidCellCount(field: StudioMaskingFluidField): number {
  return field.cells.size;
}

/** 필드를 직렬화한다 (문서 저장용). */
export function serializeStudioMaskingFluid(
  field: StudioMaskingFluidField,
): { readonly cellSize: number; readonly cells: ReadonlyArray<readonly [string, number]> } {
  return Object.freeze({
    cellSize: field.cellSize,
    cells: Object.freeze(Array.from(field.cells.entries()).map(([key, strength]) =>
      Object.freeze([key, strength] as const),
    )),
  });
}

/** 직렬화된 필드를 복원한다. */
export function deserializeStudioMaskingFluid(
  data: { readonly cellSize?: unknown; readonly cells?: unknown },
): StudioMaskingFluidField {
  const field = createStudioMaskingFluidField(
    typeof data.cellSize === "number" ? data.cellSize : STUDIO_MASKING_FLUID_DEFAULT_CELL_SIZE,
  );
  const cells = new Map<string, number>();
  if (Array.isArray(data.cells)) {
    for (const entry of data.cells) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [key, strength] = entry as unknown as readonly [unknown, unknown];
      if (typeof key !== "string" || typeof strength !== "number") continue;
      if (!/^-?\d+,-?\d+$/.test(key)) continue;
      cells.set(key, clamp01(strength));
    }
  }
  return Object.freeze({ cellSize: field.cellSize, cells });
}
