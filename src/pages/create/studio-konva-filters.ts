/**
 * Studio Konva Filter Registry
 * StudioPage가 모듈 최상단에서 인라인으로 정의하던 커스텀 Konva 픽셀 필터
 * (Screentone/Lineart/Chromatic/Posterize/Noise)와 studio-filters의 순수 픽셀 필터
 * (Temperature/Sharpen/InkThreshold/Duotone)를 한 곳에서 konva.Filters에 부착한다.
 * Konva 노드(`this`)에서 attrs를 읽는 래퍼 등록 + 보정 필드→{filters, attrs} 선택 로직을 묶었다.
 * 픽셀 수학과 상수는 studio-filters / 기존 StudioPage 구현 그대로(verbatim).
 */

import { STUDIO_PIXEL_FILTERS, type StudioImageDataLike } from "./studio-filters";
import { levelsKonvaFilter, normalizeLevels, isIdentityLevels } from "./studio-levels";
import { curveKonvaFilter, normalizeCurve, isIdentityCurve, curveToFlat, type CurvePoint } from "./studio-curves";
import { colorBalanceKonvaFilter, normalizeColorBalance, isIdentityColorBalance, type ColorBalance } from "./studio-color-balance";
import { channelMixerKonvaFilter, normalizeChannelMixer, isIdentityChannelMixer, channelMixerToFlat, type ChannelMixer } from "./studio-channel-mixer";
import { selectiveHslKonvaFilter, normalizeSelectiveHsl, isIdentitySelectiveHsl, selectiveHslToFlat, type SelectiveHsl } from "./studio-selective-hsl";
import { vibranceKonvaFilter, normalizeVibrance, isIdentityVibrance, type Vibrance } from "./studio-vibrance";
import { gradientMapKonvaFilter, normalizeGradientMap, gradientMapToFlat, type GradientMap } from "./studio-gradient-map";
import { photoFilterKonvaFilter, normalizePhotoFilter, isIdentityPhotoFilter, type PhotoFilter } from "./studio-photo-filter";

// 이미지 요소의 보정 관련 필드(StudioPage의 ImageEl 부분집합) — 결합도를 낮추기 위한 로컬 타입.
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
  // 레벨 보정(studio-levels) — 입력/출력 검정·흰점 + 감마.
  levelsBlack?: number;
  levelsWhite?: number;
  levelsGamma?: number;
  levelsOutBlack?: number;
  levelsOutWhite?: number;
  // 톤 커브(studio-curves) + 컬러 밸런스(studio-color-balance) + 채널 믹서(studio-channel-mixer).
  curve?: CurvePoint[];
  colorBalance?: ColorBalance;
  channelMixer?: ChannelMixer;
  selectiveHsl?: SelectiveHsl;
  vibrance?: Vibrance;
  gradientMap?: GradientMap;
  photoFilter?: PhotoFilter;
};

// 그라디언트 맵은 설정되면 항상 활성(기본 흑→백도 흑백 변환이므로).
function hasActiveGradientMap(el: ImageFilterFields): boolean {
  return !!el.gradientMap;
}
// 포토 필터는 농도 > 0이면 활성.
function hasActivePhotoFilter(el: ImageFilterFields): boolean {
  return !!el.photoFilter && !isIdentityPhotoFilter(normalizePhotoFilter(el.photoFilter));
}

// 선택 색상(HSL)이 항등이 아니면 활성.
function hasActiveSelectiveHsl(el: ImageFilterFields): boolean {
  return !!el.selectiveHsl && !isIdentitySelectiveHsl(normalizeSelectiveHsl(el.selectiveHsl));
}
// 생동감(Vibrance)이 항등이 아니면 활성.
function hasActiveVibrance(el: ImageFilterFields): boolean {
  return !!el.vibrance && !isIdentityVibrance(normalizeVibrance(el.vibrance));
}

// 톤 커브가 항등(보정 없음)이 아니면 활성.
function hasActiveCurve(el: ImageFilterFields): boolean {
  return !!el.curve && !isIdentityCurve(normalizeCurve(el.curve));
}
// 컬러 밸런스가 항등이 아니면 활성.
function hasActiveColorBalance(el: ImageFilterFields): boolean {
  return !!el.colorBalance && !isIdentityColorBalance(normalizeColorBalance(el.colorBalance));
}
// 채널 믹서가 항등이 아니면 활성.
function hasActiveChannelMixer(el: ImageFilterFields): boolean {
  return !!el.channelMixer && !isIdentityChannelMixer(normalizeChannelMixer(el.channelMixer));
}

// 이미지 요소의 레벨 필드 → studio-levels LevelsParams로 정규화.
function levelsParamsOf(el: ImageFilterFields) {
  return normalizeLevels({
    blackPoint: el.levelsBlack,
    whitePoint: el.levelsWhite,
    gamma: el.levelsGamma,
    outBlack: el.levelsOutBlack,
    outWhite: el.levelsOutWhite,
  });
}
// 레벨 보정이 항등(보정 없음)이 아니면 활성.
function hasActiveLevels(el: ImageFilterFields): boolean {
  return !isIdentityLevels(levelsParamsOf(el));
}

// 최소 Konva 형태(테스트에서 가짜 객체 주입 가능). Filters는 필터 함수 맵(Konva 내장 + 커스텀 혼재).
// 실제 Konva.Filters(각 값이 Konva의 Filter 타입)와 테스트 가짜 객체를 모두 받기 위해 값 타입은 any로 둔다.
export type KonvaLike = {
  Filters: Record<string, any>;
};

// Konva 필터 함수가 호출될 때의 `this` — node.attrs에서 보정 파라미터를 읽는다.
type FilterThis = { attrs?: Record<string, unknown> };

// 보정값이 "활성"인지: 불리언은 truthy, 숫자는 0이 아니고 null/undefined가 아닐 때.
function isActiveNumber(value: number | undefined): boolean {
  return value != null && value !== 0;
}

/**
 * konva.Filters에 커스텀 필터(Screentone/Lineart/Chromatic/Posterize/Noise
 * + Temperature/Sharpen/InkThreshold/Duotone)를 부착. 멱등(여러 번 호출해도 안전).
 * Konva 내장 필터(Blur/Brighten/Contrast/Grayscale/Sepia/HSL/Pixelate/Invert)는
 * konva가 제공하므로 절대 덮어쓰지 않는다.
 */
export function registerStudioKonvaFilters(konva: KonvaLike): void {
  const F = konva.Filters;

  // --- StudioPage에서 옮겨온 5개(픽셀 수학·상수 그대로) ---

  F.Screentone = function (imageData: StudioImageDataLike) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const size = 6;

    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        let totalLuminance = 0;
        let count = 0;
        for (let dy = 0; dy < size && y + dy < height; dy++) {
          for (let dx = 0; dx < size && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            const r = data[idx]!;
            const g = data[idx + 1]!;
            const b = data[idx + 2]!;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            totalLuminance += lum;
            count++;
          }
        }

        const avgLum = totalLuminance / count;
        const radius = (1 - avgLum / 255) * (size / 2) * 1.2;
        const cx = x + size / 2;
        const cy = y + size / 2;

        for (let dy = 0; dy < size && y + dy < height; dy++) {
          for (let dx = 0; dx < size && x + dx < width; dx++) {
            const px = x + dx;
            const py = y + dy;
            const idx = (py * width + px) * 4;

            const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
            if (dist < radius) {
              data[idx] = 40;
              data[idx + 1] = 40;
              data[idx + 2] = 40;
            } else {
              data[idx] = 255;
              data[idx + 1] = 255;
              data[idx + 2] = 255;
            }
          }
        }
      }
    }
  };

  F.Lineart = function (imageData: StudioImageDataLike) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const src = new Uint8ClampedArray(data);

    const kernelX = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1],
    ];
    const kernelY = [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1],
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let pixelX = 0;
        let pixelY = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            const val = 0.299 * src[idx]! + 0.587 * src[idx + 1]! + 0.114 * src[idx + 2]!;
            pixelX += val * kernelX[ky + 1]![kx + 1]!;
            pixelY += val * kernelY[ky + 1]![kx + 1]!;
          }
        }

        const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
        const currentIdx = (y * width + x) * 4;

        if (magnitude > 45) {
          data[currentIdx] = 0;
          data[currentIdx + 1] = 0;
          data[currentIdx + 2] = 0;
          data[currentIdx + 3] = 255;
        } else {
          data[currentIdx] = 255;
          data[currentIdx + 1] = 255;
          data[currentIdx + 2] = 255;
          data[currentIdx + 3] = 255;
        }
      }
    }
  };

  F.Chromatic = function (this: FilterThis, imageData: StudioImageDataLike) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    // `this`는 Konva.Node — node.attrs에서 색수차 오프셋을 읽는다.
    const offset = (this.attrs?.chromatic as number) || 4;
    const src = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const rx = Math.max(0, x - offset);
        const ridx = (y * width + rx) * 4;
        const bx = Math.min(width - 1, x + offset);
        const bidx = (y * width + bx) * 4;

        data[idx] = src[ridx]!;
        data[idx + 1] = src[idx + 1]!;
        data[idx + 2] = src[bidx]!;
      }
    }
  };

  F.Posterize = function (this: FilterThis, imageData: StudioImageDataLike) {
    const data = imageData.data;
    // `this`는 Konva.Node — node.attrs에서 포스터화 레벨을 읽는다.
    const levels = (this.attrs?.posterize as number) || 4;
    const step = 255 / (levels - 1);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i]! / step) * step;
      data[i + 1] = Math.round(data[i + 1]! / step) * step;
      data[i + 2] = Math.round(data[i + 2]! / step) * step;
    }
  };

  F.Noise = function (this: FilterThis, imageData: StudioImageDataLike) {
    const data = imageData.data;
    // `this`는 Konva.Node — node.attrs에서 노이즈 강도를 읽는다.
    const amount = (this.attrs?.noise as number) || 20;
    for (let i = 0; i < data.length; i += 4) {
      const noiseVal = (Math.random() - 0.5) * amount * 2.55;
      data[i] = Math.min(255, Math.max(0, data[i]! + noiseVal));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1]! + noiseVal));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2]! + noiseVal));
    }
  };

  // --- studio-filters의 순수 픽셀 필터를 this.attrs 기반 Konva 래퍼로 등록 ---
  // 각 래퍼의 `this`는 Konva.Node — node.attrs를 STUDIO_PIXEL_FILTERS에 넘긴다.

  F.Temperature = function (this: FilterThis, imageData: StudioImageDataLike) {
    STUDIO_PIXEL_FILTERS.Temperature!(imageData, this.attrs ?? {});
  };
  F.Sharpen = function (this: FilterThis, imageData: StudioImageDataLike) {
    STUDIO_PIXEL_FILTERS.Sharpen!(imageData, this.attrs ?? {});
  };
  F.InkThreshold = function (this: FilterThis, imageData: StudioImageDataLike) {
    STUDIO_PIXEL_FILTERS.InkThreshold!(imageData, this.attrs ?? {});
  };
  F.Duotone = function (this: FilterThis, imageData: StudioImageDataLike) {
    STUDIO_PIXEL_FILTERS.Duotone!(imageData, this.attrs ?? {});
  };
  // 레벨 보정 — this.attrs의 levels* 값을 읽어 적용(studio-levels).
  F.Levels = levelsKonvaFilter;
  // 톤 커브 — this.attrs.curvePoints(flat) 적용(studio-curves).
  F.Curve = curveKonvaFilter;
  // 컬러 밸런스 — this.attrs.cbShadows/cbMidtones/cbHighlights 적용(studio-color-balance).
  F.ColorBalance = colorBalanceKonvaFilter;
  // 채널 믹서 — this.attrs.channelMixer(flat 13) 적용(studio-channel-mixer).
  F.ChannelMixer = channelMixerKonvaFilter;
  // 선택 색상(HSL) — this.attrs.selectiveHsl(flat 24) 적용(studio-selective-hsl).
  F.SelectiveHsl = selectiveHslKonvaFilter;
  // 생동감 — this.attrs.vibrance/vibranceSat 적용(studio-vibrance).
  F.Vibrance = vibranceKonvaFilter;
  // 그라디언트 맵 — this.attrs.gradientMap(flat) 적용(studio-gradient-map).
  F.GradientMap = gradientMapKonvaFilter;
  // 포토 필터 — this.attrs.pfColor/pfDensity/pfPreserve 적용(studio-photo-filter).
  F.PhotoFilter = photoFilterKonvaFilter;
}

/** 활성 보정이 하나라도 있으면 true (캐시 on/off 판단용). */
export function hasActiveImageFilters(el: ImageFilterFields): boolean {
  return !!(
    isActiveNumber(el.blur) ||
    isActiveNumber(el.brightness) ||
    isActiveNumber(el.contrast) ||
    el.grayscale ||
    el.sepia ||
    hasActiveLevels(el) ||
    hasActiveCurve(el) ||
    hasActiveColorBalance(el) ||
    hasActiveChannelMixer(el) ||
    hasActiveSelectiveHsl(el) ||
    hasActiveVibrance(el) ||
    hasActiveGradientMap(el) ||
    hasActivePhotoFilter(el) ||
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
 * Konva.Image에 적용할 { filters, attrs }.
 * filters는 konva.Filters에서 고른 함수 배열(순서: 색조정→스타일라이즈),
 * attrs는 노드에 펼쳐 넣을 속성(활성값만 + Konva 내장 필터용 blurRadius/brightness/contrast).
 */
export function buildImageFilters(
  el: ImageFilterFields,
  konva: KonvaLike,
): { filters: Array<(imageData: StudioImageDataLike) => void>; attrs: Record<string, number | string | number[]>} {
  const F = konva.Filters;
  const filters: Array<(imageData: StudioImageDataLike) => void> = [];
  const attrs: Record<string, number | string | number[]> = {};

  // --- 색/톤 보정 먼저 ---
  if (isActiveNumber(el.brightness)) {
    filters.push(F.Brighten as (imageData: StudioImageDataLike) => void);
    attrs.brightness = el.brightness!;
  }
  if (isActiveNumber(el.contrast)) {
    filters.push(F.Contrast as (imageData: StudioImageDataLike) => void);
    attrs.contrast = el.contrast!;
  }
  if (isActiveNumber(el.blur)) {
    filters.push(F.Blur as (imageData: StudioImageDataLike) => void);
    attrs.blurRadius = el.blur!;
  }
  if (isActiveNumber(el.saturation) || isActiveNumber(el.hue)) {
    filters.push(F.HSL as (imageData: StudioImageDataLike) => void);
    // Konva HSL: saturation -1..1, hue 0..359(도), luminance 0이 중립.
    attrs.saturation = isActiveNumber(el.saturation) ? el.saturation! : 0;
    attrs.hue = isActiveNumber(el.hue) ? (((el.hue! % 360) + 360) % 360) : 0;
    attrs.luminance = 0;
  }
  if (isActiveNumber(el.temperature)) {
    filters.push(F.Temperature!);
    attrs.temperature = el.temperature!;
  }
  if (isActiveNumber(el.sharpen)) {
    filters.push(F.Sharpen!);
    attrs.sharpen = el.sharpen!;
  }
  if (hasActiveLevels(el)) {
    filters.push(F.Levels!);
    const lv = levelsParamsOf(el);
    attrs.levelsBlack = lv.blackPoint;
    attrs.levelsWhite = lv.whitePoint;
    attrs.levelsGamma = lv.gamma;
    attrs.levelsOutBlack = lv.outBlack;
    attrs.levelsOutWhite = lv.outWhite;
  }
  if (hasActiveCurve(el)) {
    filters.push(F.Curve!);
    attrs.curvePoints = curveToFlat(normalizeCurve(el.curve));
  }
  if (hasActiveColorBalance(el)) {
    filters.push(F.ColorBalance!);
    const cb = normalizeColorBalance(el.colorBalance);
    attrs.cbShadows = cb.shadows;
    attrs.cbMidtones = cb.midtones;
    attrs.cbHighlights = cb.highlights;
  }
  if (hasActiveChannelMixer(el)) {
    filters.push(F.ChannelMixer!);
    attrs.channelMixer = channelMixerToFlat(normalizeChannelMixer(el.channelMixer));
  }
  if (hasActiveSelectiveHsl(el)) {
    filters.push(F.SelectiveHsl!);
    attrs.selectiveHsl = selectiveHslToFlat(normalizeSelectiveHsl(el.selectiveHsl));
  }
  if (hasActiveVibrance(el)) {
    filters.push(F.Vibrance!);
    const vb = normalizeVibrance(el.vibrance);
    attrs.vibrance = vb.vibrance;
    attrs.vibranceSat = vb.saturation;
  }
  if (hasActivePhotoFilter(el)) {
    filters.push(F.PhotoFilter!);
    const pf = normalizePhotoFilter(el.photoFilter);
    attrs.pfColor = pf.color;
    attrs.pfDensity = pf.density;
    attrs.pfPreserve = pf.preserveLuminosity ? 1 : 0;
  }
  if (hasActiveGradientMap(el)) {
    filters.push(F.GradientMap!);
    attrs.gradientMap = gradientMapToFlat(normalizeGradientMap(el.gradientMap));
  }
  if (el.grayscale) {
    filters.push(F.Grayscale as (imageData: StudioImageDataLike) => void);
  }
  if (el.sepia) {
    filters.push(F.Sepia as (imageData: StudioImageDataLike) => void);
  }
  if (el.invert) {
    filters.push(F.Invert as (imageData: StudioImageDataLike) => void);
  }

  // --- 스타일라이즈 ---
  if (isActiveNumber(el.inkThreshold)) {
    filters.push(F.InkThreshold!);
    attrs.inkThreshold = el.inkThreshold!;
  }
  if (el.duotoneShadow && el.duotoneHighlight) {
    filters.push(F.Duotone!);
    attrs.duotoneShadow = el.duotoneShadow;
    attrs.duotoneHighlight = el.duotoneHighlight;
  }
  if (el.screentone) {
    filters.push(F.Screentone!);
  }
  if (el.lineart) {
    filters.push(F.Lineart!);
  }
  if (isActiveNumber(el.chromatic)) {
    filters.push(F.Chromatic!);
    attrs.chromatic = el.chromatic!;
  }
  if (isActiveNumber(el.posterize)) {
    filters.push(F.Posterize!);
    attrs.posterize = el.posterize!;
  }
  if (isActiveNumber(el.noise)) {
    filters.push(F.Noise!);
    attrs.noise = el.noise!;
  }
  if (isActiveNumber(el.pixelate)) {
    filters.push(F.Pixelate as (imageData: StudioImageDataLike) => void);
    attrs.pixelSize = Math.max(1, Math.round(el.pixelate!));
  }

  return { filters, attrs };
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
  ]);
}
