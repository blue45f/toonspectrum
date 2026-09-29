/**
 * 벡터 레이어 도메인 모델 (T2: 벡터 레이어 + 사후 선 편집).
 *
 * CSP(Clip Studio Paint) 벤치마킹 기반 벡터 레이어의 핵심 데이터 계약을 정의한다.
 * 모든 함수는 순수하며 DOM/Canvas 의존성이 없다.
 *
 * ## 기존 레이어 타입 유니온 확장 포인트 (수정 없이 문서화)
 *
 * 현재 스튜디오의 그리기 요소는 `../studio-element-model.ts`의 `DrawEl` 로 표현되며,
 * 종류는 `kind?: "freehand" | DrawShapeKind` 유니온(`../studio-editor-tool-model.ts`의
 * `DrawShapeKind` = line | rect | ellipse | star | arrow | triangle | polygon)으로 구분된다.
 * 벡터 레이어를 기존 문서 모델에 편입할 때의 확장 포인트는 다음과 같으며,
 * 이 파일은 기존 파일을 수정하지 않고 계약만 제공한다:
 *
 * 1. `DrawEl.kind` 유니온에 `"vector"` 리터럴을 추가한다.
 *    (`type DrawElKind = "freehand" | DrawShapeKind | "vector"`)
 * 2. `DrawEl` 에 벡터 페이로드를 싣는다. 예: `vectorStroke?: VectorStroke`
 *    (또는 별도 `VectorEl` 인터페이스를 도입해 `El` 유니온에 합친다).
 * 3. `VectorLayer` 는 문서 레벨에서 벡터 스트로크를 묶는 컨테이너이며,
 *    기존 `LayerGroup`/`El[]` 트리와 1:1 대응시킬 때는 `type: "vector"` 마커로 구분한다.
 *
 * 이 파일의 `VECTOR_LAYER_TYPE` 상수와 `isVectorLayer` 가드가 그 판별 기준이다.
 */

export interface VectorPoint2D {
  readonly x: number;
  readonly y: number;
}

/** 그리기 입력 한 샘플. pressure 가 없으면 0.5(중간 필압)로 간주한다. */
export interface VectorInputPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

/** 브러시 팁 모양 프리셋 식별자. */
export type VectorBrushShapeId = "round" | "flat" | "calligraphy";

export interface VectorBrushShape {
  readonly id: VectorBrushShapeId;
  readonly label: string;
  readonly description: string;
}

export const VECTOR_BRUSH_SHAPES: readonly VectorBrushShape[] = [
  {
    id: "round",
    label: "둥근 펜",
    description: "팁이 둥글어 방향과 무관하게 균일한 선을 만든다.",
  },
  {
    id: "flat",
    label: "납작 붓",
    description: "양 끝이 가늘어지는 치즐(chisel) 형태의 폭 프로파일을 적용한다.",
  },
  {
    id: "calligraphy",
    label: "캘리그래피",
    description: "펜촉 각도(기본 45°)에 따라 굵기가 변하는 서예 효과를 적용한다.",
  },
] as const;

export function isVectorBrushShapeId(value: unknown): value is VectorBrushShapeId {
  return VECTOR_BRUSH_SHAPES.some((shape) => shape.id === value);
}

export function normalizeVectorBrushShapeId(
  value: unknown,
  fallback: VectorBrushShapeId = "round"
): VectorBrushShapeId {
  return isVectorBrushShapeId(value) ? value : fallback;
}

/** 3차 베지어 세그먼트. 연속된 세그먼트는 끝점을 공유한다(p3[i] === p0[i+1]). */
export interface VectorCubicSegment {
  readonly p0: VectorPoint2D;
  readonly p1: VectorPoint2D;
  readonly p2: VectorPoint2D;
  readonly p3: VectorPoint2D;
}

/**
 * 벡터 스트로크 한 획.
 * - `segments`: Catmull-Rom → 베지어 변환된 패스.
 * - `widths`: 앵커(컨트롤 포인트)별 선 굵기. 길이는 항상 `segments.length + 1`.
 */
export interface VectorStroke {
  readonly id: string;
  readonly segments: readonly VectorCubicSegment[];
  readonly widths: readonly number[];
  readonly color: string;
  readonly brushShapeId: VectorBrushShapeId;
  /** 0..1 */
  readonly opacity: number;
  readonly closed?: boolean;
}

export const VECTOR_LAYER_TYPE = "vector" as const;
export type VectorLayerType = typeof VECTOR_LAYER_TYPE;

export interface VectorLayer {
  readonly id: string;
  readonly name: string;
  readonly type: VectorLayerType;
  readonly strokes: readonly VectorStroke[];
  readonly visible: boolean;
  readonly locked: boolean;
  /** 0..1 */
  readonly opacity: number;
}

/** 사후 선 굵기 일괄 조정의 허용 배율 범위. */
export const VECTOR_WIDTH_SCALE_MIN = 0.1;
export const VECTOR_WIDTH_SCALE_MAX = 5;

/** 폭 프로파일 하한(px). 0 이하 굵기는 렌더링 붕괴를 유발하므로 강제한다. */
export const VECTOR_STROKE_MIN_WIDTH_PX = 0.25;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampVectorWidthScale(scale: unknown): number {
  return clamp(
    finiteNumber(scale, 1),
    VECTOR_WIDTH_SCALE_MIN,
    VECTOR_WIDTH_SCALE_MAX
  );
}

export function normalizeVectorOpacity(opacity: unknown): number {
  return clamp(finiteNumber(opacity, 1), 0, 1);
}

/**
 * 앵커 수(`segments.length + 1`)에 맞게 폭 프로파일 길이를 정규화한다.
 * 부족하면 선형 보간으로 늘리고, 넘치면 잘라낸 뒤 하한을 강제한다.
 */
export function normalizeVectorStrokeWidths(
  segments: readonly VectorCubicSegment[],
  widths: readonly number[]
): number[] {
  const anchorCount = segments.length + 1;
  if (anchorCount <= 0) return [];
  const source = widths.length > 0 ? widths : [1];
  const result: number[] = [];
  for (let index = 0; index < anchorCount; index += 1) {
    if (source.length === 1) {
      result.push(source[0]!);
      continue;
    }
    const position = (index / Math.max(anchorCount - 1, 1)) * (source.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, source.length - 1);
    const fraction = position - lower;
    const lowerWidth = finiteNumber(source[lower], 1);
    const upperWidth = finiteNumber(source[upper], lowerWidth);
    result.push(lowerWidth + (upperWidth - lowerWidth) * fraction);
  }
  return result.map((width) =>
    Math.max(VECTOR_STROKE_MIN_WIDTH_PX, finiteNumber(width, 1))
  );
}

function sanitizeColor(color: unknown): string {
  return typeof color === "string" && color.length > 0 ? color : "#000000";
}

export interface CreateVectorStrokeInit {
  readonly id: string;
  readonly segments: readonly VectorCubicSegment[];
  readonly widths: readonly number[];
  readonly color?: string;
  readonly brushShapeId?: VectorBrushShapeId;
  readonly opacity?: number;
  readonly closed?: boolean;
}

export function createVectorStroke(init: CreateVectorStrokeInit): VectorStroke {
  return {
    id: init.id,
    segments: [...init.segments],
    widths: normalizeVectorStrokeWidths(init.segments, init.widths),
    color: sanitizeColor(init.color),
    brushShapeId: normalizeVectorBrushShapeId(init.brushShapeId),
    opacity: normalizeVectorOpacity(init.opacity),
    ...(init.closed === true ? { closed: true as const } : {}),
  };
}

export interface CreateVectorLayerInit {
  readonly id: string;
  readonly name?: string;
  readonly strokes?: readonly VectorStroke[];
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly opacity?: number;
}

export function createVectorLayer(init: CreateVectorLayerInit): VectorLayer {
  return {
    id: init.id,
    name: init.name ?? "벡터 레이어",
    type: VECTOR_LAYER_TYPE,
    strokes: [...(init.strokes ?? [])],
    visible: init.visible ?? true,
    locked: init.locked ?? false,
    opacity: normalizeVectorOpacity(init.opacity),
  };
}

function isVectorPoint2D(value: unknown): value is VectorPoint2D {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return typeof point["x"] === "number" && typeof point["y"] === "number";
}

function isVectorCubicSegment(value: unknown): value is VectorCubicSegment {
  if (typeof value !== "object" || value === null) return false;
  const segment = value as Record<string, unknown>;
  return (
    isVectorPoint2D(segment["p0"])
    && isVectorPoint2D(segment["p1"])
    && isVectorPoint2D(segment["p2"])
    && isVectorPoint2D(segment["p3"])
  );
}

/** 역직렬화 경계에서 사용하는 런타임 가드. */
export function isVectorStroke(value: unknown): value is VectorStroke {
  if (typeof value !== "object" || value === null) return false;
  const stroke = value as Record<string, unknown>;
  return (
    typeof stroke["id"] === "string"
    && Array.isArray(stroke["segments"])
    && (stroke["segments"] as unknown[]).every(isVectorCubicSegment)
    && Array.isArray(stroke["widths"])
    && (stroke["widths"] as unknown[]).every((width) => typeof width === "number")
    && (stroke["segments"] as unknown[]).length + 1
      === (stroke["widths"] as unknown[]).length
    && typeof stroke["color"] === "string"
    && isVectorBrushShapeId(stroke["brushShapeId"])
    && typeof stroke["opacity"] === "number"
  );
}

/** 역직렬화 경계에서 사용하는 런타임 가드. */
export function isVectorLayer(value: unknown): value is VectorLayer {
  if (typeof value !== "object" || value === null) return false;
  const layer = value as Record<string, unknown>;
  return (
    typeof layer["id"] === "string"
    && typeof layer["name"] === "string"
    && layer["type"] === VECTOR_LAYER_TYPE
    && Array.isArray(layer["strokes"])
    && (layer["strokes"] as unknown[]).every(isVectorStroke)
    && typeof layer["visible"] === "boolean"
    && typeof layer["locked"] === "boolean"
    && typeof layer["opacity"] === "number"
  );
}

/** 스트로크의 앵커(컨트롤 포인트) 좌표 목록. 베지어 끝점 공유 규칙을 따른다. */
export function vectorStrokeAnchors(stroke: VectorStroke): VectorPoint2D[] {
  const anchors: VectorPoint2D[] = [];
  stroke.segments.forEach((segment, index) => {
    if (index === 0) anchors.push({ x: segment.p0.x, y: segment.p0.y });
    anchors.push({ x: segment.p3.x, y: segment.p3.y });
  });
  return anchors;
}

/** 스트로크 전체의 축에 평행한 경계 상자. 빈 스트로크는 null. */
export function vectorStrokeBounds(
  stroke: VectorStroke
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  const visit = (point: VectorPoint2D, width: number): void => {
    const half = width / 2;
    minX = Math.min(minX, point.x - half);
    minY = Math.min(minY, point.y - half);
    maxX = Math.max(maxX, point.x + half);
    maxY = Math.max(maxY, point.y + half);
    found = true;
  };
  stroke.segments.forEach((segment, segmentIndex) => {
    visit(segment.p0, stroke.widths[segmentIndex] ?? 1);
    visit(segment.p1, stroke.widths[segmentIndex] ?? 1);
    visit(segment.p2, stroke.widths[segmentIndex + 1] ?? 1);
    visit(segment.p3, stroke.widths[segmentIndex + 1] ?? 1);
  });
  return found ? { minX, minY, maxX, maxY } : null;
}
