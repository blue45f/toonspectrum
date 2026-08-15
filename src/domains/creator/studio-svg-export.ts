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
  isStudioDynamicBrushCausalDepositPipeline,
  normalizeStudioBrushDynamicsSettings,
  planStudioDynamicBrushDabs,
  resolveStudioCapturedBrushDynamicsPresetId,
  studioDynamicBrushDepositPipelineUsesContinuation,
  studioReplaySafeBrushDynamicsSettingsForBrushId,
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
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
  type StudioDynamicBrushRenderStampGrid,
} from "./studio-brush-render-budget";
import { resolveStudioBrushSinglePointRoute } from "./studio-brush-runtime-contract";
import {
  rasterizeStudioBrushSoftFalloffMaskRgba,
  STUDIO_BRUSH_SOFT_FALLOFF_STAMP_GUTTER_PIXELS,
  STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION,
} from "./studio-brush-soft-falloff-stamp";
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
  studioDynamicBrushDabVariationsFromTransforms,
  studioBrushSymmetryTransforms,
  transformStudioBrushSymmetryPoint,
  type StudioBrushSymmetryTransform,
} from "./studio-brush-symmetry";
import { rasterizeStudioBrushTextureMaskRgba } from "./studio-brush-textured-stamp";
import {
  composeStudioBrushDualTipAlphaMap,
  planNormalizedStudioBrushTipComposition,
  studioBrushDualTipUsesSolidEllipse,
} from "./studio-brush-tip-composition";
import {
  buildStudioBrushTipAlphaMap,
  encodeStudioBrushTipAlphaMapBase64,
  planStudioBrushTipStampWorldSamples,
  studioBrushTipUsesSolidEllipse,
  type StudioBrushTipAlphaMap,
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
import { resolveStudioCalligraphyRenderTip } from "./studio-calligraphy-nib-profile";
import { planStudioCalligraphyRibbon } from "./studio-calligraphy-ribbon";
import {
  planStudioCausalDynamicBrushDepositsV2,
  planStudioCausalDynamicBrushDepositSegmentsV3,
  STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
} from "./studio-causal-dynamic-brush-deposit-v2";
import { planStudioCausalInk } from "./studio-causal-ink";
import {
  DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
  planCausalWatercolorBrushDabs,
} from "./studio-causal-watercolor-brush";
import { calculateStudioCrc32 } from "./studio-crc32";
import {
  planDialogueRubyOverlayPlacements,
  planDialogueVerticalRubyOverlayPlacements,
  readDialogueRubySpans,
  type StudioRubyOverlayPlacement,
  type StudioRubySpanInput,
  type StudioVerticalRubyLayoutPlan,
} from "./studio-dialogue-ruby-layout";
import {
  resolveStudioDynamicBrushMaterialIdentity,
  type StudioDynamicBrushMaterialIdentity,
} from "./studio-dry-media-dynamic-bridge";
import {
  planStudioDynamicBrushCoverageAndLegacyMarks,
  resolveStudioDynamicBrushCoverageBudgetContract,
  type StudioDynamicBrushCoverageMark,
  type StudioDynamicBrushSegmentedDabVariation,
} from "./studio-dynamic-brush-coverage-renderer";
import {
  FX_OIL_DAB_CAP,
  FX_PASTEL_DAB_CAP,
  STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION,
  fxBrushSeedFromKey,
  isStudioFxPressureBrushId,
  planGlitterBrushParticles,
  planGlowBrushPasses,
  planNeonBrushPasses,
  planOilBrushDabs,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
  planPastelBrushDabs,
  planStudioFxBrushPressurePath,
  planStudioFxLuminousRibbonPass,
  resolveStudioFxBrushTapPressureResponse,
  resolveStudioFxPressurePassResponse,
  type StudioFxLuminousRibbonPassPlan,
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
  planStudioHighlighterWashRibbon,
  planStudioHighlighterWashTap,
  resolveStudioHighlighterWashBrushId,
  studioHighlighterWashDetailPathData,
  studioHighlighterWashPlanPathData,
} from "./studio-highlighter-wash-ribbon";
import {
  resolveStudioInkPressure,
  studioInkFallbackPressure,
  studioInkPressureDiameter,
  studioInkPressureRadius,
  type StudioInkPressureModel,
} from "./studio-ink-pressure-model";
import { hasActiveImageFilters, type ImageFilterFields } from "./studio-konva-filter-fields";
import { isEffectivelyHidden, type LayerGroup } from "./studio-layers";
import {
  STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
  type StudioMaterialMinimumDiameterRatio,
  type StudioMaterialPressureModel,
} from "./studio-material-pressure-model";
import {
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
  STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR,
  STUDIO_OIL_IMPASTO_RELIEF_OVERLAY_VERSION,
  studioOilRibbonPathData,
} from "./studio-oil-ribbon-carrier";
import {
  STUDIO_CROQUIS_CAPSULE_OUTLINE_STROKE_ENGINE,
  planStudioPerfectFreehandRender,
  type StudioPerfectFreehandRenderPlan,
} from "./studio-outline-stroke-contract";
import { resolveStudioPaperBrushResponse } from "./studio-paper-brush-response";
import {
  resolveStudioDocumentPaperSurface,
  studioPaperGranulationIsActive,
} from "./studio-paper-granulation-runtime";
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
import {
  planStudioRetainedMediaPressureCurve,
  resolveStudioRetainedMediaPressure,
  resolveStudioRetainedMediaPressureProfileId,
} from "./studio-retained-media-pressure";
import { planStudioRetainedMediaRibbon } from "./studio-retained-media-ribbon";
import {
  studioSketchStyleOfElement,
  type StudioSketchStyle,
} from "./studio-rough-shape";
import { buildStudioRoughSvgParityPlan } from "./studio-rough-svg-parity";
import { skewDegToKonva, type SkewFields } from "./studio-skew";
import { planStudioStampInkRibbon } from "./studio-stamp-ink-ribbon";
import {
  planStudioAngledNibStrokeLocalCoverage,
  type StudioStrokeLocalCoveragePolygon,
} from "./studio-stroke-local-coverage";
import {
  isStudioBoundedFlowPaintModelCompatible,
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
import {
  STUDIO_SVG_R8_STREAMING_RGBA_BYTE_BUDGET,
  visitStudioSvgR8StreamingCoverage,
  type StudioSvgR8DabVariation,
  type StudioSvgR8StreamingCoverageMark,
} from "./studio-svg-r8-streaming-export";
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
import {
  planStudioWetRibbonCarrier,
  studioWetRibbonCarrierBatchPathData,
} from "./studio-wet-ribbon-carrier";

import type { BubbleVariant } from "./studio-assets";
import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";

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
  /** Dialogue annotation extension carried by the runtime scene even though the base El is structural. */
  rubySpans?: readonly StudioRubySpanInput[];
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
  /** Dialogue annotation extension carried by the runtime scene even though the base El is structural. */
  rubySpans?: readonly StudioRubySpanInput[];
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
  brushCatalogId?: string;
  /** Renderer-significant durable outline contract; unknown values receive an explicit skip. */
  outlineStroke?: unknown;
  pressures?: number[];
  pressureModel?: StudioInkPressureModel;
  materialPressureModel?: StudioMaterialPressureModel;
  materialMinimumDiameterRatio?: StudioMaterialMinimumDiameterRatio;
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
  /**
   * 획이 실린 엔진 프로그램 조합. Canvas 렌더러와 같은 키를 같은 리졸버에 넘겨야 두 표면이
   * 같은 플랜을 만든다 — 이 필드가 빠지면 커스텀 조합으로 그린 획이 내보내기에서 프리셋
   * 기본 조합으로 되돌아간다.
   */
  brushEnginePrograms?: StudioBrushEngineProgramSet;
  brushTip?: CalligraphyTipSettings;
  strokeStyle?: StrokeStyle;
  shapeParams?: ShapeParams;
  sketch?: StudioSketchStyle;
  symmetry?: {
    type: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope" | "silk";
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

function studioFxLuminousRibbonPathD(
  plan: StudioFxLuminousRibbonPassPlan,
): string {
  return plan.polygons
    .map((polygon) => pointsToPathD(polygon.points, true))
    .join(" ");
}

// ---------------------------------------------------------------------------
// 내보내기 컨텍스트 — defs/스킵/글꼴 수집 + 결정적 def id 발급
// ---------------------------------------------------------------------------

interface ExportCtx {
  defs: string[];
  skips: SvgExportSkip[];
  fonts: Set<string>;
  theme: SvgExportTheme;
  /** Full-resolution brush-tip PNGs are content-addressed and emitted once per SVG document. */
  brushTextureAssets: Map<string, Readonly<{ symbolId: string; size: number }>>;
  /** Identity fast path also covers editable maps that deliberately omit a content revision. */
  brushTextureAssetsByAlphaMap: Map<
    StudioBrushTipAlphaMap,
    Readonly<{ symbolId: string; size: number }>
  >;
  /**
   * Worst-case UTF-16 storage retained by embedded brush definitions. This is deliberately
   * separate from raw RGBA accounting: stored-DEFLATE + base64 strings and the final `join()` can
   * otherwise multiply a valid pixel budget into a main-thread/mobile OOM.
   */
  brushTextureSerializedUtf16Bytes: number;
  /**
   * Raw RGBA represented by every streamed R8 mask admitted to this document. The streaming
   * visitor owns the per-stroke preflight; this counter prevents many individually valid strokes
   * from multiplying the 64 MiB document ceiling.
   */
  r8EmbeddedRgbaBytes: number;
  /** def id 일련번호 — 입력 순서에만 의존해 결정적. */
  seq: number;
}

const STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET =
  64 * 1_024 * 1_024;

function nextId(ctx: ExportCtx, prefix: string): string {
  ctx.seq += 1;
  return `${prefix}${ctx.seq}`;
}

function fmtCoverageNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 1_000_000) / 1_000_000 + 0;
  return rounded.toFixed(6).replace(/\.?0+$/u, "");
}

function joinSvgPngBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function svgPngChunk(type: string, data: Uint8Array): Uint8Array | null {
  if (!/^[A-Za-z]{4}$/u.test(type)) return null;
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength, false);
  for (let index = 0; index < 4; index += 1) {
    output[4 + index] = type.charCodeAt(index);
  }
  output.set(data, 8);
  const checksumSource = output.subarray(4, 8 + data.byteLength);
  view.setUint32(
    8 + data.byteLength,
    calculateStudioCrc32(checksumSource),
    false,
  );
  return output;
}

function svgPngAdler32(bytes: Uint8Array): number {
  let low = 1;
  let high = 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    low = (low + bytes[index]!) % 65_521;
    high = (high + low) % 65_521;
  }
  return ((high << 16) | low) >>> 0;
}

/** Browser-safe zlib stream with deterministic uncompressed DEFLATE blocks. */
function svgPngStoredZlib(bytes: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(bytes.byteLength / 65_535));
  const output = new Uint8Array(2 + blockCount * 5 + bytes.byteLength + 4);
  const view = new DataView(output.buffer);
  output.set([0x78, 0x01], 0);
  let sourceOffset = 0;
  let outputOffset = 2;
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const length = Math.min(65_535, bytes.byteLength - sourceOffset);
    output[outputOffset] = blockIndex === blockCount - 1 ? 1 : 0;
    outputOffset += 1;
    view.setUint16(outputOffset, length, true);
    view.setUint16(outputOffset + 2, length ^ 0xffff, true);
    outputOffset += 4;
    output.set(bytes.subarray(sourceOffset, sourceOffset + length), outputOffset);
    sourceOffset += length;
    outputOffset += length;
  }
  view.setUint32(outputOffset, svgPngAdler32(bytes), false);
  return output;
}

/**
 * Losslessly embeds an ImageData-compatible RGBA snapshot. Filter byte zero and stored DEFLATE
 * make the result synchronous, platform-independent and byte-deterministic.
 */
function encodeSvgBrushTexturePng(
  pixels: Uint8ClampedArray,
  size: number,
): Uint8Array | null {
  if (
    !Number.isSafeInteger(size)
    || size <= 0
    || size > 512
    || pixels.byteLength !== size * size * 4
  ) return null;
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, size, false);
  headerView.setUint32(4, size, false);
  header.set([8, 6, 0, 0, 0], 8);

  const scanlineBytes = size * 4 + 1;
  const scanlines = new Uint8Array(scanlineBytes * size);
  for (let row = 0; row < size; row += 1) {
    const targetOffset = row * scanlineBytes;
    scanlines[targetOffset] = 0;
    scanlines.set(
      pixels.subarray(row * size * 4, (row + 1) * size * 4),
      targetOffset + 1,
    );
  }
  const headerChunk = svgPngChunk("IHDR", header);
  const dataChunk = svgPngChunk("IDAT", svgPngStoredZlib(scanlines));
  const endChunk = svgPngChunk("IEND", new Uint8Array());
  if (!headerChunk || !dataChunk || !endChunk) return null;
  return joinSvgPngBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    headerChunk,
    dataChunk,
    endChunk,
  ]);
}

/**
 * Defines one alpha-only texture carrier. A white lossless PNG is used as an SVG alpha mask, so
 * every `<use>` can supply its own dynamic colour without duplicating the alpha asset.
 */
function svgBrushTextureAsset(
  ctx: ExportCtx,
  cacheKey: string,
  size: number,
  createPixels: () => Uint8ClampedArray | null,
): Readonly<{ symbolId: string; size: number }> | null {
  const cached = ctx.brushTextureAssets.get(cacheKey);
  if (cached) return cached;
  const pixels = createPixels();
  if (!pixels) return null;
  const png = encodeSvgBrushTexturePng(pixels, size);
  if (!png) return null;
  const dataUrl = `data:image/png;base64,${encodeStudioBrushTipAlphaMapBase64(png)}`;

  const symbolId = nextId(ctx, "sbt");
  const maskId = `${symbolId}m`;
  const asset = Object.freeze({ symbolId, size });
  const definition =
    `<symbol data-brush-tip-asset="full-alpha-map-v1" id="${symbolId}" viewBox="0 0 ${size} ${size}" preserveAspectRatio="none">`
      + `<mask id="${maskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}" mask-type="alpha">`
      + `<image x="0" y="0" width="${size}" height="${size}" preserveAspectRatio="none" href="${dataUrl}"/>`
      + `</mask><rect x="0" y="0" width="${size}" height="${size}" fill="currentColor" mask="url(#${maskId})"/>`
      + `</symbol>`;
  const definitionUtf16Bytes = definition.length * 2;
  const nextSerializedUtf16Bytes =
    ctx.brushTextureSerializedUtf16Bytes + definitionUtf16Bytes;
  if (
    !Number.isSafeInteger(nextSerializedUtf16Bytes)
    || nextSerializedUtf16Bytes
      > STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET
  ) {
    return null;
  }
  ctx.brushTextureSerializedUtf16Bytes = nextSerializedUtf16Bytes;
  ctx.brushTextureAssets.set(cacheKey, asset);
  ctx.defs.push(definition);
  return asset;
}

function svgAlphaMapTextureAsset(
  ctx: ExportCtx,
  alphaMap: StudioBrushTipAlphaMap,
  retainMapIdentity = true,
): Readonly<{ symbolId: string; size: number }> | null {
  if (retainMapIdentity) {
    const identityHit = ctx.brushTextureAssetsByAlphaMap.get(alphaMap);
    if (identityHit) return identityHit;
  }
  const revisionKey = alphaMap.revision === undefined
    ? null
    : JSON.stringify([
        "alpha-map-v1",
        typeof alphaMap.revision,
        alphaMap.revision,
        alphaMap.size,
      ]);
  if (revisionKey) {
    const revisionHit = ctx.brushTextureAssets.get(revisionKey);
    if (revisionHit) {
      if (retainMapIdentity) {
        ctx.brushTextureAssetsByAlphaMap.set(alphaMap, revisionHit);
      }
      return revisionHit;
    }
  }

  // Renderer maps carry a revision. The content fallback is only for editable/test maps and is
  // memoized by identity immediately, so even those encode at most once per export.
  let pixels: Uint8ClampedArray | null = null;
  const createPixels = (): Uint8ClampedArray | null => {
    pixels ??= rasterizeStudioBrushTextureMaskRgba(alphaMap);
    return pixels;
  };
  const fallbackKey = revisionKey ?? (() => {
    const snapshot = createPixels();
    if (!snapshot) return "";
    const bytes = new Uint8Array(
      snapshot.buffer,
      snapshot.byteOffset,
      snapshot.byteLength,
    );
    return JSON.stringify([
      "alpha-map-external-v1",
      alphaMap.size,
      calculateStudioCrc32(bytes),
      encodeStudioBrushTipAlphaMapBase64(bytes),
    ]);
  })();
  if (!fallbackKey) return null;
  const asset = svgBrushTextureAsset(
    ctx,
    fallbackKey,
    alphaMap.size,
    createPixels,
  );
  if (asset && retainMapIdentity) {
    ctx.brushTextureAssetsByAlphaMap.set(alphaMap, asset);
  }
  return asset;
}

function svgSoftFalloffTextureAsset(
  ctx: ExportCtx,
  exponent: number,
): Readonly<{ symbolId: string; size: number }> | null {
  const cacheKey = JSON.stringify([
    "analytic-radial-v1",
    exponent.toString(),
    STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION,
    STUDIO_BRUSH_SOFT_FALLOFF_STAMP_GUTTER_PIXELS,
  ]);
  const surfaceSize = STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION
    + STUDIO_BRUSH_SOFT_FALLOFF_STAMP_GUTTER_PIXELS * 2;
  return svgBrushTextureAsset(
    ctx,
    cacheKey,
    surfaceSize,
    () => rasterizeStudioBrushSoftFalloffMaskRgba(
      exponent,
    )?.pixels ?? null,
  );
}

function serializeStudioDynamicCoverageMark(
  ctx: ExportCtx,
  mark: StudioDynamicBrushCoverageMark | StudioSvgR8StreamingCoverageMark,
  strokeOpacity: number,
  boundedFlow: boolean,
  retainAlphaMapIdentity = true,
  materialIdentity?: StudioDynamicBrushMaterialIdentity,
  /**
   * Skip the texture-asset branches and take the geometric one. Used only after an exact pass has
   * already failed on the document's texture budget, so the stroke lands as untextured coverage
   * rather than not landing at all.
   */
  geometricFallback = false,
): string | null {
  const opacity = Math.min(
    1,
    Math.max(0, mark.alpha * (boundedFlow ? 1 : strokeOpacity)),
  );
  const angleDegrees = mark.angleRadians * 180 / Math.PI;
  const transform = `rotate(${fmtCoverageNumber(angleDegrees)} ${fmtCoverageNumber(mark.x)} ${fmtCoverageNumber(mark.y)})`;
  const materialAttributes = materialIdentity
    ? (
        (materialIdentity.dryMediaPresetId === "pastel"
          ? ` data-brush-carrier="soft-pigment-fiber"`
          : "")
        + ` data-brush-material="${escapeXml(materialIdentity.brushId)}"`
      )
    : "";

  if (
    "ribbon" in mark
    && (
      mark.ribbon?.kind === "flat-nib-ribbon-polygon"
      || mark.ribbon?.kind === "paint-roller-ribbon-polygon"
      || mark.ribbon?.kind === "dry-media-union-ribbon-polygon"
      || mark.ribbon?.kind === "professional-shelf-ribbon-polygon"
      || mark.ribbon?.kind === "competitor-specialty-ribbon-polygon"
    )
  ) {
    if (
      mark.ribbon.kind === "competitor-specialty-ribbon-polygon"
      && mark.ribbon.contourStyles
    ) {
      let contours = "";
      let contourIndex = 0;
      while (contourIndex < mark.ribbon.polygons.length) {
        const style = mark.ribbon.contourStyles[contourIndex];
        if (!style) return null;
        let contourPath = "";
        do {
          const points = mark.ribbon.polygons[contourIndex]!;
          const [firstX, firstY, ...remaining] = points;
          if (firstX === undefined || firstY === undefined) return null;
          contourPath +=
            `M${fmtCoverageNumber(firstX)} ${fmtCoverageNumber(firstY)}`;
          for (let index = 0; index < remaining.length; index += 2) {
            const x = remaining[index];
            const y = remaining[index + 1];
            if (x === undefined || y === undefined) return null;
            contourPath += `L${fmtCoverageNumber(x)} ${fmtCoverageNumber(y)}`;
          }
          contourPath += "Z";
          contourIndex += 1;
        } while (
          contourIndex < mark.ribbon.polygons.length
          && mark.ribbon.contourStyles[contourIndex]?.role === style.role
          && mark.ribbon.contourStyles[contourIndex]?.color === style.color
          && mark.ribbon.contourStyles[contourIndex]?.alphaMultiplier
            === style.alphaMultiplier
        );
        contours += (
          `<path data-brush-contour-role="${escapeXml(style.role)}"`
          + ` d="${contourPath}" fill="${escapeXml(style.color)}"`
          + ` opacity="${fmtDabOpacity(Math.min(
            1,
            Math.max(0, opacity * style.alphaMultiplier),
          ))}"/>`
        );
      }
      return (
        `<g data-brush-coverage="competitor-specialty-ribbon"${materialAttributes}`
        + ` data-brush-material-profile="${escapeXml(mark.ribbon.semanticProfile)}">`
        + `${contours}</g>`
      );
    }
    let path = "";
    for (const points of mark.ribbon.polygons) {
      const [firstX, firstY, ...remaining] = points;
      if (firstX === undefined || firstY === undefined) return null;
      path += `M${fmtCoverageNumber(firstX)} ${fmtCoverageNumber(firstY)}`;
      for (let index = 0; index < remaining.length; index += 2) {
        const x = remaining[index];
        const y = remaining[index + 1];
        if (x === undefined || y === undefined) return null;
        path += `L${fmtCoverageNumber(x)} ${fmtCoverageNumber(y)}`;
      }
      path += "Z";
    }
    return (
      `<path data-brush-coverage="${
        mark.ribbon.kind === "paint-roller-ribbon-polygon"
          ? "paint-roller-ribbon"
          : mark.ribbon.kind === "dry-media-union-ribbon-polygon"
            ? "dry-media-union-ribbon"
            : mark.ribbon.kind === "professional-shelf-ribbon-polygon"
              ? "professional-shelf-ribbon"
              : mark.ribbon.kind === "competitor-specialty-ribbon-polygon"
                ? "competitor-specialty-ribbon"
              : "flat-nib-ribbon"
      }"${materialAttributes}${
        mark.ribbon.kind === "professional-shelf-ribbon-polygon"
        || mark.ribbon.kind === "competitor-specialty-ribbon-polygon"
          ? ` data-brush-material-profile="${escapeXml(mark.ribbon.semanticProfile)}"`
          : ""
      } d="${path}"`
      + ` fill="${escapeXml(mark.color)}" opacity="${fmtDabOpacity(opacity)}"/>`
    );
  }

  if (mark.texture?.kind === "alpha-map" && !geometricFallback) {
    const asset = svgAlphaMapTextureAsset(
      ctx,
      mark.texture.alphaMap,
      retainAlphaMapIdentity,
    );
    if (!asset) return null;
    return (
      `<use data-brush-coverage="alpha-map"${materialAttributes} href="#${asset.symbolId}"`
        + ` x="${fmtCoverageNumber(mark.x - mark.radiusX)}"`
        + ` y="${fmtCoverageNumber(mark.y - mark.radiusY)}"`
        + ` width="${fmtCoverageNumber(mark.radiusX * 2)}"`
        + ` height="${fmtCoverageNumber(mark.radiusY * 2)}"`
        + ` preserveAspectRatio="none" color="${escapeXml(mark.color)}"`
        + ` opacity="${fmtDabOpacity(opacity)}" transform="${transform}"/>`
    );
  }

  if ("falloff" in mark && mark.falloff?.kind === "analytic-radial" && !geometricFallback) {
    const asset = svgSoftFalloffTextureAsset(
      ctx,
      mark.falloff.exponent,
    );
    if (!asset) return null;
    const overscan = asset.size / STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION;
    const radiusX = mark.radiusX * overscan;
    const radiusY = mark.radiusY * overscan;
    return (
      `<use data-brush-coverage="analytic-radial"${materialAttributes} href="#${asset.symbolId}"`
        + ` x="${fmtCoverageNumber(mark.x - radiusX)}"`
        + ` y="${fmtCoverageNumber(mark.y - radiusY)}"`
        + ` width="${fmtCoverageNumber(radiusX * 2)}"`
        + ` height="${fmtCoverageNumber(radiusY * 2)}"`
        + ` preserveAspectRatio="none" color="${escapeXml(mark.color)}"`
        + ` opacity="${fmtDabOpacity(opacity)}" transform="${transform}"/>`
    );
  }

  // 솔리드 타원 커버리지도 리본·알파맵·해석적 falloff 분기와 같은 재질 주석을 남긴다 —
  // data-brush-material/data-brush-carrier는 내보낸 문서에서 질감 정체성을 추적하는
  // 시맨틱 메타데이터라 지오메트리가 가장 단순한 분기에서도 생략하지 않는다.
  // 위치 계약: 재질 속성은 ry 뒤에 둔다. Canvas↔SVG 교차 검증 파서는
  // `data-brush-coverage="ellipse" cx=…` 인접성을 전제하므로 지오메트리 앞에 끼워 넣지 않는다.
  return (
    `<ellipse data-brush-coverage="ellipse"`
      + ` cx="${fmtCoverageNumber(mark.x)}" cy="${fmtCoverageNumber(mark.y)}"`
      + ` rx="${fmtCoverageNumber(mark.radiusX)}" ry="${fmtCoverageNumber(mark.radiusY)}"`
      + `${materialAttributes}`
      + ` fill="${escapeXml(mark.color)}" opacity="${fmtDabOpacity(opacity)}"`
      + ` transform="${transform}"/>`
  );
}

function serializeStudioDynamicCoverageMarks(
  ctx: ExportCtx,
  marks: readonly StudioDynamicBrushCoverageMark[],
  strokeOpacity: number,
  boundedFlow: boolean,
  materialIdentity: StudioDynamicBrushMaterialIdentity | undefined,
  /** Set when the stroke had to be drawn without its tip textures to fit the budget. */
  approximated: { textureBudgetExhausted: boolean },
): string | null {
  if (marks.length === 0) return null;
  const initialDefsLength = ctx.defs.length;
  const initialSequence = ctx.seq;
  const initialAssetKeys = new Set(ctx.brushTextureAssets.keys());
  const initialAlphaMapKeys = new Set(ctx.brushTextureAssetsByAlphaMap.keys());
  const initialSerializedUtf16Bytes = ctx.brushTextureSerializedUtf16Bytes;
  const rollbackAssets = (): null => {
    ctx.defs.length = initialDefsLength;
    ctx.seq = initialSequence;
    ctx.brushTextureSerializedUtf16Bytes = initialSerializedUtf16Bytes;
    for (const key of ctx.brushTextureAssets.keys()) {
      if (!initialAssetKeys.has(key)) ctx.brushTextureAssets.delete(key);
    }
    for (const key of ctx.brushTextureAssetsByAlphaMap.keys()) {
      if (!initialAlphaMapKeys.has(key)) {
        ctx.brushTextureAssetsByAlphaMap.delete(key);
      }
    }
    return null;
  };
  const serializeAll = (geometricFallback: boolean): string[] | null => {
    const out: string[] = [];
    for (const mark of marks) {
      const serialized = serializeStudioDynamicCoverageMark(
        ctx,
        mark,
        strokeOpacity,
        boundedFlow,
        true,
        materialIdentity,
        geometricFallback,
      );
      if (serialized === null) return null;
      out.push(serialized);
    }
    return out;
  };

  let markup = serializeAll(false);
  if (markup === null) {
    // The document's texture budget is gone. Every texture branch would fail from here, so the
    // exact pass is abandoned and the stroke is re-serialised as untextured coverage — the same
    // positions, radii, rotations, colours and opacities, drawn as the geometric branch the
    // renderer already falls back to. It loses the tip's alpha map; it does NOT lose the stroke.
    //
    // Dropping was silent data loss on every real page: paint-tube's three-stroke cell serialises
    // to 21.2MB while its curve alone needs 22.7MB, so the second stroke exhausted the budget and
    // the exporter removed it outright. A single-stroke probe cannot see that — the drop only
    // appears once a page holds more than one stroke. erodible-pencil is next at 22.4MB.
    rollbackAssets();
    markup = serializeAll(true);
    if (markup === null) return null;
    approximated.textureBudgetExhausted = true;
  }

  return boundedFlow
    ? `<g opacity="${fmtDabOpacity(strokeOpacity)}">${markup.join("")}</g>`
    : `<g>${markup.join("")}</g>`;
}

/**
 * Encodes verified R8 paper one dab at a time. Unlike the retained Canvas plan, this path never
 * stores the per-dab Float32 alpha maps in `brushTextureAssetsByAlphaMap`; only the deterministic
 * PNG definition string and its tiny content-addressed cache record survive each callback.
 */
function serializeStudioR8DynamicCoverageMarks(
  ctx: ExportCtx,
  input: Readonly<{
    dabVariations: readonly StudioSvgR8DabVariation[];
    dynamics: NormalizedStudioBrushDynamicsSettings;
    materialIdentity?: StudioDynamicBrushMaterialIdentity;
    dynamicSeed: number;
    stroke: string;
    markBudget: number;
  }>,
  strokeOpacity: number,
  boundedFlow: boolean,
): readonly string[] | null {
  const initialDefsLength = ctx.defs.length;
  const initialSequence = ctx.seq;
  const initialAssetKeys = new Set(ctx.brushTextureAssets.keys());
  const initialAlphaMapKeys = new Set(ctx.brushTextureAssetsByAlphaMap.keys());
  const initialR8EmbeddedRgbaBytes = ctx.r8EmbeddedRgbaBytes;
  const initialSerializedUtf16Bytes = ctx.brushTextureSerializedUtf16Bytes;
  const rollbackAssets = (): null => {
    ctx.defs.length = initialDefsLength;
    ctx.seq = initialSequence;
    ctx.r8EmbeddedRgbaBytes = initialR8EmbeddedRgbaBytes;
    ctx.brushTextureSerializedUtf16Bytes = initialSerializedUtf16Bytes;
    for (const key of ctx.brushTextureAssets.keys()) {
      if (!initialAssetKeys.has(key)) ctx.brushTextureAssets.delete(key);
    }
    for (const key of ctx.brushTextureAssetsByAlphaMap.keys()) {
      if (!initialAlphaMapKeys.has(key)) {
        ctx.brushTextureAssetsByAlphaMap.delete(key);
      }
    }
    return null;
  };
  const markupByVariation = input.dabVariations.map(() => [] as string[]);
  const remainingRgbaByteBudget =
    STUDIO_SVG_R8_STREAMING_RGBA_BYTE_BUDGET - initialR8EmbeddedRgbaBytes;
  if (remainingRgbaByteBudget <= 0) return rollbackAssets();
  const streamed = visitStudioSvgR8StreamingCoverage(
    {
      ...input,
      rgbaByteBudget: remainingRgbaByteBudget,
    },
    (mark, variationIndex) => {
      const serialized = serializeStudioDynamicCoverageMark(
        ctx,
        mark,
        strokeOpacity,
        boundedFlow,
        false,
      );
      if (serialized === null) return false;
      markupByVariation[variationIndex]!.push(serialized);
      return true;
    },
  );
  if (!streamed.ok) return rollbackAssets();
  ctx.r8EmbeddedRgbaBytes =
    initialR8EmbeddedRgbaBytes + streamed.embeddedRgbaBytes;
  return markupByVariation.map((markup) => (
    boundedFlow
      ? `<g opacity="${fmtDabOpacity(strokeOpacity)}">${markup.join("")}</g>`
      : `<g>${markup.join("")}</g>`
  ));
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
      const { boxWidth, lineHeight, scaleX } = verticalTextItemGeometry(item, opts.fontSize);
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
      const transform =
        `translate(${fmt(item.x)} ${fmt(item.y)})`
        + `${rotated ? " rotate(90)" : ""}`
        + `${scaleX !== 1 ? ` scale(${fmt(scaleX)} 1)` : ""}`;
      parts.push(`<g transform="${transform}">${block}</g>`);
    }
  }
  return parts.join("");
}

function horizontalRubyBlockMarkup(
  placements: readonly StudioRubyOverlayPlacement[],
  options: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly fontFamily: string;
    readonly fontStyle: "normal" | "bold" | "italic" | "bold italic";
    readonly fill: string;
  },
): string {
  return placements
    .map((placement) => textBlockMarkup({
      text: placement.ruby,
      x: options.offsetX + placement.x,
      y: options.offsetY + placement.y,
      boxWidth: Math.max(placement.baseWidth, 1),
      fontSize: placement.rubyFontSize,
      lineHeight: 1,
      letterSpacing: 0,
      align: "center",
      fontFamily: options.fontFamily,
      fontStyle: options.fontStyle,
      fill: options.fill,
    }))
    .join("");
}

function verticalRubyBlockMarkup(
  plan: StudioVerticalRubyLayoutPlan,
  options: {
    readonly fontFamily: string;
    readonly fontStyle: "normal" | "bold" | "italic" | "bold italic";
    readonly fill: string;
  },
): string {
  return plan.placements
    .map((placement) => textBlockMarkup({
      text: [...placement.ruby].join("\n"),
      x: placement.x,
      y: placement.y,
      boxWidth: placement.width,
      boxHeight: placement.height,
      fontSize: placement.rubyFontSize,
      lineHeight: placement.rubyGlyphAdvance / placement.rubyFontSize,
      letterSpacing: 0,
      align: "center",
      fontFamily: options.fontFamily,
      fontStyle: options.fontStyle,
      fill: options.fill,
    }))
    .join("");
}

function reportVerticalRubyPlan(
  ctx: ExportCtx,
  el: { readonly id: string; readonly type: string },
  plan: StudioVerticalRubyLayoutPlan,
): void {
  for (const warning of plan.warnings) {
    addSkip(ctx, el, "approximated", `세로 루비 경고(${warning.code}): ${warning.message}`);
  }
  for (const unsupported of plan.unsupported) {
    addSkip(ctx, el, "skipped", `세로 루비 미지원(${unsupported.code}): ${unsupported.message}`);
  }
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

function svgSegmentedDynamicDabCount(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
): number {
  return segments.reduce((count, segment) => count + segment.length, 0);
}

/**
 * Retains immutable causal-v3 continuation segments. An accepted prefix shares every complete
 * segment and allocates only the one boundary slice instead of flattening and slicing the full
 * stroke before SVG planning.
 */
function svgSegmentedDynamicDabPrefix(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
  maximumDabs: number,
): readonly (readonly StudioDynamicBrushDab[])[] {
  const accepted: Array<readonly StudioDynamicBrushDab[]> = [];
  let remaining = Math.max(0, Math.floor(maximumDabs));
  for (const segment of segments) {
    if (remaining <= 0) break;
    if (segment.length <= remaining) {
      accepted.push(segment);
      remaining -= segment.length;
      continue;
    }
    accepted.push(segment.slice(0, remaining));
    remaining = 0;
  }
  return accepted;
}

/**
 * Produces variation-major segment sequences in the same affine order as getSymmetricPoints.
 * Coverage consumes the nested arrays directly, preserving the historical mark/SVG byte order
 * without a second whole-stroke dab array.
 */
function svgSegmentedDynamicDabVariations(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
  transforms: readonly StudioBrushSymmetryTransform[],
): readonly StudioDynamicBrushSegmentedDabVariation[] {
  const variationSegments = transforms.map(
    () => [] as Array<readonly StudioDynamicBrushDab[]>,
  );
  for (const segment of segments) {
    const transformed =
      studioDynamicBrushDabVariationsFromTransforms(segment, transforms);
    for (
      let variationIndex = 0;
      variationIndex < transformed.length;
      variationIndex += 1
    ) {
      variationSegments[variationIndex]!.push(transformed[variationIndex]!);
    }
  }
  return variationSegments.map((transformedSegments) => ({
    kind: "studio-dynamic-brush-segmented-dab-variation",
    segments: transformedSegments,
  }));
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
  const sketchStyle = kind !== "freehand"
    ? studioSketchStyleOfElement(el)
    : null;

  const variations = getSymmetricPoints(el.points, el.symmetry);
  // Same captured resolver as StudioDrawNode — one shared engine decision keeps the durable SVG
  // output and the Canvas replay on the same branch (no SVG-only fallback may widen this set).
  const dynamicBrushId = kind === "freehand"
    ? resolveStudioCapturedBrushDynamicsPresetId(el)
    : null;
  // Plan randomness exactly once in the original stroke coordinate space. Symmetry then transforms
  // the complete dab (source station, scatter offset and elliptical axis) just like Canvas does.
  let dynamicPlanFailed = false;
  const dynamicPlan = dynamicBrushId
    ? (() => {
        const materialIdentity = resolveStudioDynamicBrushMaterialIdentity(
          el.brush ?? dynamicBrushId,
          el.brushCatalogId,
        ) ?? resolveStudioDynamicBrushMaterialIdentity(dynamicBrushId)!;
        const sourceDynamics = normalizeStudioBrushDynamicsSettings(
          // Replay fail-safe shared with the canvas planner: an element that stored no snapshot
          // must not inherit today's dry-media kernel pin, or the same document renders through
          // the union carrier on screen and the kernel engine in an export.
          el.brushDynamics
            ?? studioReplaySafeBrushDynamicsSettingsForBrushId(el.brush)
            ?? studioReplaySafeBrushDynamicsSettingsForBrushId(dynamicBrushId)
        );
        const seed = studioBrushDynamicsSeedFromKey(
          `${el.id}:${sourceDynamics.seed}`,
        );
        // Match the renderer-neutral retained/live planner exactly. The document owns the selected
        // stroke width and each stroke owns its hashed seed; a catalogue snapshot is only the
        // immutable source profile. Leaving either value on the source snapshot made SVG texture
        // geometry diverge from the pointer-up Canvas replay.
        const dynamics = normalizeStudioBrushDynamicsSettings({
          ...sourceDynamics,
          seed,
          width: { ...sourceDynamics.width, base: strokeWidth },
        });
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
        const usesCausalDepositPlan =
          isStudioDynamicBrushCausalDepositPipeline(dynamics.depositPipeline);
        const usesContinuation =
          studioDynamicBrushDepositPipelineUsesContinuation(dynamics.depositPipeline);
        const causalDepositPlan = usesCausalDepositPlan && !usesContinuation
          ? planStudioCausalDynamicBrushDepositsV2({
              points: el.points,
              pressures: el.pressures,
              tangentialPressures: el.tangentialPressures,
              speeds: el.speeds,
              tiltXs: el.tiltXs,
              tiltYs: el.tiltYs,
              twists: el.twists,
              settings: dynamics,
              maximumDabs: STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
            })
          : null;
        const continuationPlan = usesContinuation
          ? planStudioCausalDynamicBrushDepositSegmentsV3({
              points: el.points,
              pressures: el.pressures,
              tangentialPressures: el.tangentialPressures,
              speeds: el.speeds,
              tiltXs: el.tiltXs,
              tiltYs: el.tiltYs,
              twists: el.twists,
              settings: dynamics,
            })
          : null;
        if (
          (causalDepositPlan && !causalDepositPlan.ok)
          || (continuationPlan && !continuationPlan.ok)
        ) {
          dynamicPlanFailed = true;
          return null;
        }
        let continuationSegments:
          | readonly (readonly StudioDynamicBrushDab[])[]
          | null = continuationPlan?.ok
            ? continuationPlan.segments.map((segment) => segment.dabs)
            : null;
        let baseDabs: readonly StudioDynamicBrushDab[] = continuationSegments
          ? []
          : causalDepositPlan?.ok
            ? [...causalDepositPlan.dabs]
            : planStudioDynamicBrushDabs({
                ...dabPlanInput,
                maxDabs: DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS,
              });
        const baseDabCount = continuationSegments
          ? svgSegmentedDynamicDabCount(continuationSegments)
          : baseDabs.length;
        const markBudget = usesCausalDepositPlan
          ? usesContinuation
            ? STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET
            : STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET
          : STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET;
        const coverageBudget = resolveStudioDynamicBrushCoverageBudgetContract(
          materialIdentity,
          dynamics,
        );
        const renderBudget = planStudioDynamicBrushRenderBudget({
          settings: coverageBudget.settings,
          dabCount: baseDabCount,
          symmetryCount: variations.length,
          materialMarkMultiplier: coverageBudget.materialMarkMultiplier,
          markBudget,
        });
        if (
          usesCausalDepositPlan
          && renderBudget.maxDabsPerVariation < baseDabCount
        ) {
          // Preserve the same accepted-prefix-v1 receipt used by the live and retained renderers.
          // Skipping the element here would turn a bounded pathological stroke into an empty SVG.
          if (continuationSegments) {
            continuationSegments = svgSegmentedDynamicDabPrefix(
              continuationSegments,
              renderBudget.maxDabsPerVariation,
            );
          } else {
            baseDabs = baseDabs.slice(0, renderBudget.maxDabsPerVariation);
          }
        }
        if (
          !usesCausalDepositPlan
          && renderBudget.maxDabsPerVariation < baseDabCount
        ) {
          baseDabs = planStudioDynamicBrushDabs({
            ...dabPlanInput,
            maxDabs: renderBudget.maxDabsPerVariation,
          });
        }
        const symmetryTransforms = studioBrushSymmetryTransforms(el.symmetry);
        const ordinaryDabVariations =
          studioDynamicBrushDabVariationsFromTransforms(
            baseDabs,
            symmetryTransforms,
          );
        const dabVariations = continuationSegments
          ? null
          : ordinaryDabVariations;
        const coverageDabVariations = continuationSegments
          ? svgSegmentedDynamicDabVariations(
              continuationSegments,
              symmetryTransforms,
            )
          : ordinaryDabVariations;
        // Causal-v3 serializes exact coverage marks below; keeping this null prevents a hidden
        // whole-stroke flatten merely to satisfy the legacy fallback parameter.
        let causalCoverageMarksByVariation:
          readonly (readonly StudioDynamicBrushCoverageMark[])[] | null = null;
        let r8CoverageMarkupByVariation: readonly string[] | null = null;
        const streamsR8Grain = dynamics.grain.amount > 0
          && dynamics.grain.source !== undefined;
        if (streamsR8Grain) {
          r8CoverageMarkupByVariation = serializeStudioR8DynamicCoverageMarks(
            ctx,
            {
              dabVariations: coverageDabVariations,
              dynamics,
              materialIdentity,
              dynamicSeed: seed,
              stroke,
              markBudget,
            },
            opacity,
            isStudioBoundedFlowPaintModelCompatible(el),
          );
          if (!r8CoverageMarkupByVariation) {
            dynamicPlanFailed = true;
            return null;
          }
        } else if (
          usesCausalDepositPlan
          || materialIdentity.dryMediaPresetId !== null
        ) {
          const paperResponse = resolveStudioPaperBrushResponse(
            el.brush,
          );
          const sharedCoverageInput = {
            dynamics,
            materialIdentity,
            dynamicSeed: seed,
            stroke,
            stampGrid: renderBudget.stampGrid,
            markBudget,
            // SVG는 Canvas와 같은 마크를 직렬화해야 하므로 종이 결도 같은 입력으로 받는다.
            ...(studioPaperGranulationIsActive(paperResponse)
              ? {
                  paper: {
                    response: paperResponse,
                    surface: resolveStudioDocumentPaperSurface(),
                  },
                }
              : {}),
          };
          const completeCoverage = planStudioDynamicBrushCoverageAndLegacyMarks({
            ...sharedCoverageInput,
            dabVariations: coverageDabVariations,
          }).coveragePlan;
          if (!completeCoverage.ok) {
            dynamicPlanFailed = true;
            return null;
          }

          let completeOffset = 0;
          const partitions: (readonly StudioDynamicBrushCoverageMark[])[] = [];
          for (const dabs of coverageDabVariations) {
            const variationCoverage = planStudioDynamicBrushCoverageAndLegacyMarks({
              ...sharedCoverageInput,
              dabVariations: [dabs],
            }).coveragePlan;
            if (!variationCoverage.ok) {
              dynamicPlanFailed = true;
              return null;
            }
            const partitionEnd = completeOffset + variationCoverage.marks.length;
            partitions.push(completeCoverage.marks.slice(
              completeOffset,
              partitionEnd,
            ));
            completeOffset = partitionEnd;
          }
          if (completeOffset !== completeCoverage.marks.length) {
            // 리테인드 Canvas는 completeCoverage.marks를 그대로 그린다. 변주별 재계획은 그
            // 마크 배열을 variation 경계로 자르기 위한 자 역할일 뿐이라, 두 계획의 총 마크
            // 수가 어긋나면 결정성 어딘가가 이미 깨진 것이다. 그때 변주별 계획을 조용히
            // 직렬화하면 SVG가 Canvas와 다른 지오메트리를 내보내므로(비등가 조용한 폴백 금지
            // — studio-brush-backend-quality-policy의 cross-engine 폴백 계약과 동일 원칙)
            // skip 영수증을 남기고 fail-closed 한다.
            dynamicPlanFailed = true;
            return null;
          }
          causalCoverageMarksByVariation = partitions;
        }
        return {
          dynamics,
          materialIdentity,
          seed,
          renderBudget,
          dabVariations,
          causalCoverageMarksByVariation,
          r8CoverageMarkupByVariation,
        };
      })()
    : null;
  if (dynamicBrushId && (dynamicPlanFailed || !dynamicPlan)) {
    addSkip(
      ctx,
      el,
      "skipped",
      "동적 브러시의 causal deposit 계획을 안전하게 생성하지 못해 SVG에서 제외했어요.",
    );
    return "";
  }
  const dynamicDabVariations = dynamicPlan?.dabVariations ?? null;
  const parts: string[] = [];
  for (const [variationIndex, points] of variations.entries()) {
    if (kind !== "freehand" && sketchStyle?.enabled) {
      const roughPlan = buildStudioRoughSvgParityPlan({
        elementId: el.id,
        variationIndex,
        kind,
        points,
        strokeWidth,
        hasFill: Boolean(el.fill),
        shapeParams,
        style: sketchStyle,
      });
      if (roughPlan.paths.length > 0) {
        const roughPaths = roughPlan.paths.map((path) => {
          const data = escapeXml(path.data);
          if (path.role === "outline") {
            return (
              `<path d="${data}" data-rough-role="${path.role}" fill="none" stroke="${escapeXml(stroke)}"` +
              ` stroke-width="${fmt(path.strokeWidth)}"${dashAttr}` +
              ` stroke-linecap="${strokeStyle.lineCap}" stroke-linejoin="round"/>`
            );
          }
          if (path.role === "fill-hatch") {
            return (
              `<path d="${data}" data-rough-role="${path.role}" fill="none" stroke="${escapeXml(el.fill ?? "none")}"` +
              ` stroke-width="${fmt(path.strokeWidth)}"` +
              ` stroke-linecap="round" stroke-linejoin="round"/>`
            );
          }
          return (
            `<path d="${data}" data-rough-role="${path.role}" fill="${escapeXml(
              path.role === "outline-fill" ? stroke : (el.fill ?? "none"),
            )}"/>`
          );
        });
        const lineHeads = kind === "line"
          ? lineArrowHeadGeoms(points, strokeStyle, strokeWidth).map((head) =>
              head.kind === "dot"
                ? (
                    `<circle cx="${fmt(head.cx)}" cy="${fmt(head.cy)}"` +
                    ` r="${fmt(head.r)}" fill="${escapeXml(stroke)}"/>`
                  )
                : (
                    `<path d="${pointsToPathD(head.points, true)}"` +
                    ` fill="${escapeXml(stroke)}" stroke-linejoin="round"/>`
                  )
            )
          : [];
        parts.push(
          `<g data-studio-rough-shape="v1" data-rough-seed="${roughPlan.seed}"${opacityAttr}>` +
            roughPaths.join("") +
            lineHeads.join("") +
          `</g>`,
        );
        continue;
      }
    }
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
      const r8CoverageMarkup =
        dynamicPlan?.r8CoverageMarkupByVariation?.[variationIndex];
      parts.push(r8CoverageMarkup ?? serializeFreehand(
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
          dynamicPlan?.renderBudget.stampGrid,
          dynamicPlan?.causalCoverageMarksByVariation?.[variationIndex],
          dynamicPlan?.materialIdentity,
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
    const ribbon = planStudioStampInkRibbon(dabs);
    const path = ribbon.polygons.map((polygon) => (
      pointsToPathD(polygon.points, true)
    )).join(" ");
    return `<path data-stamp-brush="ink" data-stamp-ink-ribbon="${ribbon.version}" data-stamp-ink-coverage="${ribbon.coverageOperation}" data-stamp-ink-cap="${ribbon.cap}" d="${path}" fill="${color}" fill-rule="${ribbon.fillRule}" stroke="none" opacity="${fmtDabOpacity(ribbon.opacity)}"/>`;
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

function serializeStudioOutlineStrokePlan(
  ctx: ExportCtx,
  el: SvgDrawElLike,
  plan: StudioPerfectFreehandRenderPlan,
  stroke: string,
  opacityAttr: string,
): string | null {
  if (plan.kind === "legacy-contract") return null;
  if (plan.kind === "unsupported-contract") {
    addSkip(
      ctx,
      el,
      "skipped",
      `외곽선 획 계약을 지원하지 않아 제외했어요 (${plan.issue.code}).`,
    );
    return "";
  }
  if (plan.kind === "invalid-input") {
    addSkip(
      ctx,
      el,
      "skipped",
      `외곽선 획의 저장 입력이 손상되어 제외했어요 (${plan.reason}).`,
    );
    return "";
  }
  // The capsule sibling branch carries its own honest engine label; the perfect-freehand label is
  // byte-frozen ("perfect-outline-contract-v1") so pre-wave exports stay identical (2026-08-13).
  const engineLabel =
    plan.contract.engine === STUDIO_CROQUIS_CAPSULE_OUTLINE_STROKE_ENGINE
      ? "croquis-capsule-outline-contract-v1"
      : "perfect-outline-contract-v1";
  if (plan.kind === "outline") {
    return (
      `<path d="${plan.pathData}" fill="${escapeXml(stroke)}"`
      + ` data-brush-engine="${engineLabel}"`
      + ` data-brush-profile="${escapeXml(plan.contract.profile.id)}"${opacityAttr}/>`
    );
  }

  const line = plan.line;
  const pathData = tensionPathD(line.points, line.tension);
  const lineMarkup = pathData
    ? (
        `<path d="${pathData}" fill="none" stroke="${escapeXml(stroke)}"`
        + ` stroke-width="${fmt(line.strokeWidth)}"`
        + ' stroke-linecap="round" stroke-linejoin="round"/>'
      )
    : "";
  const capRadius = line.endpointCapRadius;
  const capMarkup: string[] = [];
  if (capRadius !== null && line.points.length >= 2) {
    const startX = line.points[0]!;
    const startY = line.points[1]!;
    capMarkup.push(
      `<circle cx="${fmt(startX)}" cy="${fmt(startY)}" r="${fmt(capRadius)}"`
      + ` fill="${escapeXml(stroke)}"/>`,
    );
    const endX = line.points[line.points.length - 2]!;
    const endY = line.points[line.points.length - 1]!;
    if (endX !== startX || endY !== startY) {
      capMarkup.push(
        `<circle cx="${fmt(endX)}" cy="${fmt(endY)}" r="${fmt(capRadius)}"`
        + ` fill="${escapeXml(stroke)}"/>`,
      );
    }
  }
  return (
    `<g data-brush-engine="${engineLabel}"`
    + ` data-brush-fallback="${plan.reason}"${opacityAttr}>`
    + `${lineMarkup}${capMarkup.join("")}</g>`
  );
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
  dynamicStampGrid: StudioDynamicBrushRenderStampGrid = 7,
  causalCoverageMarks?: readonly StudioDynamicBrushCoverageMark[],
  dynamicMaterialIdentity?: StudioDynamicBrushMaterialIdentity,
): string {
  const brush = el.brush ?? "pen";
  const brushFamily = resolveStudioBrushRenderFamily(brush);
  // Mirrors StudioDrawNode's engine decision exactly (shared captured resolver, no fallback).
  const dynamicsPresetId = resolveStudioCapturedBrushDynamicsPresetId(el);
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
    const pixelPlan = planStudioPixelPencilCells({
      points,
      strokeWidth: aliasStrokeWidth,
    });
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

  if (el.outlineStroke !== undefined) {
    const outlineMarkup = serializeStudioOutlineStrokePlan(
      ctx,
      el,
      planStudioPerfectFreehandRender({
        contract: el.outlineStroke,
        stroker: peekStudioPerfectFreehandStroker(),
        points,
        // `recorded` means DrawEl already owns canonical renderer pressure. Alias mappings belong
        // to the legacy no-contract path below and must never be applied twice.
        pressures: el.pressures,
        // The durable contract, rather than the mutable brush catalogue, owns alias scale.
        strokeWidth,
        sampleSpacing: el.sampleSpacing,
        legacyMinDistance: renderSampleDistance,
      }),
      stroke,
      opacityAttr,
    );
    if (outlineMarkup !== null) return outlineMarkup;
  }

  if (
    points.length === 2 &&
    singlePointRoute === "generic-dot"
  ) {
    const pencilPasses = resolveStudioBrushAliasPencilPasses(brush);
    if (brushFamily === "pencil" && pencilPasses.length > 0) {
      const pressureProfile = resolveStudioRetainedMediaPressureProfileId(brush)
        ?? "pencil";
      const pressureResponse = resolveStudioRetainedMediaPressure(
        pressureProfile,
        el.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
          ? el.pressures?.[0]
          : undefined,
        el.materialMinimumDiameterRatio,
      );
      const circles = pencilPasses.map((pass) => (
        `<circle data-pencil-pass="${pass.role}" cx="${fmt(points[0])}" cy="${fmt(points[1])}" r="${fmt(Math.max(0.35, aliasStrokeWidth * pass.widthScale * pressureResponse.sizeScale / 2))}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(strokeOpacity * Math.min(1, pass.opacityScale * Math.sqrt(pressureResponse.opacityScale * pressureResponse.flowScale)))}"/>`
      ));
      return `<g data-brush-alias="${escapeXml(brush)}">${circles.join("")}</g>`;
    }
    const pressure = mapStudioBrushAliasPressure(
      brush,
      resolveStudioInkPressure(el.pressures?.[0], el.pressureModel),
      studioInkFallbackPressure(el.pressureModel)
    );
    const retainedPressureProfile =
      resolveStudioRetainedMediaPressureProfileId(brush);
    const retainedPressure = retainedPressureProfile
      ? resolveStudioRetainedMediaPressure(
          retainedPressureProfile,
          el.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
            ? el.pressures?.[0]
            : undefined,
          el.materialMinimumDiameterRatio,
        )
      : null;
    const pressureAware = brushFamily === "pen"
      || brushFamily === "gpen"
      || brushFamily === "calligraphy"
      || brushFamily === "perfect"
      || brushFamily === "marker"
      || retainedPressure !== null;
    const width = retainedPressure
      ? aliasStrokeWidth * retainedPressure.sizeScale
      : pressureAware
        ? aliasStrokeWidth * (0.3 + pressure * 1.4)
        : aliasStrokeWidth;
    if (brushFamily === "highlighter") {
      const pressureBrush = isStudioFxPressureBrushId(brush)
        ? brush
        : "highlighter";
      const pressureResponse = resolveStudioFxBrushTapPressureResponse(
        pressureBrush,
        el.pressures?.[0],
        el.materialPressureModel,
        el.materialMinimumDiameterRatio,
      );
      const tapWidth = aliasStrokeWidth * pressureResponse.widthScale;
      const washPlan = planStudioHighlighterWashTap({
        brushId: resolveStudioHighlighterWashBrushId(brush),
        x: points[0],
        y: points[1],
        width: tapWidth,
        opacityScale: pressureResponse.opacityScale,
      });
      return `<path d="${studioHighlighterWashPlanPathData(washPlan)}" fill="${escapeXml(stroke)}" fill-rule="nonzero" data-brush-engine="${washPlan.version}" data-highlighter-cap="${washPlan.capProfile}" data-highlighter-wash="tap" style="mix-blend-mode:multiply" opacity="${fmtDabOpacity(strokeOpacity * washPlan.opacityScale)}"/>`;
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

  // Branch order mirrors StudioDrawNode exactly: the stamp engine wins before dynamics. The two
  // id sets are disjoint under the shared resolver, but keeping the order identical guarantees
  // both surfaces take the same branch even for foreign/corrupt documents.
  if (stampKind) {
    const style = resolveStudioStampBrushStyle(
      stampKind,
      { color: stroke, size: strokeWidth, opacity: strokeOpacity },
      el.stamp,
      brush,
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

  if (
    dynamicBrush &&
    dynamicsPresetId &&
    ((causalCoverageMarks !== undefined && causalCoverageMarks.length > 0) || (dynamicDabs !== undefined && dynamicDabs.length > 0))
  ) {
    const normalizedDynamics = dynamics ?? normalizeStudioBrushDynamicsSettings(
      // Same replay fail-safe as serializeDraw and the canvas planner.
      el.brushDynamics
        ?? studioReplaySafeBrushDynamicsSettingsForBrushId(brush)
        ?? studioReplaySafeBrushDynamicsSettingsForBrushId(dynamicsPresetId)
    );
    if (causalCoverageMarks) {
      const approximated = { textureBudgetExhausted: false };
      const exactCoverage = serializeStudioDynamicCoverageMarks(
        ctx,
        causalCoverageMarks,
        strokeOpacity,
        isStudioBoundedFlowPaintModelCompatible(el),
        dynamicMaterialIdentity,
        approximated,
      );
      if (exactCoverage !== null) {
        if (approximated.textureBudgetExhausted) {
          addSkip(
            ctx,
            el,
            "approximated",
            "문서의 브러시 텍스처 예산을 모두 써서, 이 획은 팁 질감 없이 형태만 그렸어요.",
          );
        }
        return exactCoverage;
      }
      addSkip(
        ctx,
        el,
        "skipped",
        "동적 브러시의 전체 해상도 팁을 SVG에 무손실로 직렬화하지 못해 제외했어요.",
      );
      return "";
    }
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
    const boundedFlow = isStudioBoundedFlowPaintModelCompatible(el);
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
          Math.max(
            0,
            composedDab.opacity * composedDab.flow * (boundedFlow ? 1 : strokeOpacity)
          )
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
    return boundedFlow
      ? `<g opacity="${fmtDabOpacity(strokeOpacity)}">${marks.join("")}</g>`
      : `<g>${marks.join("")}</g>`;
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
    const watercolorSeed = watercolorBrushSeedFromKey(el.id);
    const watercolorPressures = mapStudioBrushAliasPressureSamples(
      brush,
      el.pressures,
      Math.floor(points.length / 2),
      0.55
    );
    if (el.watercolorPipeline === "causal-walker-v2") {
      const plannedDabs = planCausalWatercolorBrushDabs({
          points,
          pressures: watercolorPressures,
          baseWidth: watercolorSettings.baseWidth,
          spacing: watercolorSettings.spacing,
          seed: watercolorSeed,
          maxDabs: DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
        }, true);
      // Export is settled by definition — the opt-in living-ink bake runs here exactly as it does
      // on the settled Canvas commit (same seed, same planner), keeping the two surfaces agreeing.
      const dabs = applyStudioBrushAliasWatercolorMaterial(
        brush,
        plannedDabs,
        watercolorSeed,
        "settled",
      );
      const wetRibbonPlan = planStudioWetRibbonCarrier(dabs, {
        seed: watercolorSeed,
      });
      if (wetRibbonPlan.batches.length === 0) return "";
      const ribbonPaths = wetRibbonPlan.batches.map((batch) => (
        `<path d="${studioWetRibbonCarrierBatchPathData(batch)}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(batch.opacity * strokeOpacity)}"/>`
      )).join("");
      return `<g data-brush-engine="wet-ribbon-carrier-v2">${ribbonPaths}</g>`;
    }

    // Persisted watercolor without the causal marker is intentionally byte-compatible with the
    // fitted legacy circle plan. Only new v2 strokes may use the directional ribbon carrier.
    const plannedDabs = planWatercolorBrushDabs({
      points: processFreehandPoints(points, renderSampleDistance),
      pressures: watercolorPressures,
      baseWidth: watercolorSettings.baseWidth,
      spacing: watercolorSettings.spacing,
      seed: watercolorSeed,
      maxDabs: 512,
    });
    const dabs = applyStudioBrushAliasWatercolorMaterial(
      brush,
      plannedDabs,
      watercolorSeed,
      "settled",
    );
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
      // Same fallback as the Canvas node so the two renderers cannot disagree about the nib.
      resolveStudioCalligraphyRenderTip(el.brush, el.brushTip)
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
    // 붓 — Canvas와 같은 stroke-local non-zero coverage plan을 직렬화한다.
    // 각 세그먼트의 winding을 하나로 정규화해야 역방향 재추적/자기교차가 이전 칠을
    // 상쇄해 투명하게 만드는 SVG non-zero compound-path 취소를 막을 수 있다.
    const smoothed = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0,
    }).points;
    if (smoothed.length < 2) return "";
    const coveragePlan = planStudioAngledNibStrokeLocalCoverage(
      smoothed,
      aliasStrokeWidth,
      -Math.PI / 6,
      el.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
        ? {
            profileId: brush === "flat-brush" ? "flat-brush" : "brush",
            pressures: el.pressures,
            minimumDiameterRatio: el.materialMinimumDiameterRatio,
            elementOpacity: strokeOpacity,
          }
        : undefined,
    );
    if (coveragePlan.polygons.length === 0) return "";
    const coverageSubpaths = (
      polygons: readonly StudioStrokeLocalCoveragePolygon[],
    ) => polygons.map((polygon) => (
      `M ${fmt(polygon.points[0])} ${fmt(polygon.points[1])} ${Array.from(
        { length: polygon.points.length / 2 - 1 },
        (_, pointIndex) => {
          const coordinateIndex = (pointIndex + 1) * 2;
          return `L ${fmt(polygon.points[coordinateIndex])} ${fmt(polygon.points[coordinateIndex + 1])}`;
        }
      ).join(" ")} Z`
    )).join(" ");
    // No resolvable tonal range — one compound fill at the element's opacity, byte for byte what
    // this carrier has always emitted, so saved documents replay unchanged.
    if (coveragePlan.shells.length <= 1) {
      return `<path d="${coverageSubpaths(coveragePlan.polygons)}" fill="${escapeXml(stroke)}" fill-rule="nonzero"${opacityAttr} data-brush-engine="angled-nib-local-coverage"/>`;
    }
    // Cumulative density shells. Each shell is still ONE compound nonzero fill — the property that
    // keeps butt joints and self-crossings from double-darkening — and the shell's alpha is
    // absolute, so the element opacity is applied exactly once, by the planner.
    const shellPaths = coveragePlan.shells.map((shell) => (
      `<path d="${coverageSubpaths(shell.polygons)}" fill="${escapeXml(stroke)}" fill-rule="nonzero" opacity="${fmtDabOpacity(shell.opacity)}" data-brush-engine="angled-nib-local-coverage" data-nib-density-band="${shell.band}"/>`
    )).join("");
    return `<g data-brush-shells="angled-nib-density">${shellPaths}</g>`;
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
    if (
      el.materialPressureModel
      !== STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
    ) {
      const paths = passes.map((pass) => {
        const jittered = scaledPencilJitterPoints(
          renderPath.points,
          pass.jitterRadius * (pass.role === "soft-edge" ? 0.6 : 1.3),
        );
        return `<path d="${tensionPathD(jittered, renderPath.tension)}" fill="none" stroke="${escapeXml(stroke)}" data-pencil-pass="${pass.role}" stroke-width="${fmt(aliasStrokeWidth * pass.widthScale)}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmtDabOpacity(strokeOpacity * pass.opacityScale)}"/>`;
      });
      return `<g data-brush-alias="${escapeXml(brush)}">${paths.join("")}</g>`;
    }
    const pressureProfile = resolveStudioRetainedMediaPressureProfileId(brush)
      ?? "pencil";
    const paths = passes.flatMap((pass) => {
      const jittered = scaledPencilJitterPoints(
        renderPath.points,
        pass.jitterRadius,
      );
      const pressurePlan = planStudioRetainedMediaPressureCurve(
        jittered,
        el.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
          ? el.pressures
          : undefined,
        pressureProfile,
        {
          tension: renderPath.tension,
          minimumDiameterRatio: el.materialMinimumDiameterRatio,
        },
      );
      const ribbon = planStudioRetainedMediaRibbon(
        pressurePlan,
        Math.max(0.5, aliasStrokeWidth * pass.widthScale),
      );
      return ribbon.runs.flatMap((run, runIndex) => {
        const cells = run.cells.map((cell, cellIndex) => {
          const cellOpacity = strokeOpacity * Math.min(
            1,
            pass.opacityScale
            * Math.sqrt(cell.opacityScale * cell.flowScale),
          );
          return `<path d="${pointsToPathD(cell.points, true)}" fill="${escapeXml(stroke)}" stroke="none" stroke-width="${fmt(cell.width)}" data-pencil-pass="${pass.role}" data-pencil-ribbon-cell="${runIndex}:${cellIndex}" opacity="${fmtDabOpacity(cellOpacity)}"/>`;
        });
        const caps = run.caps.map((cap) => {
          const capOpacity = strokeOpacity * Math.min(
            1,
            pass.opacityScale
            * Math.sqrt(cap.opacityScale * cap.flowScale),
          );
          return `<path d="${pointsToPathD(cap.points, true)}" fill="${escapeXml(stroke)}" data-pencil-endcap="${pass.role}:${cap.role}" opacity="${fmtDabOpacity(capOpacity)}"/>`;
        });
        return [...cells, ...caps];
      });
    });
    return `<g data-brush-alias="${escapeXml(brush)}" data-brush-engine="retained-pressure-ribbon-v1">${paths.join("")}</g>`;
  }

  if (brushFamily === "highlighter") {
    // 형광펜 — 한 gesture를 한 번만 채우는 wash 리본. 자기 교차는 농도가 겹치지 않고,
    // 서로 다른 DrawEl만 multiply로 자연스럽게 중첩된다.
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      acceptedTension: 0.35,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.4,
    });
    const pressureBrush = isStudioFxPressureBrushId(brush)
      ? brush
      : "highlighter";
    const pressurePath = planStudioFxBrushPressurePath({
      brushId: pressureBrush,
      points: renderPath.points,
      pressures: el.pressures,
      pressureModel: el.materialPressureModel,
      minimumDiameterRatio: el.materialMinimumDiameterRatio,
      tension: renderPath.tension,
    });
    const washPlan = planStudioHighlighterWashRibbon({
      brushId: resolveStudioHighlighterWashBrushId(brush),
      pressurePath,
      baseWidth: aliasStrokeWidth,
    });
    const pathData = studioHighlighterWashPlanPathData(washPlan);
    const detailPathData = studioHighlighterWashDetailPathData(washPlan);
    // Same two passes as the Canvas node: one base wash, one rim/fibre wash, each painted once.
    const detailPath = detailPathData
      ? `<path d="${detailPathData}" fill="${escapeXml(stroke)}" fill-rule="nonzero" stroke="none" data-highlighter-wash="detail" opacity="${fmtDabOpacity(washPlan.opacityScale * washPlan.detailOpacityScale)}" style="mix-blend-mode:multiply"/>`
      : "";
    return `<g data-brush-engine="${washPlan.version}" data-highlighter-cap="${washPlan.capProfile}" data-highlighter-wash="single-fill"${opacityAttr}><path d="${pathData}" fill="${escapeXml(stroke)}" fill-rule="nonzero" stroke="none" opacity="${fmtDabOpacity(washPlan.opacityScale)}" style="mix-blend-mode:multiply"/>${detailPath}</g>`;
  }

  if (brushFamily === "neon") {
    const renderPath = resolveStudioFreehandRenderPath(points, {
      sampleSpacing: el.sampleSpacing,
      acceptedTension: 0.3,
      legacyMinDistance: renderSampleDistance,
      legacyTension: 0.35,
    });
    const passes = planNeonBrushPasses(strokeWidth);
    if (
      el.materialPressureModel
      !== STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
    ) {
      const layers = renderPath.points.length === 2
        ? passes.map((pass) => (
            `<circle cx="${fmt(renderPath.points[0])}" cy="${fmt(renderPath.points[1])}" r="${fmt(Math.max(0.25, strokeWidth * pass.widthScale / 2))}" fill="${pass.tone === "white-core" ? "#fff" : escapeXml(stroke)}" opacity="${fmtDabOpacity(pass.opacity * strokeOpacity)}" style="mix-blend-mode:normal"/>`
          )).join("")
        : (() => {
            const pathD = tensionPathD(renderPath.points, renderPath.tension);
            return passes.map((pass) => (
              `<path d="${pathD}" fill="none" stroke="${pass.tone === "white-core" ? "#fff" : escapeXml(stroke)}" stroke-width="${fmt(Math.max(0.5, strokeWidth * pass.widthScale))}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmtDabOpacity(pass.opacity * strokeOpacity)}" style="mix-blend-mode:normal"/>`
            )).join("");
          })();
      return `<g data-brush-engine="neon-halo" data-luminous-composite="${STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}">${layers}</g>`;
    }
    const pressurePath = planStudioFxBrushPressurePath({
      brushId: "neon",
      points: renderPath.points,
      pressures: el.pressures,
      pressureModel: el.materialPressureModel,
      minimumDiameterRatio: el.materialMinimumDiameterRatio,
      tension: renderPath.tension,
    });
    const tapPressure = resolveStudioFxBrushTapPressureResponse(
      "neon",
      el.pressures?.[0],
      el.materialPressureModel,
      el.materialMinimumDiameterRatio,
    );
    const layers = renderPath.points.length === 2
      ? passes.map((pass) => {
          const response = resolveStudioFxPressurePassResponse(
            tapPressure,
            pass.widthScale,
            pass.tone === "white-core",
          );
          return `<circle cx="${fmt(renderPath.points[0])}" cy="${fmt(renderPath.points[1])}" r="${fmt(Math.max(0.25, strokeWidth * pass.widthScale * response.widthScale / 2))}" fill="${pass.tone === "white-core" ? "#fff" : escapeXml(stroke)}" opacity="${fmtDabOpacity(Math.min(1, pass.opacity * response.opacityScale) * strokeOpacity)}" style="mix-blend-mode:normal"/>`;
        }).join("")
      : passes.map((pass) => {
          const luminousCore = pass.tone === "white-core";
          const ribbonPlan = planStudioFxLuminousRibbonPass({
            brushId: "neon",
            pressurePath,
            baseWidth: strokeWidth,
            passWidthScale: pass.widthScale,
            passOpacity: pass.opacity,
            luminousCore,
          });
          return `<path data-luminous-ribbon="single-fill" data-luminous-cap="${ribbonPlan.cap}" data-luminous-composite="${ribbonPlan.compositeOperation}" d="${studioFxLuminousRibbonPathD(ribbonPlan)}" fill="${pass.tone === "white-core" ? "#fff" : escapeXml(stroke)}" fill-rule="${ribbonPlan.fillRule}" stroke="none" opacity="${fmtDabOpacity(ribbonPlan.opacity * strokeOpacity)}" style="mix-blend-mode:normal"/>`;
        }).join("");
    return `<g data-brush-engine="neon-halo" data-luminous-composite="${STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}">${layers}</g>`;
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
    if (
      el.materialPressureModel
      !== STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
    ) {
      const layers = renderPath.points.length === 2
        ? passes.map((pass) => (
            `<circle cx="${fmt(renderPath.points[0])}" cy="${fmt(renderPath.points[1])}" r="${fmt(Math.max(0.25, strokeWidth * pass.widthScale / 2))}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(pass.opacity * strokeOpacity)}" style="mix-blend-mode:normal"/>`
          )).join("")
        : (() => {
            const pathD = tensionPathD(renderPath.points, renderPath.tension);
            return passes.map((pass) => (
              `<path d="${pathD}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(Math.max(0.5, strokeWidth * pass.widthScale))}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmtDabOpacity(pass.opacity * strokeOpacity)}" style="mix-blend-mode:normal"/>`
            )).join("");
          })();
      return `<g data-brush-engine="glow-pressure-halo" data-luminous-composite="${STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}">${layers}</g>`;
    }
    const pressureBrush = soft ? "soft-glow" : "glow";
    const pressurePath = planStudioFxBrushPressurePath({
      brushId: pressureBrush,
      points: renderPath.points,
      pressures: el.pressures,
      pressureModel: el.materialPressureModel,
      minimumDiameterRatio: el.materialMinimumDiameterRatio,
      tension: renderPath.tension,
    });
    const tapPressure = resolveStudioFxBrushTapPressureResponse(
      pressureBrush,
      el.pressures?.[0],
      el.materialPressureModel,
      el.materialMinimumDiameterRatio,
    );
    const layers = renderPath.points.length === 2
      ? passes.map((pass, passIndex) => {
          const response = resolveStudioFxPressurePassResponse(
            tapPressure,
            pass.widthScale,
            passIndex === passes.length - 1,
          );
          return `<circle cx="${fmt(renderPath.points[0])}" cy="${fmt(renderPath.points[1])}" r="${fmt(Math.max(0.25, strokeWidth * pass.widthScale * response.widthScale / 2))}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(Math.min(1, pass.opacity * response.opacityScale) * strokeOpacity)}" style="mix-blend-mode:normal"/>`;
        }).join("")
      : passes.map((pass, passIndex) => {
          const luminousCore = passIndex === passes.length - 1;
          const ribbonPlan = planStudioFxLuminousRibbonPass({
            brushId: pressureBrush,
            pressurePath,
            baseWidth: strokeWidth,
            passWidthScale: pass.widthScale,
            passOpacity: pass.opacity,
            luminousCore,
          });
          return `<path data-luminous-ribbon="single-fill" data-luminous-cap="${ribbonPlan.cap}" data-luminous-composite="${ribbonPlan.compositeOperation}" d="${studioFxLuminousRibbonPathD(ribbonPlan)}" fill="${escapeXml(stroke)}" fill-rule="${ribbonPlan.fillRule}" stroke="none" opacity="${fmtDabOpacity(ribbonPlan.opacity * strokeOpacity)}" style="mix-blend-mode:normal"/>`;
        }).join("");
    return `<g data-brush-engine="glow-pressure-halo" data-luminous-composite="${STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}">${layers}</g>`;
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
    return `<g data-luminous-composite="${STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}" style="mix-blend-mode:normal">${marks}</g>`;
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
      maxDabs: FX_OIL_DAB_CAP,
      paintBody: studioOilPaintBodyForBrush(brush),
      tipProfile: studioOilTipProfileForBrush(brush),
    });
    // brush--bristle-depletion 레인만 v1 강모 고갈 다이내믹을 켠다, brush--bristle-physics 레인만
    // WetBrush-2D 강모 물리 시뮬을 켠다(2026-08-13 wave 3) — Canvas 렌더러(StudioDrawNode)의 유화
    // 분기와 동일 입력(대브·시드)이라 두 렌더러의 플랜이 일치한다. 옵션이 없는 다른 모든 유화
    // 브러시는 캐리어 계약상 바이트 동일 플랜을 유지한다.
    //
    // dli GGX 릴리프 오버레이는 brush--impasto-relief 와 **oil--impasto-ribbon** 두 레인이 켠다
    // (2026-08-15). 임파스토 레인이 이름만 임파스토였던 것을 고친 것이다: 릴리프가 없으면
    // oil--impasto-ribbon 은 선언 필드가 oil--filbert-ribbon 과 완전히 동일해서 defaultWidth/
    // defaultOpacity 만 다른 같은 브러시였고, 렌더 픽셀 비교에서도 oil--flat-ribbon 과 0.163,
    // acrylic--stiff-ribbon 과 0.168 로 코퍼스 중앙값(1.04)의 6분의 1 거리에 붙어 있었다.
    // 저장된 oil--impasto-ribbon 획은 이제 릴리프와 함께 다시 그려진다 — 질감을 바이트 안정성보다
    // 우선한다는 기존 결정(크레용 5레인)과 같은 판단.
    const carrier = planStudioOilRibbonCarrier(
      dabs,
      studioOilRibbonProgramsForBrush(brush, fxBrushSeedFromKey(el.id), el.brushEnginePrograms?.oil),
    );
    if (!carrier.body) return "";
    const body = `<path data-paint-carrier="contiguous-variable-width-ribbon" d="${studioOilRibbonPathData(carrier.body, true)}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(carrier.bodyOpacity * strokeOpacity)}"/>`;
    // One <path> per load band, with every run of that band as a subpath: SVG paints a path once,
    // which is what keeps a self-crossing from depositing its bristle ridges twice.
    const bristles = carrier.bristleLanes.map((lane) => (
      `<path data-paint-bristle-lane="true" d="${lane.runs.map((run) => studioOilRibbonPathData(run)).join("")}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(lane.lineWidth)}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmtDabOpacity(lane.opacity * strokeOpacity)}"/>`
    )).join("");
    // brush--impasto-relief 오버레이 — Canvas sceneFunc과 같은 페인트 계약(하이라이트=공유 화이트
    // 상수 screen, 섀도우=스트로크 색 multiply, 레인당 한 번 페인트). 플랜에 키가 없으면 빈
    // 문자열이라 기존 유화 lane 직렬화 바이트가 그대로 유지된다.
    const relief = (carrier.impastoReliefLanes ?? []).map((lane) => (
      `<path data-paint-impasto-relief="${lane.kind}" d="${lane.runs.map((run) => studioOilRibbonPathData(run)).join("")}" fill="none" stroke="${lane.kind === "highlight" ? STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR : escapeXml(stroke)}" stroke-width="${fmt(lane.lineWidth)}" stroke-linecap="round" stroke-linejoin="round" opacity="${fmtDabOpacity(lane.opacity * strokeOpacity)}" style="mix-blend-mode:${lane.kind === "highlight" ? "screen" : "multiply"}"/>`
    )).join("");
    return `<g data-brush-engine="oil-ribbon-carrier-v1">${body}<g style="mix-blend-mode:multiply">${bristles}</g>${relief === "" ? "" : `<g data-brush-engine-overlay="${STUDIO_OIL_IMPASTO_RELIEF_OVERLAY_VERSION}">${relief}</g>`}</g>`;
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
      maxDabs: FX_PASTEL_DAB_CAP,
    });
    if (dabs.length === 0) return "";
    const softId = nextId(ctx, "sp");
    ctx.defs.push(
      `<radialGradient id="${softId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${escapeXml(stroke)}"/><stop offset="55%" stop-color="${escapeXml(stroke)}"/><stop offset="100%" stop-color="${escapeXml(stroke)}" stop-opacity="0"/></radialGradient>`
    );
    const fibres = dabs.map((dab) => (
      `<ellipse cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" rx="${fmt(dab.radiusX)}" ry="${fmt(dab.radiusY)}" transform="rotate(${fmt(dab.angleRad * 180 / Math.PI)} ${fmt(dab.x)} ${fmt(dab.y)})" fill="url(#${softId})" opacity="${fmtDabOpacity(dab.opacity * strokeOpacity)}"/>`
    )).join("");
    return `<g>${fibres}</g>`;
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
  const fontStyle = el.fontStyle ?? "bold";
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
  const rubySpans = readDialogueRubySpans(el.rubySpans);

  // 채우기 — 그라데이션이면 로컬(0,0 원점) bbox 로 defs 생성(그룹 translate 안이라 로컬 좌표).
  const gradientSpec =
    el.fillType === "gradient"
      ? (el.gradient ?? legacyTextGradientToSpec(el.gradientColorStart, el.gradientColorEnd, el.gradientDirection))
      : null;

  if (usesPath) {
    if (rubySpans) {
      addSkip(ctx, el, "skipped", "곡선 텍스트의 루비 주석은 SVG 경로 조판에서 아직 재현할 수 없어요.");
    }
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
    if (
      verticalLayout.columns.some((column) =>
        column.items.some(
          (item) => item.rotation === 90 || item.form === "tate-chu-yoko",
        ),
      )
    ) {
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
      fontStyle,
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
    const verticalRuby = planDialogueVerticalRubyOverlayPlacements(
      el.text,
      rubySpans,
      verticalLayout,
      {
        fontSize: el.fontSize,
        lineHeight: el.lineHeight ?? 1.4,
        letterSpacing: verticalLetterSpacing,
      },
    );
    reportVerticalRubyPlan(ctx, el, verticalRuby);
    const rubyBlock = verticalRubyBlockMarkup(verticalRuby, {
      fontFamily,
      fontStyle,
      fill: el.fill,
    });
    return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}>${verticalBlock}${rubyBlock}</g>`;
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
    fontStyle,
    fill,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    filter,
  });
  const horizontalRuby = rubySpans
    ? planDialogueRubyOverlayPlacements(content, rubySpans, {
        fontSize: el.fontSize,
        letterSpacing,
        textWidth: el.width,
        align: el.align ?? "left",
      })
    : [];
  if (horizontalRuby.length > 0) {
    addSkip(ctx, el, "approximated", "가로 루비 위치는 SVG에서 글꼴 advance 근사로 배치돼요.");
  } else if (rubySpans) {
    addSkip(ctx, el, "skipped", "유효한 가로 루비 범위를 찾지 못해 루비 주석을 그리지 않았어요.");
  }
  const rubyBlock = horizontalRubyBlockMarkup(horizontalRuby, {
    offsetX: 0,
    offsetY: 0,
    fontFamily,
    fontStyle,
    fill: el.fill,
  });
  return `<g${transform ? att("transform", transform) : ""}${opacity !== 1 ? att("opacity", opacity) : ""}>${block}${rubyBlock}</g>`;
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
  const content = el.text;
  const boxWidth = Math.max(8, el.width - bHPad * 2);
  const boxHeight = Math.max(8, el.height - (bVPadTop + bVPadBot));
  const bubbleFontStyle = el.fontStyle ?? "bold";
  const rubySpans = readDialogueRubySpans(el.rubySpans);
  if (el.vertical && content.trim().length > 0) {
    const verticalLayout = layoutVerticalText(
      {
        text: content,
        fontSize: bFs,
        lineHeight,
        letterSpacing,
        fontFamily,
        fontStyle: bubbleFontStyle,
        maxColumnLength: boxHeight,
        blockAlign: verticalBlockAlign(el.align),
      },
      SVG_VERTICAL_MEASURER,
    );
    if (
      verticalLayout.columns.some((column) =>
        column.items.some((item) => item.rotation === 90 || item.form === "tate-chu-yoko"),
      )
    ) {
      addSkip(
        ctx,
        el,
        "approximated",
        "말풍선 세로쓰기 속 라틴/숫자 폭은 글꼴 실측 없이 근사해 열 나눔이 화면과 조금 다를 수 있어요.",
      );
    }
    const verticalRuby = planDialogueVerticalRubyOverlayPlacements(
      content,
      rubySpans,
      verticalLayout,
      { fontSize: bFs, lineHeight, letterSpacing },
    );
    reportVerticalRubyPlan(ctx, el, verticalRuby);
    const baseMarkup = verticalTextBlockMarkup({
      layout: verticalLayout,
      fontSize: bFs,
      letterSpacing,
      fontFamily,
      fontStyle: bubbleFontStyle,
      fill: () => el.textFill,
    });
    const rubyMarkup = verticalRubyBlockMarkup(verticalRuby, {
      fontFamily,
      fontStyle: bubbleFontStyle,
      fill: el.textFill,
    });
    const verticalX = bHPad + Math.max(0, (boxWidth - verticalLayout.width) / 2);
    const verticalY = bVPadTop + Math.max(0, (boxHeight - verticalLayout.height) / 2);
    body.push(`<g transform="translate(${fmt(verticalX)} ${fmt(verticalY)})">${baseMarkup}${rubyMarkup}</g>`);
  } else if (content.trim().length > 0) {
    if (content.split("\n").some((line) => estimateLineWidth(line, bFs, letterSpacing) > boxWidth * 1.02)) {
      addSkip(ctx, el, "approximated", "말풍선 자동 줄바꿈은 SVG에 없어 수동 줄바꿈(엔터)만 반영돼요.");
    }
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
        fontStyle: bubbleFontStyle,
        fill: el.textFill,
      })
    );
    const horizontalRuby = rubySpans
      ? planDialogueRubyOverlayPlacements(content, rubySpans, {
          fontSize: bFs,
          letterSpacing,
          textWidth: boxWidth,
          align: el.align ?? "center",
        })
      : [];
    if (horizontalRuby.length > 0) {
      addSkip(ctx, el, "approximated", "말풍선 가로 루비 위치는 SVG에서 글꼴 advance 근사로 배치돼요.");
    } else if (rubySpans) {
      addSkip(ctx, el, "skipped", "유효한 말풍선 가로 루비 범위를 찾지 못해 루비 주석을 그리지 않았어요.");
    }
    body.push(horizontalRubyBlockMarkup(horizontalRuby, {
      offsetX: bHPad,
      offsetY: bVPadTop,
      fontFamily,
      fontStyle: bubbleFontStyle,
      fill: el.textFill,
    }));
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
    brushTextureAssets: new Map(),
    brushTextureAssetsByAlphaMap: new Map(),
    brushTextureSerializedUtf16Bytes: 0,
    r8EmbeddedRgbaBytes: 0,
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
