/**
 * 색 변환: hex ↔ sRGB ↔ linear ↔ OKLab. 레시피 색은 소문자 `#rrggbb`로 고정한다.
 * OKLab 수식은 Björn Ottosson(2020, 공개 도메인/MIT) 참고.
 */
export type Rgb01 = readonly [number, number, number];
export type Rgb255 = readonly [number, number, number];
export type Oklab = readonly [number, number, number];

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}

/** `#rrggbb`(대소문자 무관) → [r,g,b] 0..255. 형식이 틀리면 null. */
export function parseHex(hex: string): Rgb255 | null {
  const normalized = hex.trim().toLowerCase();
  if (!HEX_COLOR_PATTERN.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function to255(c: number): number {
  return Math.min(255, Math.max(0, Math.round(c)));
}

/** [r,g,b] 0..255 → 소문자 `#rrggbb` */
export function formatHex(rgb: Rgb255): string {
  return `#${rgb.map((c) => to255(c).toString(16).padStart(2, "0")).join("")}`;
}

/** hex를 소문자 정규형으로. 형식이 틀리면 null. */
export function normalizeHex(hex: string): string | null {
  const parsed = parseHex(hex);
  return parsed ? formatHex(parsed) : null;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

/** hex → linear RGB 0..1. 형식이 틀리면 null. */
export function hexToLinearRgb(hex: string): Rgb01 | null {
  const parsed = parseHex(hex);
  if (!parsed) return null;
  return [srgbToLinear(parsed[0] / 255), srgbToLinear(parsed[1] / 255), srgbToLinear(parsed[2] / 255)];
}

export function linearRgbToHex(rgb: Rgb01): string {
  return formatHex([linearToSrgb(rgb[0]) * 255, linearToSrgb(rgb[1]) * 255, linearToSrgb(rgb[2]) * 255]);
}

export function hexToSrgb01(hex: string): Rgb01 | null {
  const parsed = parseHex(hex);
  if (!parsed) return null;
  return [parsed[0] / 255, parsed[1] / 255, parsed[2] / 255];
}

export function linearRgbToOklab(rgb: Rgb01): Oklab {
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinearRgb(lab: Oklab): Rgb01 {
  const [L, a, b] = lab;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklab(hex: string): Oklab | null {
  const linear = hexToLinearRgb(hex);
  return linear ? linearRgbToOklab(linear) : null;
}

/** OKLab → hex(sRGB 색역 밖은 채널 클램프) */
export function oklabToHex(lab: Oklab): string {
  return linearRgbToHex(oklabToLinearRgb(lab));
}

export function oklabDistance(a: Oklab, b: Oklab): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** 두 hex 색을 OKLab 공간에서 보간한다. 형식이 틀리면 null. */
export function mixHexOklab(a: string, b: string, t: number): string | null {
  const la = hexToOklab(a);
  const lb = hexToOklab(b);
  if (!la || !lb) return null;
  return oklabToHex([la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t]);
}

/** 상대 휘도(sRGB 0..255 입력, WCAG) */
export function relativeLuminance(rgb: Rgb255): number {
  const [r, g, b] = rgb;
  return 0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255);
}
