/** Pure mask builders and combine semantics for professional pixel-selection sources. */
import {
  applyColorRangeMaskToSelection,
  flipColorRangeMask,
  type ColorRangeMask,
} from "./studio-color-range";
import {
  selectionCombineModeForOperation,
  selectionOperationBase,
  type PixelSelection,
  type SelectionOperationMode,
} from "./studio-selection-tools";

export const STUDIO_SELECTION_SOURCE_MAX_AXIS = 8_192;
export const STUDIO_SELECTION_SOURCE_MAX_PIXELS = 16_777_216;
export const STUDIO_SELECTION_SUBJECT_THRESHOLD_RANGE = {
  min: 0.1,
  max: 0.9,
  step: 0.05,
} as const;
export const STUDIO_SELECTION_SUBJECT_THRESHOLD_DEFAULT = 0.5;
export const STUDIO_SELECTION_SUBJECT_SOFTNESS_DEFAULT = 0.18;

export interface ApplySelectionSourceMaskOptions {
  readonly aspect?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly vectorThreshold?: number;
  readonly preserveFeather?: boolean;
}

function assertDimensions(width: number, height: number): number {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > STUDIO_SELECTION_SOURCE_MAX_AXIS
    || height > STUDIO_SELECTION_SOURCE_MAX_AXIS
  ) {
    throw new RangeError("선택 소스 이미지 크기가 안전 범위를 벗어났습니다.");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > STUDIO_SELECTION_SOURCE_MAX_PIXELS) {
    throw new RangeError("선택 소스 이미지 픽셀 수가 안전 범위를 벗어났습니다.");
  }
  return pixels;
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Extract source alpha without retaining the RGB channels. */
export function alphaMaskFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): ColorRangeMask {
  const pixels = assertDimensions(width, height);
  if (rgba.length !== pixels * 4) {
    throw new RangeError("선택 소스 RGBA 길이가 이미지 크기와 일치하지 않습니다.");
  }
  const alpha = new Uint8ClampedArray(pixels);
  for (let index = 0; index < pixels; index += 1) {
    alpha[index] = rgba[index * 4 + 3]!;
  }
  return { width, height, alpha };
}

/** Convert model confidence into an antialiased matte around a configurable decision threshold. */
export function foregroundConfidenceToMask(
  confidence: Float32Array,
  width: number,
  height: number,
  options: { readonly threshold?: number; readonly softness?: number } = {},
): ColorRangeMask {
  const pixels = assertDimensions(width, height);
  if (confidence.length !== pixels) {
    throw new RangeError("피사체 신뢰도 길이가 마스크 크기와 일치하지 않습니다.");
  }
  const threshold = clamp01(
    options.threshold ?? STUDIO_SELECTION_SUBJECT_THRESHOLD_DEFAULT,
    STUDIO_SELECTION_SUBJECT_THRESHOLD_DEFAULT,
  );
  const softness = clamp01(
    options.softness ?? STUDIO_SELECTION_SUBJECT_SOFTNESS_DEFAULT,
    STUDIO_SELECTION_SUBJECT_SOFTNESS_DEFAULT,
  );
  const lower = Math.max(0, threshold - softness / 2);
  const upper = Math.min(1, threshold + softness / 2);
  const span = Math.max(1e-6, upper - lower);
  const alpha = new Uint8ClampedArray(pixels);
  for (let index = 0; index < pixels; index += 1) {
    const value = confidence[index]!;
    if (!Number.isFinite(value) || value <= lower) continue;
    if (value >= upper) {
      alpha[index] = 255;
      continue;
    }
    const t = (value - lower) / span;
    const smooth = t * t * (3 - 2 * t);
    alpha[index] = Math.round(smooth * 255);
  }
  return { width, height, alpha };
}

/** Multiply two equal-sized masks, preserving source transparency in semantic selections. */
export function multiplySelectionSourceMasks(
  first: ColorRangeMask,
  second: ColorRangeMask,
): ColorRangeMask {
  if (
    first.width !== second.width
    || first.height !== second.height
    || first.alpha.length !== second.alpha.length
  ) {
    throw new RangeError("결합할 선택 소스 마스크 크기가 서로 다릅니다.");
  }
  const alpha = new Uint8ClampedArray(first.alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = Math.round(first.alpha[index]! * second.alpha[index]! / 255);
  }
  return { width: first.width, height: first.height, alpha };
}

export function selectionSourceMaskHasContent(mask: ColorRangeMask, threshold = 128): boolean {
  const admitted = Math.max(1, Math.min(255, Math.round(
    Number.isFinite(threshold) ? threshold : 128,
  )));
  return mask.alpha.some((value) => value >= admitted);
}

/**
 * Apply a generated mask with the same replace/add/subtract/intersect semantics as marquee,
 * lasso, magic-wand, and color-range tools. Replace preserves the artist's current feather
 * preference by default even though its geometric base starts empty.
 */
export function applySelectionSourceMask(
  selection: PixelSelection | null,
  mask: ColorRangeMask,
  operation: SelectionOperationMode,
  options: ApplySelectionSourceMaskOptions = {},
): PixelSelection | null {
  assertDimensions(mask.width, mask.height);
  if (mask.alpha.length !== mask.width * mask.height) {
    throw new RangeError("선택 소스 마스크 길이가 크기와 일치하지 않습니다.");
  }
  const displayMask = options.flipX || options.flipY
    ? flipColorRangeMask(mask, options.flipX === true, options.flipY === true)
    : mask;
  const base = selectionOperationBase(selection, operation);
  const result = applyColorRangeMaskToSelection(
    base,
    displayMask,
    selectionCombineModeForOperation(operation),
    {
      threshold: options.vectorThreshold,
      aspect: options.aspect,
    },
  );
  if (!result) return null;
  if ((options.preserveFeather ?? true) && operation === "replace" && selection) {
    return { ...result, featherPx: selection.featherPx };
  }
  return result;
}
