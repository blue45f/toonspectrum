/**
 * studio-rulers.ts
 *
 * CSP "Special Rulers" 격차 보강 — 자(rulers) 순수 도메인 모델 + 스냅 수학.
 *
 * 벤치마크:
 * - Clip Studio Paint: 특수 자(Special Rulers) — 직선/곡선/동심원/방사선/퍼스펙티브 자.
 *   자를 올려놓으면 스트로크가 자에 스냅된다.
 * - Procreate: Drawing Guide (대칭·그리드) — 자 개념 없음
 * - ibisPaint/Krita: 자 기능 없음 (Krita는 어시스턴트, 방식이 다름)
 *
 * UI 복제 금지: 원리(자 위에 그으면 선이 자에 달라붙는다)와 UX 패턴만 재해석한다.
 * DOM에 의존하지 않는다. 호출자가 PointerEvent 등에서 x/y만 추출해 전달하면
 * 스냅된 좌표를 반환한다. 실제 렌더링·이벤트 바인딩은 UI 레이어가 담당한다.
 *
 * ## 스트로크 파이프라인 순서 (stroke-stabilizer.ts와 연동)
 *
 *   원시 포인터 → StrokeStabilizer.push() → snapStudioRulerPoint() → 대칭 복제(studio-symmetry.ts)
 *
 * 스태빌라이저가 먼저 손떨림을 제거하고, 그 다음 자 스냅을 적용한다.
 * 순서를 바꾸면(스냅 후 스태빌라이즈) 자에 달라붙은 선이 다시 흔들려
 * 스냅이 무너진다. 대칭 복제는 가장 마지막에 한다 — 스냅된 좌표를
 * 대칭 행렬로 복제해야 모든 짝이 자에 정확히 붙는다.
 */

/** 자 위의 2D 점. */
export interface RulerPoint {
  readonly x: number;
  readonly y: number;
}

/** 자 종류: 직선 / 곡선(2차·3차 베지어) / 동심원 / 퍼스펙티브(1–3점 소실점). */
export type StudioRulerKind = "line" | "curve" | "concentric" | "perspective";

export const STUDIO_RULER_KINDS = [
  "line",
  "curve",
  "concentric",
  "perspective",
] as const;

/** 캔버스 하나에 올릴 수 있는 자 최대 개수. */
export const STUDIO_RULERS_MAX_PER_CANVAS = 12;

export function isStudioRulerKind(value: unknown): value is StudioRulerKind {
  return (
    STUDIO_RULER_KINDS as readonly unknown[]
  ).includes(value);
}

interface StudioRulerBase {
  readonly id: string;
  readonly name: string;
  /** 자 표시/숨기기. 꺼져 있으면 렌더도 스냅도 하지 않는다. */
  readonly visible: boolean;
  /** 스냅 on/off. 꺼져 있으면 자는 보이지만 선은 자유롭게 그려진다. */
  readonly snapEnabled: boolean;
  /** 자별 색상 (CSS hex). */
  readonly color: string;
}

/** 직선 자: 두 점으로 정의된 직선에 스트로크를 투영한다. */
export interface StudioLineRuler extends StudioRulerBase {
  readonly kind: "line";
  readonly p0: RulerPoint;
  readonly p1: RulerPoint;
}

/** 곡선 자 (2차 베지어). */
export interface StudioQuadraticCurveRuler extends StudioRulerBase {
  readonly kind: "curve";
  readonly degree: 2;
  readonly p0: RulerPoint;
  readonly p1: RulerPoint;
  readonly p2: RulerPoint;
}

/** 곡선 자 (3차 베지어). */
export interface StudioCubicCurveRuler extends StudioRulerBase {
  readonly kind: "curve";
  readonly degree: 3;
  readonly p0: RulerPoint;
  readonly p1: RulerPoint;
  readonly p2: RulerPoint;
  readonly p3: RulerPoint;
}

export type StudioCurveRuler = StudioQuadraticCurveRuler | StudioCubicCurveRuler;

/**
 * 동심원 자: 중심 + 기준 반지름 + 간격 + 개수.
 * 마법진·파문·렌즈 플레어 그리기에 유용하다.
 * ellipseX/ellipseY가 1이 아니면 타원 고리가 된다.
 */
export interface StudioConcentricRuler extends StudioRulerBase {
  readonly kind: "concentric";
  readonly centerX: number;
  readonly centerY: number;
  /** 첫 번째 고리의 반지름(px). */
  readonly baseRadius: number;
  /** 고리 간 간격(px). */
  readonly ringSpacing: number;
  /** 고리 개수 (1 이상). */
  readonly ringCount: number;
  /** 타원 x축 비율 (1 = 원). */
  readonly ellipseX: number;
  /** 타원 y축 비율 (1 = 원). */
  readonly ellipseY: number;
}

/**
 * 퍼스펙티브 자: 1–3개의 소실점.
 * 스트로크는 "소실점을 지나는 직선"에 스냅된다. 어떤 소실점의 직선인지는
 * 스트로크 시작 시점의 진행 방향으로 자동 확정된다(CSP UX 재해석).
 */
export interface StudioPerspectiveRuler extends StudioRulerBase {
  readonly kind: "perspective";
  /** 소실점 1–3개. */
  readonly vanishingPoints: ReadonlyArray<RulerPoint>;
}

export type StudioRuler =
  | StudioLineRuler
  | StudioCurveRuler
  | StudioConcentricRuler
  | StudioPerspectiveRuler;

/* ------------------------------------------------------------------ */
/* 기본값 · 정규화                                                     */
/* ------------------------------------------------------------------ */

export const STUDIO_RULER_DEFAULT_COLORS: Readonly<
  Record<StudioRulerKind, string>
> = Object.freeze({
  line: "#4f9cf9",
  curve: "#7c5cff",
  concentric: "#22b8a8",
  perspective: "#f59e0b",
});

export const STUDIO_RULER_DEFAULT_NAMES: Readonly<
  Record<StudioRulerKind, string>
> = Object.freeze({
  line: "직선 자",
  curve: "곡선 자",
  concentric: "동심원 자",
  perspective: "퍼스펙티브 자",
});

const MAX_COORD = 1_000_000;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 80;

function clampCoord(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_COORD, Math.max(-MAX_COORD, n));
}

function clampPoint(value: unknown): RulerPoint {
  const v = value as { x?: unknown; y?: unknown } | null | undefined;
  return { x: clampCoord(v?.x), y: clampCoord(v?.y) };
}

/** 안전한 CSS 색상만 통과시킨다. hex(#rgb/#rrggbb)가 아니면 종류별 기본색으로 폴백. */
export function normalizeStudioRulerColor(
  value: unknown,
  kind: StudioRulerKind,
): string {
  if (
    typeof value === "string" &&
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
  ) {
    return value;
  }
  return STUDIO_RULER_DEFAULT_COLORS[kind];
}

function normalizeBase(
  kind: StudioRulerKind,
  input: {
    id?: unknown;
    name?: unknown;
    visible?: unknown;
    snapEnabled?: unknown;
    color?: unknown;
  } | null | undefined,
): StudioRulerBase {
  const rawId = typeof input?.id === "string" ? input.id.trim() : "";
  const rawName = typeof input?.name === "string" ? input.name.trim() : "";
  return {
    id:
      rawId.length > 0
        ? rawId.slice(0, MAX_ID_LENGTH)
        : `studio-ruler-${kind}`,
    name:
      rawName.length > 0
        ? rawName.slice(0, MAX_NAME_LENGTH)
        : STUDIO_RULER_DEFAULT_NAMES[kind],
    visible: input?.visible !== false,
    snapEnabled: input?.snapEnabled !== false,
    color: normalizeStudioRulerColor(input?.color, kind),
  };
}

/** 직선 자 팩토리. p0/p1이 겹치면 스냅이 비활성화된다(순수 투영 불가). */
export function createStudioLineRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  p0?: unknown;
  p1?: unknown;
}): StudioLineRuler {
  return {
    ...normalizeBase("line", input),
    kind: "line",
    p0: input?.p0 !== undefined ? clampPoint(input.p0) : { x: 40, y: 120 },
    p1: input?.p1 !== undefined ? clampPoint(input.p1) : { x: 280, y: 120 },
  };
}

/** 곡선 자 팩토리. degree 3이면 p3이 필수다. */
export function createStudioCurveRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  degree?: unknown;
  p0?: unknown;
  p1?: unknown;
  p2?: unknown;
  p3?: unknown;
}): StudioCurveRuler {
  const degree: 2 | 3 = input?.degree === 3 ? 3 : 2;
  const base = normalizeBase("curve", input);
  const p0 = input?.p0 !== undefined ? clampPoint(input.p0) : { x: 40, y: 160 };
  const p1 = input?.p1 !== undefined ? clampPoint(input.p1) : { x: 160, y: 20 };
  const p2 = input?.p2 !== undefined ? clampPoint(input.p2) : { x: 280, y: 160 };
  if (degree === 3) {
    const p3 =
      input?.p3 !== undefined ? clampPoint(input.p3) : { x: 320, y: 120 };
    return { ...base, kind: "curve", degree, p0, p1, p2, p3 };
  }
  return { ...base, kind: "curve", degree, p0, p1, p2 };
}

/** 동심원 자 팩토리. */
export function createStudioConcentricRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  centerX?: unknown;
  centerY?: unknown;
  baseRadius?: unknown;
  ringSpacing?: unknown;
  ringCount?: unknown;
  ellipseX?: unknown;
  ellipseY?: unknown;
}): StudioConcentricRuler {
  const rawSpacing = Number(input?.ringSpacing);
  const rawCount = Number(input?.ringCount);
  const rawEllipseX = Number(input?.ellipseX);
  const rawEllipseY = Number(input?.ellipseY);
  return {
    ...normalizeBase("concentric", input),
    kind: "concentric",
    centerX: input?.centerX !== undefined ? clampCoord(input.centerX) : 160,
    centerY: input?.centerY !== undefined ? clampCoord(input.centerY) : 120,
    baseRadius: Math.max(
      0,
      input?.baseRadius !== undefined ? clampCoord(input.baseRadius) : 30,
    ),
    ringSpacing: Number.isFinite(rawSpacing)
      ? Math.min(100_000, Math.max(1, rawSpacing))
      : 30,
    ringCount: Number.isFinite(rawCount)
      ? Math.min(64, Math.max(1, Math.round(rawCount)))
      : 3,
    ellipseX:
      Number.isFinite(rawEllipseX) && rawEllipseX > 0
        ? Math.min(10, rawEllipseX)
        : 1,
    ellipseY:
      Number.isFinite(rawEllipseY) && rawEllipseY > 0
        ? Math.min(10, rawEllipseY)
        : 1,
  };
}

/** 퍼스펙티브 자 팩토리. 소실점이 1–3개가 아니면 null(무효 자). */
export function createStudioPerspectiveRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  vanishingPoints?: unknown;
}): StudioPerspectiveRuler | null {
  const raw = input?.vanishingPoints;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3) return null;
  const points: RulerPoint[] = [];
  for (const entry of raw) {
    const v = entry as { x?: unknown; y?: unknown } | null | undefined;
    if (
      v === null ||
      v === undefined ||
      !Number.isFinite(Number(v.x)) ||
      !Number.isFinite(Number(v.y))
    ) {
      return null;
    }
    points.push(clampPoint(v));
  }
  return {
    ...normalizeBase("perspective", input),
    kind: "perspective",
    vanishingPoints: Object.freeze(points),
  };
}

/* ------------------------------------------------------------------ */
/* 스냅 수학                                                           */
/* ------------------------------------------------------------------ */

/**
 * 점을 두 점이 만드는 직선(무한 직선)에 투영한다.
 * p0 == p1이면 투영이 정의되지 않아 입력 그대로 반환한다.
 */
export function projectPointOnLine(
  point: RulerPoint,
  a: RulerPoint,
  b: RulerPoint,
): RulerPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { x: point.x, y: point.y };
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function evalQuadratic(
  p0: RulerPoint,
  p1: RulerPoint,
  p2: RulerPoint,
  t: number,
): RulerPoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function evalCubic(
  p0: RulerPoint,
  p1: RulerPoint,
  p2: RulerPoint,
  p3: RulerPoint,
  t: number,
): RulerPoint {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return {
    x: u2 * u * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t2 * t * p3.x,
    y: u2 * u * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t2 * t * p3.y,
  };
}

export interface StudioBezierSnapResult {
  readonly point: RulerPoint;
  /** 곡선 위 매개변수 t (0–1). */
  readonly t: number;
  readonly distance: number;
}

/**
 * 2차/3차 베지어 곡선 위의 최근접점을 찾는다.
 * 64구간 조밀 샘플링으로 후보 t를 잡고, 6회 국소 세분화로 정밀화한다.
 * 결정적(deterministic)이며 반복문 횟수가 고정되어 있다.
 */
export function nearestPointOnBezier(
  controls: ReadonlyArray<RulerPoint>,
  point: RulerPoint,
): StudioBezierSnapResult {
  const degree = controls.length - 1;
  const evaluate =
    degree === 3
      ? (t: number) =>
          evalCubic(controls[0], controls[1], controls[2], controls[3], t)
      : (t: number) => evalQuadratic(controls[0], controls[1], controls[2], t);

  let bestT = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  const SEGMENTS = 64;
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    const p = evaluate(t);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  // 국소 세분화: 윈도우를 절반씩 줄이며 6회 정밀화
  let window = 1 / SEGMENTS;
  for (let round = 0; round < 6; round += 1) {
    window /= 2;
    for (const candidate of [bestT - window, bestT + window]) {
      if (candidate < 0 || candidate > 1) continue;
      const p = evaluate(candidate);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        bestT = candidate;
      }
    }
  }
  return { point: evaluate(bestT), t: bestT, distance: bestDist };
}

export interface StudioConcentricSnapResult {
  readonly point: RulerPoint;
  /** 스냅된 고리 인덱스 (0 = 가장 안쪽). */
  readonly ringIndex: number;
  /** 스냅된 고리의 반지름. */
  readonly radius: number;
}

/**
 * 동심원(타원) 자 스냅: 타원 정규화 공간에서 각도는 유지하고,
 * 반지름을 가장 가까운 고리에 맞춘다.
 */
export function snapPointToConcentricRuler(
  ruler: StudioConcentricRuler,
  point: RulerPoint,
): StudioConcentricSnapResult {
  const cx = ruler.centerX;
  const cy = ruler.centerY;
  const ex = ruler.ellipseX;
  const ey = ruler.ellipseY;
  const dx = (point.x - cx) / ex;
  const dy = (point.y - cy) / ey;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) {
    return { point: { x: cx, y: cy }, ringIndex: 0, radius: ruler.baseRadius };
  }
  const rawIndex = Math.round((dist - ruler.baseRadius) / ruler.ringSpacing);
  const ringIndex = Math.min(
    ruler.ringCount - 1,
    Math.max(0, rawIndex),
  );
  const radius = ruler.baseRadius + ringIndex * ruler.ringSpacing;
  const angle = Math.atan2(dy, dx);
  return {
    point: {
      x: cx + Math.cos(angle) * radius * ex,
      y: cy + Math.sin(angle) * radius * ey,
    },
    ringIndex,
    radius,
  };
}

/* ---------------- 퍼스펙티브 자 (세션 기반) ---------------- */

/**
 * 퍼스펙티브 스냅 세션. 스트로크 1개 = 세션 1개.
 * guideVanishingPointIndex가 -1이면 아직 가이드가 확정되지 않은 상태다.
 */
export interface StudioPerspectiveSnapSession {
  readonly rulerId: string;
  readonly start: RulerPoint;
  readonly guideVanishingPointIndex: number;
}

export function beginStudioPerspectiveSnapSession(
  ruler: StudioPerspectiveRuler,
  start: RulerPoint,
): StudioPerspectiveSnapSession {
  return { rulerId: ruler.id, start, guideVanishingPointIndex: -1 };
}

function wrapPi(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export interface StudioPerspectiveSnapResult {
  readonly session: StudioPerspectiveSnapSession;
  readonly point: RulerPoint;
  readonly snapped: boolean;
}

/**
 * 퍼스펙티브 자에 한 샘플을 스냅한다.
 * - 첫 샘플(start)과 겹치는 지점이면 가이드를 확정하지 않는다.
 * - 처음 움직인 방향과 가장 잘 맞는 소실점을 골라 가이드(소실점→start 직선)를 확정한다.
 * - 이후 샘플은 그 가이드 직선에 투영한다.
 */
export function snapStudioPerspectivePoint(
  ruler: StudioPerspectiveRuler,
  session: StudioPerspectiveSnapSession,
  sample: RulerPoint,
): StudioPerspectiveSnapResult {
  const vps = ruler.vanishingPoints;
  if (vps.length === 0) {
    return { session, point: sample, snapped: false };
  }
  if (session.guideVanishingPointIndex >= 0) {
    const vp = vps[session.guideVanishingPointIndex];
    return {
      session,
      point: projectPointOnLine(sample, vp, session.start),
      snapped: true,
    };
  }
  const moved = Math.hypot(sample.x - session.start.x, sample.y - session.start.y);
  if (moved < 1e-9) {
    return { session, point: sample, snapped: false };
  }
  const moveAngle = Math.atan2(sample.y - session.start.y, sample.x - session.start.x);
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < vps.length; i += 1) {
    const rayAngle = Math.atan2(
      session.start.y - vps[i].y,
      session.start.x - vps[i].x,
    );
    const score = Math.abs(wrapPi(rayAngle - moveAngle));
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  const locked: StudioPerspectiveSnapSession = {
    ...session,
    guideVanishingPointIndex: bestIndex,
  };
  return {
    session: locked,
    point: projectPointOnLine(sample, vps[bestIndex], session.start),
    snapped: true,
  };
}

/* ---------------- 종류 무관 디스패치 ---------------- */

export type StudioRulerSnapState =
  | { readonly kind: "perspective"; readonly session: StudioPerspectiveSnapSession }
  | null;

export interface StudioRulerSnapResult {
  /** 다음 샘플에 그대로 넘길 상태 (퍼스펙티브 외에는 null). */
  readonly state: StudioRulerSnapState;
  readonly point: RulerPoint;
  readonly snapped: boolean;
}

/**
 * 자 종류에 관계없이 스트로크 샘플 1개를 스냅한다.
 *
 * - ruler.visible === false 이거나 ruler.snapEnabled === false → 스냅하지 않고
 *   입력 그대로 반환한다 (state도 버린다).
 * - 퍼스펙티브 자는 세션 기반: state가 null이면 sample을 스트로크 시작으로 보고
 *   새 세션을 연다. 같은 스트로크에서는 이전 호출이 반환한 state를 그대로 넘긴다.
 * - 나머지 종류는 상태가 필요 없어 state는 항상 null이다.
 */
export function snapStudioRulerPoint(
  ruler: StudioRuler,
  point: RulerPoint,
  state: StudioRulerSnapState = null,
): StudioRulerSnapResult {
  if (!ruler.visible || !ruler.snapEnabled) {
    return { state: null, point, snapped: false };
  }
  switch (ruler.kind) {
    case "line": {
      if (Math.hypot(ruler.p1.x - ruler.p0.x, ruler.p1.y - ruler.p0.y) < 1e-9) {
        return { state: null, point, snapped: false };
      }
      return {
        state: null,
        point: projectPointOnLine(point, ruler.p0, ruler.p1),
        snapped: true,
      };
    }
    case "curve": {
      const controls =
        ruler.degree === 3
          ? [ruler.p0, ruler.p1, ruler.p2, ruler.p3]
          : [ruler.p0, ruler.p1, ruler.p2];
      return {
        state: null,
        point: nearestPointOnBezier(controls, point).point,
        snapped: true,
      };
    }
    case "concentric": {
      return {
        state: null,
        point: snapPointToConcentricRuler(ruler, point).point,
        snapped: true,
      };
    }
    case "perspective": {
      const session =
        state?.kind === "perspective" && state.session.rulerId === ruler.id
          ? state.session
          : beginStudioPerspectiveSnapSession(ruler, point);
      const result = snapStudioPerspectivePoint(ruler, session, point);
      return {
        state: { kind: "perspective", session: result.session },
        point: result.point,
        snapped: result.snapped,
      };
    }
  }
}
