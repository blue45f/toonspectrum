/**
 * Studio Bubble Custom Shape — 말풍선 외곽선을 임의의 폐곡선(폴리곤)으로 편집하는 순수 코어.
 *
 * 완전히 새로운 벡터 펜 도구를 만드는 대신, 기존 두 모듈을 그대로 이어 붙인다:
 *   1) studio-bubble-path.ts 의 bubblePathData/bubblePathDataMulti 가 만드는 "둥근사각형+꼬리"
 *      SVG path(d 문자열)를 촘촘한 폴리곤 점 배열로 샘플링한다(이 파일의 핵심 신규 로직).
 *   2) 그 점 배열은 studio-node-edit.ts 의 "점 이동" 인프라(NodeEditHandle/beginNodeDrag/
 *      updateNodeDragMove/withPointMoved/hitTestNodeHandle)를 그대로 재사용해 편집한다 — 자유선
 *      노드 편집과 동일한 상호작용 모델이라 별도 드래그 세션 타입을 새로 만들지 않는다(항상
 *      tool="move" 로만 연다; "굵기" 개념은 말풍선 외곽선에 없다).
 *
 * 스코프(§5 스케치 대비 편차는 design 문서 참조):
 *   - 완전한 베지어 핸들 편집이 아니라 "폴리곤 점 편집"이다. 점을 옮길 수만 있고(추가/삭제 없음),
 *     둥근 모서리·꼬리 곡선은 전환 시점에 직선 세그먼트로 근사돼 이후에는 각지게(원하면 사용자가
 *     점을 옮겨 다시 둥글게) 보인다.
 *   - variant(shout/thought/heart/system/scared/phone/angry 등)의 고유 실루엣(별/하트/구름) 자체를
 *     폴리곤화하지 않는다 — "커스텀 모양 전환"은 항상 이 요소의 현재 테마·꼬리 설정으로 계산한
 *     rounded-rect(+꼬리) 윤곽(=speech/whisper 변형이 그리는 것과 동일한 베이스 모양)을 출발점으로
 *     삼는다. 특수 실루엣에서 전환하면 그 실루엣이 아니라 이 베이스 모양이 나타난다(의도된 축소).
 *
 * 좌표계: bubblePathData 와 동일하게 말풍선 로컬(0,0~w,h), 회전/이동은 요소의 x/y/rotation 이
 * 담당한다(값 자체는 스케일 불변 — normalizedPointToCanvas 류와 달리 width/height 로 나누지
 * 않는다). DOM/Konva 의존성 없음 — Konva 오버레이·포인터 배선은 호출자(StudioPage)가 담당한다.
 */
import { bubblePathData, bubblePathDataMulti, type BubbleTailSpec, type BubbleTailDirection } from "./studio-bubble-path";
import {
  beginNodeDrag,
  hitTestNodeHandle,
  nodeEditPointCount,
  pointAt,
  updateNodeDragMove,
  withPointMoved,
  type NodeDragSession,
  type NodeEditHandle,
} from "./studio-node-edit";
import { canvasPointToNormalized, normalizedPointToCanvas, type SelPoint } from "./studio-selection-tools";

// 재수출 — 호출자가 이 모듈 하나만 보고도 점 편집 세션을 열 수 있게(round-trip import 축소).
export { beginNodeDrag, hitTestNodeHandle, updateNodeDragMove, withPointMoved, type NodeDragSession, type NodeEditHandle };

// ---------------------------------------------------------------------------
// 테마·꼬리 → 지오메트리 파라미터 (StudioPage 렌더 루프와 "전환" 버튼이 공유하는 단일 소스)
// ---------------------------------------------------------------------------

export type BubbleShapeTheme = "classic" | "soft" | "vivid";

/** computeBubbleShapeGeometry 입력 — StudioPage 의 BubbleEl 관련 필드 + 현재 webtoonTheme 서브셋. */
export interface BubbleShapeGeometryInput {
  width: number;
  height: number;
  theme: BubbleShapeTheme;
  tail?: "left" | "right" | "none";
  tailDirection?: BubbleTailDirection;
  tailXRatio?: number;
  tailHeight?: number;
  tailBase?: number;
  tailBend?: number;
  /** studio-bubble-path.normalizeExtraTails 로 이미 정규화된 배열을 넘긴다(호출자 책임). */
  extraTails?: BubbleTailSpec[];
}

export interface BubbleShapeGeometry {
  radius: number;
  tailSpec: BubbleTailSpec | null;
  extraTails: BubbleTailSpec[];
}

/**
 * StudioPage 의 말풍선 렌더 루프(테마별 bRadius/bTailLen/bTailBase 계산, ~line 10327-10405)와
 * 정확히 동일한 수식 — 한 곳만 두면 "지금 화면에 보이는 모양"과 "전환 버튼이 샘플링하는 모양"이
 * 항상 픽셀 단위로 일치한다(따로 계산하면 미세한 수치 차이로 전환 순간 모양이 살짝 튀는 버그가
 * 생긴다). design 문서 §4 는 렌더 루프도 이 함수를 호출하도록 리팩터를 지시한다.
 */
export function computeBubbleShapeGeometry(input: BubbleShapeGeometryInput): BubbleShapeGeometry {
  const avgSize = (input.width + input.height) / 2;
  void avgSize; // 반지름 자체는 avgSize 에 의존하지 않는다(스트로크 두께만 의존) — 계약 명시용.
  let radius = 18;
  let tailLenAdjust = 0;
  let borderRatio = 0.08;
  if (input.theme === "soft") {
    radius = 24;
    tailLenAdjust = -10;
    borderRatio = 0.08;
  } else if (input.theme === "vivid") {
    radius = Math.min(input.width, input.height) / 2;
    tailLenAdjust = -14;
    borderRatio = 0.06;
  }

  const tailDir = input.tail ?? "left";
  const tailDirection = input.tailDirection ?? "bottom";
  const showTail = tailDir !== "none";
  const tXRatio = input.tailXRatio ?? 0.35;
  const tHeight = input.tailHeight ?? 30;
  const tailIsVertical = tailDirection === "bottom" || tailDirection === "top";
  const bMinDim = Math.min(input.width, input.height);
  const bTailLen = Math.max(bMinDim * 0.12, Math.min(Math.max(8, tHeight + tailLenAdjust), bMinDim * 0.3));
  const automaticTailBase = Math.max(
    bMinDim * 0.1,
    (tailIsVertical ? input.width : input.height) * borderRatio * 1.8
  );
  const bTailBase = Math.max(4, Math.min(input.tailBase ?? automaticTailBase, bMinDim * 0.62));

  const tailSpec: BubbleTailSpec | null = showTail
    ? {
        direction: tailDirection,
        ratio: tailDir === "right" && tailIsVertical ? 1 - tXRatio : tXRatio,
        length: bTailLen,
        base: bTailBase,
        side: "center",
        bend: Math.max(-1, Math.min(input.tailBend ?? 0, 1)),
      }
    : null;

  return { radius, tailSpec, extraTails: input.extraTails ?? [] };
}

// ---------------------------------------------------------------------------
// SVG path(d) 초소형 워커 — bubblePathData/bubblePathDataMulti 가 실제로 내는 명령 집합만 지원
// ---------------------------------------------------------------------------

/** bubblePathData/Multi 가 쓰는 명령의 인자 개수. L 은 현재 미사용이지만 방어적으로 지원. */
const PATH_CMD_ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, A: 7, Q: 4, Z: 0 };

type PathToken = { cmd: string; args: number[] };

/** "M 9 0 H 82 A 9 9 0 0 1 91 9 …" 같은 공백구분 토큰 스트림을 명령 단위로 묶는다. */
function tokenizeBubblePathData(d: string): PathToken[] {
  const tokens = d.trim().split(/\s+/).filter(Boolean);
  const out: PathToken[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i]!;
    i++;
    const argc = PATH_CMD_ARG_COUNT[cmd];
    if (argc === undefined) continue; // 알 수 없는 토큰(있을 수 없지만 방어적으로 스킵)
    const args: number[] = [];
    for (let k = 0; k < argc; k++) {
      const v = Number(tokens[i + k]);
      args.push(Number.isFinite(v) ? v : 0);
    }
    i += argc;
    out.push({ cmd, args });
  }
  return out;
}

/** 두 벡터(u,v) 사이 부호있는 각도(라디안) — SVG arc 엔드포인트→중심 파라미터화 표준 공식용. */
function signedAngleBetween(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1e-9;
  let ang = Math.acos(Math.min(1, Math.max(-1, dot / len)));
  if (ux * vy - uy * vx < 0) ang = -ang;
  return ang;
}

/**
 * SVG elliptical arc(rx=ry, x-axis-rotation=0 — bubblePathData 는 항상 이 형태만 낸다) 를
 * samples 개 점으로 샘플링해 emit 한다. 표준 "엔드포인트→중심" 파라미터화(SVG 스펙 F.6.5)를
 * φ=0 으로 특수화했다. 반지름이 0에 가깝거나 시작=끝점이면 퇴화 구간이므로 끝점만 emit한다.
 */
function sampleArc(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  largeArc: number,
  sweep: number,
  samples: number,
  emit: (x: number, y: number) => void
): void {
  if (!(rx > 1e-6) || !(ry > 1e-6) || (Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9)) {
    emit(x1, y1);
    return;
  }
  const dx2 = (x0 - x1) / 2;
  const dy2 = (y0 - y1) / 2;
  let Rx = Math.abs(rx);
  let Ry = Math.abs(ry);
  const lambda = (dx2 * dx2) / (Rx * Rx) + (dy2 * dy2) / (Ry * Ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    Rx *= s;
    Ry *= s;
  }
  const sign = largeArc === sweep ? -1 : 1;
  const num = Rx * Rx * Ry * Ry - Rx * Rx * dy2 * dy2 - Ry * Ry * dx2 * dx2;
  const den = Rx * Rx * dy2 * dy2 + Ry * Ry * dx2 * dx2;
  const co = sign * Math.sqrt(Math.max(0, num) / (den || 1e-9));
  const cxp = (co * Rx * dy2) / Ry;
  const cyp = (-co * Ry * dx2) / Rx;
  const cx = cxp + (x0 + x1) / 2;
  const cy = cyp + (y0 + y1) / 2;

  const theta1 = signedAngleBetween(1, 0, (x0 - cx) / Rx, (y0 - cy) / Ry);
  let dtheta = signedAngleBetween((x0 - cx) / Rx, (y0 - cy) / Ry, (x1 - cx) / Rx, (y1 - cy) / Ry);
  if (sweep === 0 && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep === 1 && dtheta < 0) dtheta += 2 * Math.PI;

  const n = Math.max(1, Math.round(samples));
  for (let i = 1; i <= n; i++) {
    const t = theta1 + (dtheta * i) / n;
    emit(cx + Rx * Math.cos(t), cy + Ry * Math.sin(t));
  }
}

/** 2차 베지어(De Casteljau) 를 samples 개 점으로 샘플링해 emit(끝점 포함, 시작점 제외). */
function sampleQuadratic(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  samples: number,
  emit: (x: number, y: number) => void
): void {
  const n = Math.max(1, Math.round(samples));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    emit(mt * mt * x0 + 2 * mt * t * cx + t * t * x1, mt * mt * y0 + 2 * mt * t * cy + t * t * y1);
  }
}

/** d(SVG path) 를 폴리곤 점(평탄 [x0,y0,x1,y1,...])으로 워킹한다 — M/L/H/V 는 그대로, A/Q 는 곡선을 samplesPerCurve 점으로 근사. */
function walkPathDataToPolygon(d: string, samplesPerCurve: number): number[] {
  const cmds = tokenizeBubblePathData(d);
  const pts: number[] = [];
  let cx = 0;
  let cy = 0;
  const emit = (x: number, y: number) => {
    const lx = pts.at(-2);
    const ly = pts.at(-1);
    if (lx !== undefined && ly !== undefined && Math.hypot(x - lx, y - ly) < 1e-6) return; // 연속 중복점 제거
    pts.push(x, y);
  };
  for (const { cmd, args } of cmds) {
    if (cmd === "M") {
      cx = args[0]!;
      cy = args[1]!;
      emit(cx, cy);
    } else if (cmd === "L") {
      cx = args[0]!;
      cy = args[1]!;
      emit(cx, cy);
    } else if (cmd === "H") {
      cx = args[0]!;
      emit(cx, cy);
    } else if (cmd === "V") {
      cy = args[0]!;
      emit(cx, cy);
    } else if (cmd === "A") {
      const [rx, ry, , laf, sf, ex, ey] = args as [number, number, number, number, number, number, number];
      sampleArc(cx, cy, ex, ey, rx, ry, laf, sf, samplesPerCurve, emit);
      cx = ex;
      cy = ey;
    } else if (cmd === "Q") {
      const [qx, qy, ex, ey] = args as [number, number, number, number];
      sampleQuadratic(cx, cy, qx, qy, ex, ey, samplesPerCurve, emit);
      cx = ex;
      cy = ey;
    }
    // "Z" — 닫기. 마지막 명령의 끝점이 이미 시작점과 (거의) 같으므로 별도 emit 불필요.
  }
  // Z 로 닫히며 마지막 점이 첫 점과 겹치면(대부분의 경우) 중복 제거.
  if (pts.length >= 4) {
    const fx = pts[0]!;
    const fy = pts[1]!;
    const lx = pts.at(-2)!;
    const ly = pts.at(-1)!;
    if (Math.hypot(fx - lx, fy - ly) < 1e-6) {
      pts.pop();
      pts.pop();
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------
// 공개 API — 샘플링 / 역변환 / 정규화
// ---------------------------------------------------------------------------

/** 곡선(모서리 아크·꼬리 베지어) 1개당 뽑는 점 개수 기본값 — 총 점 개수는 이 값에 비례한다
 * (예: 꼬리 없는 기본 둥근사각형은 모서리 4개 × 이 값 근처, 꼬리 1개면 + 2×이 값). */
export const BUBBLE_CUSTOM_SHAPE_DEFAULT_SAMPLES_PER_CURVE = 6;
/** 폴리곤 최소 점 개수(삼각형 미만은 도형이 성립하지 않음). */
export const BUBBLE_CUSTOM_SHAPE_MIN_POINTS = 3;

/**
 * 현재 말풍선 지오메트리(테마 반지름 + 꼬리 사양)를 폴리곤 점 배열로 샘플링한다 — "커스텀
 * 모양으로 전환" 버튼이 호출하는 진입점. bubblePathData/Multi 를 문자열 그대로 재사용해
 * (기하 공식을 중복 구현하지 않고) 그 path 를 곡선 근사 워커로 걷는다.
 */
export function sampleBubbleOutlineToPolygon(
  width: number,
  height: number,
  geometry: BubbleShapeGeometry,
  samplesPerCurve: number = BUBBLE_CUSTOM_SHAPE_DEFAULT_SAMPLES_PER_CURVE
): number[] {
  const d =
    geometry.extraTails.length > 0
      ? bubblePathDataMulti(width, height, geometry.radius, [...(geometry.tailSpec ? [geometry.tailSpec] : []), ...geometry.extraTails])
      : bubblePathData(width, height, geometry.radius, geometry.tailSpec);
  return walkPathDataToPolygon(d, Math.max(2, Math.round(samplesPerCurve)));
}

/** computeBubbleShapeGeometry + sampleBubbleOutlineToPolygon 합성 — 버튼 핸들러의 단일 호출 지점. */
export function computeCustomShapePointsForBubble(
  input: BubbleShapeGeometryInput,
  samplesPerCurve: number = BUBBLE_CUSTOM_SHAPE_DEFAULT_SAMPLES_PER_CURVE
): number[] {
  return sampleBubbleOutlineToPolygon(input.width, input.height, computeBubbleShapeGeometry(input), samplesPerCurve);
}

function roundNum(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 폴리곤 점 배열 → SVG path d("M x y L x y … Z"). Konva 캔버스 렌더는 이 문자열이 필요 없다
 * (<Line points={pts} closed /> 에 배열을 그대로 넘기면 된다) — 이 함수는 향후 미리보기
 * 썸네일이나 다른 SVG 소비처를 위한 유틸이다. studio-svg-export.ts 로 내보낼 때는 그 파일이
 * 이미 갖고 있는 동일 목적의 private pointsToPathD(points, closed) 를 그대로 재사용하면 된다
 * (숫자 포맷 컨벤션을 그 파일과 통일하기 위해 — design 문서 §4 참조).
 */
export function polygonPointsToPathData(points: readonly number[]): string {
  if (points.length < 6 || points.length % 2 !== 0) return "";
  const parts = [`M ${roundNum(points[0]!)} ${roundNum(points[1]!)}`];
  for (let i = 2; i + 1 < points.length; i += 2) {
    parts.push(`L ${roundNum(points[i]!)} ${roundNum(points[i + 1]!)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * 저장 문서에서 불러온 customShapePoints 를 방어적으로 정규화한다 — 유한수·짝수 길이·
 * 최소 BUBBLE_CUSTOM_SHAPE_MIN_POINTS 점 미만이면 undefined(커스텀 모양 미적용 취급).
 */
export function normalizeCustomShapePoints(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length % 2 !== 0 || raw.length < BUBBLE_CUSTOM_SHAPE_MIN_POINTS * 2) return undefined;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    out.push(v);
  }
  return out;
}

/** points 가 유효한(그릴 수 있는) 커스텀 모양인지 — 렌더 분기·armed 게이팅 공용 가드. */
export function hasCustomBubbleShape(points: readonly number[] | undefined): points is number[] {
  return !!points && points.length >= BUBBLE_CUSTOM_SHAPE_MIN_POINTS * 2 && points.length % 2 === 0;
}

// ---------------------------------------------------------------------------
// 핸들 목록 — decimateStrokeHandles 대신 "전부"를 핸들로(폴리곤은 이미 성글다)
// ---------------------------------------------------------------------------

/**
 * 폴리곤의 모든 점을 편집 핸들로 노출한다. 자유선(studio-node-edit)의 decimateStrokeHandles 는
 * 수백~수천 점짜리 프리핸드 스트로크를 성기게 솎아내기 위한 것이라 여기선 맞지 않는다 — 커스텀
 * 모양 폴리곤은 애초에 샘플링 단계에서 성기게(점당 6개 안팎) 만들어지므로 전부 노출해도 된다.
 */
export function bubbleShapePointHandles(points: readonly number[]): NodeEditHandle[] {
  const n = nodeEditPointCount(points);
  const out: NodeEditHandle[] = [];
  for (let i = 0; i < n; i++) {
    const p = pointAt(points, i);
    if (p) out.push({ pointIndex: i, x: p.x, y: p.y });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 좌표 변환 — 말풍선은 x/y/rotation 만 있고(폭/높이로 나누지 않음), studio-selection-tools 의
// 회전 변환 공식을 width=height=1 로 특수화해 그대로 재사용한다(새 삼각함수 코드를 추가하지 않음).
// ---------------------------------------------------------------------------

export type BubbleShapeFrame = { x: number; y: number; rotation?: number };

/** 캔버스(페이지) 좌표 → 말풍선 로컬(비스케일) 좌표. */
export function bubbleShapeCanvasPointToLocal(px: number, py: number, frame: BubbleShapeFrame): SelPoint {
  return canvasPointToNormalized(px, py, { x: frame.x, y: frame.y, width: 1, height: 1, rotation: frame.rotation });
}

/** 말풍선 로컬(비스케일) 좌표 → 캔버스(페이지) 좌표 — 위 함수의 역변환. */
export function bubbleShapeLocalPointToCanvas(p: SelPoint, frame: BubbleShapeFrame): { x: number; y: number } {
  return normalizedPointToCanvas(p, { x: frame.x, y: frame.y, width: 1, height: 1, rotation: frame.rotation });
}
