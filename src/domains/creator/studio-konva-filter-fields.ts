import type {
  StudioAdjustmentEngineId,
  StudioAdjustmentFilterOperation,
  StudioAdjustmentStack,
} from "./studio-adjustment-stack";
import type {
  StudioClouds,
  StudioConvolution,
  StudioExposureAdjustment,
  StudioMorphology,
  StudioPixelOffset,
  StudioUnsharpMask,
} from "./studio-advanced-pixel-filters";
import type { AutoAdjust } from "./studio-auto-adjust";
import type { BlurFx } from "./studio-blur";
import type { ChannelMixer } from "./studio-channel-mixer";
import type { Clarity } from "./studio-clarity";
import type { ColorBalance } from "./studio-color-balance";
import type { ColorToAlpha } from "./studio-color-to-alpha";
import type { CurvePoint, CurveRgbChannels } from "./studio-curves";
import type { Detail } from "./studio-detail";
import type { Distort } from "./studio-distort";
import type { StudioGlitchFx, StudioVignetteFx } from "./studio-filter-pack";
import type { StudioFilterUnionWave } from "./studio-filter-union-wave";
import type { Glow } from "./studio-glow";
import type { GradientMap } from "./studio-gradient-map";
import type { Grain } from "./studio-grain";
import type { Halftone } from "./studio-halftone";
import type { InkWash } from "./studio-ink-wash";
import type { LevelsRgbChannels } from "./studio-levels";
import type { Light } from "./studio-light";
import type { Outline } from "./studio-outline";
import type { PhotoFilter } from "./studio-photo-filter";
import type { SelectiveHsl } from "./studio-selective-hsl";
import type { ShadowHighlight } from "./studio-shadow-highlight";
import type { Sketch } from "./studio-sketch";
import type { Stylize } from "./studio-stylize";
import type { Vibrance } from "./studio-vibrance";

// 이미지 요소의 보정 관련 필드(StudioPage의 ImageEl 부분집합).
// type-only import와 가벼운 판정만 담아 /studio 첫 청크가 픽셀 필터 엔진을 당겨오지 않게 한다.
export type ImageFilterFields = {
  blur?: number;
  brightness?: number;
  contrast?: number;
  grayscale?: boolean;
  sepia?: boolean;
  screentone?: boolean;
  lineart?: boolean;
  chromatic?: number;
  posterize?: number;
  noise?: number;
  /** Stable seed for the scalar noise filter. */
  noiseSeed?: number;
  saturation?: number;
  hue?: number;
  temperature?: number;
  sharpen?: number;
  pixelate?: number;
  invert?: boolean;
  inkThreshold?: number;
  duotoneShadow?: string;
  duotoneHighlight?: string;
  levelsBlack?: number;
  levelsWhite?: number;
  levelsGamma?: number;
  levelsOutBlack?: number;
  levelsOutWhite?: number;
  levelsCh?: LevelsRgbChannels; // r/g/b 개별 채널 레벨(마스터는 levels* 스칼라)
  curve?: CurvePoint[];
  curveCh?: CurveRgbChannels; // r/g/b 개별 채널 곡선(마스터는 curve)
  colorBalance?: ColorBalance;
  channelMixer?: ChannelMixer;
  selectiveHsl?: SelectiveHsl;
  vibrance?: Vibrance;
  gradientMap?: GradientMap;
  photoFilter?: PhotoFilter;
  colorToAlpha?: ColorToAlpha;
  autoAdjust?: AutoAdjust;
  clarity?: Clarity;
  /** 섀도우/하이라이트 — 휘도 LUT 기반 명암 복구(studio-shadow-highlight). */
  shadowHighlight?: ShadowHighlight;
  outline?: Outline;
  glow?: Glow;
  halftone?: Halftone;
  /**
   * 그레인/텍스처 — chroma(색 노이즈, 2026-07-24) 포함 객체 전체가 imageFilterCacheKey에
   * JSON 직렬화되므로 Grain에 필드가 늘어도 캐시 키가 자동으로 함께 바뀐다(stale 캐시 없음).
   */
  grain?: Grain;
  /** 수묵/수채 번짐, 한지 섬유, 안료 과립을 함께 합성하는 비파괴 재질 효과. */
  inkWash?: InkWash;
  blurFx?: BlurFx;
  distort?: Distort;
  stylize?: Stylize;
  /** 글리치 — 시드 기반 row-slice 오프셋 + RGB 분리(studio-filter-pack, type-only 의존). */
  glitchFx?: StudioGlitchFx;
  /** 비네트 — smoothstep 가장자리 어둡히기(studio-filter-pack, type-only 의존). */
  vignetteFx?: StudioVignetteFx;
  /** Deterministic inverse-warp/noise/stylize union wave. */
  filterUnionWave?: StudioFilterUnionWave;
  light?: Light;
  sketch?: Sketch;
  detail?: Detail;
  /** Worker-first bounded pixel filters exposed through the non-destructive smart-filter stack. */
  exposureAdjustment?: StudioExposureAdjustment;
  unsharpMask?: StudioUnsharpMask;
  morphology?: StudioMorphology;
  pixelOffset?: StudioPixelOffset;
  convolution?: StudioConvolution;
  clouds?: StudioClouds;
  /** Persisted non-destructive program on Studio image elements. */
  smartFilters?: StudioAdjustmentStack;
  /** Normalized Worker projection; preserves exact order and duplicate engines. */
  smartFilterOperations?: readonly StudioAdjustmentFilterOperation[];
};

function isActiveNumber(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function isActivePositiveNumber(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNonDefault(value: number | undefined, defaultValue: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== defaultValue;
}

function isNonDefaultLevelFields(el: ImageFilterFields): boolean {
  return !!(
    isFiniteNonDefault(el.levelsBlack, 0) ||
    isFiniteNonDefault(el.levelsWhite, 255) ||
    isFiniteNonDefault(el.levelsGamma, 1) ||
    isFiniteNonDefault(el.levelsOutBlack, 0) ||
    isFiniteNonDefault(el.levelsOutWhite, 255)
  );
}

function hasObjectFilter(value: unknown): boolean {
  return value != null;
}

// 수묵 재질은 strength만 0이어도 기본 파라미터 객체가 남을 수 있다. 이 파일은 /studio 첫
// 청크에서 읽히므로 무거운 픽셀 엔진을 import하지 않고, 효과를 켜는 최소 조건만 가볍게 판별한다.
// 누락/잘못된 strength는 normalizeInkWash에서 기본 0으로 돌아가므로 캐시를 켤 이유가 없다.
function hasActiveInkWashCandidate(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const strength = (value as { strength?: unknown }).strength;
  return typeof strength === "number" && Number.isFinite(strength) && strength > 0;
}

function candidateRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function candidateFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasActiveExposureCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  if (!source) return false;
  return (candidateFinite(source.exposure) && source.exposure !== 0)
    || (candidateFinite(source.gamma) && source.gamma !== 1)
    || (candidateFinite(source.offset) && source.offset !== 0);
}

function hasActiveAmountCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  return !!source && candidateFinite(source.amount) && source.amount > 0;
}

function hasActiveSignedAmountCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  return !!source && candidateFinite(source.amount) && source.amount !== 0;
}

function hasActiveIntensityCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  return !!source && candidateFinite(source.intensity) && source.intensity > 0;
}

function hasActiveDarknessCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  return !!source && candidateFinite(source.darkness) && source.darkness > 0;
}

function hasActiveRadiusCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  return !!source && candidateFinite(source.radius) && source.radius > 0;
}

function hasActivePixelOffsetCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  if (!source) return false;
  return (candidateFinite(source.x) && source.x !== 0)
    || (candidateFinite(source.y) && source.y !== 0);
}

function hasActiveConvolutionCandidate(value: unknown): boolean {
  const source = candidateRecord(value);
  if (!source || !Array.isArray(source.kernel) || source.kernel.length !== 9) return false;
  const identity = [0, 0, 0, 0, 1, 0, 0, 0, 0];
  const kernelChanged = source.kernel.some((coefficient, index) =>
    candidateFinite(coefficient) && coefficient !== identity[index]
  );
  const divisorChanged = candidateFinite(source.divisor) && source.divisor !== 1;
  const biasChanged = candidateFinite(source.bias) && source.bias !== 0;
  return kernelChanged || divisorChanged || biasChanged;
}

const LIGHTWEIGHT_ADJUSTMENT_ENGINES = new Set<StudioAdjustmentEngineId>([
  "curves",
  "levels",
  "brightness-contrast",
  "shadow-highlight",
  "hue-saturation",
  "color-balance",
  "channel-mixer",
  "gradient-map",
  "blur",
  "gaussian-blur",
  "motion-blur",
  "spin-blur",
  "zoom-blur",
  "sharpen",
  "smart-sharpen",
  "median-despeckle",
  "high-pass",
  "noise",
  "invert",
  "grayscale",
  "sepia",
  "pixelate",
  "posterize",
  "ink-threshold",
  "line-extraction",
  "screentone",
  "color-halftone",
  "chromatic-aberration",
  "edge-detect",
  "emboss",
  "solarize",
  "oil-paint",
  "exposure",
  "unsharp-mask",
  "morphology",
  "offset",
  "custom-convolution",
  "clouds",
  "surface-blur",
  "crystal-mosaic",
  "pencil-sketch",
  "crosshatch",
  "ordered-dither",
  "glowing-edges",
  "cutout",
  "retro-film",
  "watercolor",
  "diffuse-glow",
]);

function lightweightSmartFilterParams(value: unknown): Record<string, number | string | boolean> {
  const source = candidateRecord(value);
  if (!source) return {};
  const params: Record<string, number | string | boolean> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (key.length > 48) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) params[key] = raw;
    else if (typeof raw === "boolean") params[key] = raw;
    else if (typeof raw === "string" && raw.length <= 128) params[key] = raw;
  }
  return params;
}

/**
 * Lightweight mirror of the ordered-operation wire normalization. This module intentionally has
 * no runtime imports: it is evaluated before the heavyweight filter engine is intent-loaded.
 */
function lightweightSmartFilterProgram(value: unknown): readonly StudioAdjustmentFilterOperation[] {
  const source = candidateRecord(value);
  const list = Array.isArray(value)
    ? value
    : source && Array.isArray(source.entries)
      ? source.entries
      : [];
  const entries: StudioAdjustmentFilterOperation[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < list.length && entries.length < 24; index += 1) {
    const candidate = candidateRecord(list[index]);
    if (!candidate || typeof candidate.engine !== "string") continue;
    if (!LIGHTWEIGHT_ADJUSTMENT_ENGINES.has(candidate.engine as StudioAdjustmentEngineId)) continue;
    let id = typeof candidate.id === "string" && candidate.id.trim().length > 0
      ? candidate.id.trim().slice(0, 80)
      : `adj-${index + 1}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    entries.push({
      id,
      engine: candidate.engine as StudioAdjustmentEngineId,
      enabled: candidate.enabled !== false,
      params: lightweightSmartFilterParams(candidate.params),
    });
  }
  return entries.filter((entry) => entry.enabled);
}

function hasActiveSmartFilterProgram(el: ImageFilterFields): boolean {
  return lightweightSmartFilterProgram(
    el.smartFilterOperations !== undefined ? el.smartFilterOperations : el.smartFilters
  ).length > 0;
}

/** 가벼운 활성 판정. true면 고급 필터 엔진을 동적 로드하고, 엔진이 최종 identity 여부를 다시 판정한다. */
export function hasActiveImageFilters(el: ImageFilterFields): boolean {
  return !!(
    isActivePositiveNumber(el.blur) ||
    isActiveNumber(el.brightness) ||
    isActiveNumber(el.contrast) ||
    el.grayscale ||
    el.sepia ||
    isNonDefaultLevelFields(el) ||
    hasObjectFilter(el.levelsCh) ||
    hasObjectFilter(el.curve) ||
    hasObjectFilter(el.curveCh) ||
    hasObjectFilter(el.colorBalance) ||
    hasObjectFilter(el.channelMixer) ||
    hasObjectFilter(el.selectiveHsl) ||
    hasObjectFilter(el.vibrance) ||
    hasObjectFilter(el.gradientMap) ||
    hasObjectFilter(el.photoFilter) ||
    hasObjectFilter(el.autoAdjust) ||
    hasObjectFilter(el.clarity) ||
    hasObjectFilter(el.shadowHighlight) ||
    hasObjectFilter(el.outline) ||
    hasObjectFilter(el.glow) ||
    hasObjectFilter(el.halftone) ||
    hasObjectFilter(el.grain) ||
    hasActiveInkWashCandidate(el.inkWash) ||
    hasObjectFilter(el.blurFx) ||
    hasObjectFilter(el.distort) ||
    hasObjectFilter(el.stylize) ||
    hasObjectFilter(el.light) ||
    hasObjectFilter(el.sketch) ||
    hasObjectFilter(el.detail) ||
    hasActiveExposureCandidate(el.exposureAdjustment) ||
    hasActiveAmountCandidate(el.unsharpMask) ||
    hasActiveRadiusCandidate(el.morphology) ||
    hasActivePixelOffsetCandidate(el.pixelOffset) ||
    hasActiveConvolutionCandidate(el.convolution) ||
    hasActiveAmountCandidate(el.clouds) ||
    hasActiveIntensityCandidate(el.glitchFx) ||
    hasActiveDarknessCandidate(el.vignetteFx) ||
    hasActiveSignedAmountCandidate(el.filterUnionWave) ||
    hasActiveSmartFilterProgram(el) ||
    hasObjectFilter(el.colorToAlpha) ||
    isActiveNumber(el.saturation) ||
    isActiveNumber(el.hue) ||
    isActiveNumber(el.temperature) ||
    isActivePositiveNumber(el.sharpen) ||
    isActivePositiveNumber(el.pixelate) ||
    el.invert ||
    isActivePositiveNumber(el.inkThreshold) ||
    (el.duotoneShadow && el.duotoneHighlight) ||
    el.screentone ||
    el.lineart ||
    isActivePositiveNumber(el.chromatic) ||
    isActivePositiveNumber(el.posterize) ||
    isActivePositiveNumber(el.noise)
  );
}

/**
 * buildImageFilters의 attrs/filters가 바뀌는지 비교할 때 쓰는 캐시 의존성 키
 * (StudioPage useEffect deps용) — 모든 보정 필드를 안정적 순서로 직렬화한 문자열.
 */
export function imageFilterCacheKey(el: ImageFilterFields): string {
  const smartFilterProgram = lightweightSmartFilterProgram(
    el.smartFilterOperations !== undefined ? el.smartFilterOperations : el.smartFilters
  );
  return JSON.stringify([
    el.blur ?? null,
    el.brightness ?? null,
    el.contrast ?? null,
    el.grayscale ?? null,
    el.sepia ?? null,
    el.screentone ?? null,
    el.lineart ?? null,
    el.chromatic ?? null,
    el.posterize ?? null,
    el.noise ?? null,
    el.noiseSeed ?? null,
    el.saturation ?? null,
    el.hue ?? null,
    el.temperature ?? null,
    el.sharpen ?? null,
    el.pixelate ?? null,
    el.invert ?? null,
    el.inkThreshold ?? null,
    el.duotoneShadow ?? null,
    el.duotoneHighlight ?? null,
    el.levelsBlack ?? null,
    el.levelsWhite ?? null,
    el.levelsGamma ?? null,
    el.levelsOutBlack ?? null,
    el.levelsOutWhite ?? null,
    el.curve ?? null,
    el.colorBalance ?? null,
    el.channelMixer ?? null,
    el.selectiveHsl ?? null,
    el.vibrance ?? null,
    el.gradientMap ?? null,
    el.photoFilter ?? null,
    el.autoAdjust ?? null,
    el.clarity ?? null,
    el.shadowHighlight ?? null,
    el.outline ?? null,
    el.glow ?? null,
    el.halftone ?? null,
    el.grain ?? null,
    el.inkWash ?? null,
    el.blurFx ?? null,
    el.distort ?? null,
    el.stylize ?? null,
    el.light ?? null,
    el.sketch ?? null,
    el.detail ?? null,
    el.colorToAlpha ?? null,
    el.levelsCh ?? null,
    el.curveCh ?? null,
    el.exposureAdjustment ?? null,
    el.unsharpMask ?? null,
    el.morphology ?? null,
    el.pixelOffset ?? null,
    el.convolution ?? null,
    el.clouds ?? null,
    el.glitchFx ?? null,
    el.vignetteFx ?? null,
    el.filterUnionWave ?? null,
    smartFilterProgram,
  ]);
}
