import type { AutoAdjust } from "./studio-auto-adjust";
import type { BlurFx } from "./studio-blur";
import type { ChannelMixer } from "./studio-channel-mixer";
import type { Clarity } from "./studio-clarity";
import type { ColorBalance } from "./studio-color-balance";
import type { ColorToAlpha } from "./studio-color-to-alpha";
import type { CurvePoint, CurveRgbChannels } from "./studio-curves";
import type { Detail } from "./studio-detail";
import type { Distort } from "./studio-distort";
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
  outline?: Outline;
  glow?: Glow;
  halftone?: Halftone;
  grain?: Grain;
  /** 수묵/수채 번짐, 한지 섬유, 안료 과립을 함께 합성하는 비파괴 재질 효과. */
  inkWash?: InkWash;
  blurFx?: BlurFx;
  distort?: Distort;
  stylize?: Stylize;
  light?: Light;
  sketch?: Sketch;
  detail?: Detail;
};

function isActiveNumber(value: number | undefined): boolean {
  return value != null && value !== 0;
}

function isNonDefaultLevelFields(el: ImageFilterFields): boolean {
  return !!(
    (el.levelsBlack != null && el.levelsBlack !== 0) ||
    (el.levelsWhite != null && el.levelsWhite !== 255) ||
    (el.levelsGamma != null && el.levelsGamma !== 1) ||
    (el.levelsOutBlack != null && el.levelsOutBlack !== 0) ||
    (el.levelsOutWhite != null && el.levelsOutWhite !== 255)
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

/** 가벼운 활성 판정. true면 고급 필터 엔진을 동적 로드하고, 엔진이 최종 identity 여부를 다시 판정한다. */
export function hasActiveImageFilters(el: ImageFilterFields): boolean {
  return !!(
    isActiveNumber(el.blur) ||
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
    hasObjectFilter(el.colorToAlpha) ||
    isActiveNumber(el.saturation) ||
    isActiveNumber(el.hue) ||
    isActiveNumber(el.temperature) ||
    isActiveNumber(el.sharpen) ||
    isActiveNumber(el.pixelate) ||
    el.invert ||
    isActiveNumber(el.inkThreshold) ||
    (el.duotoneShadow && el.duotoneHighlight) ||
    el.screentone ||
    el.lineart ||
    isActiveNumber(el.chromatic) ||
    isActiveNumber(el.posterize) ||
    isActiveNumber(el.noise)
  );
}

/**
 * buildImageFilters의 attrs/filters가 바뀌는지 비교할 때 쓰는 캐시 의존성 키
 * (StudioPage useEffect deps용) — 모든 보정 필드를 안정적 순서로 직렬화한 문자열.
 */
export function imageFilterCacheKey(el: ImageFilterFields): string {
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
  ]);
}
