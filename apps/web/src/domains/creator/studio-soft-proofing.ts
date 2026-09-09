import { studioDeterministicContentId } from "./studio-deterministic-serialization";

export type StudioColorProfileId = "srgb" | "display-p3" | "adobe-rgb-1998";
export type StudioProofIntent = "relative-colorimetric" | "perceptual";
export type StudioHdrToneMap = "clip" | "reinhard" | "aces";

export interface StudioRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface StudioHsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

export interface StudioCmyk {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
}

export interface StudioColorProfile {
  readonly id: StudioColorProfileId;
  readonly label: string;
  readonly gamma: number;
  readonly rgbToXyz: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
  readonly xyzToRgb: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
}

export const STUDIO_COLOR_PROFILES: Readonly<Record<StudioColorProfileId, StudioColorProfile>> =
  Object.freeze({
    srgb: Object.freeze({
      id: "srgb",
      label: "sRGB IEC61966-2.1",
      gamma: 2.4,
      rgbToXyz: Object.freeze([
        0.4124564, 0.3575761, 0.1804375,
        0.2126729, 0.7151522, 0.072175,
        0.0193339, 0.119192, 0.9503041,
      ]),
      xyzToRgb: Object.freeze([
        3.2404542, -1.5371385, -0.4985314,
        -0.969266, 1.8760108, 0.041556,
        0.0556434, -0.2040259, 1.0572252,
      ]),
    }),
    "display-p3": Object.freeze({
      id: "display-p3",
      label: "Display P3",
      gamma: 2.4,
      rgbToXyz: Object.freeze([
        0.4865709, 0.2656677, 0.1982173,
        0.2289746, 0.6917385, 0.0792869,
        0, 0.0451134, 1.0439444,
      ]),
      xyzToRgb: Object.freeze([
        2.4934969, -0.9313836, -0.4027108,
        -0.829489, 1.762664, 0.0236247,
        0.0358458, -0.0761724, 0.9568845,
      ]),
    }),
    "adobe-rgb-1998": Object.freeze({
      id: "adobe-rgb-1998",
      label: "Adobe RGB (1998)",
      gamma: 2.19921875,
      rgbToXyz: Object.freeze([
        0.5767309, 0.185554, 0.1881852,
        0.2973769, 0.6273491, 0.0752741,
        0.0270343, 0.0706872, 0.9911085,
      ]),
      xyzToRgb: Object.freeze([
        2.041369, -0.5649464, -0.3446944,
        -0.969266, 1.8760108, 0.041556,
        0.0134474, -0.1183897, 1.0154096,
      ]),
    }),
  });

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertRgb(rgb: StudioRgb): void {
  for (const value of [rgb.r, rgb.g, rgb.b]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("RGB components must be 0-1.");
  }
}

function decodeChannel(value: number, profile: StudioColorProfile): number {
  if (profile.id === "srgb" || profile.id === "display-p3") {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }
  return Math.pow(value, profile.gamma);
}

function encodeChannel(value: number, profile: StudioColorProfile): number {
  if (profile.id === "srgb" || profile.id === "display-p3") {
    return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(Math.max(0, value), 1 / 2.4) - 0.055;
  }
  return Math.pow(Math.max(0, value), 1 / profile.gamma);
}

function multiply3(matrix: StudioColorProfile["rgbToXyz"], vector: readonly [number, number, number]): readonly [number, number, number] {
  return Object.freeze([
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ]);
}

export interface StudioProfileConversionResult {
  readonly rgb: StudioRgb;
  readonly unclampedRgb: StudioRgb;
  readonly outOfGamut: boolean;
}

export function convertStudioRgbProfile(
  rgb: StudioRgb,
  sourceProfileId: StudioColorProfileId,
  targetProfileId: StudioColorProfileId,
  intent: StudioProofIntent = "relative-colorimetric",
): StudioProfileConversionResult {
  assertRgb(rgb);
  const source = STUDIO_COLOR_PROFILES[sourceProfileId];
  const target = STUDIO_COLOR_PROFILES[targetProfileId];
  const sourceLinear: readonly [number, number, number] = Object.freeze([
    decodeChannel(rgb.r, source),
    decodeChannel(rgb.g, source),
    decodeChannel(rgb.b, source),
  ]);
  const xyz = multiply3(source.rgbToXyz, sourceLinear);
  const targetLinear = multiply3(target.xyzToRgb, xyz);
  const encoded = {
    r: encodeChannel(targetLinear[0], target),
    g: encodeChannel(targetLinear[1], target),
    b: encodeChannel(targetLinear[2], target),
  };
  const outOfGamut = Object.values(encoded).some((value) => value < 0 || value > 1);
  const compressed = intent === "perceptual" && outOfGamut
    ? perceptualCompress(encoded)
    : { r: clamp01(encoded.r), g: clamp01(encoded.g), b: clamp01(encoded.b) };
  return Object.freeze({
    rgb: Object.freeze(compressed),
    unclampedRgb: Object.freeze(encoded),
    outOfGamut,
  });
}

function perceptualCompress(rgb: StudioRgb): StudioRgb {
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  if (min >= 0 && max <= 1) return rgb;
  const span = Math.max(1e-9, max - min);
  return Object.freeze({
    r: clamp01((rgb.r - min) / span),
    g: clamp01((rgb.g - min) / span),
    b: clamp01((rgb.b - min) / span),
  });
}

export function studioRgbToHsl(rgb: StudioRgb): StudioHsl {
  assertRgb(rgb);
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (delta > 0) {
    if (max === rgb.r) h = 60 * (((rgb.g - rgb.b) / delta) % 6);
    else if (max === rgb.g) h = 60 * ((rgb.b - rgb.r) / delta + 2);
    else h = 60 * ((rgb.r - rgb.g) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return Object.freeze({ h, s, l });
}

export function studioHslToRgb(hsl: StudioHsl): StudioRgb {
  if (![hsl.h, hsl.s, hsl.l].every(Number.isFinite) || hsl.s < 0 || hsl.s > 1 || hsl.l < 0 || hsl.l > 1) {
    throw new RangeError("HSL components are invalid.");
  }
  const hue = ((hsl.h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * hsl.l - 1)) * hsl.s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = hsl.l - chroma / 2;
  const [r, g, b] =
    hue < 60 ? [chroma, x, 0]
      : hue < 120 ? [x, chroma, 0]
        : hue < 180 ? [0, chroma, x]
          : hue < 240 ? [0, x, chroma]
            : hue < 300 ? [x, 0, chroma]
              : [chroma, 0, x];
  return Object.freeze({ r: r + m, g: g + m, b: b + m });
}

export function studioRgbToCmyk(rgb: StudioRgb): StudioCmyk {
  assertRgb(rgb);
  const k = 1 - Math.max(rgb.r, rgb.g, rgb.b);
  if (k >= 1 - 1e-9) return Object.freeze({ c: 0, m: 0, y: 0, k: 1 });
  return Object.freeze({
    c: (1 - rgb.r - k) / (1 - k),
    m: (1 - rgb.g - k) / (1 - k),
    y: (1 - rgb.b - k) / (1 - k),
    k,
  });
}

export function studioCmykToRgb(cmyk: StudioCmyk): StudioRgb {
  for (const value of [cmyk.c, cmyk.m, cmyk.y, cmyk.k]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("CMYK components must be 0-1.");
  }
  return Object.freeze({
    r: (1 - cmyk.c) * (1 - cmyk.k),
    g: (1 - cmyk.m) * (1 - cmyk.k),
    b: (1 - cmyk.y) * (1 - cmyk.k),
  });
}

export function toneMapStudioHdr(value: number, mode: StudioHdrToneMap): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("HDR channel must be finite and non-negative.");
  if (mode === "clip") return clamp01(value);
  if (mode === "reinhard") return value / (1 + value);
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return clamp01((value * (a * value + b)) / (value * (c * value + d) + e));
}

export interface StudioSoftProofConfig {
  readonly sourceProfile: StudioColorProfileId;
  readonly targetProfile: StudioColorProfileId;
  readonly intent: StudioProofIntent;
  readonly showGamutWarning: boolean;
  readonly gamutWarningRgb: StudioRgb;
  readonly hdrToneMap: StudioHdrToneMap;
}

export interface StudioSoftProofReceipt {
  readonly pixels: Uint8ClampedArray;
  readonly gamutWarningPixels: number;
  readonly configHash: string;
}

export function applyStudioSoftProof(
  rgba: Uint8ClampedArray,
  config: StudioSoftProofConfig,
): StudioSoftProofReceipt {
  if (rgba.length % 4 !== 0) throw new RangeError("soft-proof input must be RGBA.");
  assertRgb(config.gamutWarningRgb);
  const output = new Uint8ClampedArray(rgba.length);
  let gamutWarningPixels = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3] ?? 0;
    if (alpha === 0) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 0;
      continue;
    }
    const sourceRgb = {
      r: (rgba[index] ?? 0) / 255,
      g: (rgba[index + 1] ?? 0) / 255,
      b: (rgba[index + 2] ?? 0) / 255,
    };
    const converted = convertStudioRgbProfile(
      sourceRgb,
      config.sourceProfile,
      config.targetProfile,
      config.intent,
    );
    const display = config.showGamutWarning && converted.outOfGamut
      ? config.gamutWarningRgb
      : converted.rgb;
    if (config.showGamutWarning && converted.outOfGamut) gamutWarningPixels += 1;
    output[index] = Math.round(toneMapStudioHdr(display.r, config.hdrToneMap) * 255);
    output[index + 1] = Math.round(toneMapStudioHdr(display.g, config.hdrToneMap) * 255);
    output[index + 2] = Math.round(toneMapStudioHdr(display.b, config.hdrToneMap) * 255);
    output[index + 3] = alpha;
  }
  return Object.freeze({
    pixels: output,
    gamutWarningPixels,
    configHash: studioDeterministicContentId(config),
  });
}

export type StudioPaletteHarmony = "complementary" | "analogous" | "triadic" | "split-complementary";

export function generateStudioPaletteHarmony(base: StudioRgb, harmony: StudioPaletteHarmony): readonly StudioRgb[] {
  const hsl = studioRgbToHsl(base);
  const offsets = harmony === "complementary" ? [0, 180]
    : harmony === "analogous" ? [-30, 0, 30]
      : harmony === "triadic" ? [0, 120, 240]
        : [0, 150, 210];
  return Object.freeze(offsets.map((offset) => studioHslToRgb({ ...hsl, h: hsl.h + offset })));
}

export interface StudioRecentColorEntry {
  readonly hex: string;
  readonly usedAtMs: number;
  readonly profile: StudioColorProfileId;
}

export function mergeStudioRecentColors(
  current: readonly StudioRecentColorEntry[],
  incoming: readonly StudioRecentColorEntry[],
  limit = 32,
): readonly StudioRecentColorEntry[] {
  const byKey = new Map<string, StudioRecentColorEntry>();
  for (const entry of [...current, ...incoming]) {
    const hex = entry.hex.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/u.test(hex) || !Number.isSafeInteger(entry.usedAtMs) || entry.usedAtMs < 0) continue;
    const key = `${entry.profile}:${hex}`;
    const previous = byKey.get(key);
    if (!previous || entry.usedAtMs > previous.usedAtMs) byKey.set(key, Object.freeze({ ...entry, hex }));
  }
  return Object.freeze([...byKey.values()].sort((a, b) => b.usedAtMs - a.usedAtMs).slice(0, Math.max(1, limit)));
}
