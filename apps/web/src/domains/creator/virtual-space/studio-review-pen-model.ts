/**
 * C-5: 원고 위 펜 주석(빨간펜) 스트로크 모델.
 *
 * 스트로크는 페이지 좌표계(원고 원본 픽셀 기준, page.width × page.height)에 저장한다.
 * 렌더링은 SVG viewBox 로 같은 좌표계를 쓰므로 줌·리사이즈와 무관하게 같은 위치에 그려진다.
 * 검수 코멘트의 공간 앵커(ReviewAnchor) 권한 모델은 바꾸지 않는다. 펜 첨삭은
 * 스트로크들의 바운딩 박스를 region 앵커로 삼고, 스트로크 자체는 코멘트 입력의
 * 선택적 strokes 필드로 함께 전송한다. 서버가 strokes 를 저장하지 않으면
 * region 앵커(서버가 이미 저장하는 필드)만 남는다.
 */

export interface StudioReviewPenPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioReviewPenStroke {
  readonly id: string;
  readonly points: readonly StudioReviewPenPoint[];
  readonly color: string;
  /** 페이지 좌표계 단위의 선 굵기. */
  readonly width: number;
}

/** 빨간펜 기본 팔레트. */
export const STUDIO_REVIEW_PEN_COLORS = Object.freeze([
  { id: "red", label: "빨간펜", value: "#e5484d" },
  { id: "black", label: "검정펜", value: "#1c1c1e" },
  { id: "blue", label: "파란펜", value: "#2563eb" },
] as const);
export const STUDIO_REVIEW_PEN_DEFAULT_COLOR = STUDIO_REVIEW_PEN_COLORS[0].value;

const MAX_STROKES_PER_COMMENT = 50;
const MAX_POINTS_PER_STROKE = 500;
const MIN_POINT_DISTANCE = 2;

function isPenColor(value: string): boolean {
  return STUDIO_REVIEW_PEN_COLORS.some((entry) => entry.value === value);
}

function clampPoint(point: StudioReviewPenPoint, pageWidth: number, pageHeight: number): StudioReviewPenPoint | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return {
    x: Math.min(pageWidth, Math.max(0, point.x)),
    y: Math.min(pageHeight, Math.max(0, point.y)),
  };
}

/**
 * 원시 포인터 점들을 스트로크로 정규화한다. 점이 2개 미만이면 null.
 * 페이지 범위로 클램프하고, 연속 중복점을 제거한다.
 */
export function normalizeStudioReviewPenStroke(
  input: {
    readonly id: string;
    readonly points: readonly StudioReviewPenPoint[];
    readonly color?: string;
    readonly width?: number;
  },
  page: { readonly width: number; readonly height: number },
): StudioReviewPenStroke | null {
  if (!input.id || page.width <= 0 || page.height <= 0) return null;
  const points: StudioReviewPenPoint[] = [];
  for (const raw of input.points.slice(0, MAX_POINTS_PER_STROKE)) {
    const point = clampPoint(raw, page.width, page.height);
    if (!point) continue;
    const last = points[points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) continue;
    points.push(point);
  }
  if (points.length < 2) return null;
  const width = Number.isFinite(input.width) && (input.width as number) > 0
    ? (input.width as number)
    : Math.max(page.width, page.height) * 0.004;
  return Object.freeze({
    id: input.id,
    points: Object.freeze(points),
    color: input.color && isPenColor(input.color) ? input.color : STUDIO_REVIEW_PEN_DEFAULT_COLOR,
    width,
  });
}

export interface StudioReviewPenBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 스트로크들의 바운딩 박스를 구한다. region 앵커로 쓸 수 있게
 * 너비·높이는 최소 1px 이상으로 보정한다. 스트로크가 없으면 null.
 */
export function studioReviewPenStrokeBounds(
  strokes: readonly StudioReviewPenStroke[],
): StudioReviewPenBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      count += 1;
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!count) return null;
  return Object.freeze({
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  });
}

/** 전송용 직렬화. 개수 제한을 넘으면 앞에서부터 자른다. */
export function serializeStudioReviewPenStrokes(
  strokes: readonly StudioReviewPenStroke[],
): readonly StudioReviewPenStroke[] {
  return Object.freeze(strokes.slice(0, MAX_STROKES_PER_COMMENT).map((stroke) => Object.freeze({
    id: String(stroke.id).slice(0, 64),
    points: Object.freeze(stroke.points.slice(0, MAX_POINTS_PER_STROKE).map((point) => Object.freeze({
      x: point.x,
      y: point.y,
    }))),
    color: isPenColor(stroke.color) ? stroke.color : STUDIO_REVIEW_PEN_DEFAULT_COLOR,
    width: Number.isFinite(stroke.width) && stroke.width > 0 ? stroke.width : 1,
  })));
}

/** 서버·외부에서 들어온 strokes 값을 방어적으로 읽는다. 유효하지 않으면 빈 배열. */
export function parseStudioReviewPenStrokes(value: unknown): readonly StudioReviewPenStroke[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const strokes: StudioReviewPenStroke[] = [];
  for (const raw of value.slice(0, MAX_STROKES_PER_COMMENT)) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as { id?: unknown; points?: unknown; color?: unknown; width?: unknown };
    if (typeof candidate.id !== "string" || !candidate.id || !Array.isArray(candidate.points)) continue;
    const points: StudioReviewPenPoint[] = [];
    for (const entry of candidate.points.slice(0, MAX_POINTS_PER_STROKE)) {
      if (!entry || typeof entry !== "object") continue;
      const { x, y } = entry as { x?: unknown; y?: unknown };
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push({ x, y });
    }
    if (points.length < 2) continue;
    strokes.push({
      id: candidate.id.slice(0, 64),
      points,
      color: typeof candidate.color === "string" && isPenColor(candidate.color) ? candidate.color : STUDIO_REVIEW_PEN_DEFAULT_COLOR,
      width: typeof candidate.width === "number" && Number.isFinite(candidate.width) && candidate.width > 0 ? candidate.width : 1,
    });
  }
  return Object.freeze(strokes);
}
