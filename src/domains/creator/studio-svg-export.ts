/**
 * Studio SVG Vector Export — 일러스트레이터급 벡터 내보내기 직렬화 엔진.
 *
 * 래스터 내보내기(studio-export, png/jpg/webp)가 "캔버스 픽셀 캡처"라면, 이 모듈은
 * StudioPage 의 요소(El) 배열을 **SVG 마크업으로 직접 직렬화**해 도형·텍스트·말풍선·
 * 프레임·효과선을 벡터로 보존한다(Illustrator/Inkscape/브라우저에서 무손실 확대·재편집).
 *
 * 재현 규약(캔버스 렌더와 동일 지오메트리 소스 공유):
 *  - 도형(draw): studio-stroke-shapes 의 별/다각형 포인트·점선 프리셋·화살촉 지오메트리,
 *    studio-gradient-engine 그라데이션(defs), studio-pattern-fill 패턴(defs <pattern>).
 *    채우기 우선순위는 캔버스와 동일: 패턴 > 그라데이션 > 단색.
 *  - 말풍선: studio-bubble-path 의 bubblePathData/Multi 를 그대로 재사용(이음새 없는 단일 path).
 *  - 텍스트: 글꼴/크기/자간/행간/정렬 + 곡선 텍스트(studio-text-path)는 <textPath> 로.
 *  - 이미지: <image> 태그(data URL 은 그대로 임베드), 프레임은 <clipPath> 클립.
 *  - 회전/기울이기: Konva 변환 순서(translate→rotate→skew)와 동일한 transform 문자열.
 *  - 집중선/속도선: StudioPage 와 동일한 seededRandom(id) 시드 난수로 같은 선 배치를 재현.
 *
 * 정직성 규약: 완벽 재현이 불가한 것은 그리지 않거나 근사하고, 전부 skipped 목록으로
 * 집계해 반환한다(콜러가 사용자에게 고지). 예: 픽셀 필터/보정(제외 아님, 원본 이미지로
 * 근사), 지우개 합성(destination-out — 제외), 아래 레이어 클리핑(근사), 자동 줄바꿈(근사).
 * 말풍선 그룹 그림자는 캔버스에서도 그려지지 않으므로(Konva 컨테이너 그림자는 cache 필요)
 * 내보내지 않는다 — 화면과 동일.
 *
 * 전부 순수·결정적(입력이 같으면 출력 바이트 동일) — DOM/Konva 무의존. Blob 생성·다운로드는
 * 콜러(StudioPage) 몫이다. 사용자 노출 문자열은 한글.
 */

import {
  buildCalligraphySegments,
  processFreehandPoints,
  processPencilPoints,
  resampleStrokePressures,
  resolveStudioFreehandRenderPath,
  resolveStudioBrushRenderFamily,
  screentoneDotRadius,
  screentoneDotsForStroke,
  strokeRenderDistance,
  type CalligraphyStylusInput,
  type CalligraphyTipSettings,
} from "./studio-brush";
import {
  applyStudioBrushAliasWatercolorMaterial,
  mapStudioBrushAliasPressure,
  mapStudioBrushAliasPressureSamples,
  resolveStudioBrushAliasPencilPasses,
  resolveStudioBrushAliasWatercolorPlanSettings,
  studioBrushAliasEffectiveDiameter,
} from "./studio-brush-alias-profile";
import {
  DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS,
  normalizeStudioBrushDynamicsSettings,
  planStudioDynamicBrushDabs,
  resolveStudioBrushDynamicsPresetId,
  studioBrushDynamicsSettingsForBrushId,
  studioBrushDynamicsSeedFromKey,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioDynamicBrushDab,
  type StudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import {
  resolveNormalizedStudioBrushDabColor,
  resolveNormalizedStudioBrushGrainAlphaMultiplier,
  studioBrushGrainIsActive,
} from "./studio-brush-material-dynamics";
import {
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
  type StudioDynamicBrushRenderStampGrid,
} from "./studio-brush-render-budget";
import { resolveStudioBrushSinglePointRoute } from "./studio-brush-runtime-contract";
import {
  planStudioStampBrushDabs,
  resolveStudioStampBrushKind,
  resolveStudioStampBrushStyle,
  stampJitter,
  type StudioStampBrushDab,
  type StudioStampBrushStyle,
  type StudioStampBrushTuning,
} from "./studio-brush-stamp-engine";
import {
  studioDynamicBrushDabVariations,
  studioBrushSymmetryTransforms,
  transformStudioBrushSymmetryPoint,
} from "./studio-brush-symmetry";
import {
  composeStudioBrushDualTipAlphaMap,
  planNormalizedStudioBrushTipComposition,
  studioBrushDualTipUsesSolidEllipse,
} from "./studio-brush-tip-composition";
import {
  buildStudioBrushTipAlphaMap,
  planStudioBrushTipStampWorldSamples,
  studioBrushTipUsesSolidEllipse,
} from "./studio-brush-tip-stamp";
import {
  bubblePathData,
  bubblePathDataMulti,
  burstStarPathData,
  doubleBubblePathData,
  heartBubblePathData,
  normalizeExtraTails,
  scaredBubblePathData,
  thoughtBubbleBodyPath,
  type BubbleTailSpec,
} from "./studio-bubble-path";
import { planStudioCalligraphyRibbon } from "./studio-calligraphy-ribbon";
import { planStudioCausalInk } from "./studio-causal-ink";
import {
  DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
  planCausalWatercolorBrushDabs,
} from "./studio-causal-watercolor-brush";
import {
  fxBrushSeedFromKey,
  planGlitterBrushParticles,
  planGlowBrushPasses,
  planNeonBrushPasses,
  planOilBrushDabs,
  planPastelBrushDabs,
} from "./studio-fx-brush";
import {
  estimateTextGradientBBox,
  legacyTextGradientToSpec,
  linearGradientPoints,
  normalizeGradientSpec,
  radialGradientGeometry,
  type GradientBBox,
  type StudioGradientSpec,
} from "./studio-gradient-engine";
import {
  resolveStudioInkPressure,
  studioInkFallbackPressure,
  studioInkPressureDiameter,
  studioInkPressureRadius,
  type StudioInkPressureModel,
} from "./studio-ink-pressure-model";
import { hasActiveImageFilters, type ImageFilterFields } from "./studio-konva-filter-fields";
import { isEffectivelyHidden, type LayerGroup } from "./studio-layers";
import { getPatternDef, normalizePatternSpec, type StudioPatternSpec } from "./studio-pattern-fill";
import {
  buildStudioPerfectFreehandPathData,
  loadStudioPerfectFreehandStroker,
  peekStudioPerfectFreehandStroker,
  resolveStudioPerfectFreehandProfile,
} from "./studio-perfect-freehand";
import {
  isStudioPixelPencilRenderMode,
  planStudioPixelPencilCells,
} from "./studio-pixel-pencil";
import { skewDegToKonva, type SkewFields } from "./studio-skew";
import {
  isStudioStrokePaintModelCompatible,
  type StudioStrokePaintModel,
} from "./studio-stroke-paint-model";
import {
  effectiveCornerRadius,
  lineArrowHeadGeoms,
  normalizeShapeParams,
  normalizeStrokeStyle,
  polygonPathPointsInBounds,
  starPathPoints,
  strokeDashArray,
  type ShapeParams,
  type StrokeStyle,
} from "./studio-stroke-shapes";
import { buildTextPathData, isFlatTextPath, normalizeTextPath, type TextPathConfig } from "./studio-text-path";
import {
  layoutVerticalText,
  verticalBlockAlign,
  verticalTextItemGeometry,
  type VerticalTextItem,
  type VerticalTextLayout,
  type VerticalTextMeasurer,
} from "./studio-vertical-text";
import {
  planWatercolorBrushDabs,
  watercolorBrushSeedFromKey,
} from "./studio-watercolor-brush";

import type { BubbleVariant } from "./studio-assets";

// ---------------------------------------------------------------------------
// 요소 구조 타입 — StudioPage 의 El 유니온과 구조 호환(필드 부분집합, 전부 옵셔널 위주).
// StudioPage 를 임포트하지 않고(순수 모듈 규약) 구조 타이핑으로 El[] 를 그대로 받는다.
// ---------------------------------------------------------------------------

/** 모든 요소가 공유하는 레이어 메타(El 인터섹션과 동일 필드). */
interface SvgElMeta {
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  noClip?: boolean;
  opacity?: number;
  blendMode?: string;
  lockAspect?: boolean;
  groupId?: string;
  clipBelow?: boolean;
}

export interface SvgImageElLike extends SvgElMeta, SkewFields, ImageFilterFields {
  id: string;
  type: "image";
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipped?: boolean;
  flippedY?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  cornerRadius?: number;
}

export interface SvgTextElLike extends SvgElMeta, SkewFields {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fill: string;
  rotation: number;
  font?: string;
  stroke?: string;
  strokeWidth?: number;
  letterSpacing?: number;
  lineHeight?: number;
  vertical?: boolean;
  align?: "left" | "center" | "right";
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  fillType?: "solid" | "gradient";
  gradientColorStart?: string;
  gradientColorEnd?: string;
  gradientDirection?: "vertical" | "horizontal";
  gradient?: StudioGradientSpec;
  textPath?: TextPathConfig;
}

export interface SvgBubbleElLike extends SvgElMeta {
  id: string;
  type: "bubble";
  variant: BubbleVariant;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  textFill: string;
  rotation: number;
  tail?: "left" | "right" | "none";
  tailDirection?: "bottom" | "top" | "left" | "right";
  extraTails?: BubbleTailSpec[];
  font?: string;
  fontSize?: number;
  lineHeight?: number;
  vertical?: boolean;
  align?: "left" | "center" | "right";
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  tailXRatio?: number;
  tailHeight?: number;
  tailBase?: number;
  tailBend?: number;
  stroke?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  /** shout/angry Star 안쪽 반경 비율(0..1). 미설정 시 variant 기본값. */
  starAmplitude?: number;
  customShapePoints?: number[];
}

export interface SvgFrameElLike extends SvgElMeta {
  id: string;
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
  bg?: string;
  bgColor?: string;
  stroke?: string;
  strokeWidth?: number;
  dashStyle?: "solid" | "dashed";
  points?: number[];
}

export interface SvgStickerElLike extends SvgElMeta, SkewFields {
  id: string;
  type: "sticker";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
}

export interface SvgDrawElLike extends SvgElMeta {
  id: string;
  type: "draw";
  kind?: "freehand" | "line" | "rect" | "ellipse" | "star" | "arrow" | "triangle" | "polygon";
  mode?: "pen" | "eraser";
  points: number[];
  stroke: string;
  strokeWidth: number;
  fill?: string;
  gradient?: StudioGradientSpec;
  pattern?: StudioPatternSpec;
  brush?: string;
  pressures?: number[];
  pressureModel?: StudioInkPressureModel;
  paintModel?: StudioStrokePaintModel;
  sampleSpacing?: number;
  stampPipeline?: "causal-walker-v2";
  /** 스탬프 브러시 흐름·경도·최소 굵기 스냅샷. */
  stamp?: StudioStampBrushTuning;
  watercolorPipeline?: "causal-walker-v2";
  tiltXs?: number[];
  tiltYs?: number[];
  twists?: number[];
  speeds?: number[];
  tangentialPressures?: number[];
  brushDynamics?: StudioBrushDynamicsSettings;
  brushTip?: CalligraphyTipSettings;
  strokeStyle?: StrokeStyle;
  shapeParams?: ShapeParams;
  symmetry?: {
    type: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope";
    centerX: number;
    centerY: number;
    radialCount?: number;
  };
}

export interface SvgFocusLinesElLike extends SvgElMeta {
  id: string;
  type: "focusLines";
  x: number;
  y: number;
  width: number;
  height: number;
  // 캔버스 렌더(FocusLinesNode)와 동일한 방어적 기본값(?? 80/120/600/24 등)을 위해 옵셔널.
  lineCount?: number;
  innerRadius?: number;
  outerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
  noise?: number;
  rotation?: number;
  centerXRatio?: number;
  centerYRatio?: number;
}

export interface SvgSpeedLinesElLike extends SvgElMeta {
  id: string;
  type: "speedLines";
  x: number;
  y: number;
  width: number;
  height: number;
  // 캔버스 렌더(SpeedLinesNode)와 동일한 방어적 기본값(?? 60/horizontal 등)을 위해 옵셔널.
  lineCount?: number;
  direction?: "horizontal" | "vertical";
  stroke?: string;
  strokeWidth?: number;
  noise?: number;
  rotation?: number;
}

/** StudioPage El 유니온과 구조 호환하는 내보내기 입력 요소. */
export type SvgExportEl =
  | SvgImageElLike
  | SvgTextElLike
  | SvgBubbleElLike
  | SvgFrameElLike
  | SvgStickerElLike
  | SvgDrawElLike
  | SvgFocusLinesElLike
  | SvgSpeedLinesElLike;

// ---------------------------------------------------------------------------
// 입출력 타입
// ---------------------------------------------------------------------------

/** 말풍선/프레임 렌더 파라미터를 좌우하는 웹툰 테마 — StudioPage webtoonTheme 와 동일. */
export type SvgExportTheme = "classic" | "soft" | "vivid";

export interface SvgExportPageInput {
  /** 페이지 캔버스 폭(px) — StudioPage CANVAS_W. */
  width: number;
  /** 페이지 캔버스 높이(px). */
  height: number;
  /** 배경 단색 — bgGrad 가 없을 때 사용(기본 #ffffff). */
  bg?: string;
  /** 배경 세로 2색 그라데이션([위, 아래]) — 있으면 bg 보다 우선(캔버스와 동일). */
  bgGrad?: readonly string[] | null;
  /** true 면 배경을 그리지 않는다(투명 내보내기). */
  transparentBg?: boolean;
  /** z-order 요소 배열(인덱스 0 = 맨 뒤) — StudioPage 페이지 elements 그대로. */
  elements: readonly SvgExportEl[];
  /** 레이어 그룹(폴더) — 그룹 숨김을 반영한다. */
  groups?: readonly LayerGroup[];
  /** 웹툰 테마(말풍선/프레임 기본 선 굵기·모서리) — 미지정 시 "classic". */
  theme?: SvgExportTheme;
}

/** 재현 불가/근사 항목 한 건 — 콜러가 사용자에게 고지한다. */
export interface SvgExportSkip {
  /** 요소 id. */
  id: string;
  /** 요소 타입(El type). */
  type: string;
  /** "skipped"=그리지 않음, "approximated"=그렸지만 화면과 일부 다름. */
  mode: "skipped" | "approximated";
  /** 사용자 안내용 한글 사유. */
  label: string;
}

export interface SvgExportResult {
  /** 완성된 SVG 마크업(단일 문자열, 결정적). */
  svg: string;
  /** 재현 불가/근사 집계 — 비어 있으면 전부 벡터 보존. */
  skipped: SvgExportSkip[];
  /** 사용된 글꼴 패밀리 목록(SVG 에 임베드되지 않음 — 고지용). */
  fontFamilies: string[];
  /** 전역 주의사항(글꼴 미임베드 등) — 사용자 고지용 한글 문장. */
  caveats: string[];
  /** 실제로 직렬화 대상이 된(숨김 제외) 요소 수. */
  elementCount: number;
}

/** 콜러가 Blob 생성에 쓸 MIME 타입. */
export const SVG_EXPORT_MIME = "image/svg+xml;charset=utf-8";

/** 단일 페이지 SVG 파일명 — 래스터 내보내기(pageExportFileName)와 같은 제목 규칙. */
export function svgExportFileName(title: string): string {
  return `${title.trim() || "toonspectrum-comic"}.svg`;
}

// ---------------------------------------------------------------------------
// 공용 유틸 — 수 포맷·XML 이스케이프·transform
// ---------------------------------------------------------------------------

/** 좌표/치수 포맷 — 소수 둘째 자리 반올림, 꼬리 0 제거, -0/비유한수는 0. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100 + 0;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * 누적형 dab 투명도 포맷 — 좌표보다 높은 6자리 정밀도로 아주 옅은 에어브러시도 보존한다.
 * SVG opacity 유효 범위로 제한하고, 0보다 큰 값이 반올림만으로 완전 투명해지지 않게 한다.
 */
function fmtDabOpacity(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const bounded = Math.min(1, Math.max(0, n));
  const rounded = Math.round(bounded * 1_000_000) / 1_000_000;
  const visible = bounded > 0 && rounded === 0 ? 0.000001 : rounded;
  return visible.toFixed(6).replace(/\.?0+$/, "");
}

/** XML 텍스트/속성 이스케이프 — & < > " ' 전부 치환(속성·본문 공용). */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** 속성 문자열 조각 — 값이 undefined/null 이면 빈 문자열(속성 생략). */
function att(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return ` ${name}="${typeof value === "number" ? fmt(value) : escapeXml(value)}"`;
}

/**
 * Konva 노드 변환과 동일한 transform 문자열 — translate → rotate → skew 순.
 * Konva skewX/skewY 는 tangent 계수라 SVG matrix(1, tanY, tanX, 1, 0, 0) 로 표현한다.
 * 항등 성분은 생략하고, 전부 항등이면 undefined(속성 생략).
 */
function nodeTransform(x: number, y: number, rotation?: number, skew?: SkewFields): string | undefined {
  const parts: string[] = [];
  if (x !== 0 || y !== 0) parts.push(`translate(${fmt(x)} ${fmt(y)})`);
  if (rotation && rotation !== 0) parts.push(`rotate(${fmt(rotation)})`);
  const tanX = skewDegToKonva(skew?.skewX ?? 0);
  const tanY = skewDegToKonva(skew?.skewY ?? 0);
  if (tanX !== 0 || tanY !== 0) parts.push(`matrix(1 ${fmt(tanY)} ${fmt(tanX)} 1 0 0)`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** 평탄 포인트 → path d("M x0 y0 L x1 y1 ...") — closed 면 "Z" 로 닫는다. */
function pointsToPathD(points: readonly number[], closed = false): string {
  if (points.length < 2) return "";
  const parts = [`M ${fmt(points[0])} ${fmt(points[1])}`];
  for (let i = 2; i + 1 < points.length; i += 2) parts.push(`L ${fmt(points[i])} ${fmt(points[i + 1])}`);
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/**
 * Round dabs as one painted SVG geometry.
 *
 * A list of sibling circles would composite an alpha-bearing CSS color once per circle, so their
 * overlaps would darken even when the stroke opacity itself is isolated on a parent group. One
 * compound path is rasterized as a single source shape instead, matching the Canvas Path2D fill
 * used by `layered-flow-v1` for both color alpha and stroke opacity.
 */
function circularDabsToCompoundPathD(
  dabs: readonly { readonly x: number; readonly y: number; readonly radius: number }[]
): string {
  return dabs.map((dab) => {
    const x = Number.isFinite(dab.x) ? dab.x : 0;
    const y = Number.isFinite(dab.y) ? dab.y : 0;
    const radius = Number.isFinite(dab.radius) ? Math.max(0, dab.radius) : 0;
    if (radius === 0) return `M ${fmt(x)} ${fmt(y)} Z`;
    const left = x - radius;
    const right = x + radius;
    return [
      `M ${fmt(left)} ${fmt(y)}`,
      `A ${fmt(radius)} ${fmt(radius)} 0 1 0 ${fmt(right)} ${fmt(y)}`,
      `A ${fmt(radius)} ${fmt(radius)} 0 1 0 ${fmt(left)} ${fmt(y)}`,
      "Z",
    ].join(" ");
  }).join(" ");
}

/** 평탄 포인트 → polygon points 속성("x,y x,y ..."). */
function pointsAttr(points: readonly number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push(`${fmt(points[i])},${fmt(points[i + 1])}`);
  return pairs.join(" ");
}

/** StudioPage seededRandom 포트 — 같은 id 면 같은 난수열(집중선/속도선 재현의 핵심). */
function seededRandom(seedStr: string): () => number {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return () => {
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };
}

/** StudioPage drawBounds 포트 — 도형 드래그 박스(첫 두 점 기준). */
function drawBounds(points: readonly number[]): { x: number; y: number; width: number; height: number } {
  const x1 = points[0] ?? 0;
  const y1 = points[1] ?? 0;
  const x2 = points[2] ?? x1;
  const y2 = points[3] ?? y1;
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** StudioPage getSymmetricPoints 포트 — 대칭 드로잉 변형 좌표열. */
function getSymmetricPoints(points: number[], symmetry: SvgDrawElLike["symmetry"]): number[][] {
  if (points.length === 0) return [points];
  return studioBrushSymmetryTransforms(symmetry).map((transform) => {
    const transformed: number[] = [];
    for (let index = 0; index + 1 < points.length; index += 2) {
      transformed.push(...transformStudioBrushSymmetryPoint(
        points[index]!,
        points[index + 1]!,
        transform
      ));
    }
    return transformed;
  });
}

/** StudioPage formatVerticalText 포트 — 세로쓰기(열 우→좌, 빈 칸은 전각 공백). */
function formatVerticalText(text: string): string {
  const lines = text.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length));
  const resultLines: string[] = [];
  for (let charIdx = 0; charIdx < maxLen; charIdx++) {
    const rowChars: string[] = [];
    for (let lineIdx = lines.length - 1; lineIdx >= 0; lineIdx--) {
      rowChars.push(lines[lineIdx]?.[charIdx] ?? "　");
    }
    resultLines.push(rowChars.join("  "));
  }
  return resultLines.join("\n");
}

/**
 * Konva Line(tension) 곡선 포트 — 카디널 스플라인 제어점(getControlPoints/expandPoints)을
 * 그대로 재현해 Q/C 커맨드 path 로 만든다. 점이 2개 이하이거나 제어점이 없으면 직선.
 */
function tensionPathD(points: readonly number[], tension: number): string {
  if (points.length < 6 || tension === 0) return pointsToPathD(points);
  const tp: number[] = [];
  for (let n = 2; n < points.length - 2; n += 2) {
    const x0 = points[n - 2];
    const y0 = points[n - 1];
    const x1 = points[n];
    const y1 = points[n + 1];
    const x2 = points[n + 2];
    const y2 = points[n + 3];
    const d01 = Math.hypot(x1 - x0, y1 - y0);
    const d12 = Math.hypot(x2 - x1, y2 - y1);
    const fa = (tension * d01) / (d01 + d12);
    const fb = (tension * d12) / (d01 + d12);
    if (Number.isNaN(fa)) continue; // 겹친 점(d01+d12=0) — Konva 와 동일하게 건너뜀
    tp.push(x1 - fa * (x2 - x0), y1 - fa * (y2 - y0), x1, y1, x1 + fb * (x2 - x0), y1 + fb * (y2 - y0));
  }
  if (tp.length < 4) return pointsToPathD(points);
  const parts = [`M ${fmt(points[0])} ${fmt(points[1])}`, `Q ${fmt(tp[0])} ${fmt(tp[1])} ${fmt(tp[2])} ${fmt(tp[3])}`];
  let n = 4;
  while (n < tp.length - 2) {
    parts.push(`C ${fmt(tp[n])} ${fmt(tp[n + 1])} ${fmt(tp[n + 2])} ${fmt(tp[n + 3])} ${fmt(tp[n + 4])} ${fmt(tp[n + 5])}`);
    n += 6;
  }
  parts.push(
    `Q ${fmt(tp[tp.length - 2])} ${fmt(tp[tp.length - 1])} ${fmt(points[points.length - 2])} ${fmt(points[points.length - 1])}`
  );
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// 내보내기 컨텍스트 — defs/스킵/글꼴 수집 + 결정적 def id 발급
// ---------------------------------------------------------------------------

interface ExportCtx {
  defs: string[];
  skips: SvgExportSkip[];
  fonts: Set<string>;
  theme: SvgExportTheme;
  /** def id 일련번호 — 입력 순서에만 의존해 결정적. */
  seq: number;
}

function nextId(ctx: ExportCtx, prefix: string): string {
  ctx.seq += 1;
  return `${prefix}${ctx.seq}`;
}

function addSkip(ctx: ExportCtx, el: { id: string; type: string }, mode: SvgExportSkip["mode"], label: string): void {
  ctx.skips.push({ id: el.id, type: el.type, mode, label });
}

/** 그라데이션 defs — userSpaceOnUse 좌표(노드 로컬 bbox + 로컬 원점 오프셋). */
function gradientDef(ctx: ExportCtx, spec: StudioGradientSpec, bbox: GradientBBox, origin: { x: number; y: number }): string {
  const safe = normalizeGradientSpec(spec);
  const id = nextId(ctx, "sg");
  const stops = safe.stops.map((s) => `<stop offset="${fmt(s.offset * 100)}%" stop-color="${s.color}"/>`).join("");
  if (safe.type === "radial") {
    const geo = radialGradientGeometry(bbox);
    ctx.defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fmt(origin.x + geo.center.x)}" cy="${fmt(origin.y + geo.center.y)}" r="${fmt(geo.endRadius)}">${stops}</radialGradient>`
    );
  } else {
    const { start, end } = linearGradientPoints(safe, bbox);
    ctx.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(origin.x + start.x)}" y1="${fmt(origin.y + start.y)}" x2="${fmt(origin.x + end.x)}" y2="${fmt(origin.y + end.y)}">${stops}</linearGradient>`
    );
  }
  return `url(#${id})`;
}

/** 패턴 defs — 타일 마크업(studio-pattern-fill)을 노드 로컬 원점에 정렬해 반복. */
function patternDefFill(ctx: ExportCtx, spec: StudioPatternSpec, origin: { x: number; y: number }): string {
  const safe = normalizePatternSpec(spec);
  const def = getPatternDef(safe.patternId);
  const id = nextId(ctx, "sp");
  const size = def.tile * safe.scale;
  const bgRect = safe.bg ? `<rect width="${fmt(def.tile)}" height="${fmt(def.tile)}" fill="${safe.bg}"/>` : "";
  ctx.defs.push(
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${fmt(size)}" height="${fmt(size)}" patternTransform="translate(${fmt(origin.x)} ${fmt(origin.y)})"><g transform="scale(${fmt(safe.scale)})">${bgRect}${def.inner(safe.fg)}</g></pattern>`
  );
  return `url(#${id})`;
}

/** 그림자 필터 defs — canvas shadow* 를 feDropShadow 로 근사(σ ≈ blur/2). */
function shadowFilterDef(
  ctx: ExportCtx,
  shadow: { color: string; blur: number; offsetX: number; offsetY: number; opacity: number }
): string {
  const id = nextId(ctx, "sf");
  ctx.defs.push(
    `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="${fmt(shadow.offsetX)}" dy="${fmt(shadow.offsetY)}" stdDeviation="${fmt(shadow.blur / 2)}" flood-color="${escapeXml(shadow.color)}" flood-opacity="${fmt(shadow.opacity)}"/></filter>`
  );
  return `url(#${id})`;
}

// ---------------------------------------------------------------------------
// 텍스트 공통 — 줄 배치·정렬·폭 초과(자동 줄바꿈 없음) 근사 판정
// ---------------------------------------------------------------------------

// 알파벳 기준선 근사 오프셋(em) — Konva 10 은 폰트 메트릭 (ascent-descent)/2 를 쓰고,
// 한글/라틴 통상 메트릭(ascent≈0.86em, descent≈0.14em)에서 0.36em 에 수렴한다.
const BASELINE_EM = 0.36;

/** 한 줄 폭 근사(px) — CJK/전각 1em, 그 외 0.55em + 자간. 자동 줄바꿈 경고 판정 전용. */
function estimateLineWidth(line: string, fontSize: number, letterSpacing: number): number {
  let units = 0;
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    units += code > 0x2e7f ? 1 : 0.55;
  }
  return units * fontSize + Math.max(0, line.length - 1) * letterSpacing;
}

interface TextBlockOptions {
  text: string;
  x: number; // 정렬 기준 박스 로컬 x
  y: number; // 박스 로컬 y(첫 줄 상단)
  boxWidth: number; // 정렬 박스 폭(0 이면 왼쪽 앵커 고정)
  boxHeight?: number; // verticalAlign middle 용(미지정 시 상단 정렬)
  fontSize: number;
  lineHeight: number; // 배수
  letterSpacing: number;
  align: "left" | "center" | "right";
  fontFamily: string;
  fontStyle: "normal" | "bold" | "italic" | "bold italic";
  fill: string; // 색 또는 url(#...)
  stroke?: string;
  strokeWidth?: number;
  filter?: string;
}

/** 여러 줄 텍스트 <text> 마크업 — Konva Text 의 줄 중앙(midline) 배치와 동일 산식. */
function textBlockMarkup(opts: TextBlockOptions): string {
  const lines = opts.text.split("\n");
  const lineHeightPx = opts.fontSize * opts.lineHeight;
  // verticalAlign middle — 블록 높이를 박스 안 가운데로(Konva alignY 산식).
  const alignY = opts.boxHeight !== undefined ? (opts.boxHeight - lines.length * lineHeightPx) / 2 : 0;
  const anchor = opts.align === "center" ? "middle" : opts.align === "right" ? "end" : "start";
  const anchorX = opts.align === "center" ? opts.x + opts.boxWidth / 2 : opts.align === "right" ? opts.x + opts.boxWidth : opts.x;
  const weight = opts.fontStyle.includes("bold") ? "bold" : undefined;
  const style = opts.fontStyle.includes("italic") ? "italic" : undefined;
  const spans = lines
    .map((line, i) => {
      const baseline = opts.y + alignY + (i + 0.5) * lineHeightPx + opts.fontSize * BASELINE_EM;
      return `<tspan x="${fmt(anchorX)}" y="${fmt(baseline)}">${escapeXml(line)}</tspan>`;
    })
    .join("");
  const strokeAttrs =
    opts.stroke && (opts.strokeWidth ?? 0) > 0
      ? `${att("stroke", opts.stroke)}${att("stroke-width", opts.strokeWidth)} paint-order="stroke" stroke-linejoin="round"`
      : "";
  return (
    `<text xml:space="preserve" font-family="${escapeXml(opts.fontFamily)}" font-size="${fmt(opts.fontSize)}"` +
    `${att("font-weight", weight)}${att("font-style", style)}` +
    `${opts.letterSpacing !== 0 ? att("letter-spacing", opts.letterSpacing) : ""}` +
    ` text-anchor="${anchor}" fill="${escapeXml(opts.fill)}"${strokeAttrs}${opts.filter ? att("filter", opts.filter) : ""}>` +
    `${spans}</text>`
  );
}

// ---------------------------------------------------------------------------
// 세로쓰기(縦組み) — studio-vertical-text 코어를 캔버스와 같은 지오메트리로 SVG에 옮긴다
// ---------------------------------------------------------------------------

/**
 * SVG 내보내기용 세로쓰기 글자 폭 측정기 — 이 모듈은 순수/Worker 안전이라 캔버스 measureText를
 * 쓸 수 없으므로 `estimateLineWidth` 근사를 쓴다. 한글/한자만 있는 세로쓰기는 회전 런이 없어
 * 폭 측정 자체가 호출되지 않으므로 화면과 열 나눔이 정확히 같다. 라틴/숫자 구간이 섞이면
 * 그 런의 길이만 근사가 되어 열 나눔 지점이 화면과 달라질 수 있고, 그때는 정직하게 고지한다.
 */
const SVG_VERTICAL_MEASURER: VerticalTextMeasurer = {
  measureWidth: (text, fontPx) => estimateLineWidth(text, fontPx, 0),
};

interface VerticalTextBlockOptions {
  layout: VerticalTextLayout;
  fontSize: number;
  letterSpacing: number;
  fontFamily: string;
  fontStyle: "normal" | "bold" | "italic" | "bold italic";
  /** 단색이면 그대로, 그라데이션이면 아이템 로컬 좌표계마다 새 def를 만들어야 해 콜백으로 받는다. */
  fill: (item: VerticalTextItem) => string;
  stroke?: string;
  strokeWidth?: number;
  filter?: string;
}

/**
 * 세로쓰기 블록 마크업 — 아이템마다 `<g transform="translate(x y)[ rotate(90)]">` 안에 로컬
 * 원점 기준 `textBlockMarkup`을 하나 넣는다. Konva 쪽(StudioKonvaTextNodes의 세로쓰기 노드)이
 * 만드는 노드 트리와 **좌표계가 1:1로 대응**하므로(자식 노드 = 이 `<g>`), 그라데이션처럼 노드
 * 로컬 좌표계에서 해석되는 값도 캔버스와 같은 결과가 된다.
 */
function verticalTextBlockMarkup(opts: VerticalTextBlockOptions): string {
  const parts: string[] = [];
  for (const column of opts.layout.columns) {
    for (const item of column.items) {
      const { boxWidth, lineHeight } = verticalTextItemGeometry(item, opts.fontSize);
      const rotated = item.rotation === 90;
      const block = textBlockMarkup({
        text: item.text,
        x: 0,
        y: 0,
        boxWidth: rotated ? 0 : boxWidth,
        fontSize: opts.fontSize,
        lineHeight,
        letterSpacing: rotated ? opts.letterSpacing : 0,
        align: rotated ? "left" : "center",
        fontFamily: opts.fontFamily,
        fontStyle: opts.fontStyle,
        fill: opts.fill(item),
        stroke: opts.stroke,
        strokeWidth: opts.strokeWidth,
        filter: opts.filter,
      });
      const transform = `translate(${fmt(item.x)} ${fmt(item.y)})${rotated ? " rotate(90)" : ""}`;
      parts.push(`<g transform="${transform}">${block}</g>`);
    }
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// 요소별 직렬화
// ---------------------------------------------------------------------------

/** 도형/선 채우기 값 — 우선순위 패턴 > 그라데이션 > 단색 > 없음(none). */
function resolveDrawFill(
  ctx: ExportCtx,
  el: SvgDrawElLike,
  origin: { x: number; y: number },
  gradientBBox: GradientBBox | null
): string {
  if (el.pattern) return patternDefFill(ctx, el.pattern, origin);
  if (el.gradient && gradientBBox) return gradientDef(ctx, el.gradient, gradientBBox, origin);
  return el.fill ?? "none";
}

function serializeDraw(ctx: ExportCtx, el: SvgDrawElLike): string {
  if (el.mode === "eraser") {
    addSkip(ctx, el, "skipped", "지우개 자국은 벡터로 재현할 수 없어 제외했어요.");
    return "";
  }
  const kind = el.kind ?? "freehand";
  const opacity = el.opacity ?? 1;
  const stroke = el.stroke;
  const strokeWidth = Math.max(1, el.strokeWidth);
  const strokeStyle = normalizeStrokeStyle(el.strokeStyle);
  const shapeParams = normalizeShapeParams(el.shapeParams);
  const dash = strokeDashArray(strokeStyle.dash, strokeWidth);
  const dashAttr = dash ? att("stroke-dasharray", dash.map(fmt).join(" ")) : "";
  const opacityAttr = opacity !== 1 ? att("opacity", opacity) : "";
  const strokeAttrs = `${att("stroke", stroke)}${att("stroke-width", strokeWidth)}`;

  const variations = getSymmetricPoints(el.points, el.symmetry);
  const dynamicBrushId = kind === "freehand" ? resolveStudioBrushDynamicsPresetId(el.brush) : null;
  // Plan randomness exactly once in the original stroke coordinate space. Symmetry then transforms
  // the complete dab (source station, scatter offset and elliptical axis) just like Canvas does.
  const dynamicPlan = dynamicBrushId
    ? (() => {
        const dynamics = normalizeStudioBrushDynamicsSettings(
          el.brushDynamics
            ?? studioBrushDynamicsSettingsForBrushId(el.brush)
            ?? studioBrushDynamicsSettingsForBrushId(dynamicBrushId)
        );
        const seed = studioBrushDynamicsSeedFromKey(`${el.id}:${dynamics.seed}`);
        const dabPlanInput = {
          points: el.points,
          pressures: el.pressures,
          tangentialPressures: el.tangentialPressures,
          speeds: el.speeds,
          tiltXs: el.tiltXs,
          tiltYs: el.tiltYs,
          twists: el.twists,
          baseWidth: strokeWidth,
          baseOpacity: dynamics.opacity.base,
          settings: dynamics,
          seed,
        };
        let baseDabs = planStudioDynamicBrushDabs({
          ...dabPlanInput,
          maxDabs: DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS,
        });
        const renderBudget = planStudioDynamicBrushRenderBudget({
          settings: dynamics,
          dabCount: baseDabs.length,
          symmetryCount: variations.length,
          markBudget: STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
        });
        if (renderBudget.maxDabsPerVariation < baseDabs.length) {
          baseDabs = planStudioDynamicBrushDabs({
            ...dabPlanInput,
            maxDabs: renderBudget.maxDabsPerVariation,
          });
        }
        return {
          dynamics,
          seed,
          renderBudget,
          dabVariations: studioDynamicBrushDabVariations(baseDabs, el.symmetry),
        };
      })()
    : null;
  const dynamicDabVariations = dynamicPlan?.dabVariations ?? null;
  const parts: string[] = [];
  for (const [variationIndex, points] of variations.entries()) {
    if (kind === "rect") {
      const box = drawBounds(points);
      const w = Math.max(0.1, box.width);
      const h = Math.max(0.1, box.height);
      const fill = resolveDrawFill(ctx, el, { x: box.x, y: box.y }, { x: 0, y: 0, width: w, height: h });
      const rx = effectiveCornerRadius(box.width, box.height, shapeParams.cornerRadius);
      parts.push(
        `<rect x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(w)}" height="${fmt(h)}"${rx > 0 ? att("rx", rx) : ""} fill="${escapeXml(fill)}"${strokeAttrs}${dashAttr} stroke-linejoin="round"${opacityAttr}/>`
      );
    } else if (kind === "ellipse") {
      const box = drawBounds(points);
      const w = Math.max(0.1, box.width);
      const h = Math.max(0.1, box.height);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const fill = resolveDrawFill(ctx, el, { x: cx, y: cy }, { x: -box.width / 2, y: -box.height / 2, width: w, height: h });
      parts.push(
        `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(w / 2)}" ry="${fmt(h / 2)}" fill="${escapeXml(fill)}"${strokeAttrs}${dashAttr}${opacityAttr}/>`
      );
    } else if (kind === "star" || kind === "triangle" || kind === "polygon") {
      const box = drawBounds(points);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const m = Math.max(0.1, Math.min(box.width, box.height));
      // 캔버스 규약: 그라데이션은 별에만(triangle/polygon 은 패턴·단색만) — 동일하게 반영.
      const gradientBBox = kind === "star" ? { x: -m / 2, y: -m / 2, width: m, height: m } : null;
      const fill = resolveDrawFill(ctx, el, { x: cx, y: cy }, gradientBBox);
      const pts =
        kind === "star"
          ? starPathPoints(cx, cy, m / 2, shapeParams)
          : polygonPathPointsInBounds(
              box.x,
              box.y,
              box.width,
              box.height,
              kind === "triangle" ? 3 : shapeParams.polygonSides
            );
      parts.push(
        `<polygon points="${pointsAttr(pts)}" fill="${escapeXml(fill)}"${strokeAttrs}${dashAttr} stroke-linejoin="round"${opacityAttr}/>`
      );
    } else if (kind === "line") {
      const heads = lineArrowHeadGeoms(points, strokeStyle, strokeWidth)
        .map((head) =>
          head.kind === "dot"
            ? `<circle cx="${fmt(head.cx)}" cy="${fmt(head.cy)}" r="${fmt(head.r)}" fill="${escapeXml(stroke)}"/>`
            : `<path d="${pointsToPathD(head.points, true)}" fill="${escapeXml(stroke)}" stroke-linejoin="round"/>`
        )
        .join("");
      parts.push(
        `<g${opacityAttr}><path d="${pointsToPathD(points)}" fill="none"${strokeAttrs}${dashAttr} stroke-linecap="${strokeStyle.lineCap}" stroke-linejoin="round"/>${heads}</g>`
      );
    } else if (kind === "arrow") {
      // Konva Arrow 재현 — 몸통 폴리라인 + 끝점 삼각 화살촉(굵기 비례, 화살촉은 점선 미적용).
      const pointer = Math.max(8, strokeWidth * 2);
      let head = "";
      if (points.length >= 4) {
        const xe = points[points.length - 2];
        const ye = points[points.length - 1];
        const angle = Math.atan2(ye - points[points.length - 3], xe - points[points.length - 4]);
        const bx = xe - pointer * Math.cos(angle);
        const by = ye - pointer * Math.sin(angle);
        const px = (pointer / 2) * Math.cos(angle + Math.PI / 2);
        const py = (pointer / 2) * Math.sin(angle + Math.PI / 2);
        head = `<path d="${pointsToPathD([xe, ye, bx + px, by + py, bx - px, by - py], true)}" fill="${escapeXml(stroke)}"${strokeAttrs}/>`;
      }
      parts.push(
        `<g${opacityAttr}><path d="${pointsToPathD(points)}" fill="none"${strokeAttrs}${dashAttr} stroke-linecap="${strokeStyle.lineCap}"/>${head}</g>`
      );
    } else {
      parts.push(serializeFreehand(
        ctx,
        el,
        points,
        stroke,
        strokeWidth,
        opacityAttr,
        opacity,
        dynamicDabVariations?.[variationIndex],
        dynamicPlan?.dynamics,
        dynamicPlan?.seed,
        dynamicPlan?.renderBudget.stampGrid
      ));
    }
  }
  return parts.join("");
}

/** Canvas drawDab과 같은 하나의 논리 dab → 종류별 SVG 마크 직렬화. */
function serializeStampBrushDabs(
  ctx: ExportCtx,
  style: StudioStampBrushStyle,
  dabs: readonly StudioStampBrushDab[]
): string {
  if (dabs.length === 0) return "";
  const color = escapeXml(style.color);

  if (style.kind === "ink") {
    const circles = dabs.map((dab) => (
      `<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radius)}" fill="${color}" opacity="${fmtDabOpacity(dab.alpha)}"/>`
    )).join("");
    return `<g data-stamp-brush="ink">${circles}</g>`;
  }

  if (style.kind === "pencil") {
    const marks = dabs.map((dab) => {
      // Canvas drawDab과 같은 salt/산식 — 주 dab 1개 + 종이 그레인 2개.
      const jx = (stampJitter(dab.index, 11) - 0.5) * dab.radius * 0.5;
      const jy = (stampJitter(dab.index, 23) - 0.5) * dab.radius * 0.5;
      const primaryRadius = dab.radius * (0.82 + 0.18 * stampJitter(dab.index, 41));
      const primaryOpacity = dab.alpha * (0.7 + 0.3 * stampJitter(dab.index, 37));
      const grains = [0, 1].map((grain) => {
        const gx = dab.x + (stampJitter(dab.index, 53 + grain) - 0.5) * dab.radius * 2.4;
        const gy = dab.y + (stampJitter(dab.index, 67 + grain) - 0.5) * dab.radius * 2.4;
        return `<circle cx="${fmt(gx)}" cy="${fmt(gy)}" r="${fmt(dab.radius * 0.2)}" opacity="${fmtDabOpacity(dab.alpha * 0.45)}"/>`;
      }).join("");
      return `<circle cx="${fmt(dab.x + jx)}" cy="${fmt(dab.y + jy)}" r="${fmt(primaryRadius)}" opacity="${fmtDabOpacity(primaryOpacity)}"/>${grains}`;
    }).join("");
    return `<g data-stamp-brush="pencil" fill="${color}">${marks}</g>`;
  }

  // Canvas의 inner radius(hardness×.85)까지 단색, 바깥에서 0으로 감쇠하는 방사 팁.
  const gradientId = nextId(ctx, style.kind === "airbrush" ? "ssa" : "ssw");
  const hardStop = fmt(Math.min(1, Math.max(0, style.hardness)) * 85);
  ctx.defs.push(
    `<radialGradient id="${gradientId}" cx="50%" cy="50%" r="50%"><stop offset="${hardStop}%" stop-color="${color}"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient>`
  );
  const marks = dabs.map((dab) => {
    const fill = `<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radius)}" fill="url(#${gradientId})" opacity="${fmtDabOpacity(dab.alpha)}"/>`;
    if (style.kind === "airbrush") return fill;
    // 수채 웻엣지 링도 Canvas와 같은 반경·굵기·0.22 농도다.
    return `${fill}<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radius * 0.94)}" fill="none" stroke="${color}" stroke-width="${fmt(Math.max(0.35, dab.radius * 0.1))}" opacity="${fmtDabOpacity(dab.alpha * 0.22)}"/>`;
  }).join("");
  return `<g data-stamp-brush="${style.kind}">${marks}</g>`;
}

const STUDIO_PENCIL_DEFAULT_JITTER_RADIUS = 0.75;

function scaledPencilJitterPoints(
  points: number[],
  jitterRadius: number
): number[] {
  const jittered = processPencilPoints(points);
  if (jitterRadius === STUDIO_PENCIL_DEFAULT_JITTER_RADIUS) return jittered;
  const scale = jitterRadius / STUDIO_PENCIL_DEFAULT_JITTER_RADIUS;
  return jittered.map((value, coordinateIndex) => {
    const source = points[coordinateIndex];
    return source === undefined ? value : source + (value - source) * scale;
  });
}

/** 자유곡선(브러시별) — 캔버스 렌더 경로와 같은 지오메트리 소스(studio-brush)를 쓴다. */
function serializeFreehand(
  ctx: ExportCtx,
  el: SvgDrawElLike,
  points: number[],
  stroke: string,
  strokeWidth: number,
  opacityAttr: string,
  strokeOpacity: number,
  dynamicDabs?: readonly StudioDynamicBrushDab[],
  dynamics?: NormalizedStudioBrushDynamicsSettings,
  dynamicSeed?: number,
  dynamicStampGrid: StudioDynamicBrushRenderStampGrid = 7
): string {
  const brush = el.brush ?? "pen";
  const brushFamily = resolveStudioBrushRenderFamily(brush);
  const dynamicsPresetId = resolveStudioBrushDynamicsPresetId(brush);
  const dynamicBrush = dynamicsPresetId !== null;
  const stampKind = resolveStudioStampBrushKind(brush);
  const renderSampleDistance = strokeRenderDistance(el.sampleSpacing);
  const aliasStrokeWidth = studioBrushAliasEffectiveDiameter(brush, strokeWidth);
  const singlePointRoute = resolveStudioBrushSinglePointRoute({
    brushId: brush,
    mode: el.mode,
    causalInkEnabled: el.sampleSpacing !== undefined || el.pressureModel !== undefined,
  });

  if (isStudioPixelPencilRenderMode(brush) && el.mode !== "eraser") {
    const pixelPlan = planStudioPixelPencilCells({ points });
    if (!pixelPlan.complete) {
      addSkip(ctx, el, "skipped", "픽셀 펜 셀 예산을 초과해 SVG에서 안전하게 제외했어요.");
      return "";
    }
    const path = pixelPlan.cells
      .map((cell) => `M${cell.x} ${cell.y}h1v1h-1Z`)
      .join("");
    return path
      ? `<path d="${path}" fill="${escapeXml(stroke)}" shape-rendering="crispEdges"${opacityAttr}/>`
      : "";
  }

  if (
    points.length === 2 &&
    singlePointRoute === "generic-dot"
  ) {
    const pencilPasses = resolveStudioBrushAliasPencilPasses(brush);
    if (brushFamily === "pencil" && pencilPasses.length > 0) {
      const circles = pencilPasses.map((pass) => (
        `<circle data-pencil-pass="${pass.role}" cx="${fmt(points[0])}" cy="${fmt(points[1])}" r="${fmt(Math.max(0.35, aliasStrokeWidth * pass.widthScale / 2))}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(strokeOpacity * pass.opacityScale)}"/>`
      ));
      return `<g data-brush-alias="${escapeXml(brush)}">${circles.join("")}</g>`;
    }
    const pressure = mapStudioBrushAliasPressure(
      brush,
      resolveStudioInkPressure(el.pressures?.[0], el.pressureModel),
      studioInkFallbackPressure(el.pressureModel)
    );
    const pressureAware = brushFamily === "pen"
      || brushFamily === "gpen"
      || brushFamily === "calligraphy"
      || brushFamily === "perfect"
      || brushFamily === "marker";
    const width = pressureAware
      ? aliasStrokeWidth * (0.3 + pressure * 1.4)
      : aliasStrokeWidth;
    if (brushFamily === "highlighter") {
      const half = aliasStrokeWidth / 2;
      return `<rect x="${fmt(points[0] - half)}" y="${fmt(points[1] - half)}" width="${fmt(aliasStrokeWidth)}" height="${fmt(aliasStrokeWidth)}" fill="${escapeXml(stroke)}" style="mix-blend-mode:multiply"${opacityAttr}/>`;
    }
    if (brushFamily === "brush" || brushFamily === "calligraphy") {
      const roundness = brushFamily === "calligraphy"
        ? Math.min(1, Math.max(0.08, el.brushTip?.roundness ?? 0.35))
        : 0.36;
      const angle = brushFamily === "calligraphy"
        ? el.brushTip?.angleDeg ?? -30
        : -30;
      return `<ellipse cx="${fmt(points[0])}" cy="${fmt(points[1])}" rx="${fmt(Math.max(0.35, width / 2))}" ry="${fmt(Math.max(0.35, width * roundness / 2))}" fill="${escapeXml(stroke)}" transform="rotate(${fmt(angle)} ${fmt(points[0])} ${fmt(points[1])})"${opacityAttr}/>`;
    }
    const radius = pressureAware && el.pressureModel !== undefined
      ? studioInkPressureRadius(aliasStrokeWidth, pressure, el.pressureModel)
      : Math.max(0.35, width / 2);
    return `<circle cx="${fmt(points[0])}" cy="${fmt(points[1])}" r="${fmt(radius)}" fill="${escapeXml(stroke)}"${opacityAttr}/>`;
  }

  if (stampKind) {
    const style = resolveStudioStampBrushStyle(
      stampKind,
      { color: stroke, size: strokeWidth, opacity: strokeOpacity },
      el.stamp
    );
    // v2는 이미 수락·안정화된 append-only 입력이다. legacy만 과거 평활화/압력 재표본을 유지한다.
    const causal = el.stampPipeline === "causal-walker-v2";
    const stampPoints = causal
      ? points
      : resolveStudioFreehandRenderPath(points, {
          sampleSpacing: el.sampleSpacing,
          legacyMinDistance: renderSampleDistance,
          legacyTension: 0,
        }).points;
    const sourceAligned = causal || stampPoints === points;
    const stampPressures = sourceAligned
      ? el.pressures
      : resampleStrokePressures(
          el.pressures ?? [],
          Math.floor(stampPoints.length / 2),
          0.5
        );
    return serializeStampBrushDabs(
      ctx,
      style,
      planStudioStampBrushDabs(style, stampPoints, stampPressures)
    );
  }

  if (dynamicBrush && dynamicsPresetId) {
    const normalizedDynamics = dynamics ?? normalizeStudioBrushDynamicsSettings(
      el.brushDynamics
        ?? studioBrushDynamicsSettingsForBrushId(brush)
        ?? studioBrushDynamicsSettingsForBrushId(dynamicsPresetId)
    );
    const strokeSeed = dynamicSeed
      ?? studioBrushDynamicsSeedFromKey(`${el.id}:${normalizedDynamics.seed}`);
    const dabs = dynamicDabs ?? [];
    const grainActive = studioBrushGrainIsActive(normalizedDynamics.grain);
    const tipDefinitions = [
      normalizedDynamics.tip,
      ...normalizedDynamics.tipLayers.map((layer) => layer.tip),
    ];
    // 듀얼 브러시는 1차 팁(index 0)에만 합성 — 비활성 시 기존 함수와 동일 반환(바이트 불변).
    const dualBrush = normalizedDynamics.dualBrush;
    const tipUsesEllipse = tipDefinitions.map((tip, tipIndex) => (
      !grainActive && (tipIndex === 0
        ? studioBrushDualTipUsesSolidEllipse(tip, dualBrush)
        : studioBrushTipUsesSolidEllipse(tip))
    ));
    const tipAlphaMaps = tipDefinitions.map((tip, tipIndex) => (
      tipUsesEllipse[tipIndex]
        ? null
        : tipIndex === 0
          ? composeStudioBrushDualTipAlphaMap(tip, dualBrush)
          : buildStudioBrushTipAlphaMap(tip)
    ));
    const strokeOriginX = dabs[0]?.sourceX ?? dabs[0]?.x ?? 0;
    const strokeOriginY = dabs[0]?.sourceY ?? dabs[0]?.y ?? 0;
    const marks: string[] = [];
    const grainAt = (x: number, y: number) => resolveNormalizedStudioBrushGrainAlphaMultiplier({
      x,
      y,
      strokeOriginX,
      strokeOriginY,
      strokeSeed,
    }, normalizedDynamics.grain);

    const dabScale = aliasStrokeWidth / 16;
    for (const dab of dabs) {
      const dabColor = escapeXml(resolveNormalizedStudioBrushDabColor(
        stroke,
        dab.index,
        strokeSeed,
        normalizedDynamics.colorDynamics
      ));
      const composed = planNormalizedStudioBrushTipComposition(
        dab,
        normalizedDynamics.tip,
        normalizedDynamics.tipLayers
      );
      for (const composedTip of composed) {
        const composedDab = composedTip.dab;
        const tipIndex = composedTip.role === "primary" ? 0 : composedTip.layerIndex + 1;
        const baseOpacity = Math.min(
          1,
          Math.max(0, composedDab.opacity * composedDab.flow * strokeOpacity)
        );
        const alphaMap = tipAlphaMaps[tipIndex] ?? null;
        if (tipUsesEllipse[tipIndex] || !alphaMap) {
          // Canvas clamps the circular radius and then scales its Y axis by roundness.
          const radius = Math.max(0.25, (composedDab.size * dabScale) / 2);
          const opacity = Math.min(
            1,
            Math.max(0, baseOpacity * grainAt(composedDab.x, composedDab.y))
          );
          marks.push(`<ellipse cx="${fmt(composedDab.x)}" cy="${fmt(composedDab.y)}" rx="${fmt(radius)}" ry="${fmt(radius * composedDab.roundness)}" fill="${dabColor}" opacity="${fmtDabOpacity(opacity)}" transform="rotate(${fmt(composedDab.angle)} ${fmt(composedDab.x)} ${fmt(composedDab.y)})"/>`);
          continue;
        }

        for (const sample of planStudioBrushTipStampWorldSamples(
          composedDab,
          composedTip.tip,
          { alphaMap, grid: dynamicStampGrid }
        )) {
          const opacity = Math.min(
            1,
            Math.max(0, baseOpacity * sample.alpha * grainAt(sample.x, sample.y))
          );
          marks.push(`<circle cx="${fmt(sample.x)}" cy="${fmt(sample.y)}" r="${fmt(sample.radius * dabScale)}" fill="${dabColor}" opacity="${fmtDabOpacity(opacity)}"/>`);
        }
      }
    }
    return `<g>${marks.join("")}</g>`;
  }

  const perfectProfile = resolveStudioPerfectFreehandProfile(brush);
  if (perfectProfile) {
    // perfect 잉크와 G펜 계열 — 캔버스와 같은 연속 가변 폭 아웃라인을 선 색으로 채운다.
    // getStroke는 순수 함수라 같은 입력이면 바이트가 동일하다(내보내기 결정성 규약 유지).
    const perfectStroker = peekStudioPerfectFreehandStroker();
    if (perfectStroker) {
      const outlinePressures = brushFamily === "gpen"
        || (el.pressures && el.pressures.length > 0)
        ? mapStudioBrushAliasPressureSamples(
            brush,
            el.pressures,
            Math.floor(points.length / 2),
            brushFamily === "gpen" ? 0.6 : 0.5
          )
        : el.pressures;
      const pathD = buildStudioPerfectFreehandPathData(perfectStroker, {
        points,
        pressures: outlinePressures,
        strokeWidth: aliasStrokeWidth,
        profile: perfectProfile,
      });
      if (pathD) {
        return `<path d="${pathD}" fill="${escapeXml(stroke)}" data-brush-engine="perfect-outline" data-brush-variant="${escapeXml(brush)}"${opacityAttr}/>`;
      }
    }
    // 모듈 미로드(드문 경우: 해당 브러시 획을 화면에 그린 적 없이 곧바로 내보내기) — 다음
    // 내보내기를 위해 백그라운드 로드를 걸고, 이번에는 깨끗한 라인 폴백으로 근사한다.
    if (!perfectStroker) {
      void loadStudioPerfectFreehandStroker().catch(() => {});
    }
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.4,
    });
    return `<path d="${tensionPathD(renderPath.points, renderPath.tension)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(aliasStrokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr}/>`;
  }

  if (brushFamily === "watercolor") {
    const watercolorSettings = resolveStudioBrushAliasWatercolorPlanSettings(
      brush,
      strokeWidth
    ) ?? { baseWidth: strokeWidth, spacing: Math.max(0.25, strokeWidth * 0.34) };
    const watercolorPressures = mapStudioBrushAliasPressureSamples(
      brush,
      el.pressures,
      Math.floor(points.length / 2),
      0.55
    );
    const plannedDabs = el.watercolorPipeline === "causal-walker-v2"
      ? planCausalWatercolorBrushDabs({
          points,
          pressures: watercolorPressures,
          baseWidth: watercolorSettings.baseWidth,
          spacing: watercolorSettings.spacing,
          seed: watercolorBrushSeedFromKey(el.id),
          maxDabs: DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
        }, true)
      : planWatercolorBrushDabs({
          points: processFreehandPoints(points, renderSampleDistance),
          pressures: watercolorPressures,
          baseWidth: watercolorSettings.baseWidth,
          spacing: watercolorSettings.spacing,
          seed: watercolorBrushSeedFromKey(el.id),
          maxDabs: 512,
        });
    const dabs = applyStudioBrushAliasWatercolorMaterial(brush, plannedDabs);
    if (dabs.length === 0) return "";
    const diffuseId = nextId(ctx, "sw");
    ctx.defs.push(
      `<radialGradient id="${diffuseId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${escapeXml(stroke)}"/><stop offset="45%" stop-color="${escapeXml(stroke)}"/><stop offset="100%" stop-color="${escapeXml(stroke)}" stop-opacity="0"/></radialGradient>`
    );
    const circles = dabs.map((dab) => (
      `<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radius)}" fill="${dab.role === "diffuse" ? `url(#${diffuseId})` : escapeXml(stroke)}" opacity="${fmtDabOpacity(dab.opacity * strokeOpacity)}"/>`
    )).join("");
    return `<g>${circles}</g>`;
  }

  if (brushFamily === "calligraphy") {
    const smoothed = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0,
    }).points;
    if (smoothed.length < 2) return "";
    const sourcePointCount = Math.floor(points.length / 2);
    const sampleCount = Math.min(
      sourcePointCount,
      Math.max(el.tiltXs?.length ?? 0, el.tiltYs?.length ?? 0, el.twists?.length ?? 0)
    );
    const stylusSamples: CalligraphyStylusInput[] = Array.from(
      { length: sampleCount },
      (_, sampleIndex) => ({
        pointerType: "pen",
        tiltX: el.tiltXs?.[sampleIndex],
        tiltY: el.tiltYs?.[sampleIndex],
        twist: el.twists?.[sampleIndex],
      })
    );
    const segments = buildCalligraphySegments(
      smoothed,
      mapStudioBrushAliasPressureSamples(
        brush,
        el.pressures,
        sourcePointCount,
        0.5,
      ),
      stylusSamples,
      aliasStrokeWidth,
      el.brushTip
    );
    if (segments.length === 0) {
      return `<circle cx="${fmt(smoothed[0])}" cy="${fmt(smoothed[1])}" r="${fmt(Math.max(0.5, aliasStrokeWidth * 0.18))}" fill="${escapeXml(stroke)}"${opacityAttr}/>`;
    }
    const ribbon = planStudioCalligraphyRibbon(segments);
    const subpaths = ribbon.runs.map((run) => {
      const outline = run.outlinePoints;
      const polygon = outline.length >= 4
        ? `M ${fmt(outline[0])} ${fmt(outline[1])} ${Array.from(
            { length: Math.max(0, outline.length / 2 - 1) },
            (_, pointIndex) => {
              const offset = (pointIndex + 1) * 2;
              return `L ${fmt(outline[offset])} ${fmt(outline[offset + 1])}`;
            }
          ).join(" ")} Z`
        : "";
      const start = run.startCap;
      const end = run.endCap;
      const startCircle = `M ${fmt(start.x + start.radius)} ${fmt(start.y)} A ${fmt(start.radius)} ${fmt(start.radius)} 0 1 0 ${fmt(start.x - start.radius)} ${fmt(start.y)} A ${fmt(start.radius)} ${fmt(start.radius)} 0 1 0 ${fmt(start.x + start.radius)} ${fmt(start.y)} Z`;
      const endCircle = `M ${fmt(end.x + end.radius)} ${fmt(end.y)} A ${fmt(end.radius)} ${fmt(end.radius)} 0 1 0 ${fmt(end.x - end.radius)} ${fmt(end.y)} A ${fmt(end.radius)} ${fmt(end.radius)} 0 1 0 ${fmt(end.x + end.radius)} ${fmt(end.y)} Z`;
      return `${polygon} ${startCircle} ${endCircle}`;
    }).join(" ");
    return `<path d="${subpaths}" fill="${escapeXml(stroke)}" fill-rule="nonzero"${opacityAttr} data-brush-engine="calligraphy-ribbon"/>`;
  }

  if (brushFamily === "brush") {
    // 붓 — 기울인 펜촉(-30°) 리본 쿼드 채움(캔버스 sceneFunc 포트).
    const smoothed = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0,
    }).points;
    if (smoothed.length < 2) return "";
    const angle = -Math.PI / 6;
    const dx = (aliasStrokeWidth / 2) * Math.cos(angle);
    const dy = (aliasStrokeWidth / 2) * Math.sin(angle);
    const sub: string[] = [];
    if (smoothed.length === 2) {
      sub.push(`M ${fmt(smoothed[0] - dx)} ${fmt(smoothed[1] - dy)} L ${fmt(smoothed[0] + dx)} ${fmt(smoothed[1] + dy)}`);
    } else {
      for (let i = 0; i < smoothed.length - 2; i += 2) {
        const x0 = smoothed[i];
        const y0 = smoothed[i + 1];
        const x1 = smoothed[i + 2];
        const y1 = smoothed[i + 3];
        sub.push(
          `M ${fmt(x0 - dx)} ${fmt(y0 - dy)} L ${fmt(x0 + dx)} ${fmt(y0 + dy)} L ${fmt(x1 + dx)} ${fmt(y1 + dy)} L ${fmt(x1 - dx)} ${fmt(y1 - dy)} Z`
        );
      }
    }
    return `<path d="${sub.join(" ")}" fill="${escapeXml(stroke)}"${opacityAttr}/>`;
  }

  if (brushFamily === "screentone") {
    // 스크린톤 — 전역 격자 정렬 망점(결정적)을 원으로 그대로 재현.
    const pitch = Math.max(3, aliasStrokeWidth * 0.42);
    const radius = Math.max(2, aliasStrokeWidth / 2);
    const dots = screentoneDotsForStroke(points, radius, pitch);
    const dotR = screentoneDotRadius(pitch);
    const circles: string[] = [];
    for (let i = 0; i + 1 < dots.length; i += 2) {
      circles.push(`<circle cx="${fmt(dots[i])}" cy="${fmt(dots[i + 1])}" r="${fmt(dotR)}"/>`);
    }
    return `<g fill="${escapeXml(stroke)}"${opacityAttr}>${circles.join("")}</g>`;
  }

  if (brushFamily === "pencil") {
    // 연필 — 새 획은 append-only raw 샘플, 레거시는 과거 평활화+tension을 유지한다.
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      acceptedTension: 0.18,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.2,
    });
    const configuredPasses = resolveStudioBrushAliasPencilPasses(brush);
    const passes = configuredPasses.length > 0
      ? configuredPasses
      : [{ role: "core" as const, widthScale: 1, opacityScale: 1, jitterRadius: 0.75 }];
    const paths = passes.map((pass) => {
      const jittered = scaledPencilJitterPoints(renderPath.points, pass.jitterRadius * (pass.role === "soft-edge" ? 0.6 : 1.3));
      return `<path d="${tensionPathD(jittered, renderPath.tension)}" fill="none" stroke="${escapeXml(stroke)}" data-pencil-pass="${pass.role}" stroke-width="${fmt(aliasStrokeWidth * pass.widthScale)}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmtDabOpacity(strokeOpacity * pass.opacityScale)}"/>`;
    });
    return `<g data-brush-alias="${escapeXml(brush)}">${paths.join("")}</g>`;
  }

  if (brushFamily === "highlighter") {
    // 형광펜 — 사각 끝 + multiply 합성(SVG mix-blend-mode 로 동일 표현).
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      acceptedTension: 0.35,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.4,
    });
    const lineJoin = brush === "chisel-highlighter" ? "bevel" : "round";
    return `<path d="${tensionPathD(renderPath.points, renderPath.tension)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(aliasStrokeWidth)}" stroke-linecap="square" stroke-linejoin="${lineJoin}" style="mix-blend-mode:multiply"${opacityAttr}/>`;
  }

  if (brushFamily === "neon") {
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      acceptedTension: 0.3,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.35,
    });
    const passes = planNeonBrushPasses(strokeWidth);
    const layers = renderPath.points.length === 2
      ? passes.map((pass) => (
          `<circle cx="${fmt(renderPath.points[0])}" cy="${fmt(renderPath.points[1])}" r="${fmt(Math.max(0.25, strokeWidth * pass.widthScale / 2))}" fill="${pass.tone === "white-core" ? "#fff" : escapeXml(stroke)}" opacity="${fmtDabOpacity(pass.opacity)}" style="mix-blend-mode:screen"/>`
        )).join("")
      : (() => {
          const pathD = tensionPathD(renderPath.points, renderPath.tension);
          return passes.map((pass) => (
            `<path d="${pathD}" fill="none" stroke="${pass.tone === "white-core" ? "#fff" : escapeXml(stroke)}" stroke-width="${fmt(Math.max(0.5, strokeWidth * pass.widthScale))}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmtDabOpacity(pass.opacity)}" style="mix-blend-mode:screen"/>`
          )).join("");
        })();
    return `<g data-brush-engine="neon-halo"${opacityAttr}>${layers}</g>`;
  }

  if (brushFamily === "glow") {
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      acceptedTension: 0.3,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.35,
    });
    const soft = (el.brush ?? "glow") === "soft-glow";
    const passes = planGlowBrushPasses(strokeWidth, soft);
    const layers = renderPath.points.length === 2
      ? passes.map((pass) => (
          `<circle cx="${fmt(renderPath.points[0])}" cy="${fmt(renderPath.points[1])}" r="${fmt(Math.max(0.25, strokeWidth * pass.widthScale / 2))}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(pass.opacity)}" style="mix-blend-mode:screen"/>`
        )).join("")
      : (() => {
          const pathD = tensionPathD(renderPath.points, renderPath.tension);
          return passes.map((pass) => (
            `<path d="${pathD}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(Math.max(0.5, strokeWidth * pass.widthScale))}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmt(pass.opacity)}" style="mix-blend-mode:screen"/>`
          )).join("");
        })();
    return `<g${opacityAttr}>${layers}</g>`;
  }

  if (brushFamily === "glitter") {
    const mode = (el.brush ?? "glitter") === "star-dust" ? "star-dust" : (el.brush === "sparkle-star" ? "sparkle-star" : "glitter");
    const particles = planGlitterBrushParticles({
      points: resolveStudioFreehandRenderPath(points, {
        sampleSpacing: el.sampleSpacing,
        legacyMinDistance: renderSampleDistance,
        legacyTension: 0,
      }).points,
      pressures: el.pressures,
      baseWidth: aliasStrokeWidth,
      seed: fxBrushSeedFromKey(el.id),
      mode,
      maxParticles: 512,
    });
    const marks = particles.map((p) => {
      if (p.kind === 1) {
        const s = p.radius * 1.35;
        return `<rect x="${fmt(p.x - s / 2)}" y="${fmt(p.y - s / 2)}" width="${fmt(s)}" height="${fmt(s)}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(p.opacity * strokeOpacity)}" transform="rotate(45 ${fmt(p.x)} ${fmt(p.y)})"/>`;
      }
      return `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(p.radius)}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(p.opacity * strokeOpacity)}"/>`;
    }).join("");
    return `<g style="mix-blend-mode:screen">${marks}</g>`;
  }

  if (brushFamily === "oil") {
    const dabs = planOilBrushDabs({
      points: resolveStudioFreehandRenderPath(points, {
        sampleSpacing: el.sampleSpacing,
        legacyMinDistance: renderSampleDistance,
        legacyTension: 0,
      }).points,
      pressures: el.pressures,
      baseWidth: aliasStrokeWidth,
      seed: fxBrushSeedFromKey(el.id),
      maxDabs: 512,
    });
    const ellipses = dabs.map((dab) => (
      `<ellipse cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" rx="${fmt(dab.radiusX)}" ry="${fmt(dab.radiusY)}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(dab.opacity * strokeOpacity)}" transform="rotate(${fmt((dab.angleRad * 180) / Math.PI)} ${fmt(dab.x)} ${fmt(dab.y)})"/>`
    )).join("");
    return `<g>${ellipses}</g>`;
  }

  if (brushFamily === "airbrush") {
    const isSplatter = el.brush === "splatter";
    const dabs = planOilBrushDabs({
      points: resolveStudioFreehandRenderPath(points, {
        sampleSpacing: el.sampleSpacing,
        legacyMinDistance: renderSampleDistance,
        legacyTension: 0,
      }).points,
      pressures: el.pressures,
      baseWidth: aliasStrokeWidth * (isSplatter ? 1.6 : 1.0),
      seed: fxBrushSeedFromKey(el.id),
      maxDabs: isSplatter ? 256 : 512,
    });
    const softId = nextId(ctx, isSplatter ? "spl" : "sa");
    ctx.defs.push(
      `<radialGradient id="${softId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${escapeXml(stroke)}"/><stop offset="${isSplatter ? "40%" : "60%"}" stop-color="${escapeXml(stroke)}" stop-opacity="${isSplatter ? "0.9" : "0.6"}"/><stop offset="100%" stop-color="${escapeXml(stroke)}" stop-opacity="0"/></radialGradient>`
    );
    const circles = dabs.map((dab) => (
      `<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radiusX * (isSplatter ? 0.7 : 1))}" fill="url(#${softId})" opacity="${fmtDabOpacity(dab.opacity * strokeOpacity)}"/>`
    )).join("");
    return `<g>${circles}</g>`;
  }

  if (brushFamily === "pastel") {
    const dabs = planPastelBrushDabs({
      points: resolveStudioFreehandRenderPath(points, {
        sampleSpacing: el.sampleSpacing,
        legacyMinDistance: renderSampleDistance,
        legacyTension: 0,
      }).points,
      pressures: el.pressures,
      baseWidth: aliasStrokeWidth,
      seed: fxBrushSeedFromKey(el.id),
      maxDabs: 512,
    });
    if (dabs.length === 0) return "";
    const softId = nextId(ctx, "sp");
    ctx.defs.push(
      `<radialGradient id="${softId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${escapeXml(stroke)}"/><stop offset="55%" stop-color="${escapeXml(stroke)}"/><stop offset="100%" stop-color="${escapeXml(stroke)}" stop-opacity="0"/></radialGradient>`
    );
    const circles = dabs.map((dab) => (
      `<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radius)}" fill="url(#${softId})" opacity="${fmtDabOpacity(dab.opacity * strokeOpacity)}"/>`
    )).join("");
    return `<g>${circles}</g>`;
  }

  // 새 기본 펜/마커 — live Canvas, WebGPU, Konva가 공유하는 round-dab footprint 그대로.
  if (
    (el.sampleSpacing !== undefined || el.pressureModel !== undefined)
    && !el.fill
    && (brushFamily === "pen" || brushFamily === "marker")
  ) {
    const plan = planStudioCausalInk({
      points,
      pressures: mapStudioBrushAliasPressureSamples(
        brush,
        el.pressures,
        Math.floor(points.length / 2),
        studioInkFallbackPressure(el.pressureModel)
      ),
      pressureModel: el.pressureModel,
      minDistance: el.sampleSpacing ?? 0,
      size: aliasStrokeWidth,
    });
    const layeredOpacity = isStudioStrokePaintModelCompatible({
      paintModel: el.paintModel,
      kind: el.kind,
      mode: el.mode,
      brush: el.brush,
      sampleSpacing: el.sampleSpacing,
      pressureModel: el.pressureModel,
      fill: el.fill,
      brushDynamics: el.brushDynamics,
      stampPipeline: el.stampPipeline,
      watercolorPipeline: el.watercolorPipeline,
      symmetry: el.symmetry,
    });
    if (layeredOpacity) {
      const path = circularDabsToCompoundPathD(plan.dabs);
      return path.length > 0
        ? `<path d="${path}" fill="${escapeXml(stroke)}"${opacityAttr}/>`
        : "";
    }
    const dabs = plan.dabs.map((dab) => (
      `<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radius)}" fill="${escapeXml(stroke)}"${opacityAttr}/>`
    )).join("");
    return `<g>${dabs}</g>`;
  }

  // Filled freehand paths are the document representation used by lasso fill and generated
  // drafting faces. Preserve their closed fill in SVG instead of degrading them to an outline.
  if (el.fill && el.mode !== "eraser" && points.length >= 6) {
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.4,
    });
    const path = renderPath.tension === 0
      ? pointsToPathD(renderPath.points, true)
      : `${tensionPathD(renderPath.points, renderPath.tension)} Z`;
    return `<path d="${path}" fill="${escapeXml(el.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr}/>`;
  }

  // 레거시 기본 펜/마커 — 필압 배열이 있으면 세그먼트별 굵기 산식으로 재현.
  const smoothed = processFreehandPoints(points, renderSampleDistance);
  const pressures = el.pressures;
  if (pressures && pressures.length > 0 && smoothed.length >= 4) {
    const sampledPressures = mapStudioBrushAliasPressureSamples(
      brush,
      resampleStrokePressures(
        pressures,
        Math.floor(smoothed.length / 2),
        studioInkFallbackPressure(el.pressureModel)
      ),
      Math.floor(smoothed.length / 2),
      studioInkFallbackPressure(el.pressureModel)
    );
    const segs: string[] = [];
    for (let i = 2; i < smoothed.length; i += 2) {
      const p = resolveStudioInkPressure(
        sampledPressures[Math.floor(i / 2)],
        el.pressureModel
      );
      const w = el.pressureModel === undefined
        ? Math.max(0.5, aliasStrokeWidth * (0.3 + p * 1.4))
        : studioInkPressureDiameter(aliasStrokeWidth, p, el.pressureModel);
      segs.push(
        `<path d="M ${fmt(smoothed[i - 2])} ${fmt(smoothed[i - 1])} L ${fmt(smoothed[i])} ${fmt(smoothed[i + 1])}" stroke="${escapeXml(stroke)}" stroke-width="${fmt(w)}" stroke-linecap="round" fill="none"/>`
      );
    }
    return `<g${opacityAttr}>${segs.join("")}</g>`;
  }
  return `<path d="${tensionPathD(smoothed, 0.4)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(aliasStrokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr}/>`;
}

function serializeText(ctx: ExportCtx, el: SvgTextElLike): string {
  const fontFamily = el.font ?? "Pretendard, sans-serif";
  ctx.fonts.add(fontFamily);
  const transform = nodeTransform(el.x, el.y, el.rotation, el);
  const opacity = el.opacity ?? 1;
  const shadowEnabled = !!el.shadowColor && (el.shadowOpacity ?? 0) > 0;
  const filter = shadowEnabled
    ? shadowFilterDef(ctx, {
        color: el.shadowColor ?? "#000000",
        blur: el.shadowBlur ?? 0,
        offsetX: el.shadowOffsetX ?? 0,
        offsetY: el.shadowOffsetY ?? 0,
        opacity: el.shadowOpacity ?? 1,
      })
    : undefined;

  const textPath = normalizeTextPath(el.textPath);
  const usesPath = el.textPath && !isFlatTextPath(textPath);

  // 채우기 — 그라데이션이면 로컬(0,0 원점) bbox 로 defs 생성(그룹 translate 안이라 로컬 좌표).
  const gradientSpec =
    el.fillType === "gradient"
      ? (el.gradient ?? legacyTextGradientToSpec(el.gradientColorStart, el.gradientColorEnd, el.gradientDirection))
      : null;

  if (usesPath) {
    const pathData = buildTextPathData(textPath, el.width, el.fontSize);
    const pathId = nextId(ctx, "stp");
    ctx.defs.push(`<path id="${pathId}" d="${escapeXml(pathData)}" fill="none"/>`);
    const fill = gradientSpec
      ? gradientDef(ctx, gradientSpec, { x: 0, y: 0, width: Math.max(1, el.width), height: el.fontSize * 2.8 }, { x: 0, y: 0 })
      : el.fill;
    const align = el.align ?? "left";
    const startOffset = align === "center" ? "50%" : align === "right" ? "100%" : "0";
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const weight = (el.fontStyle ?? "bold").includes("bold") ? "bold" : undefined;
    const style = (el.fontStyle ?? "bold").includes("italic") ? "italic" : undefined;
    const strokeAttrs =
      el.stroke && (el.strokeWidth ?? 0) > 0
        ? `${att("stroke", el.stroke)}${att("stroke-width", el.strokeWidth)} paint-order="stroke" stroke-linejoin="round"`
        : "";
    return (
      `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}>` +
      `<text xml:space="preserve" font-family="${escapeXml(fontFamily)}" font-size="${fmt(el.fontSize)}"` +
      `${att("font-weight", weight)}${att("font-style", style)}` +
      `${(el.letterSpacing ?? 0) !== 0 ? att("letter-spacing", el.letterSpacing ?? 0) : ""}` +
      ` fill="${escapeXml(fill)}"${strokeAttrs}${filter ? att("filter", filter) : ""}>` +
      `<textPath href="#${pathId}" startOffset="${startOffset}" text-anchor="${anchor}">${escapeXml(el.text)}</textPath>` +
      `</text></g>`
    );
  }

  if (el.vertical) {
    // 세로쓰기 — studio-vertical-text 코어가 캔버스와 같은 열/런 배치를 계산하고, 여기서는
    // 그 좌표를 그대로 <g transform> 으로 옮긴다(StudioKonvaTextNodes 세로쓰기 노드와 1:1 대응).
    // el.width 는 CSS 논리 속성 규약대로 inline size = **열 길이 예산**으로 읽는다.
    const verticalLetterSpacing = el.letterSpacing ?? 0;
    const verticalLayout = layoutVerticalText(
      {
        text: el.text,
        fontSize: el.fontSize,
        lineHeight: el.lineHeight ?? 1.4,
        letterSpacing: verticalLetterSpacing,
        fontFamily,
        fontStyle: el.fontStyle ?? "bold",
        maxColumnLength: el.width,
        blockAlign: verticalBlockAlign(el.align),
      },
      SVG_VERTICAL_MEASURER
    );
    if (verticalLayout.columns.some((column) => column.items.some((item) => item.rotation === 90))) {
      addSkip(
        ctx,
        el,
        "approximated",
        "세로쓰기 속 라틴/숫자 구간의 폭은 글꼴 실측 없이 근사해 열 나눔이 화면과 조금 다를 수 있어요."
      );
    }
    const verticalBlock = verticalTextBlockMarkup({
      layout: verticalLayout,
      fontSize: el.fontSize,
      letterSpacing: verticalLetterSpacing,
      fontFamily,
      fontStyle: el.fontStyle ?? "bold",
      fill: (item) =>
        gradientSpec
          ? gradientDef(
              ctx,
              gradientSpec,
              // 캔버스와 동일하게 "블록 전체 bbox를 아이템 로컬 원점으로 옮긴 것"을 쓴다.
              {
                x: -item.x,
                y: -item.y,
                width: Math.max(1, verticalLayout.width),
                height: Math.max(1, verticalLayout.height),
              },
              { x: 0, y: 0 }
            )
          : el.fill,
      stroke: el.stroke,
      strokeWidth: el.strokeWidth,
      filter,
    });
    return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}>${verticalBlock}</g>`;
  }

  const content = el.text;
  const lineHeight = el.lineHeight ?? 1;
  const letterSpacing = el.letterSpacing ?? 0;
  const fill = gradientSpec
    ? gradientDef(
        ctx,
        gradientSpec,
        estimateTextGradientBBox({ width: el.width, text: content, fontSize: el.fontSize, lineHeight }),
        { x: 0, y: 0 }
      )
    : el.fill;
  // 자동 줄바꿈은 SVG 에 없음 — 수동 줄바꿈 없이 박스 폭을 넘길 것으로 추정되면 근사 고지.
  if (content.split("\n").some((line) => estimateLineWidth(line, el.fontSize, letterSpacing) > el.width * 1.02)) {
    addSkip(ctx, el, "approximated", "자동 줄바꿈은 SVG에 없어 수동 줄바꿈(엔터)만 반영돼요.");
  }
  const block = textBlockMarkup({
    text: content,
    x: 0,
    y: 0,
    boxWidth: el.width,
    fontSize: el.fontSize,
    lineHeight,
    letterSpacing,
    align: el.align ?? "left",
    fontFamily,
    fontStyle: el.fontStyle ?? "bold",
    fill,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    filter,
  });
  return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}>${block}</g>`;
}

function serializeSticker(ctx: ExportCtx, el: SvgStickerElLike): string {
  ctx.fonts.add("Arial");
  const transform = nodeTransform(el.x, el.y, el.rotation, el);
  const opacity = el.opacity ?? 1;
  const block = textBlockMarkup({
    text: el.text,
    x: 0,
    y: 0,
    boxWidth: 0,
    fontSize: el.fontSize,
    lineHeight: 1,
    letterSpacing: 0,
    align: "left",
    fontFamily: "Arial",
    fontStyle: "normal",
    fill: "black",
  });
  return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}>${block}</g>`;
}

/** 말풍선 테마 파라미터(StudioPage 렌더의 classic/soft/vivid 분기 포트). */
function bubbleThemeParams(el: SvgBubbleElLike, theme: SvgExportTheme) {
  const avgSize = (el.width + el.height) / 2;
  let stroke = el.stroke ?? "#1f1a16";
  let strokeW = el.strokeWidth ?? (avgSize < 300 ? 2.5 : avgSize < 500 ? 3 : 3.5);
  let radius = 18;
  let tailHeightAdjust = 0;
  let borderRatio = 0.08;
  if (theme === "soft") {
    stroke = el.stroke ?? "#2d2d2d";
    strokeW = el.strokeWidth ?? (avgSize < 300 ? 1.5 : avgSize < 500 ? 1.8 : 2);
    radius = 24;
    tailHeightAdjust = -10;
  } else if (theme === "vivid") {
    stroke = el.stroke ?? "#444444";
    strokeW = el.strokeWidth ?? (avgSize < 300 ? 1.2 : avgSize < 500 ? 1.5 : 1.8);
    radius = Math.min(el.width, el.height) / 2;
    tailHeightAdjust = -14;
    borderRatio = 0.06;
  }
  return { stroke, strokeW, radius, tailHeightAdjust, borderRatio };
}

function serializeBubble(ctx: ExportCtx, el: SvgBubbleElLike): string {
  const theme = ctx.theme;
  const { stroke: bStroke, strokeW: bStrokeW, radius: bRadius, tailHeightAdjust, borderRatio } = bubbleThemeParams(el, theme);
  const tXRatio = el.tailXRatio ?? 0.35;
  const tHeight = el.tailHeight ?? 30;
  const tailDir = el.tail ?? "left";
  const tailDirection = el.tailDirection ?? "bottom";
  const showTail = tailDir !== "none";

  // 본체+꼬리 단일 path — StudioPage 와 동일 정규화(최소변 비례 꼬리 길이/밑동).
  const tailIsVertical = tailDirection === "bottom" || tailDirection === "top";
  const bMinDim = Math.min(el.width, el.height);
  const bTailLen = Math.max(bMinDim * 0.12, Math.min(Math.max(8, tHeight + tailHeightAdjust), bMinDim * 0.3));
  const automaticTailBase = Math.max(
    bMinDim * 0.1,
    (tailIsVertical ? el.width : el.height) * borderRatio * 1.8
  );
  const bTailBase = Math.max(4, Math.min(el.tailBase ?? automaticTailBase, bMinDim * 0.62));
  const bubbleTailSpec: BubbleTailSpec | null = showTail
    ? {
        direction: tailDirection,
        ratio: tailDir === "right" && tailIsVertical ? 1 - tXRatio : tXRatio,
        length: bTailLen,
        base: bTailBase,
        side: "center",
        bend: Math.max(-1, Math.min(el.tailBend ?? 0, 1)),
      }
    : null;
  const bubbleExtraTails = normalizeExtraTails(el.extraTails);
  const speechPathData =
    bubbleExtraTails.length > 0
      ? bubblePathDataMulti(el.width, el.height, bRadius, [...(bubbleTailSpec ? [bubbleTailSpec] : []), ...bubbleExtraTails])
      : bubblePathData(el.width, el.height, bRadius, bubbleTailSpec);

  const body: string[] = [];
  const strokeAttrs = `${att("stroke", bStroke)}${att("stroke-width", bStrokeW)}`;

  if (el.customShapePoints && el.customShapePoints.length >= 6) {
    body.push(
      `<path d="${pointsToPathD(el.customShapePoints, true)}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round"/>`
    );
  } else if (el.variant === "shout" || el.variant === "angry") {
    const isShout = el.variant === "shout";
    const outer = isShout ? 68 : 64;
    const innerBase = isShout ? 36 / 68 : 28 / 64;
    const amp = el.starAmplitude ?? innerBase;
    const inner = outer * Math.min(0.95, Math.max(0.1, amp));
    const starStroke = isShout
      ? bStroke
      : theme === "soft"
        ? "#dc2626"
        : theme === "vivid"
          ? "#7f1d1d"
          : "#991b1b";
    const starStrokeW = isShout ? bStrokeW : Math.max(bStrokeW, 3.5);
    body.push(
      `<path d="${escapeXml(burstStarPathData(el.width, el.height, isShout ? 20 : 22, inner, outer))}" fill="${escapeXml(el.fill)}" stroke="${escapeXml(starStroke)}" stroke-width="${fmt(starStrokeW)}" stroke-linejoin="round" stroke-linecap="round"/>`
    );
  } else if (el.variant === "double") {
    body.push(
      `<path d="${escapeXml(doubleBubblePathData(el.width, el.height, bubbleTailSpec))}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round"/>`
    );
  } else if (el.variant === "thought") {
    body.push(
      `<path d="${escapeXml(thoughtBubbleBodyPath(el.width, el.height))}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round"/>`
    );
    if (showTail) {
      const thoughtSW = bStrokeW * 0.8;
      const bigX = tailDir === "right" ? el.width * 0.74 : el.width * 0.26;
      const smallX = tailDir === "right" ? el.width * 0.84 : el.width * 0.16;
      const bigY = tailDir === "right" ? el.height * 0.74 : el.height * 0.26;
      const smallY = tailDir === "right" ? el.height * 0.84 : el.height * 0.16;
      const dot = (x: number, y: number, rx: number, ry: number) =>
        `<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${escapeXml(el.fill)}" stroke="${escapeXml(bStroke)}" stroke-width="${fmt(thoughtSW)}"/>`;
      if (tailDirection === "bottom") {
        body.push(dot(bigX, el.height + 14, 14, 11), dot(bigX, el.height + 32, 10, 8), dot(smallX, el.height + 54, 6, 5));
      } else if (tailDirection === "top") {
        body.push(dot(bigX, -14, 14, 11), dot(bigX, -32, 10, 8), dot(smallX, -54, 6, 5));
      } else if (tailDirection === "left") {
        body.push(dot(-14, bigY, 11, 14), dot(-32, bigY, 8, 10), dot(-54, smallY, 5, 6));
      } else {
        body.push(dot(el.width + 14, bigY, 11, 14), dot(el.width + 32, bigY, 8, 10), dot(el.width + 54, smallY, 5, 6));
      }
    }
  } else if (el.variant === "whisper") {
    body.push(
      `<path d="${escapeXml(speechPathData)}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="8 5"/>`
    );
  } else if (el.variant === "scared") {
    const scaredFill = el.fill === "transparent" ? "transparent" : el.fill === "#ffffff" ? "#f5f3ff" : el.fill;
    body.push(
      `<path d="${escapeXml(scaredBubblePathData(el.width, el.height, bubbleTailSpec))}" fill="${escapeXml(scaredFill)}" stroke="#7c3aed" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    );
  } else if (el.variant === "system") {
    body.push(
      `<rect width="${fmt(el.width)}" height="${fmt(el.height)}" rx="4" fill="#0a0f24" opacity="0.88" stroke="#0ea5e9" stroke-width="2.5"/>`,
      `<rect x="4" y="4" width="${fmt(el.width - 8)}" height="${fmt(el.height - 8)}" rx="2" fill="none" stroke="#38bdf8" stroke-width="1" opacity="0.5"/>`
    );
  } else if (el.variant === "phone") {
    const phoneRadius = theme === "soft" ? 10 : theme === "vivid" ? 6 : 8;
    const bMinDim = Math.min(el.width, el.height);
    const phoneTail =
      showTail && bubbleTailSpec
        ? {
            ...bubbleTailSpec,
            length: Math.min(bubbleTailSpec.length, Math.max(8, bMinDim * 0.1)),
            base: Math.min(bubbleTailSpec.base, Math.max(6, bMinDim * 0.12)),
          }
        : null;
    body.push(
      `<path d="${escapeXml(bubblePathData(el.width, el.height, phoneRadius, phoneTail))}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round"/>`
    );
  } else if (el.variant === "heart") {
    body.push(
      `<path d="${escapeXml(heartBubblePathData(el.width, el.height))}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round"/>`
    );
  } else if (el.variant === "box") {
    const boxRadius = theme === "soft" ? 6 : theme === "vivid" ? 3 : 4;
    body.push(
      `<rect width="${fmt(el.width)}" height="${fmt(el.height)}" rx="${fmt(boxRadius)}" fill="${escapeXml(el.fill)}"${strokeAttrs}/>`
    );
  } else {
    // speech(기본) — 본체+꼬리 단일 path.
    body.push(
      `<path d="${escapeXml(speechPathData)}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round"/>`
    );
  }

  // 말풍선 텍스트 — StudioPage 여백/행간/자간 규약 그대로.
  const fontFamily = el.font ?? "Pretendard, sans-serif";
  ctx.fonts.add(fontFamily);
  const bFs = el.fontSize ?? 24;
  const bHPad = Math.max(12, Math.round(bFs * 0.6));
  const bVPadTop = Math.max(8, Math.round(bFs * 0.48));
  const bVPadBot = Math.max(10, Math.round(bFs * 0.64));
  const lineHeight = el.lineHeight ?? (el.vertical ? 1.4 : theme === "soft" ? 1.35 : theme === "vivid" ? 1.2 : 1.25);
  const letterSpacing = theme === "vivid" ? 0 : 0.3;
  const content = el.vertical ? formatVerticalText(el.text) : el.text;
  const boxWidth = Math.max(8, el.width - bHPad * 2);
  const boxHeight = Math.max(8, el.height - (bVPadTop + bVPadBot));
  if (content.split("\n").some((line) => estimateLineWidth(line, bFs, letterSpacing) > boxWidth * 1.02)) {
    addSkip(ctx, el, "approximated", "말풍선 자동 줄바꿈은 SVG에 없어 수동 줄바꿈(엔터)만 반영돼요.");
  }
  if (content.trim().length > 0) {
    body.push(
      textBlockMarkup({
        text: content,
        x: bHPad,
        y: bVPadTop,
        boxWidth,
        boxHeight,
        fontSize: bFs,
        lineHeight,
        letterSpacing,
        align: el.align ?? "center",
        fontFamily,
        fontStyle: el.fontStyle ?? "bold",
        fill: el.textFill,
      })
    );
  }

  const transform = nodeTransform(el.x, el.y, el.rotation);
  const opacity = el.opacity ?? 1;
  return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}>${body.join("")}</g>`;
}

/** 프레임(패널) 테마 파라미터 — StudioPage FramePanel 분기 포트. */
function frameThemeParams(el: SvgFrameElLike, theme: SvgExportTheme) {
  let stroke = el.stroke ?? "#16100c";
  let strokeW = el.strokeWidth ?? 3;
  let radius = 4;
  let shadow: { color: string; blur: number; offsetX: number; offsetY: number; opacity: number } | null = null;
  if (theme === "soft") {
    stroke = el.stroke ?? "#222222";
    strokeW = el.strokeWidth ?? 1.8;
    radius = 0;
  } else if (theme === "vivid") {
    stroke = el.stroke ?? "#3a3a3a";
    strokeW = el.strokeWidth ?? 1.2;
    radius = 6;
    shadow = { color: "black", blur: 5, offsetX: 1, offsetY: 2, opacity: 0.08 };
  }
  return { stroke, strokeW, radius, shadow };
}

function serializeFrame(ctx: ExportCtx, el: SvgFrameElLike): string {
  const { stroke, strokeW, radius, shadow } = frameThemeParams(el, ctx.theme);
  const poly = el.points && el.points.length >= 6 ? el.points : null;
  const clipId = nextId(ctx, "sc");
  ctx.defs.push(
    `<clipPath id="${clipId}">${
      poly ? `<polygon points="${pointsAttr(poly)}"/>` : `<rect width="${fmt(el.width)}" height="${fmt(el.height)}"/>`
    }</clipPath>`
  );

  const parts: string[] = [];
  // 배경 채움(폴리곤이면 폴리곤 그대로).
  const bgFill = el.bgColor ?? "#ffffff";
  parts.push(
    poly
      ? `<polygon points="${pointsAttr(poly)}" fill="${escapeXml(bgFill)}"/>`
      : `<rect width="${fmt(el.width)}" height="${fmt(el.height)}" fill="${escapeXml(bgFill)}"/>`
  );
  // 배경 이미지 — cover-fit 은 preserveAspectRatio slice 로 동일 재현.
  if (el.bg) {
    if (!el.bg.startsWith("data:")) {
      addSkip(ctx, el, "approximated", "프레임 배경 이미지가 외부 주소라 SVG에 데이터로 담기지 않았어요.");
    }
    parts.push(
      `<image href="${escapeXml(el.bg)}" width="${fmt(el.width)}" height="${fmt(el.height)}" preserveAspectRatio="xMidYMid slice"/>`
    );
  }
  // 테두리 — 캔버스와 동일하게 클립 안쪽에서 절반 인셋으로 그린다.
  if (strokeW > 0) {
    const dashAttr = el.dashStyle === "dashed" ? att("stroke-dasharray", "10 5") : "";
    const filterAttr = shadow ? att("filter", shadowFilterDef(ctx, shadow)) : "";
    if (poly) {
      parts.push(
        `<polygon points="${pointsAttr(poly)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(strokeW)}"${dashAttr}${filterAttr}/>`
      );
    } else {
      const inset = strokeW / 2;
      parts.push(
        `<rect x="${fmt(inset)}" y="${fmt(inset)}" width="${fmt(Math.max(0, el.width - strokeW))}" height="${fmt(Math.max(0, el.height - strokeW))}"${Math.max(0, radius - inset) > 0 ? att("rx", Math.max(0, radius - inset)) : ""} fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(strokeW)}"${dashAttr}${filterAttr}/>`
      );
    }
  }
  const transform = nodeTransform(el.x, el.y);
  return `<g${transform ? att("transform", transform) : ""} clip-path="url(#${clipId})">${parts.join("")}</g>`;
}

function serializeImage(ctx: ExportCtx, el: SvgImageElLike): string {
  if (!el.src.startsWith("data:")) {
    addSkip(ctx, el, "approximated", "이미지가 외부 주소라 SVG에 데이터로 담기지 않았어요(오프라인에서 안 보일 수 있음).");
  }
  if (hasActiveImageFilters(el)) {
    addSkip(ctx, el, "approximated", "픽셀 필터·색보정은 SVG에 적용되지 않아 원본 이미지로 표시돼요.");
  }
  const transform = nodeTransform(el.x, el.y, el.rotation, el);
  const opacity = el.opacity ?? 1;
  const attrs: string[] = [];
  // 둥근 모서리 — 로컬 좌표 둥근 사각형 클립.
  if ((el.cornerRadius ?? 0) > 0) {
    const clipId = nextId(ctx, "sc");
    const rx = Math.min(el.cornerRadius ?? 0, Math.min(el.width, el.height) / 2);
    ctx.defs.push(`<clipPath id="${clipId}"><rect width="${fmt(el.width)}" height="${fmt(el.height)}" rx="${fmt(rx)}"/></clipPath>`);
    attrs.push(` clip-path="url(#${clipId})"`);
  }
  if (el.shadowColor) {
    attrs.push(
      att(
        "filter",
        shadowFilterDef(ctx, {
          color: el.shadowColor,
          blur: el.shadowBlur ?? 0,
          offsetX: el.shadowOffsetX ?? 0,
          offsetY: el.shadowOffsetY ?? 0,
          opacity: el.shadowOpacity ?? 1,
        })
      )
    );
  }
  // 좌우/상하 반전 — 캔버스는 비트맵을 미리 뒤집는다. SVG 는 로컬 반전 변환으로 동일 결과.
  let flip = "";
  if (el.flipped || el.flippedY) {
    const sx = el.flipped ? -1 : 1;
    const sy = el.flippedY ? -1 : 1;
    flip = ` transform="translate(${fmt(el.flipped ? el.width : 0)} ${fmt(el.flippedY ? el.height : 0)}) scale(${sx} ${sy})"`;
  }
  const image = `<image href="${escapeXml(el.src)}" width="${fmt(el.width)}" height="${fmt(el.height)}" preserveAspectRatio="none"${flip}/>`;
  return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}${attrs.join("")}>${image}</g>`;
}

function serializeFocusLines(el: SvgFocusLinesElLike): string {
  const count = el.lineCount ?? 80;
  const innerR = el.innerRadius ?? 120;
  const outerR = el.outerRadius ?? 600;
  const noise = el.noise ?? 24;
  const cx = el.width * (el.centerXRatio ?? 0.5);
  const cy = el.height * (el.centerYRatio ?? 0.5);
  const rand = seededRandom(el.id);
  const segs: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * 2 * Math.PI) / count;
    const nStart = (rand() - 0.5) * noise;
    const nEnd = (rand() - 0.5) * noise;
    const rStart = Math.max(1, innerR + nStart);
    const rEnd = Math.max(rStart + 10, outerR + nEnd);
    segs.push(
      `M ${fmt(cx + rStart * Math.cos(angle))} ${fmt(cy + rStart * Math.sin(angle))} L ${fmt(cx + rEnd * Math.cos(angle))} ${fmt(cy + rEnd * Math.sin(angle))}`
    );
  }
  const transform = nodeTransform(el.x, el.y, el.rotation ?? 0);
  const opacity = el.opacity ?? 1;
  return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}><path d="${segs.join(" ")}" fill="none" stroke="${escapeXml(el.stroke ?? "#000000")}" stroke-width="${fmt(el.strokeWidth ?? 2.5)}"/></g>`;
}

function serializeSpeedLines(el: SvgSpeedLinesElLike): string {
  const count = el.lineCount ?? 60;
  const dir = el.direction ?? "horizontal";
  const rand = seededRandom(el.id);
  const segs: string[] = [];
  if (dir === "horizontal") {
    for (let i = 0; i < count; i++) {
      const y = rand() * el.height;
      const len = el.width * (0.2 + rand() * 0.8);
      const xStart = rand() > 0.5 ? 0 : el.width - len;
      segs.push(`M ${fmt(xStart)} ${fmt(y)} L ${fmt(xStart + len)} ${fmt(y)}`);
    }
  } else {
    for (let i = 0; i < count; i++) {
      const x = rand() * el.width;
      const len = el.height * (0.2 + rand() * 0.8);
      const yStart = rand() > 0.5 ? 0 : el.height - len;
      segs.push(`M ${fmt(x)} ${fmt(yStart)} L ${fmt(x)} ${fmt(yStart + len)}`);
    }
  }
  const transform = nodeTransform(el.x, el.y, el.rotation ?? 0);
  const opacity = el.opacity ?? 1;
  return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}><path d="${segs.join(" ")}" fill="none" stroke="${escapeXml(el.stroke ?? "#000000")}" stroke-width="${fmt(el.strokeWidth ?? 2.5)}"/></g>`;
}

// ---------------------------------------------------------------------------
// 패널 클리핑·혼합 모드 래핑 — StudioPage wrapClip 규약 포트
// ---------------------------------------------------------------------------

/** 요소 대략 bbox(StudioPage elBounds 포트) — 패널 소속 판정용. */
function elBounds(el: SvgExportEl): { x: number; y: number; w: number; h: number } {
  if (el.type === "draw") {
    let minX = el.points[0] ?? 0;
    let minY = el.points[1] ?? 0;
    let maxX = minX;
    let maxY = minY;
    for (let i = 2; i + 1 < el.points.length; i += 2) {
      const x = el.points[i];
      const y = el.points[i + 1];
      if (x < minX) minX = x;
      else if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      else if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (el.type === "text") return { x: el.x, y: el.y, w: el.width, h: el.fontSize * 1.4 };
  if (el.type === "sticker") return { x: el.x, y: el.y, w: el.fontSize, h: el.fontSize };
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

/** 요소가 들어가야 할 패널(StudioPage containingPanel 포트) — 없으면 null. */
function containingPanel(el: SvgExportEl, all: readonly SvgExportEl[]): SvgFrameElLike | null {
  if (el.type === "frame") return null;
  const b = elBounds(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let best: SvgFrameElLike | null = null;
  let bestArea = Infinity;
  for (const f of all) {
    if (f.type !== "frame" || f.hidden) continue;
    if (cx < f.x || cx > f.x + f.width || cy < f.y || cy > f.y + f.height) continue;
    if (b.w > f.width * 1.4 || b.h > f.height * 1.4) continue;
    const area = f.width * f.height;
    if (area < bestArea) {
      bestArea = area;
      best = f;
    }
  }
  return best;
}

// CSS mix-blend-mode 로 그대로 표현 가능한 합성 모드(레이어 인스펙터 선택지 전부 포함).
const CSS_BLEND_MODES = new Set([
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

// ---------------------------------------------------------------------------
// 메인 — 페이지 → SVG
// ---------------------------------------------------------------------------

export function exportPageToSvg(input: SvgExportPageInput): SvgExportResult {
  const ctx: ExportCtx = {
    defs: [],
    skips: [],
    fonts: new Set<string>(),
    theme: input.theme ?? "classic",
    seq: 0,
  };
  const groups: LayerGroup[] = [...(input.groups ?? [])];
  const body: string[] = [];

  // 배경 — 캔버스 bg 레이어와 동일(그라데이션은 세로 2색).
  if (!input.transparentBg) {
    const grad = input.bgGrad;
    if (grad && grad.length >= 2) {
      const id = nextId(ctx, "sg");
      ctx.defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(input.height)}"><stop offset="0%" stop-color="${escapeXml(grad[0])}"/><stop offset="100%" stop-color="${escapeXml(grad[1])}"/></linearGradient>`
      );
      body.push(`<rect width="${fmt(input.width)}" height="${fmt(input.height)}" fill="url(#${id})"/>`);
    } else {
      body.push(`<rect width="${fmt(input.width)}" height="${fmt(input.height)}" fill="${escapeXml(input.bg ?? "#ffffff")}"/>`);
    }
  }

  let elementCount = 0;
  for (const el of input.elements) {
    if (isEffectivelyHidden(el, groups)) continue; // 숨긴 레이어/그룹은 캔버스 내보내기와 동일하게 제외
    elementCount += 1;

    let markup = "";
    switch (el.type) {
      case "image":
        markup = serializeImage(ctx, el);
        break;
      case "frame":
        markup = serializeFrame(ctx, el);
        break;
      case "focusLines":
        markup = serializeFocusLines(el);
        break;
      case "speedLines":
        markup = serializeSpeedLines(el);
        break;
      case "draw":
        markup = serializeDraw(ctx, el);
        break;
      case "text":
        markup = serializeText(ctx, el);
        break;
      case "sticker":
        markup = serializeSticker(ctx, el);
        break;
      case "bubble":
        markup = serializeBubble(ctx, el);
        break;
    }
    if (!markup) continue;

    // 아래 레이어 클리핑(알파 마스크) — SVG 로 재현 불가, 자르지 않고 표시(근사 고지).
    if (el.clipBelow) {
      addSkip(ctx, el, "approximated", "아래 레이어로 자르기(클리핑 마스크)는 SVG에서 지원되지 않아 자르지 않고 표시돼요.");
    }

    // 패널 클리핑 + 혼합 모드 — 캔버스 wrapClip 과 동일 조건.
    const panel = el.type !== "frame" && !el.noClip ? containingPanel(el, input.elements) : null;
    const blend = el.blendMode && el.blendMode !== "source-over" ? el.blendMode : null;
    let blendStyle = "";
    if (blend) {
      if (CSS_BLEND_MODES.has(blend)) {
        blendStyle = ` style="mix-blend-mode:${blend}"`;
      } else {
        addSkip(ctx, el, "approximated", `혼합 모드(${blend})는 SVG에서 지원되지 않아 보통 합성으로 표시돼요.`);
      }
    }
    if (panel) {
      const clipId = nextId(ctx, "sc");
      ctx.defs.push(
        `<clipPath id="${clipId}"><rect x="${fmt(panel.x)}" y="${fmt(panel.y)}" width="${fmt(panel.width)}" height="${fmt(panel.height)}"/></clipPath>`
      );
      markup = `<g clip-path="url(#${clipId})"${blendStyle}>${markup}</g>`;
    } else if (blendStyle) {
      markup = `<g${blendStyle}>${markup}</g>`;
    }
    body.push(markup);
  }

  const caveats: string[] = [];
  if (ctx.fonts.size > 0) {
    caveats.push("글꼴은 SVG 파일에 임베드되지 않아요 — 보는 기기에 설치된 글꼴로 표시돼요.");
  }

  const defsMarkup = ctx.defs.length > 0 ? `<defs>${ctx.defs.join("")}</defs>` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(input.width)}" height="${fmt(input.height)}" viewBox="0 0 ${fmt(input.width)} ${fmt(input.height)}">` +
    defsMarkup +
    body.join("") +
    `</svg>`;

  return {
    svg,
    skipped: ctx.skips,
    fontFamilies: [...ctx.fonts],
    caveats,
    elementCount,
  };
}

/** 내보내기 결과 요약 한 줄(한글) — 내보내기 패널 상태 문구용. 정직하게 제외/근사 개수를 밝힌다. */
export function svgExportResultMessage(result: SvgExportResult): string {
  const droppedIds = new Set(result.skipped.filter((s) => s.mode === "skipped").map((s) => s.id));
  const approxIds = new Set(result.skipped.filter((s) => s.mode === "approximated" && !droppedIds.has(s.id)).map((s) => s.id));
  const parts = [`SVG 저장 완료 — 요소 ${result.elementCount}개 벡터 변환`];
  if (droppedIds.size > 0) parts.push(`제외 ${droppedIds.size}개`);
  if (approxIds.size > 0) parts.push(`근사 ${approxIds.size}개`);
  if (droppedIds.size === 0 && approxIds.size === 0 && result.elementCount > 0) parts.push("전부 벡터 보존");
  return parts.join(" · ");
}
