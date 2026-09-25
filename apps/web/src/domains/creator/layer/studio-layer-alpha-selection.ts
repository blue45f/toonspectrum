import { flipColorRangeMask } from "../studio-color-range";
import { applyExactSelectionMask } from "../selection/studio-selection-exact-mask";
/**
 * 레이어 알파 → 선택. 확정은 원본 픽셀의 경계를 손실 없이 보존한다.
 * 아래의 축소/RDP 도우미는 maxDim을 명시한 미리보기와 기존 호출자에만 사용한다.
 * 알파 문턱(기본 128)과 스칼라 페더는 기존 PixelSelection 계약을 유지한다.
 */
import { flipMagicWandRegion, MAGIC_WAND_MAX_LOOPS, MAGIC_WAND_TRACE_MAX_DIM } from "../studio-magic-wand";
import { traceMaskRegions } from "../studio-quick-mask";
import {
  addSelectionSubpath,
  isSelectionUsable,
  SELECTION_FEATHER_RANGE,
  type PixelSelection,
  type SelPoint,
} from "../studio-selection-tools";

// ---------------------------------------------------------------------------
// (A) 상수 · 타입
// ---------------------------------------------------------------------------

/** 알파 → 선택 이진화 문턱(0..255) — 퀵 마스크의 QUICK_MASK_SELECTION_THRESHOLD와 같은 "절반" 규약. */
export const LAYER_ALPHA_SELECTION_THRESHOLD_DEFAULT = 128;
/** 추적 해상도 상한(긴 변 텍셀) — 마술봉/퀵 마스크와 같은 값이라 세 도구의 경계 체감이 일치한다. */
export const LAYER_ALPHA_TRACE_MAX_DIM = MAGIC_WAND_TRACE_MAX_DIM;
/** RDP 기본 허용오차(추적 텍셀) — 1텍셀 미만이라 계단만 펴고 실루엣은 보존한다. */
export const LAYER_ALPHA_SIMPLIFY_TOLERANCE_TEXELS = 0.75;
/** 링 1개의 꼭짓점 하드 상한 — 넘으면 허용오차 상향 → 균일 데시메이션 순으로 강제한다. */
export const LAYER_ALPHA_MAX_POINTS_PER_RING = 512;
/** 허용오차 상향 재시도 횟수 상한(매회 2배). */
const SIMPLIFY_ESCALATION_LIMIT = 8;

/** 단일 채널 알파 비트맵 — RGBA가 아니라 알파만 뽑아 든 형태. */
export type AlphaBitmap = {
  readonly width: number;
  readonly height: number;
  /** width*height, 0=완전 투명 · 255=완전 불투명. */
  readonly alpha: Uint8ClampedArray;
};

/** 추출된 닫힌 링 1개 — 정규화(0..1) 꼭짓점 배열. 첫 점과 끝 점은 중복하지 않는다(암묵 닫힘). */
export type AlphaContourRing = {
  readonly points: SelPoint[];
  /** outer = 칠해진 영역의 바깥 테두리, hole = 그 안의 구멍. */
  readonly kind: "outer" | "hole";
  /** 이 링이 속한 연결 성분 번호(0부터, traceMaskRegions 순서). */
  readonly componentIndex: number;
  /** 구멍이면 감싸는 외곽 링의 rings 배열 인덱스, 외곽이면 -1. */
  readonly parent: number;
  /** 부호 있는 면적(정규화 단위²) — 외곽은 양수, 구멍은 음수. */
  readonly signedArea: number;
};

export type TraceAlphaContourOptions = {
  /** 이진화 문턱(1..255). 기본 LAYER_ALPHA_SELECTION_THRESHOLD_DEFAULT. */
  threshold?: number;
  /** 유지할 최대 분리 성분 수. 기본 MAGIC_WAND_MAX_LOOPS. */
  maxRegions?: number;
  /** RDP 허용오차(텍셀). 0 이하면 2차 단순화를 끄고 1차 결과를 그대로 쓴다. */
  simplifyToleranceTexels?: number;
  /** 링 1개 꼭짓점 상한. 기본 LAYER_ALPHA_MAX_POINTS_PER_RING. */
  maxPointsPerRing?: number;
  /** 요소가 좌우/상하 반전 표시 중이면 true — 원본 픽셀 좌표를 표시 좌표로 되돌린다. */
  flipX?: boolean;
  flipY?: boolean;
};

// ---------------------------------------------------------------------------
// (B) 알파 비트맵 만들기 · 줄이기
// ---------------------------------------------------------------------------

function sanitizeDim(v: number): number | null {
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.max(1, Math.round(v));
}

/**
 * RGBA 평탄 배열에서 알파 채널만 뽑는다. 길이가 width*height*4 미만이면 null.
 * (ImageData.data를 그대로 넘기면 된다 — 캔버스 의존은 호출부 몫.)
 */
export function alphaBitmapFromRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): AlphaBitmap | null {
  const w = sanitizeDim(width);
  const h = sanitizeDim(height);
  if (!w || !h) return null;
  if (rgba.length < w * h * 4) return null;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i += 1) alpha[i] = rgba[i * 4 + 3] ?? 0;
  return { width: w, height: h, alpha };
}

/**
 * 추적 해상도로 줄인다 — 목적지 텍셀이 덮는 원본 픽셀 블록의 **산술 평균**(박스 필터).
 * 이미 상한 이하면 원본을 그대로 반환한다(복사 없음 — 불변 취급이라 안전).
 * 종횡비 유지, 최소 1텍셀. 결정적(부동소수 누적 순서가 스캔 순서로 고정).
 */
export function downsampleAlphaBitmap(bitmap: AlphaBitmap, maxDim = LAYER_ALPHA_TRACE_MAX_DIM): AlphaBitmap {
  const cap = Number.isFinite(maxDim) && maxDim > 0 ? Math.round(maxDim) : LAYER_ALPHA_TRACE_MAX_DIM;
  const longSide = Math.max(bitmap.width, bitmap.height);
  if (longSide <= cap) return bitmap;
  const scale = cap / longSide;
  const tw = Math.max(1, Math.round(bitmap.width * scale));
  const th = Math.max(1, Math.round(bitmap.height * scale));
  const out = new Uint8ClampedArray(tw * th);
  for (let j = 0; j < th; j += 1) {
    const sy0 = Math.floor((j * bitmap.height) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((j + 1) * bitmap.height) / th));
    for (let i = 0; i < tw; i += 1) {
      const sx0 = Math.floor((i * bitmap.width) / tw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((i + 1) * bitmap.width) / tw));
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1 && sy < bitmap.height; sy += 1) {
        const row = sy * bitmap.width;
        for (let sx = sx0; sx < sx1 && sx < bitmap.width; sx += 1) {
          sum += bitmap.alpha[row + sx]!;
          count += 1;
        }
      }
      out[j * tw + i] = count > 0 ? sum / count : 0;
    }
  }
  return { width: tw, height: th, alpha: out };
}

// ---------------------------------------------------------------------------
// (C) 링 정규화 — 방향 · 앵커 회전 · RDP 단순화
// ---------------------------------------------------------------------------

/** 신발끈 부호 있는 면적(x→오른쪽, y→아래 좌표계). 양수=외곽 방향, 음수=구멍 방향. */
function signedAreaNorm(points: readonly SelPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** 앵커 = (y, x) 사전순 최소 꼭짓점의 인덱스(동률이면 작은 인덱스). */
function anchorIndex(points: readonly SelPoint[]): number {
  let best = 0;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i]!;
    const b = points[best]!;
    if (p.y < b.y || (p.y === b.y && p.x < b.x)) best = i;
  }
  return best;
}

/** 앵커가 index 0이 되도록 회전(불변) — 추적 시작점 의존성을 제거한다. */
function rotateToAnchor(points: readonly SelPoint[]): SelPoint[] {
  if (points.length < 2) return points.slice();
  const a = anchorIndex(points);
  if (a === 0) return points.slice();
  return [...points.slice(a), ...points.slice(0, a)];
}

/** 점-선분 수직거리² (텍셀 공간). */
function perpDistSq(p: SelPoint, a: SelPoint, b: SelPoint, sx: number, sy: number): number {
  const px = p.x * sx;
  const py = p.y * sy;
  const ax = a.x * sx;
  const ay = a.y * sy;
  const bx = b.x * sx;
  const by = b.y * sy;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}

/**
 * 열린 폴리라인 RDP — keep 배열에 유지할 인덱스를 표시한다(명시 스택, 재귀 없음).
 * 같은 최대거리가 여러 곳이면 **작은 인덱스**를 고른다(결정적 타이브레이크).
 */
function rdpMark(
  pts: readonly SelPoint[],
  first: number,
  last: number,
  tolSq: number,
  sx: number,
  sy: number,
  keep: boolean[]
): void {
  const stack: [number, number][] = [[first, last]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (hi <= lo + 1) continue;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = lo + 1; i < hi; i += 1) {
      const d = perpDistSq(pts[i]!, pts[lo]!, pts[hi]!, sx, sy);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx < 0 || maxDist <= tolSq) continue;
    keep[maxIdx] = true;
    stack.push([lo, maxIdx], [maxIdx, hi]);
  }
}

/**
 * 닫힌 링 RDP — 앵커(index 0)와 앵커에서 가장 먼 점 두 곳을 고정 분할점으로 잡아 두 개의 열린
 * 폴리라인으로 나눈 뒤 각각 RDP한다(닫힌 곡선 RDP의 표준 처리 — 시작점 하나만 고정하면 그
 * 주변이 통째로 잘려 링이 찌그러진다). 결과가 3점 미만이면 원본을 돌려준다.
 */
function simplifyClosedRing(
  points: readonly SelPoint[],
  toleranceTexels: number,
  width: number,
  height: number
): SelPoint[] {
  const n = points.length;
  if (n < 4 || !(toleranceTexels > 0)) return points.slice();
  const tolSq = toleranceTexels * toleranceTexels;
  // 링을 앵커에서 앵커로 되돌아오는 열린 폴리라인(n+1점)으로 편다.
  const open: SelPoint[] = [...points, points[0]!];
  let far = 1;
  let farDist = -1;
  for (let i = 1; i < n; i += 1) {
    const dx = (points[i]!.x - points[0]!.x) * width;
    const dy = (points[i]!.y - points[0]!.y) * height;
    const d = dx * dx + dy * dy;
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const keep = new Array<boolean>(open.length).fill(false);
  keep[0] = true;
  keep[far] = true;
  keep[open.length - 1] = true;
  rdpMark(open, 0, far, tolSq, width, height, keep);
  rdpMark(open, far, open.length - 1, tolSq, width, height, keep);
  const out: SelPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    if (keep[i]) out.push(points[i]!);
  }
  return out.length >= 3 ? out : points.slice();
}

/** 균일 데시메이션(최후 수단) — 인덱스를 등간격으로 골라 하드 상한을 강제한다. */
function decimateRing(points: readonly SelPoint[], maxPoints: number): SelPoint[] {
  const n = points.length;
  if (n <= maxPoints || maxPoints < 3) return points.slice();
  const out: SelPoint[] = [];
  for (let k = 0; k < maxPoints; k += 1) {
    const idx = Math.min(n - 1, Math.round((k * n) / maxPoints));
    const p = points[idx]!;
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out.length >= 3 ? out : points.slice(0, Math.max(3, Math.min(n, maxPoints)));
}

/**
 * 링 하나를 규범형으로 만든다: (1) 방향 강제 → (2) 앵커 회전 → (3) RDP(+예산 초과 시 허용오차
 * 상향 재시도 → 균일 데시메이션) → (4) 앵커 재회전. 3점 미만이 되면 null(버림).
 */
function canonicalizeRing(
  raw: readonly SelPoint[],
  wantOuter: boolean,
  width: number,
  height: number,
  toleranceTexels: number,
  maxPoints: number
): { points: SelPoint[]; signedArea: number } | null {
  if (raw.length < 3) return null;
  let points = raw.slice();
  const area = signedAreaNorm(points);
  if (area === 0) return null;
  if (area > 0 !== wantOuter) points.reverse();
  points = rotateToAnchor(points);

  if (toleranceTexels > 0) {
    let tolerance = toleranceTexels;
    let simplified = simplifyClosedRing(points, tolerance, width, height);
    for (let attempt = 0; attempt < SIMPLIFY_ESCALATION_LIMIT && simplified.length > maxPoints; attempt += 1) {
      tolerance *= 2;
      simplified = simplifyClosedRing(points, tolerance, width, height);
    }
    points = simplified;
  }
  if (points.length > maxPoints) points = decimateRing(points, maxPoints);
  if (points.length < 3) return null;

  points = rotateToAnchor(points);
  const finalArea = signedAreaNorm(points);
  if (finalArea === 0) return null;
  if (finalArea > 0 !== wantOuter) {
    points.reverse();
    points = rotateToAnchor(points);
  }
  return { points, signedArea: signedAreaNorm(points) };
}

// ---------------------------------------------------------------------------
// (D) 알파 비트맵 → 닫힌 링
// ---------------------------------------------------------------------------

/**
 * 알파 비트맵 → 닫힌 링 배열(정규화 0..1). 비트맵은 **이미 추적 해상도**여야 한다
 * (필요하면 downsampleAlphaBitmap을 먼저 부른다 — layerAlphaToPixelSelection의 maxDim 옵션 경로가 부른다).
 * 아무것도 안 칠해져 있으면 빈 배열. 모듈 docstring의 순서·방향·꼭짓점 계약을 만족한다.
 */
export function traceAlphaContourRings(
  bitmap: AlphaBitmap,
  opts?: TraceAlphaContourOptions
): AlphaContourRing[] {
  const w = sanitizeDim(bitmap.width);
  const h = sanitizeDim(bitmap.height);
  if (!w || !h || bitmap.alpha.length !== w * h) return [];

  const rawThreshold = opts?.threshold;
  const threshold =
    Number.isFinite(rawThreshold) && rawThreshold! >= 1 && rawThreshold! <= 255
      ? Math.round(rawThreshold!)
      : LAYER_ALPHA_SELECTION_THRESHOLD_DEFAULT;
  const rawMaxRegions = opts?.maxRegions;
  const maxRegions =
    Number.isFinite(rawMaxRegions) && rawMaxRegions! >= 1 ? Math.round(rawMaxRegions!) : MAGIC_WAND_MAX_LOOPS;
  const rawTolerance = opts?.simplifyToleranceTexels;
  const tolerance = Number.isFinite(rawTolerance)
    ? Math.max(0, rawTolerance!)
    : LAYER_ALPHA_SIMPLIFY_TOLERANCE_TEXELS;
  const rawMaxPoints = opts?.maxPointsPerRing;
  const maxPoints =
    Number.isFinite(rawMaxPoints) && rawMaxPoints! >= 3
      ? Math.round(rawMaxPoints!)
      : LAYER_ALPHA_MAX_POINTS_PER_RING;
  const flipX = !!opts?.flipX;
  const flipY = !!opts?.flipY;

  const regions = traceMaskRegions(bitmap.alpha, w, h, { threshold, maxRegions });
  const rings: AlphaContourRing[] = [];
  for (let componentIndex = 0; componentIndex < regions.length; componentIndex += 1) {
    // flip은 방향을 뒤집으므로 반드시 규범화 **전에** 적용한다(canonicalizeRing이 다시 바로잡는다).
    const region = flipMagicWandRegion(regions[componentIndex]!, flipX, flipY);
    const outer = canonicalizeRing(region.outer, true, w, h, tolerance, maxPoints);
    if (!outer) continue;
    const parent = rings.length;
    rings.push({
      points: outer.points,
      kind: "outer",
      componentIndex,
      parent: -1,
      signedArea: outer.signedArea,
    });
    const holes: AlphaContourRing[] = [];
    for (const rawHole of region.holes) {
      const hole = canonicalizeRing(rawHole, false, w, h, tolerance, maxPoints);
      if (!hole) continue;
      holes.push({
        points: hole.points,
        kind: "hole",
        componentIndex,
        parent,
        signedArea: hole.signedArea,
      });
    }
    // 구멍 순서도 앵커 기준으로 고정한다 — 추적 간선 맵 순회 순서에 의존하지 않는다.
    holes.sort((a, b) => a.points[0]!.y - b.points[0]!.y || a.points[0]!.x - b.points[0]!.x);
    rings.push(...holes);
  }
  return rings;
}

// ---------------------------------------------------------------------------
// (E) 링 → PixelSelection
// ---------------------------------------------------------------------------

export type AlphaRingsToSelectionOptions = {
  /** 기존 선택(없으면 새로 만든다 — 포토샵의 Ctrl+클릭 = 치환). */
  base?: PixelSelection | null;
  /**
   * 결합 모드. add = Ctrl+Shift+클릭, subtract = Ctrl+Alt+클릭.
   * intersect는 지원하지 않는다 — 기존 intersectSelectionWithPolygon이 폴리곤 1개만 받는
   * 근사라서 다중 링(구멍 포함)에 그대로 적용하면 구멍이 무시된다. 필요하면 호출부가
   * "치환 후 intersect" 2단계로 구성한다.
   */
  mode?: "add" | "subtract";
  /** 결과 선택의 페더(표시 px). 미지정 시 base의 값(없으면 0)을 유지한다. */
  featherPx?: number;
};

/**
 * 닫힌 링 배열 → PixelSelection. 외곽 링은 mode로, 구멍 링은 반대 모드로 **배열 순서 그대로**
 * addSelectionSubpath 한다 — "마지막에 덮은 서브패스가 이긴다"는 PixelSelection 규약과
 * traceMaskRegions의 "감싸는 성분이 먼저" 순서 계약이 맞물려, 구멍 안에 떠 있는 섬(중첩 성분)이
 * 구멍에 먹히지 않는다. 이는 마술봉의 applyMagicWandRegionToSelection과 같은 접기 규칙이다.
 * 남는 게 없으면 null.
 */
export function alphaRingsToPixelSelection(
  rings: readonly AlphaContourRing[],
  opts?: AlphaRingsToSelectionOptions
): PixelSelection | null {
  const mode = opts?.mode === "subtract" ? "subtract" : "add";
  const holeMode = mode === "add" ? "subtract" : "add";
  let sel: PixelSelection | null = opts?.base ?? null;
  for (const ring of rings) {
    sel = addSelectionSubpath(sel, ring.kind === "outer" ? mode : holeMode, ring.points);
  }
  if (!sel || !isSelectionUsable(sel)) return null;
  const rawFeather = opts?.featherPx;
  if (Number.isFinite(rawFeather)) {
    const featherPx = Math.round(
      Math.min(SELECTION_FEATHER_RANGE.max, Math.max(SELECTION_FEATHER_RANGE.min, rawFeather!))
    );
    return { ...sel, featherPx };
  }
  return sel;
}

export type LayerAlphaToSelectionOptions = TraceAlphaContourOptions &
  AlphaRingsToSelectionOptions & {
    /** 미리보기 추적 해상도 상한. 생략하면 원본 픽셀로 확정한다. */
    maxDim?: number;
  };

/**
 * 레이어 알파 비트맵 → PixelSelection (한 방 진입점 — 포토샵 레이어 썸네일 Ctrl+클릭).
 * 확정은 원본 픽셀을 유지한다. maxDim을 명시한 미리보기만 기존 축소 추적을 사용한다.
 */
export function layerAlphaToPixelSelection(
  bitmap: AlphaBitmap,
  opts?: LayerAlphaToSelectionOptions
): PixelSelection | null {
  const w = sanitizeDim(bitmap.width);
  const h = sanitizeDim(bitmap.height);
  if (!w || !h || bitmap.alpha.length !== w * h) return null;
  if (opts?.maxDim === undefined) {
    const displayed = opts?.flipX || opts?.flipY ? flipColorRangeMask(bitmap, opts.flipX === true, opts.flipY === true) : bitmap;
    const result = applyExactSelectionMask(opts?.base ?? null, displayed, opts?.mode ?? (opts?.base ? "add" : "replace"), { threshold: opts?.threshold });
    return result && Number.isFinite(opts?.featherPx)
      ? { ...result, featherPx: Math.round(Math.min(SELECTION_FEATHER_RANGE.max, Math.max(SELECTION_FEATHER_RANGE.min, opts!.featherPx!))) }
      : result;
  }
  const scaled = downsampleAlphaBitmap(bitmap, opts.maxDim);
  const rings = traceAlphaContourRings(scaled, opts);
  if (rings.length === 0) return null;
  return alphaRingsToPixelSelection(rings, opts);
}
