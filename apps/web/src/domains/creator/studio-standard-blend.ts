/**
 * Shared encoded-RGB blend core for adjustment layers and smart-filter entries.
 *
 * The filtered result is treated as the blend source and the pixels before that filter as the
 * backdrop. Non-separable modes follow CSS Compositing & Blending Level 1 (Lum/Sat/ClipColor).
 * Smart-filter strength remains a cross-fade between the pre-filter and filtered surfaces so
 * legacy opacity semantics and alpha-removing filters remain byte-compatible.
 */

import type { StudioImageDataLike } from "./studio-filters";

export const STUDIO_STANDARD_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "hard-light",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

export type StudioStandardBlendMode = (typeof STUDIO_STANDARD_BLEND_MODES)[number];

const STUDIO_STANDARD_BLEND_MODE_SET = new Set<string>(STUDIO_STANDARD_BLEND_MODES);

const BLEND_MODE_LABELS: Readonly<Record<StudioStandardBlendMode, string>> = Object.freeze({
  normal: "표준",
  multiply: "곱하기",
  screen: "스크린",
  overlay: "오버레이",
  "soft-light": "소프트 라이트",
  "hard-light": "하드 라이트",
  darken: "어둡게",
  lighten: "밝게",
  "color-dodge": "색상 닷지",
  "color-burn": "색상 번",
  difference: "차이",
  exclusion: "제외",
  hue: "색조",
  saturation: "채도",
  color: "색상",
  luminosity: "광도",
});

export function isStudioStandardBlendMode(value: unknown): value is StudioStandardBlendMode {
  return typeof value === "string" && STUDIO_STANDARD_BLEND_MODE_SET.has(value);
}

export function studioStandardBlendModeLabel(mode: StudioStandardBlendMode): string {
  return BLEND_MODE_LABELS[mode];
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, value));
}

function luminance(red: number, green: number, blue: number): number {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function saturation(red: number, green: number, blue: number): number {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

function clipColorInto(
  output: Float64Array,
  red: number,
  green: number,
  blue: number,
): void {
  const lightness = luminance(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const maximum = Math.max(red, green, blue);
  if (minimum < 0) {
    const divisor = lightness - minimum;
    if (divisor !== 0) {
      red = lightness + ((red - lightness) * lightness) / divisor;
      green = lightness + ((green - lightness) * lightness) / divisor;
      blue = lightness + ((blue - lightness) * lightness) / divisor;
    }
  }
  if (maximum > 255) {
    const divisor = maximum - lightness;
    if (divisor !== 0) {
      red = lightness + ((red - lightness) * (255 - lightness)) / divisor;
      green = lightness + ((green - lightness) * (255 - lightness)) / divisor;
      blue = lightness + ((blue - lightness) * (255 - lightness)) / divisor;
    }
  }
  output[0] = clampByte(red);
  output[1] = clampByte(green);
  output[2] = clampByte(blue);
}

function setLuminanceInto(
  output: Float64Array,
  red: number,
  green: number,
  blue: number,
  nextLuminance: number,
): void {
  const delta = nextLuminance - luminance(red, green, blue);
  clipColorInto(output, red + delta, green + delta, blue + delta);
}

function setSaturationInto(
  output: Float64Array,
  red: number,
  green: number,
  blue: number,
  nextSaturation: number,
): void {
  let minimumIndex: 0 | 1 | 2;
  let middleIndex: 0 | 1 | 2;
  let maximumIndex: 0 | 1 | 2;
  let minimum: number;
  let middle: number;
  let maximum: number;

  if (red <= green) {
    if (green <= blue) {
      minimumIndex = 0; middleIndex = 1; maximumIndex = 2;
      minimum = red; middle = green; maximum = blue;
    } else if (red <= blue) {
      minimumIndex = 0; middleIndex = 2; maximumIndex = 1;
      minimum = red; middle = blue; maximum = green;
    } else {
      minimumIndex = 2; middleIndex = 0; maximumIndex = 1;
      minimum = blue; middle = red; maximum = green;
    }
  } else if (red <= blue) {
    minimumIndex = 1; middleIndex = 0; maximumIndex = 2;
    minimum = green; middle = red; maximum = blue;
  } else if (green <= blue) {
    minimumIndex = 1; middleIndex = 2; maximumIndex = 0;
    minimum = green; middle = blue; maximum = red;
  } else {
    minimumIndex = 2; middleIndex = 1; maximumIndex = 0;
    minimum = blue; middle = green; maximum = red;
  }

  output[0] = 0;
  output[1] = 0;
  output[2] = 0;
  if (maximum > minimum) {
    output[middleIndex] = ((middle - minimum) * nextSaturation) / (maximum - minimum);
    output[maximumIndex] = nextSaturation;
  }
  output[minimumIndex] = 0;
}

type SeparableBlendMode = Exclude<
  StudioStandardBlendMode,
  "hue" | "saturation" | "color" | "luminosity"
>;

function blendChannel(mode: SeparableBlendMode, base: number, blend: number): number {
  switch (mode) {
    case "normal":
      return blend;
    case "multiply":
      return (base * blend) / 255;
    case "screen":
      return 255 - ((255 - base) * (255 - blend)) / 255;
    case "overlay":
      return base <= 127.5
        ? (2 * base * blend) / 255
        : 255 - (2 * (255 - base) * (255 - blend)) / 255;
    case "soft-light": {
      const source = blend / 255;
      const destination = base / 255;
      const value = source <= 0.5
        ? destination - (1 - 2 * source) * destination * (1 - destination)
        : destination + (2 * source - 1)
          * ((destination <= 0.25
            ? ((16 * destination - 12) * destination + 4) * destination
            : Math.sqrt(destination)) - destination);
      return value * 255;
    }
    case "hard-light":
      return blend <= 127.5
        ? (2 * base * blend) / 255
        : 255 - (2 * (255 - base) * (255 - blend)) / 255;
    case "darken":
      return Math.min(base, blend);
    case "lighten":
      return Math.max(base, blend);
    case "color-dodge":
      return blend >= 255 ? 255 : Math.min(255, (base * 255) / (255 - blend));
    case "color-burn":
      return blend <= 0 ? 0 : 255 - Math.min(255, ((255 - base) * 255) / blend);
    case "difference":
      return Math.abs(base - blend);
    case "exclusion":
      return base + blend - (2 * base * blend) / 255;
  }
}

export function blendStudioStandardRgbInto(
  output: Float64Array,
  scratch: Float64Array,
  mode: StudioStandardBlendMode,
  baseRed: number,
  baseGreen: number,
  baseBlue: number,
  blendRed: number,
  blendGreen: number,
  blendBlue: number,
): void {
  switch (mode) {
    case "hue":
      setSaturationInto(
        scratch,
        blendRed,
        blendGreen,
        blendBlue,
        saturation(baseRed, baseGreen, baseBlue),
      );
      setLuminanceInto(
        output,
        scratch[0]!,
        scratch[1]!,
        scratch[2]!,
        luminance(baseRed, baseGreen, baseBlue),
      );
      return;
    case "saturation":
      setSaturationInto(
        scratch,
        baseRed,
        baseGreen,
        baseBlue,
        saturation(blendRed, blendGreen, blendBlue),
      );
      setLuminanceInto(
        output,
        scratch[0]!,
        scratch[1]!,
        scratch[2]!,
        luminance(baseRed, baseGreen, baseBlue),
      );
      return;
    case "color":
      setLuminanceInto(
        output,
        blendRed,
        blendGreen,
        blendBlue,
        luminance(baseRed, baseGreen, baseBlue),
      );
      return;
    case "luminosity":
      setLuminanceInto(
        output,
        baseRed,
        baseGreen,
        baseBlue,
        luminance(blendRed, blendGreen, blendBlue),
      );
      return;
    default:
      output[0] = blendChannel(mode, baseRed, blendRed);
      output[1] = blendChannel(mode, baseGreen, blendGreen);
      output[2] = blendChannel(mode, baseBlue, blendBlue);
  }
}

export function blendStudioStandardRgb(
  mode: StudioStandardBlendMode,
  base: readonly [number, number, number],
  blend: readonly [number, number, number],
): [number, number, number] {
  const output = new Float64Array(3);
  blendStudioStandardRgbInto(
    output,
    new Float64Array(3),
    mode,
    base[0],
    base[1],
    base[2],
    blend[0],
    blend[1],
    blend[2],
  );
  return [output[0]!, output[1]!, output[2]!];
}

function assertMatchingSurfaces(
  base: StudioImageDataLike,
  filtered: StudioImageDataLike,
): void {
  const baseBytes = base.width * base.height * 4;
  const filteredBytes = filtered.width * filtered.height * 4;
  if (
    !Number.isSafeInteger(base.width)
    || !Number.isSafeInteger(base.height)
    || base.width <= 0
    || base.height <= 0
    || base.data.length !== baseBytes
    || filtered.width !== base.width
    || filtered.height !== base.height
    || filtered.data.length !== filteredBytes
  ) {
    throw new Error("스마트 필터 합성: 원본과 필터 결과의 RGBA 크기가 일치해야 합니다.");
  }
}

/**
 * Mutates `base` by cross-fading a complete filter result against the pixels before that filter.
 * This intentionally differs from layer source-over: strength 100% must reproduce the filtered
 * surface exactly, including alpha removed by Color to Alpha.
 */
export function compositeStudioFilterResult(
  base: StudioImageDataLike,
  filtered: StudioImageDataLike,
  opacity: number,
  mode: StudioStandardBlendMode = "normal",
): void {
  assertMatchingSurfaces(base, filtered);
  const strength = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
  if (strength <= 0) return;

  const baseData = base.data;
  const filteredData = filtered.data;
  const blended = new Float64Array(3);
  const scratch = new Float64Array(3);

  for (let index = 0; index < baseData.length; index += 4) {
    const baseRed = baseData[index]!;
    const baseGreen = baseData[index + 1]!;
    const baseBlue = baseData[index + 2]!;
    const filteredRed = filteredData[index]!;
    const filteredGreen = filteredData[index + 1]!;
    const filteredBlue = filteredData[index + 2]!;

    if (mode === "normal") {
      blended[0] = filteredRed;
      blended[1] = filteredGreen;
      blended[2] = filteredBlue;
    } else {
      blendStudioStandardRgbInto(
        blended,
        scratch,
        mode,
        baseRed,
        baseGreen,
        baseBlue,
        filteredRed,
        filteredGreen,
        filteredBlue,
      );
    }

    const originalWeight = baseData[index + 3]! * (1 - strength);
    const filteredWeight = filteredData[index + 3]! * strength;
    const alpha = originalWeight + filteredWeight;
    baseData[index] = alpha > 0
      ? (baseRed * originalWeight + blended[0]! * filteredWeight) / alpha
      : 0;
    baseData[index + 1] = alpha > 0
      ? (baseGreen * originalWeight + blended[1]! * filteredWeight) / alpha
      : 0;
    baseData[index + 2] = alpha > 0
      ? (baseBlue * originalWeight + blended[2]! * filteredWeight) / alpha
      : 0;
    baseData[index + 3] = alpha;
  }
}
