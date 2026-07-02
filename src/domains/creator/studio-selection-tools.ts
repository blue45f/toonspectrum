/**
 * Studio Selection Tools — 픽셀 선택 도구(포토샵식 마퀴/올가미) 순수 코어.
 *
 * ⚠️ 이름이 비슷한 studio-selection.ts 와는 **다른 개념**이다:
 *   - studio-selection.ts       : "요소 선택" — 캔버스 위 요소(El)들을 마퀴로 다중 선택/정렬.
 *   - studio-selection-tools.ts : "픽셀 선택" — 한 이미지 요소 **안쪽 픽셀 영역**을
 *     사각/타원/올가미로 선택해 부분 조정(밝기/색조)·부분 삭제를 가하는 도구.
 *
 * 좌표 규약 3계층:
 *   1. 정규화(u,v 0..1)  — 이미지 요소의 비회전 로컬 박스 기준. 선택 영역의 저장 형식.
 *      요소를 리사이즈해도 선택이 함께 따라간다(해상도 무관).
 *   2. 요소 로컬 px       — u*width, v*height. 마칭앤츠 오버레이용(회전은 Konva Group 이 적용).
 *   3. 마스크 디바이스 px — u*naturalWidth. 원본 해상도 오프스크린 마스크 래스터용.
 *
 * 마스크 래스터 의미론(순차 덮어쓰기):
 *   합치기(add)=fill(source-over), 빼기(subtract)=erase(destination-out)를 서브패스 순서대로
 *   칠한다 → 픽셀의 최종 상태는 "그 픽셀을 덮는 마지막 서브패스의 모드". pointInSelection 이
 *   동일 규칙을 수식으로 구현해 히트테스트와 래스터 결과가 항상 일치한다.
 *   feather 는 완성된 하드 마스크 전체에 blur(px) 한 번, invert 는 맨 마지막에 알파 반전.
 *
 * DOM 의존성 없음 — 캔버스에 실제로 그리는 함수(paintSelectionMaskSteps 등)도 구조 타입
 * (MaskCtx2DLike)과 주입 팩토리(SelectionCanvasFactory)만 받아 순수하게 유지한다.
 * 실제 CanvasRenderingContext2D/HTMLCanvasElement 는 구조상 호환된다(테스트에서 컴파일 검증).
 * 모두 결정적(랜덤·Date 없음) — 마칭앤츠도 경과시간을 인자로 받는다.
 */

// ---------------------------------------------------------------------------
// 타입·상수
// ---------------------------------------------------------------------------

/** 정규화 점 — 이미지 요소 비회전 로컬 박스 기준 0..1(올가미는 살짝 벗어남 허용). */
export type SelPoint = { x: number; y: number };

/** 픽셀 선택 도구 종류 — 전부 최종적으로 폴리곤(정규화)으로 수렴한다. */
export type SelectionToolKind = "rect" | "ellipse" | "lasso";

/** 서브패스 결합 모드 — 합치기(fill) / 빼기(erase). */
export type SelectionCombineMode = "add" | "subtract";

/** 선택 서브패스 — 도구와 무관하게 폴리곤(≥3점, 자동 닫힘)으로 저장한다. */
export type SelectionSubpath = { mode: SelectionCombineMode; points: SelPoint[] };

/** 픽셀 선택 영역 전체 상태 — 이미지 요소 1개에 귀속된다(요소 전환 시 해제). */
export type PixelSelection = {
  subpaths: SelectionSubpath[];
  /** 가장자리 페더(px) — 캔버스 표시 px 기준. 래스터 시 featherScale 로 원본 px 환산. */
  featherPx: number;
  /** 반전 — 서브패스 바깥을 선택(서브패스 0개 + 반전 = 전체 선택). */
  invert: boolean;
};

/** 페더 슬라이더 범위(캔버스 표시 px). */
export const SELECTION_FEATHER_RANGE = { min: 0, max: 60, step: 1 } as const;
/** 선택 영역 밝기 조정 범위(%p — 0=변화 없음). */
export const SELECTION_BRIGHTNESS_RANGE = { min: -100, max: 100, step: 1 } as const;
/** 선택 영역 색조 회전 범위(° — 0=변화 없음). */
export const SELECTION_HUE_RANGE = { min: -180, max: 180, step: 1 } as const;

/** 타원 → 폴리곤 근사 분할 수(기본). 48이면 픽셀 마스크에서 사실상 매끈하다. */
export const ELLIPSE_POLYGON_SEGMENTS = 48;
/** 올가미 이웃 점 최소 간격(정규화) — 이보다 가까우면 궤적에 추가하지 않는다. */
export const LASSO_MIN_POINT_DIST = 0.004;
/** 의미 있는 서브패스 최소 면적(정규화 단위²) — 우발 클릭/찰나 드래그 제외. */
export const MIN_SELECTION_SUBPATH_AREA = 0.00001;
/** 올가미 점 허용 범위 — 박스를 살짝 벗어난 드래그를 보존(마스크 캔버스가 어차피 클립). */
const SEL_POINT_MIN = -0.25;
const SEL_POINT_MAX = 1.25;
/** 원본 해상도 환산 후 페더 상한(px) — 비정상 배율로 인한 과도한 blur 방지. */
const MAX_DEVICE_FEATHER_PX = 250;

/** 도구 선택 칩 목록 — 패널에서 id/라벨/설명으로 사용. */
export const SELECTION_TOOLS: { id: SelectionToolKind; label: string; tip: string }[] = [
  { id: "rect", label: "사각형", tip: "드래그한 사각형 안쪽 픽셀을 선택합니다." },
  { id: "ellipse", label: "타원", tip: "드래그한 박스에 내접하는 타원 안쪽을 선택합니다." },
  { id: "lasso", label: "올가미", tip: "자유롭게 그린 궤적 안쪽을 선택합니다(자동 닫힘)." },
];

/** 결합 모드 칩 목록. */
export const SELECTION_COMBINE_MODES: { id: SelectionCombineMode; label: string; tip: string }[] = [
  { id: "add", label: "합치기", tip: "기존 선택 영역에 새 영역을 더합니다." },
  { id: "subtract", label: "빼기", tip: "기존 선택 영역에서 새 영역을 뺍니다." },
];

// ---------------------------------------------------------------------------
// 내부 수치 헬퍼
// ---------------------------------------------------------------------------

/** 비유한 값을 fallback 으로, 나머지는 [lo, hi]로 클램프. */
function clampNum(v: number, lo: number, hi: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

/** 정규화 점 위생 처리 — NaN 방어 + 도구별 허용 범위 클램프. */
function sanitizePoint(p: SelPoint, lo: number, hi: number): SelPoint {
  return { x: clampNum(p.x, lo, hi), y: clampNum(p.y, lo, hi) };
}

// ---------------------------------------------------------------------------
// (1) 도구 → 정규화 폴리곤
// ---------------------------------------------------------------------------

/** 사각형 선택 — 드래그 시작/끝(순서 무관)을 0..1로 클램프한 4점 폴리곤으로. */
export function rectSelectionPolygon(a: SelPoint, b: SelPoint): SelPoint[] {
  // 각 입력을 먼저 위생 처리(NaN→0) — min/max 에 NaN 이 들어가 양끝을 같이 오염시키지 않도록.
  const ax = clampNum(a.x, 0, 1);
  const ay = clampNum(a.y, 0, 1);
  const bx = clampNum(b.x, 0, 1);
  const by = clampNum(b.y, 0, 1);
  const x1 = Math.min(ax, bx);
  const x2 = Math.max(ax, bx);
  const y1 = Math.min(ay, by);
  const y2 = Math.max(ay, by);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

/** 타원 선택 — 드래그 박스 내접 타원을 segments 각형 폴리곤으로 근사(0..1 클램프). */
export function ellipseSelectionPolygon(
  a: SelPoint,
  b: SelPoint,
  segments = ELLIPSE_POLYGON_SEGMENTS
): SelPoint[] {
  const n = Math.round(clampNum(segments, 8, 96, ELLIPSE_POLYGON_SEGMENTS));
  const cx = (clampNum(a.x, 0, 1) + clampNum(b.x, 0, 1)) / 2;
  const cy = (clampNum(a.y, 0, 1) + clampNum(b.y, 0, 1)) / 2;
  const rx = Math.abs(clampNum(b.x, 0, 1) - clampNum(a.x, 0, 1)) / 2;
  const ry = Math.abs(clampNum(b.y, 0, 1) - clampNum(a.y, 0, 1)) / 2;
  const pts: SelPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: clampNum(cx + rx * Math.cos(t), 0, 1), y: clampNum(cy + ry * Math.sin(t), 0, 1) });
  }
  return pts;
}

/**
 * 올가미 궤적에 점 추가 — 마지막 점과 minDist 미만이면 기존 배열을 그대로 반환(추가 없음).
 * 불변: 추가 시 새 배열을 만든다(React 상태로 바로 쓸 수 있음).
 */
export function appendLassoPoint(
  points: readonly SelPoint[],
  p: SelPoint,
  minDist = LASSO_MIN_POINT_DIST
): SelPoint[] {
  const next = sanitizePoint(p, SEL_POINT_MIN, SEL_POINT_MAX);
  const last = points[points.length - 1];
  if (last) {
    const dx = next.x - last.x;
    const dy = next.y - last.y;
    if (dx * dx + dy * dy < minDist * minDist) return points as SelPoint[];
  }
  return [...points, next];
}

/**
 * 올가미 폴리곤 단순화 — 이웃 중복점 제거 + 일직선 위 중간점 제거 + 시작·끝 중복 닫음 제거.
 * 마스크 품질은 유지하면서 문서에 저장되는 점 수를 줄인다.
 */
export function simplifyLassoPolygon(points: readonly SelPoint[], minDist = LASSO_MIN_POINT_DIST): SelPoint[] {
  const dedup: SelPoint[] = [];
  for (const raw of points) {
    const p = sanitizePoint(raw, SEL_POINT_MIN, SEL_POINT_MAX);
    const last = dedup[dedup.length - 1];
    if (last) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < minDist * minDist) continue;
    }
    dedup.push(p);
  }
  // 폴리곤은 자동으로 닫히므로 마지막 점이 첫 점과 겹치면 버린다.
  if (dedup.length >= 2) {
    const first = dedup[0]!;
    const last = dedup[dedup.length - 1]!;
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    if (dx * dx + dy * dy < minDist * minDist) dedup.pop();
  }
  if (dedup.length < 3) return dedup;
  // 일직선 위 중간점 제거 — 외적(교차곱)이 0에 가까우면 꺾임이 없는 점.
  const out: SelPoint[] = [];
  const EPS = 1e-9;
  for (let i = 0; i < dedup.length; i += 1) {
    const prev = out[out.length - 1] ?? dedup[(i + dedup.length - 1) % dedup.length]!;
    const cur = dedup[i]!;
    const next = dedup[(i + 1) % dedup.length]!;
    const cross = (cur.x - prev.x) * (next.y - prev.y) - (cur.y - prev.y) * (next.x - prev.x);
    if (Math.abs(cross) > EPS || out.length < 1) out.push(cur);
  }
  return out.length >= 3 ? out : dedup;
}

// ---------------------------------------------------------------------------
// (2) 폴리곤 기하 — 면적·포함 판정
// ---------------------------------------------------------------------------

/** 신발끈 공식 절대 면적(정규화 단위²). 점 3개 미만이면 0. */
export function polygonAreaNorm(points: readonly SelPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/** 점-폴리곤 포함 판정(even-odd 레이 캐스팅) — 경계는 근사 포함. */
export function pointInPolygon(p: SelPoint, poly: readonly SelPoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    const crossesY = a.y > p.y !== b.y > p.y;
    if (crossesY && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// (3) 선택 상태 — 생성·결합(합집합/빼기)·페더·반전 (전부 불변)
// ---------------------------------------------------------------------------

/** 빈 선택 상태 — 서브패스 0개, 페더 0, 반전 없음. */
export function emptyPixelSelection(): PixelSelection {
  return { subpaths: [], featherPx: 0, invert: false };
}

/**
 * 서브패스 추가(합치기/빼기 결합) — 점 위생 처리 후 면적이 무의미하면 기존 선택을 그대로 반환.
 * sel 이 null 이면 빈 선택에서 시작한다.
 */
export function addSelectionSubpath(
  sel: PixelSelection | null,
  mode: SelectionCombineMode,
  points: readonly SelPoint[]
): PixelSelection | null {
  const clean = points.map((p) => sanitizePoint(p, SEL_POINT_MIN, SEL_POINT_MAX));
  if (clean.length < 3 || polygonAreaNorm(clean) < MIN_SELECTION_SUBPATH_AREA) return sel;
  const base = sel ?? emptyPixelSelection();
  return { ...base, subpaths: [...base.subpaths, { mode, points: clean }] };
}

/** 마지막 서브패스 한 단계 되돌리기 — 남는 게 없고 반전도 없으면 null(선택 해제). */
export function removeLastSubpath(sel: PixelSelection): PixelSelection | null {
  if (sel.subpaths.length === 0) return sel.invert ? sel : null;
  const subpaths = sel.subpaths.slice(0, -1);
  if (subpaths.length === 0 && !sel.invert) return null;
  return { ...sel, subpaths };
}

/** 페더(px) 설정 — 범위 클램프 + 정수 반올림. */
export function setSelectionFeather(sel: PixelSelection, px: number): PixelSelection {
  return { ...sel, featherPx: Math.round(clampNum(px, SELECTION_FEATHER_RANGE.min, SELECTION_FEATHER_RANGE.max)) };
}

/** 반전 토글 — 서브패스 0개 + 반전 = 전체 선택(Ctrl+A 상당). */
export function toggleSelectionInvert(sel: PixelSelection): PixelSelection {
  return { ...sel, invert: !sel.invert };
}

/** 조정을 가할 수 있는 선택인지 — 반전이거나, 합치기 서브패스가 1개 이상. */
export function isSelectionUsable(sel: PixelSelection | null): boolean {
  if (!sel) return false;
  return sel.invert || sel.subpaths.some((sp) => sp.mode === "add");
}

/**
 * 점이 최종 선택 영역 안인지 — 래스터와 동일한 "마지막 덮는 서브패스" 의미론 + 반전.
 * (fill 은 폴리곤 안을 불투명으로, erase 는 투명으로 만들므로 마지막 서브패스가 이긴다.)
 */
export function pointInSelection(sel: PixelSelection | null, p: SelPoint): boolean {
  if (!sel) return false;
  let inside = false;
  for (const sp of sel.subpaths) {
    if (pointInPolygon(p, sp.points)) inside = sp.mode === "add";
  }
  return sel.invert ? !inside : inside;
}

/** 선택 영역의 정규화 bbox — 반전이면 전체 박스, 쓸 수 없는 선택이면 null. */
export function selectionBoundsNorm(sel: PixelSelection | null): { x: number; y: number; w: number; h: number } | null {
  if (!isSelectionUsable(sel)) return null;
  if (sel!.invert) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sp of sel!.subpaths) {
    if (sp.mode !== "add") continue; // 빼기는 영역을 넓히지 못한다.
    for (const p of sp.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const x = clampNum(minX, 0, 1);
  const y = clampNum(minY, 0, 1);
  return { x, y, w: clampNum(maxX, 0, 1) - x, h: clampNum(maxY, 0, 1) - y };
}

// ---------------------------------------------------------------------------
// (4) 드래그 세션 — StudioPage 포인터 핸들러가 쓰는 얇은 순수 리듀서
// ---------------------------------------------------------------------------

/** 진행 중 드래그 상태 — points 는 실시간 미리보기 폴리곤(정규화)으로 바로 그릴 수 있다. */
export type SelectionDragState = {
  tool: SelectionToolKind;
  mode: SelectionCombineMode;
  start: SelPoint;
  points: SelPoint[];
};

/** 드래그 시작 — 시작점 기준의 퇴화 폴리곤(면적 0)으로 초기화한다. */
export function beginSelectionDrag(tool: SelectionToolKind, mode: SelectionCombineMode, p: SelPoint): SelectionDragState {
  const start = sanitizePoint(p, SEL_POINT_MIN, SEL_POINT_MAX);
  const points = tool === "lasso" ? [start] : rectSelectionPolygon(start, start);
  return { tool, mode, start, points };
}

/** 드래그 이동 — rect/ellipse 는 시작→현재 박스로 재계산, lasso 는 궤적 누적. */
export function updateSelectionDrag(drag: SelectionDragState, p: SelPoint): SelectionDragState {
  if (drag.tool === "lasso") {
    const points = appendLassoPoint(drag.points, p);
    return points === drag.points ? drag : { ...drag, points };
  }
  const points = drag.tool === "rect" ? rectSelectionPolygon(drag.start, p) : ellipseSelectionPolygon(drag.start, p);
  return { ...drag, points };
}

/**
 * 드래그 확정 — 올가미는 단순화 후 서브패스로 결합. 면적이 무의미하면 null(변화 없음 신호).
 * 반환값이 null 이 아니면 그대로 선택 상태로 set 하면 된다.
 */
export function commitSelectionDrag(sel: PixelSelection | null, drag: SelectionDragState): PixelSelection | null {
  const points = drag.tool === "lasso" ? simplifyLassoPolygon(drag.points) : drag.points;
  if (points.length < 3 || polygonAreaNorm(points) < MIN_SELECTION_SUBPATH_AREA) return null;
  const next = addSelectionSubpath(sel, drag.mode, points);
  return next === sel ? null : next;
}

// ---------------------------------------------------------------------------
// (5) 좌표 변환 — 캔버스 포인터 ↔ 정규화 (요소 회전 포함)
// ---------------------------------------------------------------------------

/** 이미지 요소 배치 프레임 — Konva 노드와 동일하게 회전은 좌상단(x,y) 기준 도(deg). */
export type SelectionFrame = { x: number; y: number; width: number; height: number; rotation?: number };

/** 캔버스 좌표 → 정규화 좌표 — 요소 역변환(이동→역회전→크기 나눔). 클램프하지 않는다. */
export function canvasPointToNormalized(px: number, py: number, frame: SelectionFrame): SelPoint {
  const w = Number.isFinite(frame.width) && frame.width !== 0 ? frame.width : 1;
  const h = Number.isFinite(frame.height) && frame.height !== 0 ? frame.height : 1;
  const dx = px - frame.x;
  const dy = py - frame.y;
  const theta = ((frame.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // R(-θ)·(p - t): 회전된 요소 위 포인터를 비회전 로컬로 되돌린다.
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return { x: clampNum(lx / w, -1e6, 1e6), y: clampNum(ly / h, -1e6, 1e6) };
}

/** 정규화 좌표 → 캔버스 좌표 — canvasPointToNormalized 의 역변환. */
export function normalizedPointToCanvas(p: SelPoint, frame: SelectionFrame): { x: number; y: number } {
  const theta = ((frame.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const lx = p.x * frame.width;
  const ly = p.y * frame.height;
  return { x: frame.x + lx * cos - ly * sin, y: frame.y + lx * sin + ly * cos };
}

/** 서브패스 → 요소 로컬 px 평탄 배열([x0,y0,x1,y1,…]) — Konva Line(points, closed)용. */
export function subpathOutlinePoints(subpath: SelectionSubpath, size: { width: number; height: number }): number[] {
  const out: number[] = [];
  for (const p of subpath.points) {
    out.push(p.x * size.width, p.y * size.height);
  }
  return out;
}

// ---------------------------------------------------------------------------
// (6) 마칭앤츠 — 대시 오프셋 애니메이션 파라미터
// ---------------------------------------------------------------------------

/** 마칭앤츠 대시 패턴(px) — [칠함, 빔]. 합(9px)이 한 주기. */
export const MARCHING_ANTS_DASH: readonly [number, number] = [5, 4];
/** 개미 행진 속도(px/초) — 화면 픽셀 기준. */
export const MARCHING_ANTS_SPEED_PX_PER_SEC = 18;

/**
 * 경과시간(ms) → 대시 오프셋(px). 음수 방향(전진)으로 흐르고 주기로 접어 수치가 안 커진다.
 * 결정적: 같은 elapsedMs 는 항상 같은 오프셋(비유한 입력은 0).
 */
export function marchingAntsDashOffset(
  elapsedMs: number,
  speedPxPerSec = MARCHING_ANTS_SPEED_PX_PER_SEC,
  cyclePx = MARCHING_ANTS_DASH[0] + MARCHING_ANTS_DASH[1]
): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(speedPxPerSec) || !Number.isFinite(cyclePx) || cyclePx <= 0) {
    return 0;
  }
  const offset = -(((elapsedMs / 1000) * speedPxPerSec) % cyclePx);
  return offset === 0 ? 0 : offset; // -0 정규화
}

/** 마칭앤츠 한 획 파라미터 — Konva Line 의 stroke/dash/dashOffset/strokeWidth 에 대응. */
export type MarchingAntsPass = {
  stroke: string;
  dash: [number, number] | null; // null = 실선(밑줄 패스)
  dashOffset: number;
  strokeWidth: number;
};

/**
 * 마칭앤츠 2패스 — 흰 실선 밑줄 + 어두운 대시(행진)로 어떤 배경에서도 보인다.
 * scale 은 스테이지 줌(effScale) — 화면 px 두께가 일정하도록 나눠 준다.
 */
export function marchingAntsPasses(elapsedMs: number, scale = 1): MarchingAntsPass[] {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const width = 1.6 / s;
  return [
    { stroke: "#ffffff", dash: null, dashOffset: 0, strokeWidth: width },
    {
      stroke: "#18181b",
      dash: [MARCHING_ANTS_DASH[0] / s, MARCHING_ANTS_DASH[1] / s],
      dashOffset: marchingAntsDashOffset(elapsedMs) / s,
      strokeWidth: width,
    },
  ];
}

// ---------------------------------------------------------------------------
// (7) 마스크 래스터화 — 파라미터 계산(순수) + ctx 실행(구조 타입 주입)
// ---------------------------------------------------------------------------

/** 마스크 그리기 한 단계 — 디바이스 px 폴리곤을 fill(합치기)/erase(빼기)로 칠한다. */
export type SelectionMaskStep = { op: "fill" | "erase"; points: [number, number][] };

/** 오프스크린 알파 마스크 래스터화 계획 — 계산은 순수, 실행은 ctx 주입. */
export type SelectionMaskPlan = {
  /** 마스크 캔버스 크기(원본 이미지 px). */
  width: number;
  height: number;
  /** 서브패스 순서 그대로의 그리기 단계. */
  steps: SelectionMaskStep[];
  /** 디바이스 px 로 환산된 페더 blur 반경(0=하드 엣지). */
  featherPx: number;
  /** 마지막에 알파 반전 여부. */
  invert: boolean;
};

/**
 * 선택 → 마스크 래스터화 계획.
 * @param imageW/imageH 원본(자연) 픽셀 크기 — 마스크 캔버스 크기가 된다.
 * @param opts.featherScale 표시 px→디바이스 px 환산 배율(예: naturalWidth / el.width). 기본 1.
 * @param opts.flipX/flipY 요소가 좌우/상하 반전 표시 중이면 true — 선택은 화면(반전된 모습)
 *        기준으로 그려지므로 원본 픽셀에 적용하려면 마스크 좌표를 되반전해야 한다.
 */
export function buildSelectionMaskPlan(
  sel: PixelSelection | null,
  imageW: number,
  imageH: number,
  opts?: { featherScale?: number; flipX?: boolean; flipY?: boolean }
): SelectionMaskPlan | null {
  if (!isSelectionUsable(sel)) return null;
  if (!Number.isFinite(imageW) || !Number.isFinite(imageH) || imageW <= 0 || imageH <= 0) return null;
  const width = Math.max(1, Math.round(imageW));
  const height = Math.max(1, Math.round(imageH));
  const rawScale = opts?.featherScale;
  const featherScale = Number.isFinite(rawScale) && rawScale! > 0 ? rawScale! : 1;
  const featherPx = clampNum(Math.round(sel!.featherPx * featherScale * 10) / 10, 0, MAX_DEVICE_FEATHER_PX);
  const steps: SelectionMaskStep[] = sel!.subpaths.map((sp) => ({
    op: sp.mode === "add" ? "fill" : "erase",
    points: sp.points.map((p): [number, number] => {
      const x = p.x * width;
      const y = p.y * height;
      return [opts?.flipX ? width - x : x, opts?.flipY ? height - y : y];
    }),
  }));
  return { width, height, steps, featherPx, invert: sel!.invert };
}

/** drawImage 소스의 최소 표현 — 실제로는 HTMLCanvasElement/HTMLImageElement 등. */
export type MaskImageSource = object;

/** 캔버스의 최소 구조 — 크기만 요구(실제로는 HTMLCanvasElement). */
export type MaskCanvasLike = { width: number; height: number };

/**
 * 2D 컨텍스트 최소 구조 타입 — 마스크/조정 합성에 필요한 멤버만.
 * 실제 CanvasRenderingContext2D 가 그대로 대입된다(메서드 바이베리언스 — 테스트에서 컴파일 검증).
 */
export type MaskCtx2DLike = {
  fillStyle: unknown;
  globalCompositeOperation: string;
  filter: string;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(fillRule?: "nonzero" | "evenodd"): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: MaskImageSource, dx: number, dy: number): void;
};

/** 오프스크린 캔버스 팩토리 — DOM 의존부를 호출자(StudioPage)가 주입한다. */
export type SelectionCanvasFactory = (
  width: number,
  height: number
) => { canvas: MaskCanvasLike & MaskImageSource; ctx: MaskCtx2DLike } | null;

/**
 * 계획의 steps 를 ctx 에 하드 엣지로 칠한다(feather/invert 이전 단계).
 * fill=source-over 흰색, erase=destination-out. 끝나면 합성 모드를 원복한다.
 */
export function paintSelectionMaskSteps(ctx: MaskCtx2DLike, plan: SelectionMaskPlan): void {
  ctx.clearRect(0, 0, plan.width, plan.height);
  ctx.fillStyle = "#ffffff";
  for (const step of plan.steps) {
    if (step.points.length < 3) continue; // 방어 — 퇴화 폴리곤은 건너뜀
    ctx.globalCompositeOperation = step.op === "fill" ? "source-over" : "destination-out";
    ctx.beginPath();
    ctx.moveTo(step.points[0]![0], step.points[0]![1]);
    for (let i = 1; i < step.points.length; i += 1) {
      ctx.lineTo(step.points[i]![0], step.points[i]![1]);
    }
    ctx.closePath();
    ctx.fill("evenodd");
  }
  ctx.globalCompositeOperation = "source-over";
}

/**
 * 계획 → 알파 마스크 캔버스. 하드 마스크 → (feather 면) 전체 blur → (invert 면) 알파 반전.
 * 흰색(alpha=1) = 선택됨. 팩토리가 null 을 주면 중단하고 null.
 */
export function rasterizeSelectionMask(
  plan: SelectionMaskPlan,
  createCanvas: SelectionCanvasFactory
): (MaskCanvasLike & MaskImageSource) | null {
  const base = createCanvas(plan.width, plan.height);
  if (!base) return null;
  paintSelectionMaskSteps(base.ctx, plan);
  let current = base.canvas;
  if (plan.featherPx > 0) {
    const soft = createCanvas(plan.width, plan.height);
    if (!soft) return null;
    soft.ctx.filter = `blur(${plan.featherPx}px)`;
    soft.ctx.drawImage(current, 0, 0);
    soft.ctx.filter = "none";
    current = soft.canvas;
  }
  if (plan.invert) {
    const inverted = createCanvas(plan.width, plan.height);
    if (!inverted) return null;
    inverted.ctx.fillStyle = "#ffffff";
    inverted.ctx.fillRect(0, 0, plan.width, plan.height);
    inverted.ctx.globalCompositeOperation = "destination-out";
    inverted.ctx.drawImage(current, 0, 0);
    inverted.ctx.globalCompositeOperation = "source-over";
    current = inverted.canvas;
  }
  return current;
}

// ---------------------------------------------------------------------------
// (8) 선택 영역 한정 조정 planner — 밝기/색조/삭제
// ---------------------------------------------------------------------------

/** 선택 영역에 가할 조정 종류. */
export type SelectionAdjustKind = "brightness" | "hue" | "delete";

/** 조정 실행 계획 — cssFilter 는 ctx.filter 문자열(삭제는 null). */
export type SelectionAdjustPlan =
  | { kind: "delete"; cssFilter: null }
  | { kind: "brightness" | "hue"; amount: number; cssFilter: string };

/** 소수점 노이즈 없는 수 문자열(최대 3자리). */
function fmt(n: number): string {
  return String(Number(n.toFixed(3)));
}

/** 조정 종류+양 → 실행 계획. 양은 범위로 클램프·반올림된다. */
export function planSelectionAdjust(kind: SelectionAdjustKind, amount = 0): SelectionAdjustPlan {
  if (kind === "delete") return { kind: "delete", cssFilter: null };
  if (kind === "brightness") {
    const amt = Math.round(clampNum(amount, SELECTION_BRIGHTNESS_RANGE.min, SELECTION_BRIGHTNESS_RANGE.max));
    return { kind, amount: amt, cssFilter: `brightness(${fmt(1 + amt / 100)})` };
  }
  const amt = Math.round(clampNum(amount, SELECTION_HUE_RANGE.min, SELECTION_HUE_RANGE.max));
  return { kind: "hue", amount: amt, cssFilter: `hue-rotate(${amt}deg)` };
}

/** 아무 변화도 없는 계획인지(밝기 0/색조 0) — 패널이 적용 버튼을 비활성화할 때 사용. */
export function isSelectionAdjustNoop(plan: SelectionAdjustPlan): boolean {
  return plan.kind !== "delete" && plan.amount === 0;
}

/**
 * 원본 이미지 + 마스크 + 계획 → 조정 결과 캔버스.
 *   삭제:      결과 = 원본 그대로 그린 뒤 destination-out 으로 마스크 영역 알파 제거.
 *   밝기/색조: (a) 전체에 cssFilter 적용본을 만들고 (b) destination-in 으로 마스크 안만 남긴 뒤
 *              (c) 원본 위에 얹는다 — 페더의 부분 알파가 자연스러운 경계 블렌딩이 된다.
 * source 는 마스크와 같은 픽셀 크기(원본 자연 크기)라고 가정한다.
 */
export function applySelectionAdjustToCanvas(
  source: MaskImageSource,
  width: number,
  height: number,
  mask: MaskImageSource,
  plan: SelectionAdjustPlan,
  createCanvas: SelectionCanvasFactory
): (MaskCanvasLike & MaskImageSource) | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (plan.kind === "delete") {
    const out = createCanvas(w, h);
    if (!out) return null;
    out.ctx.drawImage(source, 0, 0);
    out.ctx.globalCompositeOperation = "destination-out";
    out.ctx.drawImage(mask, 0, 0);
    out.ctx.globalCompositeOperation = "source-over";
    return out.canvas;
  }

  const adjusted = createCanvas(w, h);
  if (!adjusted) return null;
  adjusted.ctx.filter = plan.cssFilter;
  adjusted.ctx.drawImage(source, 0, 0);
  adjusted.ctx.filter = "none";
  adjusted.ctx.globalCompositeOperation = "destination-in";
  adjusted.ctx.drawImage(mask, 0, 0);
  adjusted.ctx.globalCompositeOperation = "source-over";

  const out = createCanvas(w, h);
  if (!out) return null;
  out.ctx.drawImage(source, 0, 0);
  out.ctx.drawImage(adjusted.canvas, 0, 0);
  return out.canvas;
}
