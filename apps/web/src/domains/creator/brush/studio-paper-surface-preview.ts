/**
 * Perf-safe paper surface presentation helpers.
 *
 * Generates a seamless tile (default 128²) from the same height field used for brush
 * granulation, then caches pattern canvases so the stage can fillPattern-repeat without
 * regenerating megapixel textures every frame.
 */

import { computeStudioImpastoReliefShading } from "../studio-impasto-relief-shading-v1";

import {
  DEFAULT_STUDIO_PAPER_SURFACE,
  normalizeStudioPaperSurfaceSettings,
  type StudioPaperSurfaceSettings,
} from "./studio-paper-granulation-runtime";
import {
  getStudioPaperSurfaceCatalogEntry,
  type StudioPaperSurfaceCatalogEntry,
} from "./studio-paper-surface-catalog";
import {
  createPaperHeightField,
  PAPER_REFERENCE_TILE,
  STUDIO_PAPER_HEIGHT_CONTRAST_SHAPED_V2,
  type PaperGrainKind,
} from "./studio-paper-texture";

export interface StudioPaperSurfacePreviewOptions {
  readonly size?: number;
  /** 0..1 visual grain strength on the backdrop (default 0.52). */
  readonly grainStrength?: number;
  /** Optional multiplier tint. Neutral white is default so page colour is never applied twice. */
  readonly tintHex?: string;
  /** Multiplies relief contrast 0..1 (Konva fill opacity is separate). */
  readonly grainOpacity?: number;
}

interface CacheEntry {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
}

const MAX_CACHE = 12;
const cache = new Map<string, CacheEntry>();

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.trim().replace(/^#/, "");
  if (raw.length === 3) {
    const r = Number.parseInt(raw[0]! + raw[0]!, 16);
    const g = Number.parseInt(raw[1]! + raw[1]!, 16);
    const b = Number.parseInt(raw[2]! + raw[2]!, 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
  }
  if (raw.length >= 6) {
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
  }
  return { r: 244, g: 239, b: 230 };
}

function cacheKey(
  surface: StudioPaperSurfaceSettings,
  size: number,
  grainStrength: number,
  tintHex: string,
  grainOpacity: number,
): string {
  return [
    surface.kind,
    surface.seed,
    size,
    grainStrength.toFixed(3),
    tintHex,
    grainOpacity.toFixed(3),
  ].join("|");
}

function touch(entry: CacheEntry): HTMLCanvasElement {
  cache.delete(entry.key);
  cache.set(entry.key, entry);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return entry.canvas;
}

/**
 * Build (or reuse) a seamless paper tile canvas for Konva fillPatternImage.
 * Works in browser; returns null when document/canvas is unavailable (SSR/tests without DOM).
 */
export function getStudioPaperSurfacePreviewTile(
  surfaceInput?: unknown,
  options: StudioPaperSurfacePreviewOptions = {},
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const surface = normalizeStudioPaperSurfaceSettings(surfaceInput ?? DEFAULT_STUDIO_PAPER_SURFACE);
  const size = Math.max(
    32,
    Math.min(256, Math.round(options.size ?? PAPER_REFERENCE_TILE)),
  );
  const grainStrength = clamp01(options.grainStrength ?? 0.52, 0.52);
  const tintHex = options.tintHex ?? "#ffffff";
  const grainOpacity = clamp01(options.grainOpacity ?? 1, 1);
  const key = cacheKey(surface, size, grainStrength, tintHex, grainOpacity);
  const hit = cache.get(key);
  if (hit) return touch(hit);

  const field = createPaperHeightField({
    kind: surface.kind,
    seed: surface.seed,
    width: size,
    height: size,
    contrast: STUDIO_PAPER_HEIGHT_CONTRAST_SHAPED_V2,
  });
  const { r, g, b } = parseHexRgb(tintHex);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  // Combine height, wrapped slope and micro-curvature. Height alone reads like cloudy noise;
  // directional slope/curvature makes fibres and tooth catch a virtual raking light while keeping
  // the tile seamless (all neighbour reads wrap at the boundary). Shaped-v2 preserves each paper's
  // declared amplitude, so smooth sheets stay restrained and rough sheets remain materially rough.
  const sample = (x: number, y: number): number => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    return field.values[yy * size + xx]!;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = sample(x, y);
      const left = sample(x - 1, y);
      const right = sample(x + 1, y);
      const up = sample(x, y - 1);
      const down = sample(x, y + 1);
      const relief = Math.min(1, Math.max(-1, (h - 0.5) * 4.4));
      const slope = Math.min(1, Math.max(-1, ((left - right) * 0.72 + (up - down) * 0.48) * 8));
      const curvature = Math.min(1, Math.max(-1, (h * 4 - left - right - up - down) * 10));
      const tooth = Math.min(1, Math.max(-1, relief * 0.5 + slope * 0.35 + curvature * 0.15));
      const lit = 1 + tooth * grainStrength * grainOpacity * 0.72;
      const o = (y * size + x) * 4;
      data[o] = Math.round(Math.min(255, Math.max(0, r * lit)));
      data[o + 1] = Math.round(Math.min(255, Math.max(0, g * lit)));
      data[o + 2] = Math.round(Math.min(255, Math.max(0, b * lit)));
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const stored: CacheEntry = { key, canvas, width: size, height: size };
  cache.set(key, stored);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return canvas;
}

/**
 * Paint a signed substrate relief field ([-1,1], row-major) into a pattern canvas.
 *
 * This is the high-fidelity sibling of `getStudioPaperSurfacePreviewTile`. The synchronous
 * fallback already uses shaped-v2 height plus wrapped slope/curvature so it remains materially
 * readable without a worker. The substrate path goes further: it receives a signed field baked
 * by the procedural surface provider and runs the shared relief BRDF for raking-light shading.
 *
 * The caller owns the field; nothing here mutates it. Returns null without a DOM.
 */
export interface StudioPaperSubstrateTilePaintOptions
  extends StudioPaperSurfacePreviewOptions {
  /**
   * Halo width baked around the core tile. Relief shading clamps at buffer edges, which would
   * print a seam grid on a repeating pattern; sampling a halo and cropping it away keeps the
   * shaded tile exactly as seamless as the field it came from.
   */
  readonly halo?: number;
  /**
   * `"lit"` runs the production impasto relief BRDF over the sheet so the tooth catches a raking
   * light — this is what makes paper read as paper rather than as grey noise. `"flat"` keeps the
   * plain signed-relief multiply.
   */
  readonly relief?: "flat" | "lit";
}

export function paintStudioPaperSubstrateTileCanvas(
  heightField: Float32Array,
  size: number,
  options: StudioPaperSubstrateTilePaintOptions = {},
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const halo = Math.max(0, Math.min(8, Math.round(options.halo ?? 0)));
  const fieldWidth = size + halo * 2;
  if (
    !Number.isInteger(size)
    || size < 8
    || heightField.length !== fieldWidth * fieldWidth
  ) return null;
  const grainStrength = clamp01(options.grainStrength ?? 0.52, 0.52);
  const grainOpacity = clamp01(options.grainOpacity ?? 1, 1);
  const { r, g, b } = parseHexRgb(options.tintHex ?? "#ffffff");
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  // The BRDF returns a multiplier around 1; a flat sheet maps to exactly 1 everywhere.
  const shading = options.relief === "lit"
    ? computeStudioImpastoReliefShading(heightField, {
        width: fieldWidth,
        height: fieldWidth,
        normalScale: 3.1,
        roughness: 0.5,
        specularScale: 0.2,
        diffuseScale: 0.44,
        maxShadingMultiplier: 1.9,
      })
    : null;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const source = (y + halo) * fieldWidth + (x + halo);
      const relief = Math.min(1, Math.max(-1, heightField[source]!));
      const base = shading
        ? (shading[source]! - 1) * 1.5 + relief * 0.38
        : relief;
      const lit = 1 + Math.min(1, Math.max(-1, base)) * grainStrength * grainOpacity;
      const o = (y * size + x) * 4;
      data[o] = Math.round(Math.min(255, Math.max(0, r * lit)));
      data[o + 1] = Math.round(Math.min(255, Math.max(0, g * lit)));
      data[o + 2] = Math.round(Math.min(255, Math.max(0, b * lit)));
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Deterministic backdrop opacity — rougher papers show a bit more tooth, never overpower strokes. */
export function studioPaperSurfacePreviewOpacity(kind: PaperGrainKind | unknown): number {
  const entry = getStudioPaperSurfaceCatalogEntry(kind);
  return Math.min(0.78, Math.max(0.36, 0.34 + entry.tooth * 0.46));
}

export function resolveStudioPaperSurfaceTint(
  surfaceInput?: unknown,
  preferCatalogSwatch = true,
): string {
  const surface = normalizeStudioPaperSurfaceSettings(surfaceInput ?? DEFAULT_STUDIO_PAPER_SURFACE);
  if (!preferCatalogSwatch) return "#ffffff";
  return getStudioPaperSurfaceCatalogEntry(surface.kind).swatch;
}

export function clearStudioPaperSurfacePreviewCache(): void {
  cache.clear();
}

export function studioPaperSurfacePreviewCacheStats(): { entries: number } {
  return { entries: cache.size };
}

/** Plan an optional page bg tint when the user opts into "tint background with paper". */
export function planStudioPaperTintBackgroundApply(
  kind: PaperGrainKind,
  options?: { readonly previousBg?: string },
): { readonly bg: string; readonly catalog: StudioPaperSurfaceCatalogEntry } {
  const catalog = getStudioPaperSurfaceCatalogEntry(kind);
  return {
    bg: catalog.swatch,
    catalog,
    ...(options?.previousBg ? { previousBg: options.previousBg } : {}),
  } as { readonly bg: string; readonly catalog: StudioPaperSurfaceCatalogEntry };
}
