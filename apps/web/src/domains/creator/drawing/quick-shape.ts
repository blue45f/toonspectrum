/**
 * quick-shape.ts
 *
 * 퀵쉐이프 (Procreate QuickShape 재해석 — UI 복제가 아니라 동작 원리만 차용).
 *
 * 흐름:
 * 1. 사용자가 선을 그리고 펜을 떼지 않은 채 잠깐 멈춘다(홀드).
 *    `startQuickShapeHold` / `updateQuickShapeHold` 가 홀드 임계값(기본 500ms)
 *    도달을 감지한다.
 * 2. 홀드가 성립하면 `classifyQuickShape` 가 스트로크 점열을 분석해
 *    직선 / 타원·원 / 직사각형·정사각형 / 삼각형·정삼각형 / 폴리라인(폴백) 중
 *    하나로 분류하고 신뢰도(0..1)를 매긴다.
 * 3. 홀드 중 두 번째 손가락(포인터)이 닿으면 `perfectifyQuickShape` 가
 *    완벽 도형으로 바꾼다: 타원→원, 직사각형→정사각형, 삼각형→정삼각형,
 *    직선→15° 스냅.
 * 4. 신뢰도가 임계값보다 낮으면 `keepOriginal: true` — 삐뚤빼뚤한 원본을
 *    억지로 도형으로 바꾸지 않는다.
 *
 * 전부 순수·결정적. DOM/Canvas/타이머에 의존하지 않는다
 * (시간은 호출자가 ms 타임스탬프로 주입한다).
 */

/** 퀵쉐이프 입력 점 1개. */
export interface QuickShapePoint {
  readonly x: number;
  readonly y: number;
}

/** 분류 가능한 도형 종류. */
export type QuickShapeKind =
  | "line"
  | "ellipse"
  | "rectangle"
  | "triangle"
  | "polyline";

/** 보정된 도형의 기하 정보. */
export type QuickShapeGeometry =
  | {
      readonly kind: "line";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly kind: "ellipse";
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
      /** 회전(도). 현재 분류기는 축평행 타원만 만든다. */
      readonly rotationDeg: number;
    }
  | {
      readonly kind: "rectangle";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: "triangle";
      readonly p1: QuickShapePoint;
      readonly p2: QuickShapePoint;
      readonly p3: QuickShapePoint;
    }
  | {
      readonly kind: "polyline";
      readonly points: readonly QuickShapePoint[];
    };

/** 도형 분류 결과. */
export interface QuickShapeClassification {
  readonly kind: QuickShapeKind;
  /** 0..1. 임계값보다 낮으면 원본을 유지한다. */
  readonly confidence: number;
  /** 두 번째 포인터로 완벽 도형이 적용됐는지. */
  readonly isPerfect: boolean;
  /** true 면 보정하지 말고 사용자가 그린 원본을 그대로 둔다. */
  readonly keepOriginal: boolean;
  readonly geometry: QuickShapeGeometry;
}

/** 홀드 임계값 기본값(ms). Procreate Gesture Controls 대응, 설정 가능. */
export const QUICK_SHAPE_DEFAULT_HOLD_MS = 500;

/** 분류 신뢰도 임계값 기본값. 이보다 낮으면 원본 유지. */
export const QUICK_SHAPE_DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

/** 완벽 직선의 각도 스냅 단위(도). */
export const QUICK_SHAPE_LINE_SNAP_DEG = 15;

export interface ClassifyQuickShapeOptions {
  /** 이보다 낮으면 keepOriginal. 기본 0.6. */
  readonly confidenceThreshold?: number;
  /** 직선 판정: 현(chord) 대비 최대 수직 이탈 허용 비율. 기본 0.06. */
  readonly lineDeviationRatio?: number;
  /** 닫힘 판정: 전체 길이 대비 시작~끝 거리 허용 비율. 기본 0.15. */
  readonly closedRatio?: number;
  /** 타원 판정: 정규 반경의 표준편차/평균 허용 비율. 기본 0.2. */
  readonly ellipseErrorRatio?: number;
  /** 다각형 단순화 허용 오차 = simplifyRatio × bbox 대각선. 기본 0.02. */
  readonly simplifyRatio?: number;
  /** 최대 입력 점 수. 기본 1_000. */
  readonly maxPoints?: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function distance(a: QuickShapePoint, b: QuickShapePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sanitizePoints(
  points: ReadonlyArray<QuickShapePoint>,
  maxPoints: number,
): QuickShapePoint[] {
  const clean: QuickShapePoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    clean.push({ x: p.x, y: p.y });
    if (clean.length >= maxPoints) break;
  }
  return clean;
}

interface StrokeStats {
  readonly totalLength: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly diagonal: number;
}

function strokeStats(points: ReadonlyArray<QuickShapePoint>): StrokeStats {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let totalLength = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (i > 0) totalLength += distance(points[i - 1]!, p);
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  return { totalLength, minX, minY, maxX, maxY, diagonal };
}

/** 선분 ab 에 대한 점 p 의 수직 거리. */
function perpendicularDistance(
  p: QuickShapePoint,
  a: QuickShapePoint,
  b: QuickShapePoint,
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const length = Math.hypot(abx, aby);
  if (length < 1e-12) return distance(p, a);
  return Math.abs(abx * (a.y - p.y) - aby * (a.x - p.x)) / length;
}

/** Douglas-Peucker 단순화 (점열 → 점열). */
function douglasPeucker(
  points: ReadonlyArray<QuickShapePoint>,
  tolerance: number,
): QuickShapePoint[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];
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
      const d = perpendicularDistance(points[i]!, a, b);
      if (d > maxDistance) {
        maxDistance = d;
        maxIndex = i;
      }
    }
    if (maxDistance > tolerance && maxIndex >= 0) {
      keep[maxIndex] = true;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** 세 점이 만드는 내각(도). b 가 꼭짓점. */
function cornerAngleDeg(
  a: QuickShapePoint,
  b: QuickShapePoint,
  c: QuickShapePoint,
): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** shoelace 다각형 면적 (절댓값). */
function polygonArea(vertices: ReadonlyArray<QuickShapePoint>): number {
  let area = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const p = vertices[i]!;
    const q = vertices[(i + 1) % vertices.length]!;
    area += p.x * q.y - q.x * p.y;
  }
  return Math.abs(area) / 2;
}

/* ------------------------------------------------------------------ */
/* 홀드 감지                                                            */
/* ------------------------------------------------------------------ */

export interface QuickShapeHoldOptions {
  /** 홀드 임계값(ms). 기본 500. */
  readonly holdThresholdMs?: number;
}

/** 홀드 세션. 스트로크 종료 시점에 `startQuickShapeHold` 로 만든다. */
export interface QuickShapeHoldSession {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly startedAtMs: number;
  /** 앵커에서 가장 멀어진 거리(px). 홀드 유지 드래그(스케일/회전)의 입력. */
  readonly movedPx: number;
}

/**
 * 스트로크 종료(펜이 멈춘 지점) 시점에 홀드 세션을 시작한다.
 * startedAtMs 는 스트로크가 끝난 시각(ms 타임스탬프)이다.
 */
export function startQuickShapeHold(
  endPoint: QuickShapePoint,
  startedAtMs: number,
): QuickShapeHoldSession {
  return {
    anchorX: finiteNumber(endPoint.x, 0),
    anchorY: finiteNumber(endPoint.y, 0),
    startedAtMs: finiteNumber(startedAtMs, 0),
    movedPx: 0,
  };
}

export interface QuickShapeHoldUpdate {
  readonly session: QuickShapeHoldSession;
  /** 홀드 임계값에 도달했는지. */
  readonly holdReached: boolean;
  /** 경과 시간(ms). 음수가 되지 않는다. */
  readonly heldMs: number;
  /** 펜을 먼저 뗐는지. true 면 세션을 버린다. */
  readonly pointerLifted: boolean;
}

/**
 * 홀드 진행 업데이트. 포인터가 계속 닿아 있고 임계값을 넘기면
 * `holdReached: true` 가 된다. 움직임은 취소 조건이 아니라
 * 홀드 유지 드래그(스케일/회전) 입력으로 누적한다.
 */
export function updateQuickShapeHold(
  session: QuickShapeHoldSession,
  nowMs: number,
  pointer: { readonly x: number; readonly y: number; readonly down: boolean },
  options: QuickShapeHoldOptions = {},
): QuickShapeHoldUpdate {
  const threshold = Math.max(
    0,
    finiteNumber(options.holdThresholdMs, QUICK_SHAPE_DEFAULT_HOLD_MS),
  );
  const heldMs = Math.max(0, finiteNumber(nowMs, 0) - session.startedAtMs);
  if (!pointer.down) {
    return { session, holdReached: false, heldMs, pointerLifted: true };
  }
  const drift = Math.hypot(pointer.x - session.anchorX, pointer.y - session.anchorY);
  const movedPx = Math.max(session.movedPx, Number.isFinite(drift) ? drift : 0);
  return {
    session: { ...session, movedPx },
    holdReached: heldMs >= threshold,
    heldMs,
    pointerLifted: false,
  };
}

/* ------------------------------------------------------------------ */
/* 도형 분류                                                            */
/* ------------------------------------------------------------------ */

function fallbackPolyline(
  points: ReadonlyArray<QuickShapePoint>,
  confidence: number,
): QuickShapeClassification {
  return {
    kind: "polyline",
    confidence,
    isPerfect: false,
    keepOriginal: true,
    geometry: { kind: "polyline", points: [...points] },
  };
}

/**
 * 스트로크 점열 → 도형 분류.
 * 점이 6개 미만, bbox 대각선이 8px 미만이면 분류하지 않고 원본 유지를 반환한다.
 */
export function classifyQuickShape(
  rawPoints: ReadonlyArray<QuickShapePoint>,
  options: ClassifyQuickShapeOptions = {},
): QuickShapeClassification {
  const maxPoints = Math.max(8, Math.floor(finiteNumber(options.maxPoints, 1000)));
  const points = sanitizePoints(rawPoints, maxPoints);
  if (points.length < 6) {
    return fallbackPolyline(points, 0);
  }
  const stats = strokeStats(points);
  if (stats.diagonal < 8 || stats.totalLength < 1e-9) {
    return fallbackPolyline(points, 0);
  }

  const lineDeviationRatio = Math.max(
    0.01,
    finiteNumber(options.lineDeviationRatio, 0.06),
  );
  const closedRatio = Math.max(0.01, finiteNumber(options.closedRatio, 0.15));
  const ellipseErrorRatio = Math.max(
    0.01,
    finiteNumber(options.ellipseErrorRatio, 0.2),
  );
  const simplifyRatio = Math.max(
    0.005,
    finiteNumber(options.simplifyRatio, 0.02),
  );
  const confidenceThreshold = clamp01(
    finiteNumber(options.confidenceThreshold, QUICK_SHAPE_DEFAULT_CONFIDENCE_THRESHOLD),
  );

  const start = points[0]!;
  const end = points[points.length - 1]!;
  const closedness = distance(start, end) / stats.totalLength;
  const closedScore = clamp01(1 - closedness / closedRatio);

  // 1) 직선: 시작→끝 현에 대한 최대 수직 이탈이 작으면 직선.
  const chordLength = distance(start, end);
  if (chordLength > stats.diagonal * 0.5) {
    let maxDeviation = 0;
    for (const p of points) {
      const d = perpendicularDistance(p, start, end);
      if (d > maxDeviation) maxDeviation = d;
    }
    const ratio = maxDeviation / chordLength;
    if (ratio < lineDeviationRatio) {
      const confidence = clamp01(1 - ratio / lineDeviationRatio);
      return finalize(
        {
          kind: "line",
          confidence,
          isPerfect: false,
          keepOriginal: false,
          geometry: { kind: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y },
        },
        confidenceThreshold,
      );
    }
  }

  // 2) 다각형: 단순화 후 꼭짓점이 3개면 삼각형, 4개면 직사각형 후보.
  const tolerance = Math.max(1, simplifyRatio * stats.diagonal);
  const simplified = douglasPeucker(points, tolerance);
  const vertices = [...simplified];
  if (vertices.length > 1 && distance(vertices[0]!, vertices[vertices.length - 1]!) < tolerance * 2) {
    vertices.pop();
  }
  if (closedScore > 0 && vertices.length >= 3 && vertices.length <= 4) {
    const polygonResult = classifyPolygon(vertices, stats, closedScore);
    if (polygonResult) return finalize(polygonResult, confidenceThreshold);
  }

  // 3) 타원: 닫힘 + bbox 기준 정규 반경의 산포가 작으면 타원.
  if (closedScore > 0) {
    const ellipseResult = classifyEllipse(points, stats, ellipseErrorRatio, closedScore);
    if (ellipseResult) return finalize(ellipseResult, confidenceThreshold);
  }

  // 4) 폴백: 단순화된 폴리라인. 원본 유지.
  return fallbackPolyline(douglasPeucker(points, tolerance), 0.5);
}

/** 임계값 미달이면 keepOriginal 을 켠다. */
function finalize(
  classification: QuickShapeClassification,
  confidenceThreshold: number,
): QuickShapeClassification {
  if (classification.confidence < confidenceThreshold) {
    return { ...classification, keepOriginal: true };
  }
  return classification;
}

function classifyPolygon(
  vertices: ReadonlyArray<QuickShapePoint>,
  stats: StrokeStats,
  closedScore: number,
): QuickShapeClassification | null {
  const n = vertices.length;
  if (n === 3) {
    // 삼각형: 퇴화(너무 뾰족한) 꼭짓점이 없어야 한다.
    const angles = [0, 1, 2].map((i) =>
      cornerAngleDeg(vertices[(i + 2) % 3]!, vertices[i]!, vertices[(i + 1) % 3]!),
    );
    if (Math.min(...angles) < 20) return null;
    const confidence = clamp01(0.55 + 0.45 * closedScore);
    return {
      kind: "triangle",
      confidence,
      isPerfect: false,
      keepOriginal: false,
      geometry: {
        kind: "triangle",
        p1: vertices[0]!,
        p2: vertices[1]!,
        p3: vertices[2]!,
      },
    };
  }
  if (n === 4) {
    // 직사각형: 네 각이 90° 근처 + 면적이 bbox 를 충분히 채워야 한다.
    const angles = [0, 1, 2, 3].map((i) =>
      cornerAngleDeg(vertices[(i + 3) % 4]!, vertices[i]!, vertices[(i + 1) % 4]!),
    );
    const avgAngleError =
      angles.reduce((acc, a) => acc + Math.abs(a - 90), 0) / 4;
    if (avgAngleError > 15) return null;
    const bboxArea =
      Math.max(1e-9, (stats.maxX - stats.minX) * (stats.maxY - stats.minY));
    if (polygonArea(vertices) / bboxArea < 0.7) return null;
    const angleFit = clamp01(1 - avgAngleError / 15);
    const confidence = clamp01(0.4 + 0.35 * angleFit + 0.25 * closedScore);
    return {
      kind: "rectangle",
      confidence,
      isPerfect: false,
      keepOriginal: false,
      geometry: {
        kind: "rectangle",
        x: stats.minX,
        y: stats.minY,
        width: stats.maxX - stats.minX,
        height: stats.maxY - stats.minY,
      },
    };
  }
  return null;
}

function classifyEllipse(
  points: ReadonlyArray<QuickShapePoint>,
  stats: StrokeStats,
  ellipseErrorRatio: number,
  closedScore: number,
): QuickShapeClassification | null {
  const cx = (stats.minX + stats.maxX) / 2;
  const cy = (stats.minY + stats.maxY) / 2;
  const rx = Math.max(1e-9, (stats.maxX - stats.minX) / 2);
  const ry = Math.max(1e-9, (stats.maxY - stats.minY) / 2);
  // bbox 가 너무 납작하면 타원이 아니다.
  const aspect = Math.min(rx, ry) / Math.max(rx, ry);
  if (aspect < 0.25) return null;
  let sum = 0;
  let sumSq = 0;
  for (const p of points) {
    const r = Math.sqrt(((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2);
    sum += r;
    sumSq += r * r;
  }
  const mean = sum / points.length;
  if (mean < 1e-9) return null;
  const variance = Math.max(0, sumSq / points.length - mean * mean);
  const error = Math.sqrt(variance) / mean;
  if (error >= ellipseErrorRatio) return null;
  // 닫힘 정도도 신뢰도에 반영한다.
  const confidence = clamp01(
    0.45 + 0.4 * (1 - error / ellipseErrorRatio) + 0.15 * closedScore,
  );
  return {
    kind: "ellipse",
    confidence,
    isPerfect: false,
    keepOriginal: false,
    geometry: { kind: "ellipse", cx, cy, rx, ry, rotationDeg: 0 },
  };
}

/* ------------------------------------------------------------------ */
/* 완벽 도형 (두 번째 포인터)                                             */
/* ------------------------------------------------------------------ */

/** 각도를 step 도 단위로 스냅한다 (기본 15°). */
export function snapAngleToStep(angleDeg: number, stepDeg = QUICK_SHAPE_LINE_SNAP_DEG): number {
  const step = Math.max(1, finiteNumber(stepDeg, 15));
  return Math.round(finiteNumber(angleDeg, 0) / step) * step;
}

/**
 * 두 번째 포인터가 닿은 동안의 완벽 도형 변환.
 * - line: 15° 스냅 (시작점 고정)
 * - ellipse: 장·단축 중 큰 값으로 통일 → 원
 * - rectangle: 긴 변으로 통일 → 정사각형 (중심 유지)
 * - triangle: 무게중심 기준 정삼각형 (가장 먼 꼭짓점 방향을 꼭대기로)
 * - polyline: 변화 없음
 */
export function perfectifyQuickShape(
  classification: QuickShapeClassification,
): QuickShapeClassification {
  const { geometry } = classification;
  if (classification.kind === "line" && geometry.kind === "line") {
    const length = Math.hypot(geometry.x2 - geometry.x1, geometry.y2 - geometry.y1);
    const angleDeg = (Math.atan2(geometry.y2 - geometry.y1, geometry.x2 - geometry.x1) * 180) / Math.PI;
    const snapped = (snapAngleToStep(angleDeg) * Math.PI) / 180;
    return {
      ...classification,
      isPerfect: true,
      geometry: {
        kind: "line",
        x1: geometry.x1,
        y1: geometry.y1,
        x2: geometry.x1 + Math.cos(snapped) * length,
        y2: geometry.y1 + Math.sin(snapped) * length,
      },
    };
  }
  if (classification.kind === "ellipse" && geometry.kind === "ellipse") {
    const radius = Math.max(geometry.rx, geometry.ry);
    return {
      ...classification,
      isPerfect: true,
      geometry: { kind: "ellipse", cx: geometry.cx, cy: geometry.cy, rx: radius, ry: radius, rotationDeg: 0 },
    };
  }
  if (classification.kind === "rectangle" && geometry.kind === "rectangle") {
    const side = Math.max(geometry.width, geometry.height);
    const cx = geometry.x + geometry.width / 2;
    const cy = geometry.y + geometry.height / 2;
    return {
      ...classification,
      isPerfect: true,
      geometry: { kind: "rectangle", x: cx - side / 2, y: cy - side / 2, width: side, height: side },
    };
  }
  if (classification.kind === "triangle" && geometry.kind === "triangle") {
    const { p1, p2, p3 } = geometry;
    const cx = (p1.x + p2.x + p3.x) / 3;
    const cy = (p1.y + p2.y + p3.y) / 3;
    // 가장 먼 꼭짓점의 방향을 정삼각형의 꼭대기 방향으로 삼는다.
    const apexCandidates = [p1, p2, p3];
    let apex = p1;
    let apexDistance = -1;
    for (const candidate of apexCandidates) {
      const d = Math.hypot(candidate.x - cx, candidate.y - cy);
      if (d > apexDistance) {
        apexDistance = d;
        apex = candidate;
      }
    }
    const radius = (distance(p1, { x: cx, y: cy }) + distance(p2, { x: cx, y: cy }) + distance(p3, { x: cx, y: cy })) / 3;
    const apexAngle = Math.atan2(apex.y - cy, apex.x - cx);
    const vertex = (angle: number): QuickShapePoint => ({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
    return {
      ...classification,
      isPerfect: true,
      geometry: {
        kind: "triangle",
        p1: vertex(apexAngle),
        p2: vertex(apexAngle + (2 * Math.PI) / 3),
        p3: vertex(apexAngle + (4 * Math.PI) / 3),
      },
    };
  }
  return classification;
}

/* ------------------------------------------------------------------ */
/* 홀드 유지 드래그: 스케일 / 회전                                        */
/* ------------------------------------------------------------------ */

export interface QuickShapeTransform {
  /** 중심 기준 배율. 생략하면 1. */
  readonly scale?: number;
  /** 중심 기준 회전(도, 시계방향+). 생략하면 0. */
  readonly rotateDeg?: number;
  /** 회전 스냅 단위(도). 지정하면 회전각을 스냅한다. */
  readonly snapRotateDeg?: number;
}

/** 도형의 중심점. */
export function quickShapeCenter(geometry: QuickShapeGeometry): QuickShapePoint {
  switch (geometry.kind) {
    case "line":
      return { x: (geometry.x1 + geometry.x2) / 2, y: (geometry.y1 + geometry.y2) / 2 };
    case "ellipse":
      return { x: geometry.cx, y: geometry.cy };
    case "rectangle":
      return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 };
    case "triangle":
      return {
        x: (geometry.p1.x + geometry.p2.x + geometry.p3.x) / 3,
        y: (geometry.p1.y + geometry.p2.y + geometry.p3.y) / 3,
      };
    case "polyline": {
      if (geometry.points.length === 0) return { x: 0, y: 0 };
      const sum = geometry.points.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 },
      );
      return { x: sum.x / geometry.points.length, y: sum.y / geometry.points.length };
    }
  }
}

function transformPoint(
  p: QuickShapePoint,
  center: QuickShapePoint,
  scale: number,
  rotateRad: number,
): QuickShapePoint {
  const dx = (p.x - center.x) * scale;
  const dy = (p.y - center.y) * scale;
  const cos = Math.cos(rotateRad);
  const sin = Math.sin(rotateRad);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * 홀드 유지 드래그로 도형을 스케일/회전한다.
 * snapRotateDeg 를 주면 Procreate식 15° 자석 회전이 된다.
 */
export function transformQuickShapeGeometry(
  geometry: QuickShapeGeometry,
  transform: QuickShapeTransform,
): QuickShapeGeometry {
  const scale = Math.max(0.05, finiteNumber(transform.scale, 1));
  let rotateDeg = finiteNumber(transform.rotateDeg, 0);
  if (transform.snapRotateDeg !== undefined) {
    rotateDeg = snapAngleToStep(rotateDeg, transform.snapRotateDeg);
  }
  if (scale === 1 && rotateDeg === 0) return geometry;
  const center = quickShapeCenter(geometry);
  const rotateRad = (rotateDeg * Math.PI) / 180;
  const tp = (p: QuickShapePoint): QuickShapePoint =>
    transformPoint(p, center, scale, rotateRad);

  switch (geometry.kind) {
    case "line": {
      const a = tp({ x: geometry.x1, y: geometry.y1 });
      const b = tp({ x: geometry.x2, y: geometry.y2 });
      return { kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case "ellipse": {
      // 축평행 타원의 스케일만 지원. 회전은 경계 상자 기준으로 근사한다.
      if (rotateDeg !== 0) {
        const corners = [
          tp({ x: geometry.cx - geometry.rx, y: geometry.cy - geometry.ry }),
          tp({ x: geometry.cx + geometry.rx, y: geometry.cy - geometry.ry }),
          tp({ x: geometry.cx + geometry.rx, y: geometry.cy + geometry.ry }),
          tp({ x: geometry.cx - geometry.rx, y: geometry.cy + geometry.ry }),
        ];
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return {
          kind: "ellipse",
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          rx: (maxX - minX) / 2,
          ry: (maxY - minY) / 2,
          rotationDeg: 0,
        };
      }
      return {
        kind: "ellipse",
        cx: geometry.cx,
        cy: geometry.cy,
        rx: geometry.rx * scale,
        ry: geometry.ry * scale,
        rotationDeg: 0,
      };
    }
    case "rectangle": {
      if (rotateDeg !== 0) {
        // 회전된 직사각형은 외접 박스로 근사 (분류기는 축평행만 만들므로).
        const corners = [
          tp({ x: geometry.x, y: geometry.y }),
          tp({ x: geometry.x + geometry.width, y: geometry.y }),
          tp({ x: geometry.x + geometry.width, y: geometry.y + geometry.height }),
          tp({ x: geometry.x, y: geometry.y + geometry.height }),
        ];
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { kind: "rectangle", x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
      const centerX = geometry.x + geometry.width / 2;
      const centerY = geometry.y + geometry.height / 2;
      const width = geometry.width * scale;
      const height = geometry.height * scale;
      return { kind: "rectangle", x: centerX - width / 2, y: centerY - height / 2, width, height };
    }
    case "triangle":
      return { kind: "triangle", p1: tp(geometry.p1), p2: tp(geometry.p2), p3: tp(geometry.p3) };
    case "polyline":
      return { kind: "polyline", points: geometry.points.map(tp) };
  }
}

/* ------------------------------------------------------------------ */
/* SVG 렌더링 (가이드/프리뷰용)                                           */
/* ------------------------------------------------------------------ */

function roundTo(n: number, precision: number): string {
  const factor = 10 ** precision;
  return String(Math.round(n * factor) / factor);
}

/** 보정된 도형 → SVG path data. */
export function quickShapeGeometryToSvgPathData(
  geometry: QuickShapeGeometry,
  precision = 2,
): string {
  const r = (n: number): string => roundTo(n, precision);
  switch (geometry.kind) {
    case "line":
      return `M${r(geometry.x1)} ${r(geometry.y1)}L${r(geometry.x2)} ${r(geometry.y2)}`;
    case "ellipse": {
      const { cx, cy, rx, ry } = geometry;
      // 두 개의 호로 완전한 타원을 그린다.
      return (
        `M${r(cx - rx)} ${r(cy)}` +
        `A${r(rx)} ${r(ry)} 0 1 0 ${r(cx + rx)} ${r(cy)}` +
        `A${r(rx)} ${r(ry)} 0 1 0 ${r(cx - rx)} ${r(cy)}Z`
      );
    }
    case "rectangle": {
      const { x, y, width, height } = geometry;
      return (
        `M${r(x)} ${r(y)}` +
        `L${r(x + width)} ${r(y)}` +
        `L${r(x + width)} ${r(y + height)}` +
        `L${r(x)} ${r(y + height)}Z`
      );
    }
    case "triangle": {
      const { p1, p2, p3 } = geometry;
      return `M${r(p1.x)} ${r(p1.y)}L${r(p2.x)} ${r(p2.y)}L${r(p3.x)} ${r(p3.y)}Z`;
    }
    case "polyline": {
      if (geometry.points.length === 0) return "";
      const [head, ...tail] = geometry.points;
      return (
        `M${r(head!.x)} ${r(head!.y)}` +
        tail.map((p) => `L${r(p.x)} ${r(p.y)}`).join("")
      );
    }
  }
}
