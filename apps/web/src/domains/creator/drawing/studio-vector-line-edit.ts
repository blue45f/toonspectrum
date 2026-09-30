/**
 * studio-vector-line-edit.ts
 *
 * 벡터 선 직접 편집 (Clip Studio Paint 벡터 레이어 "선을 손으로 조정" 재해석).
 * UI 복제가 아니라 원리만 차용한다: 그은 뒤에도 선을 어루만지듯 굵기를 바꾸고,
 * 컨트롤 포인트를 밀고·지우고·끼워 넣고, 선을 단순화한다.
 *
 * ## studio-stroke-vectorizer.ts 와의 관계
 * - `studio-stroke-vectorizer.ts` 의 `StudioVectorizedStroke.rings` 는 렌더링용
 *   **외곽선 폴리곤**이다. 외곽선만으로는 "어느 구간의 선이 몇 px인지"를 알 수 없다.
 * - 그래서 이 모듈은 벡터라이저와 **같은 입력**(`StudioVectorizerPoint[]`)에서
 *   출발하는 **중심선 + 앵커별 선폭** 모델(`StudioEditableVectorLine`)을 정의한다.
 *   선폭은 perfect-freehand 의 압력→반경 프로파일을 근사한
 *   `estimateWidthFromPressure` 로 복원한다(정확한 외곽선 재생성이 아니라
 *   "편집용 어림값"이다).
 * - 편집이 끝난 선의 표시용 외곽선은 `vectorLineOutlinePathData` 로 만든다.
 *   정밀 벡터화는 기존 `vectorizeFreehandStroke` 를 그대로 쓴다.
 *
 * 전부 순수·결정적. DOM/Canvas에 의존하지 않는다.
 */

import { ringsToSvgPathData } from "./studio-stroke-vectorizer";

/** 벡터 선의 컨트롤 포인트 1개 (중심선 위치 + 해당 위치의 선폭 px). */
export interface StudioVectorLinePoint {
  readonly x: number;
  readonly y: number;
  /** 선폭(px). 항상 0보다 크다. */
  readonly width: number;
}

/**
 * 편집 가능한 벡터 선 한 획.
 * - `points`: 중심선 앵커들. `widths` 와 1:1 대응이다
 *   (vector-layer 의 `VectorStroke` 가 앵커별 폭을 갖는 것과 같은 멘탈 모델).
 */
export interface StudioEditableVectorLine {
  readonly id: string;
  readonly points: readonly StudioVectorLinePoint[];
  readonly color: string;
  /** 닫힌 도형이면 마지막 앵커와 첫 앵커가 이어진다. */
  readonly closed: boolean;
}

/** 선폭 하한(px). 0 이하 굵기는 렌더링 붕괴를 유발하므로 강제한다. */
export const STUDIO_VECTOR_LINE_MIN_WIDTH_PX = 0.25;

/** 단순화 기본 허용 오차(px). */
export const STUDIO_VECTOR_LINE_DEFAULT_SIMPLIFY_TOLERANCE_PX = 2;

/** 되돌리기 히스토리 최대 길이. */
export const STUDIO_VECTOR_LINE_HISTORY_LIMIT = 50;

/** 폭 프로파일 배율 상한. CSP의 "선폭 수정"이 발산하지 않도록 둔다. */
export const STUDIO_VECTOR_LINE_MAX_WIDTH_SCALE = 8;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampWidth(width: number): number {
  return Math.max(
    STUDIO_VECTOR_LINE_MIN_WIDTH_PX,
    finiteNumber(width, STUDIO_VECTOR_LINE_MIN_WIDTH_PX),
  );
}

let vectorLineIdCounter = 0;

/** 편집 선 ID 발급 (`svl-1`, `svl-2`, ...). */
export function createEditableVectorLineId(): string {
  vectorLineIdCounter += 1;
  return `svl-${vectorLineIdCounter}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * 필압 → 선폭 어림값(px).
 * perfect-freehand 의 압력 기반 반경 프로파일(`size`·`thinning`)을
 * `size * (1 - thinning * (1 - pressure))` 로 근사한다.
 * 벡터화 외곽선을 역산하는 것이 아니라 편집 시작점용 어림값이다.
 */
export function estimateWidthFromPressure(
  size: number,
  thinning: number,
  pressure: number,
): number {
  const safeSize = Math.max(0.5, finiteNumber(size, 16));
  const safeThinning = clamp01(thinning);
  const safePressure = clamp01(pressure);
  return clampWidth(safeSize * (1 - safeThinning * (1 - safePressure)));
}

export interface EditableLineFromPointsOptions {
  /** 선 ID. 생략하면 자동 발급. */
  readonly id?: string;
  readonly color?: string;
  readonly closed?: boolean;
  /** 벡터라이저 `size` 와 같은 기준 굵기(px). 기본 16. */
  readonly size?: number;
  /** 벡터라이저 `thinning` 과 같은 굵기 변화 강도 0..1. 기본 0.5. */
  readonly thinning?: number;
}

/**
 * 벡터라이저 입력 점열 → 편집 가능한 벡터 선.
 * 점이 2개 미만이면 null 을 반환한다 (편집할 선이 없다).
 */
export function editableLineFromVectorizerPoints(
  points: ReadonlyArray<{ readonly x: number; readonly y: number; readonly pressure?: number }>,
  options: EditableLineFromPointsOptions = {},
): StudioEditableVectorLine | null {
  if (points.length < 2) return null;
  const size = options.size ?? 16;
  const thinning = options.thinning ?? 0.5;
  const linePoints = points.map((p) => ({
    x: finiteNumber(p.x, 0),
    y: finiteNumber(p.y, 0),
    width: estimateWidthFromPressure(size, thinning, p.pressure ?? 0.5),
  }));
  return {
    id: options.id ?? createEditableVectorLineId(),
    points: linePoints,
    color: options.color ?? "#111111",
    closed: options.closed ?? false,
  };
}

/* ------------------------------------------------------------------ */
/* 구간 선택                                                            */
/* ------------------------------------------------------------------ */

/** 앵커 구간 [startIndex, endIndex] (양 끝 포함). */
export interface StudioVectorLineRange {
  readonly startIndex: number;
  readonly endIndex: number;
}

/**
 * 구간 선택 정규화: 범위를 [0, pointCount-1] 로 클램프하고 start <= end 로 정렬한다.
 * pointCount 가 0이면 `{ startIndex: 0, endIndex: -1 }`(빈 구간)을 반환한다.
 */
export function normalizeWidthRange(
  pointCount: number,
  a: number,
  b: number,
): StudioVectorLineRange {
  if (pointCount <= 0) return { startIndex: 0, endIndex: -1 };
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const startIndex = Math.min(
    pointCount - 1,
    Math.max(0, Math.floor(finiteNumber(lo, 0))),
  );
  const endIndex = Math.min(
    pointCount - 1,
    Math.max(0, Math.floor(finiteNumber(hi, 0))),
  );
  return { startIndex, endIndex };
}

function isRangeUsable(
  line: StudioEditableVectorLine,
  range: StudioVectorLineRange,
): boolean {
  return (
    range.endIndex >= range.startIndex
    && range.startIndex >= 0
    && range.endIndex < line.points.length
  );
}

function mapPointsInRange(
  line: StudioEditableVectorLine,
  range: StudioVectorLineRange,
  mapWidth: (width: number, index: number, t: number) => number,
): StudioEditableVectorLine {
  if (!isRangeUsable(line, range)) return line;
  const span = range.endIndex - range.startIndex;
  const points = line.points.map((point, index) => {
    if (index < range.startIndex || index > range.endIndex) return point;
    const t = span === 0 ? 0 : (index - range.startIndex) / span;
    return { ...point, width: clampWidth(mapWidth(point.width, index, t)) };
  });
  return { ...line, points };
}

/* ------------------------------------------------------------------ */
/* 1. 구간 선폭 편집: 늘이기 / 줄이기 / 테이퍼                             */
/* ------------------------------------------------------------------ */

/**
 * 구간 선폭에 배율을 곱한다 (늘이기: scale > 1, 줄이기: scale < 1).
 * 배율은 (0, STUDIO_VECTOR_LINE_MAX_WIDTH_SCALE] 로 클램프된다.
 */
export function scaleWidthInRange(
  line: StudioEditableVectorLine,
  range: StudioVectorLineRange,
  scale: number,
): StudioEditableVectorLine {
  const clampedScale = Math.min(
    STUDIO_VECTOR_LINE_MAX_WIDTH_SCALE,
    Math.max(0.01, finiteNumber(scale, 1)),
  );
  return mapPointsInRange(line, range, (width) => width * clampedScale);
}

/** 구간 선폭을 절대값으로 설정한다. */
export function setWidthInRange(
  line: StudioEditableVectorLine,
  range: StudioVectorLineRange,
  width: number,
): StudioEditableVectorLine {
  const target = clampWidth(width);
  return mapPointsInRange(line, range, () => target);
}

export type VectorLineTaperDirection = "toEnd" | "toStart" | "bothEnds";

export interface TaperWidthInRangeOptions {
  /** 테이퍼 방향. 기본 "toEnd" (점점 가늘어짐). */
  readonly direction?: VectorLineTaperDirection;
  /** 구간 끝(가장 가는 쪽)의 배율 0..1. 기본 0.15. */
  readonly endFactor?: number;
}

/**
 * 구간에 테이퍼(점점 가늘어지는 폭 프로파일)를 적용한다.
 * 기존 폭에 방향별 램프를 곱하는 방식이라 원래 붓 터치가 살아남는다.
 * - toEnd: 구간 시작 → 끝으로 갈수록 endFactor 까지 감소
 * - toStart: 반대
 * - bothEnds: 양 끝이 가늘어지는 치즐형 (`sin(π·t)` 램프)
 */
export function taperWidthInRange(
  line: StudioEditableVectorLine,
  range: StudioVectorLineRange,
  options: TaperWidthInRangeOptions = {},
): StudioEditableVectorLine {
  const direction = options.direction ?? "toEnd";
  const endFactor = clamp01(finiteNumber(options.endFactor, 0.15));
  return mapPointsInRange(line, range, (width, _index, t) => {
    let factor: number;
    if (direction === "toStart") {
      factor = endFactor + (1 - endFactor) * t;
    } else if (direction === "bothEnds") {
      factor = endFactor + (1 - endFactor) * Math.sin(Math.PI * t);
    } else {
      factor = 1 - (1 - endFactor) * t;
    }
    return width * factor;
  });
}

/* ------------------------------------------------------------------ */
/* 2. 컨트롤 포인트 이동·삭제·추가                                        */
/* ------------------------------------------------------------------ */

/** 컨트롤 포인트를 (x, y) 로 이동한다. 선폭은 유지된다. */
export function moveControlPoint(
  line: StudioEditableVectorLine,
  index: number,
  x: number,
  y: number,
): StudioEditableVectorLine {
  if (!Number.isInteger(index) || index < 0 || index >= line.points.length) {
    return line;
  }
  const nx = finiteNumber(x, line.points[index]!.x);
  const ny = finiteNumber(y, line.points[index]!.y);
  const points = line.points.map((point, i) =>
    i === index ? { ...point, x: nx, y: ny } : point,
  );
  return { ...line, points };
}

/**
 * 컨트롤 포인트를 삭제한다.
 * 앵커가 2개 이하로 떨어지면 선이 성립하지 않으므로 변경하지 않는다.
 * 닫힌 선이 3개 미만으로 떨어지면 열린 선으로 바꾼다.
 */
export function deleteControlPoint(
  line: StudioEditableVectorLine,
  index: number,
): StudioEditableVectorLine {
  if (
    !Number.isInteger(index)
    || index < 0
    || index >= line.points.length
    || line.points.length <= 2
  ) {
    return line;
  }
  const points = line.points.filter((_, i) => i !== index);
  const closed = line.closed && points.length >= 3;
  return { ...line, points, closed };
}

function segmentCount(line: StudioEditableVectorLine): number {
  return line.closed ? line.points.length : Math.max(0, line.points.length - 1);
}

/** segmentIndex 번째 선분 위의 t(0..1) 지점에 컨트롤 포인트를 끼워 넣는다. */
export function insertControlPoint(
  line: StudioEditableVectorLine,
  segmentIndex: number,
  t: number,
): StudioEditableVectorLine {
  const count = segmentCount(line);
  if (
    !Number.isInteger(segmentIndex)
    || segmentIndex < 0
    || segmentIndex >= count
    || line.points.length === 0
  ) {
    return line;
  }
  const a = line.points[segmentIndex]!;
  const b = line.points[(segmentIndex + 1) % line.points.length]!;
  const tt = clamp01(finiteNumber(t, 0.5));
  const inserted: StudioVectorLinePoint = {
    x: a.x + (b.x - a.x) * tt,
    y: a.y + (b.y - a.y) * tt,
    width: clampWidth(a.width + (b.width - a.width) * tt),
  };
  const points = [
    ...line.points.slice(0, segmentIndex + 1),
    inserted,
    ...line.points.slice(segmentIndex + 1),
  ];
  return { ...line, points };
}

function pointToSegmentT(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { readonly distance: number; readonly t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared < 1e-12) {
    return { distance: Math.hypot(px - ax, py - ay), t: 0 };
  }
  const t = Math.min(
    1,
    Math.max(0, ((px - ax) * abx + (py - ay) * aby) / lengthSquared),
  );
  return {
    distance: Math.hypot(px - (ax + abx * t), py - (ay + aby * t)),
    t,
  };
}

/**
 * (x, y) 에 가장 가까운 선분을 찾아 그 위에 컨트롤 포인트를 끼워 넣는다.
 * CSP의 "선을 눌러 제어점 추가"와 같은 멘탈 모델이다.
 */
export function insertControlPointAt(
  line: StudioEditableVectorLine,
  x: number,
  y: number,
): StudioEditableVectorLine {
  const count = segmentCount(line);
  if (count === 0 || !Number.isFinite(x) || !Number.isFinite(y)) return line;
  let bestSegment = 0;
  let bestT = 0.5;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let s = 0; s < count; s += 1) {
    const a = line.points[s]!;
    const b = line.points[(s + 1) % line.points.length]!;
    const { distance, t } = pointToSegmentT(x, y, a.x, a.y, b.x, b.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegment = s;
      bestT = t;
    }
  }
  return insertControlPoint(line, bestSegment, bestT);
}

/* ------------------------------------------------------------------ */
/* 3. 선 단순화 (Douglas-Peucker)                                        */
/* ------------------------------------------------------------------ */

function perpendicularDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const length = Math.hypot(abx, aby);
  if (length < 1e-12) return Math.hypot(px - ax, py - ay);
  return Math.abs(abx * (ay - py) - aby * (ax - px)) / length;
}

/**
 * Douglas-Peucker 단순화. 중심선 위치만 보고 앵커를 솎아내며,
 * 살아남은 앵커의 선폭은 그대로 유지한다.
 * tolerance <= 0 이면 변경하지 않는다. 양 끝점은 항상 유지된다.
 */
export function simplifyVectorLine(
  line: StudioEditableVectorLine,
  tolerance = STUDIO_VECTOR_LINE_DEFAULT_SIMPLIFY_TOLERANCE_PX,
): StudioEditableVectorLine {
  const safeTolerance = finiteNumber(tolerance, 0);
  if (safeTolerance <= 0 || line.points.length <= 2) return line;
  const points = line.points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<readonly [number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const a = points[first]!;
    const b = points[last]!;
    let maxDistance = -1;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const p = points[i]!;
      const distance = perpendicularDistance(p.x, p.y, a.x, a.y, b.x, b.y);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxDistance > safeTolerance && maxIndex >= 0) {
      keep[maxIndex] = true;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  const simplified = points.filter((_, i) => keep[i]);
  if (simplified.length === points.length) return line;
  return { ...line, points: simplified };
}

/* ------------------------------------------------------------------ */
/* 4. 되돌리기 가능한 커맨드 모델 (before/after 스냅샷)                    */
/* ------------------------------------------------------------------ */

/** 선 편집 커맨드 1개. before/after 스냅샷으로 되돌리기가 항상 가능하다. */
export interface StudioVectorLineCommand {
  readonly commandId: string;
  readonly label: string;
  readonly before: StudioEditableVectorLine;
  readonly after: StudioEditableVectorLine;
}

/** 불변 되돌리기 히스토리. past 의 끝이 가장 최근 커맨드다. */
export interface StudioVectorLineHistory {
  readonly past: readonly StudioVectorLineCommand[];
  readonly future: readonly StudioVectorLineCommand[];
}

let vectorLineCommandCounter = 0;

/** 커맨드 생성. ID는 자동 발급된다. */
export function createVectorLineCommand(
  label: string,
  before: StudioEditableVectorLine,
  after: StudioEditableVectorLine,
): StudioVectorLineCommand {
  vectorLineCommandCounter += 1;
  return {
    commandId: `svlc-${vectorLineCommandCounter}`,
    label,
    before,
    after,
  };
}

/** 빈 히스토리. */
export function emptyVectorLineHistory(): StudioVectorLineHistory {
  return { past: [], future: [] };
}

/**
 * 커맨드를 히스토리에 쌓는다. 새 커맨드가 들어오면 redo 스택(future)은 비워진다.
 * past 는 STUDIO_VECTOR_LINE_HISTORY_LIMIT 을 넘지 않는다.
 */
export function pushVectorLineCommand(
  history: StudioVectorLineHistory,
  command: StudioVectorLineCommand,
): StudioVectorLineHistory {
  const past = [...history.past, command];
  const trimmed =
    past.length > STUDIO_VECTOR_LINE_HISTORY_LIMIT
      ? past.slice(past.length - STUDIO_VECTOR_LINE_HISTORY_LIMIT)
      : past;
  return { past: trimmed, future: [] };
}

export interface StudioVectorLineUndoResult {
  readonly history: StudioVectorLineHistory;
  /** 되돌린 뒤의 선. */
  readonly stroke: StudioEditableVectorLine;
}

/** 실행 취소. past 가 비어 있으면 null. */
export function undoVectorLine(
  history: StudioVectorLineHistory,
): StudioVectorLineUndoResult | null {
  if (history.past.length === 0) return null;
  const command = history.past[history.past.length - 1]!;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [command, ...history.future],
    },
    stroke: command.before,
  };
}

/** 다시 실행. future 가 비어 있으면 null. */
export function redoVectorLine(
  history: StudioVectorLineHistory,
): StudioVectorLineUndoResult | null {
  if (history.future.length === 0) return null;
  const command = history.future[0]!;
  return {
    history: {
      past: [...history.past, command],
      future: history.future.slice(1),
    },
    stroke: command.after,
  };
}

/** 히스토리를 비운다 (새 선을 불러올 때 등). */
export function clearVectorLineHistory(): StudioVectorLineHistory {
  return emptyVectorLineHistory();
}

/* ------------------------------------------------------------------ */
/* 표시용 외곽선 (가이드/프리뷰 렌더링)                                   */
/* ------------------------------------------------------------------ */

function anchorNormal(
  points: readonly StudioVectorLinePoint[],
  index: number,
  closed: boolean,
): readonly [number, number] {
  const n = points.length;
  const prev = points[closed ? (index - 1 + n) % n : Math.max(0, index - 1)]!;
  const next = points[closed ? (index + 1) % n : Math.min(n - 1, index + 1)]!;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return [0, 1];
  return [-dy / length, dx / length];
}

/**
 * 편집 선의 표시용 외곽선 SVG path data.
 * 각 앵커에서 법선 방향으로 ±width/2 만큼 벌린 뒤 한 바퀴 돌아
 * `ringsToSvgPathData` 로 묶는다 (기존 벡터라이저 에셋 재활용).
 * 점이 2개 미만이면 빈 문자열.
 */
export function vectorLineOutlinePathData(
  line: StudioEditableVectorLine,
  precision = 2,
): string {
  const { points } = line;
  if (points.length < 2) return "";
  const left: Array<readonly [number, number]> = [];
  const right: Array<readonly [number, number]> = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const [nx, ny] = anchorNormal(points, i, line.closed);
    const half = p.width / 2;
    left.push([p.x + nx * half, p.y + ny * half]);
    right.push([p.x - nx * half, p.y - ny * half]);
  }
  const ring = [...left, ...right.reverse()];
  if (line.closed && ring.length > 0) {
    // 닫힌 선은 이음매가 벌어지지 않도록 링을 닫는다.
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }
  return ringsToSvgPathData([ring], precision);
}
