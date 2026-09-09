/**
 * Shared primitives for ToonStudio's generated 2D vector starter pack.
 * Every asset is composed from deterministic SVG paths and shapes with no external resources.
 */

import type { BgScene } from "./studio-bg-scenes";
import type { StudioElementItem } from "./studio-elements-catalog";

export const PACK_PREFIX = "gen2d-";
export const INK = "#182033";
export const PAPER = "#fffaf2";
export const SOFT_INK = "#46516a";
export const BLUE = "#5b8cff";
export const CYAN = "#5fd7e8";
export const PINK = "#f39ab7";
export const GOLD = "#f6c65b";
export const GREEN = "#70bd8c";
export const WOOD = "#9a6445";
export const SKIN = "#f5c9ad";

export function wrapSvg(
  width: number,
  height: number,
  body: string,
  defs = "",
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"><defs>${defs}</defs>${body}</svg>`;
}

export function generatedScene(
  id: string,
  label: string,
  genre: string,
  body: string,
  defs = "",
): BgScene {
  return {
    id: `${PACK_PREFIX}${id}`,
    label,
    genre,
    svg: wrapSvg(720, 1080, body, defs),
    width: 720,
    height: 1080,
  };
}

export function generatedElement(
  id: string,
  label: string,
  category: StudioElementItem["category"],
  keywords: readonly string[],
  width: number,
  height: number,
  body: string,
  defs = "",
): StudioElementItem {
  return {
    id: `${PACK_PREFIX}${id}`,
    label,
    category,
    keywords: Object.freeze([
      ...keywords,
      "AI 생성",
      "네이티브 벡터",
      "toonstudio generated",
    ]),
    width,
    height,
    svg: wrapSvg(width, height, body, defs),
  };
}

export function deterministicPoints(
  count: number,
  seed: number,
  width: number,
  height: number,
): readonly [number, number, number][] {
  let value = seed >>> 0;
  return Array.from({ length: count }, () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    const x = 0.08 + (value / 4294967296) * 0.84;
    value = (value * 1664525 + 1013904223) >>> 0;
    const y = 0.06 + (value / 4294967296) * 0.88;
    value = (value * 1664525 + 1013904223) >>> 0;
    const scale = 0.55 + (value / 4294967296) * 0.75;
    return [x * width, y * height, scale] as const;
  });
}

export function blossomCloud(
  seed: number,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  return deterministicPoints(34, seed, width, height)
    .map(([px, py, scale], index) => {
      const fill = index % 4 === 0 ? "#ffffff" : index % 3 === 0 ? "#ffd9e8" : "#f7aac6";
      const r = 8 * scale;
      return `<g transform="translate(${(x + px).toFixed(1)} ${(y + py).toFixed(1)}) rotate(${(index * 37) % 360})"><circle cx="0" cy="-${r.toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="${fill}"/><circle cx="${r.toFixed(1)}" cy="0" r="${(r * 0.62).toFixed(1)}" fill="${fill}"/><circle cx="0" cy="${r.toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="${fill}"/><circle cx="-${r.toFixed(1)}" cy="0" r="${(r * 0.62).toFixed(1)}" fill="${fill}"/><circle r="${(r * 0.42).toFixed(1)}" fill="${GOLD}"/></g>`;
    })
    .join("");
}

export function windowGrid(
  x: number,
  y: number,
  columns: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
  gap: number,
  litEvery = 3,
): string {
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const fill = index % litEvery === 0 ? "#ffd986" : "#86a7ca";
    return `<rect x="${x + column * (cellWidth + gap)}" y="${y + row * (cellHeight + gap)}" width="${cellWidth}" height="${cellHeight}" rx="2" fill="${fill}" opacity="${index % litEvery === 0 ? "0.95" : "0.55"}"/>`;
  }).join("");
}

export const GLOW_FILTER = `<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="10" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

export function furnitureShadow(cx: number, cy: number, rx: number, ry: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#243047" opacity="0.16"/>`;
}

export const PROP_DEFS = `<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ca8d5d"/><stop offset="0.55" stop-color="#9a6043"/><stop offset="1" stop-color="#684033"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dfe7ec"/><stop offset="0.5" stop-color="#8797a5"/><stop offset="1" stop-color="#465565"/></linearGradient>`;

export function characterBust(
  palette: {
    hair: string;
    hairDark: string;
    outfit: string;
    accent: string;
    eye: string;
  },
  variant: "boy" | "girl" | "mage" | "street" | "chibi" | "office",
): string {
  const isChibi = variant === "chibi";
  const headY = isChibi ? 148 : 138;
  const headRadiusX = isChibi ? 94 : 76;
  const headRadiusY = isChibi ? 96 : 88;
  const hairBack = variant === "girl"
    ? `<path d="M88 122 C82 28 274 18 278 126 L292 320 C238 354 122 354 70 320Z" fill="${palette.hairDark}"/>`
    : variant === "mage"
      ? `<path d="M72 134 C64 26 288 18 290 142 L310 340 C248 370 110 366 52 330Z" fill="${palette.hairDark}"/>`
      : `<path d="M82 132 C72 28 278 22 282 136 L270 266 H92Z" fill="${palette.hairDark}"/>`;
  const bangs = variant === "street"
    ? `<path d="M88 124 C100 34 260 26 276 112 C220 94 214 150 178 164 C150 146 130 110 88 124Z" fill="${palette.hair}"/>`
    : `<path d="M84 126 C92 40 270 32 278 124 C236 98 226 156 186 164 C156 148 136 106 84 126Z" fill="${palette.hair}"/>`;
  const accessory = variant === "mage"
    ? `<path d="M180 38 L212 82 L264 72 L238 118 L262 166 L208 154 L178 198 L166 146 L112 132 L160 106Z" fill="${palette.accent}" stroke="${INK}" stroke-width="7"/>`
    : variant === "girl"
      ? `<path d="M254 92 C306 58 320 136 264 146Z M254 92 C220 42 194 112 248 134Z" fill="${palette.accent}" stroke="${INK}" stroke-width="7"/>`
      : variant === "street"
        ? `<path d="M98 84 Q180 24 262 84 L248 108 Q180 68 112 108Z" fill="#20283a" stroke="${INK}" stroke-width="8"/>`
        : variant === "office"
          ? `<rect x="220" y="82" width="62" height="18" rx="9" fill="${palette.accent}"/>`
          : variant === "chibi"
            ? `<path d="M80 100 Q180 18 280 100" fill="none" stroke="${palette.accent}" stroke-width="20" stroke-linecap="round"/>`
            : "";
  const outfit = variant === "mage"
    ? `<path d="M66 480 C72 332 124 292 180 292 C236 292 288 332 294 480Z" fill="${palette.outfit}" stroke="${INK}" stroke-width="10"/><path d="M132 302 L180 380 L228 302" fill="${palette.accent}" stroke="${INK}" stroke-width="8"/><circle cx="180" cy="354" r="18" fill="#fff7c6" stroke="${INK}" stroke-width="7"/>`
    : variant === "office"
      ? `<path d="M58 480 C64 330 122 294 180 294 C238 294 296 330 302 480Z" fill="${palette.outfit}" stroke="${INK}" stroke-width="10"/><path d="M128 302 L180 390 L232 302" fill="${PAPER}" stroke="${INK}" stroke-width="8"/><path d="M180 338 L164 400 L180 438 L196 400Z" fill="${palette.accent}"/>`
      : `<path d="M58 480 C64 330 122 294 180 294 C238 294 296 330 302 480Z" fill="${palette.outfit}" stroke="${INK}" stroke-width="10"/><path d="M126 302 L180 366 L234 302" fill="${PAPER}" stroke="${INK}" stroke-width="8"/>`;
  return `${hairBack}${outfit}<ellipse cx="180" cy="${headY}" rx="${headRadiusX}" ry="${headRadiusY}" fill="${SKIN}" stroke="${INK}" stroke-width="9"/>${bangs}${accessory}<path d="M128 ${headY - 2} Q148 ${headY - 18} 164 ${headY - 2}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M196 ${headY - 2} Q214 ${headY - 18} 232 ${headY - 2}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><ellipse cx="148" cy="${headY + 12}" rx="8" ry="13" fill="${palette.eye}"/><ellipse cx="212" cy="${headY + 12}" rx="8" ry="13" fill="${palette.eye}"/><circle cx="151" cy="${headY + 8}" r="3" fill="#fff"/><circle cx="215" cy="${headY + 8}" r="3" fill="#fff"/><path d="M162 ${headY + 52} Q180 ${headY + 66} 198 ${headY + 52}" fill="none" stroke="#a4515a" stroke-width="6" stroke-linecap="round"/><ellipse cx="126" cy="${headY + 44}" rx="18" ry="8" fill="#ef9b9f" opacity="0.42"/><ellipse cx="234" cy="${headY + 44}" rx="18" ry="8" fill="#ef9b9f" opacity="0.42"/>`;
}
