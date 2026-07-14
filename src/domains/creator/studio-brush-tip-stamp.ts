/**
 * PNG-alpha tip stamp engine for Studio dynamic brushes.
 *
 * Pure, DOM-free: tip alpha maps are square 0..1 grids (procedural built-ins or compact
 * base64 custom maps). Stamp footprints honor dab size / angle / roundness and are fully
 * deterministic for the same tip settings, so canvas, SVG and tests share one plan.
 */

import type { StudioDynamicBrushDab } from "./studio-brush-dynamics";

export const STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE_RANGE = { min: 8, max: 64 } as const;
export const DEFAULT_STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE = 24;
export const STUDIO_BRUSH_TIP_STAMP_GRID_RANGE = { min: 3, max: 17 } as const;
export const DEFAULT_STUDIO_BRUSH_TIP_STAMP_GRID = 9;

export const STUDIO_BRUSH_TIP_SHAPE_IDS = [
  "round",
  "soft",
  "hard",
  "flake",
  "grain",
  "star",
] as const;

export type StudioBrushTipShapeId = (typeof STUDIO_BRUSH_TIP_SHAPE_IDS)[number];

export interface StudioBrushTipSettings {
  shape?: StudioBrushTipShapeId;
  /** Edge falloff for procedural tips (0 = sharpest for shape, 1 = softest). */
  softness?: number;
  /**
   * Optional custom alpha channel: base64 of N×N bytes (0..255). When present and valid,
   * overrides the procedural shape — this is the in-document PNG-alpha tip payload.
   */
  alphaMapBase64?: string | null;
  alphaMapSize?: number;
}

export interface NormalizedStudioBrushTipSettings {
  shape: StudioBrushTipShapeId;
  softness: number;
  alphaMapBase64: string | null;
  alphaMapSize: number;
}

export interface StudioBrushTipAlphaMap {
  size: number;
  /** Row-major alpha samples in 0..1. Length is always size*size. */
  alphas: Float32Array;
  shape: StudioBrushTipShapeId;
  softness: number;
  custom: boolean;
}

export interface StudioBrushTipStampSample {
  /** Offset from dab centre after angle/roundness transform, in document px. */
  dx: number;
  dy: number;
  alpha: number;
  /** Local stamp radius for this sample (document px). */
  radius: number;
}

export interface StudioBrushTipStampPlan {
  samples: StudioBrushTipStampSample[];
  tip: NormalizedStudioBrushTipSettings;
  mapSize: number;
  grid: number;
}

const DEFAULT_TIP: NormalizedStudioBrushTipSettings = {
  shape: "round",
  softness: 0.35,
  alphaMapBase64: null,
  alphaMapSize: DEFAULT_STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE,
};

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isStudioBrushTipShapeId(value: unknown): value is StudioBrushTipShapeId {
  return typeof value === "string"
    && (STUDIO_BRUSH_TIP_SHAPE_IDS as readonly string[]).includes(value);
}

/** Encode raw alpha bytes (0..255) into a URL-safe-enough standard base64 payload. */
export function encodeStudioBrushTipAlphaMapBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = index + 1 < bytes.length ? bytes[index + 1]! : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += BASE64_ALPHABET[(triple >> 18) & 63];
    output += BASE64_ALPHABET[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : "=";
  }
  return output;
}

/** Decode standard base64 (with or without padding) into raw bytes. Invalid input returns null. */
export function decodeStudioBrushTipAlphaMapBase64(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const cleaned = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(cleaned) || cleaned.length % 4 !== 0) return null;
  const output = new Uint8Array((cleaned.length / 4) * 3);
  let write = 0;
  for (let index = 0; index < cleaned.length; index += 4) {
    const c0 = BASE64_ALPHABET.indexOf(cleaned[index]!);
    const c1 = BASE64_ALPHABET.indexOf(cleaned[index + 1]!);
    const c2 = cleaned[index + 2] === "=" ? -1 : BASE64_ALPHABET.indexOf(cleaned[index + 2]!);
    const c3 = cleaned[index + 3] === "=" ? -1 : BASE64_ALPHABET.indexOf(cleaned[index + 3]!);
    if (c0 < 0 || c1 < 0 || (cleaned[index + 2] !== "=" && c2 < 0) || (cleaned[index + 3] !== "=" && c3 < 0)) {
      return null;
    }
    const triple = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    output[write++] = (triple >> 16) & 255;
    if (c2 >= 0) output[write++] = (triple >> 8) & 255;
    if (c3 >= 0) output[write++] = triple & 255;
  }
  return output.subarray(0, write);
}

export function normalizeStudioBrushTipSettings(value?: unknown): NormalizedStudioBrushTipSettings {
  const source = asRecord(value) ?? {};
  const shape = isStudioBrushTipShapeId(source.shape) ? source.shape : DEFAULT_TIP.shape;
  const softness = clamp01(finiteNumber(source.softness, DEFAULT_TIP.softness));
  const alphaMapSize = Math.trunc(clamp(
    finiteNumber(source.alphaMapSize, DEFAULT_TIP.alphaMapSize),
    STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE_RANGE.min,
    STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE_RANGE.max
  ));
  let alphaMapBase64: string | null = null;
  if (typeof source.alphaMapBase64 === "string" && source.alphaMapBase64.length > 0) {
    const decoded = decodeStudioBrushTipAlphaMapBase64(source.alphaMapBase64);
    const expected = alphaMapSize * alphaMapSize;
    if (decoded && decoded.length === expected) {
      alphaMapBase64 = encodeStudioBrushTipAlphaMapBase64(decoded);
    }
  } else if (source.alphaMapBase64 === null) {
    alphaMapBase64 = null;
  }
  return { shape, softness, alphaMapBase64, alphaMapSize };
}

function hashUnit(x: number, y: number, salt: number): number {
  let value = Math.imul(Math.floor(x * 4096) ^ salt, 0x9e37_79b1) >>> 0;
  value ^= Math.imul(Math.floor(y * 4096) + 1, 0x85eb_ca6b) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d);
  value ^= value >>> 15;
  return (value >>> 0) / 0x1_0000_0000;
}

/**
 * Sample a procedural tip alpha at normalized coordinates in [-1, 1] × [-1, 1].
 * Outside the unit disk (or star arms) returns 0 — same contract as a PNG alpha channel.
 */
export function sampleStudioBrushTipProceduralAlpha(
  shape: StudioBrushTipShapeId,
  nx: number,
  ny: number,
  softness: number
): number {
  const soft = clamp01(softness);
  const radius = Math.hypot(nx, ny);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return 0;

  switch (shape) {
    case "round": {
      if (radius >= 1) return 0;
      const edge = 1 - radius;
      const falloff = Math.pow(edge, 0.35 + soft * 1.8);
      return clamp01(falloff);
    }
    case "soft": {
      if (radius >= 1) return 0;
      const core = Math.pow(1 - radius, 1.4 + soft * 2.2);
      return clamp01(core * (0.55 + (1 - soft) * 0.45));
    }
    case "hard": {
      if (radius >= 1) return 0;
      const edgeWidth = 0.04 + soft * 0.28;
      if (radius <= 1 - edgeWidth) return 1;
      return clamp01((1 - radius) / edgeWidth);
    }
    case "flake": {
      if (radius >= 1) return 0;
      const angle = Math.atan2(ny, nx);
      const ridges = 0.55 + 0.45 * Math.cos(angle * 3 + radius * 4);
      const body = Math.pow(1 - radius, 0.55 + soft);
      return clamp01(body * ridges);
    }
    case "grain": {
      if (radius >= 1) return 0;
      const grain = 0.35 + 0.65 * hashUnit(nx, ny, 0x51e0_03ab);
      const body = Math.pow(1 - radius, 0.7 + soft * 1.2);
      return clamp01(body * grain);
    }
    case "star": {
      const angle = Math.atan2(ny, nx);
      const points = 5;
      const starRadius = 0.45 + 0.55 * Math.abs(Math.cos(angle * points / 2));
      const limit = starRadius * (0.92 + soft * 0.08);
      if (radius >= limit) return 0;
      const edge = 1 - radius / limit;
      return clamp01(Math.pow(edge, 0.5 + soft));
    }
    default:
      return 0;
  }
}

function buildProceduralAlphaMap(
  shape: StudioBrushTipShapeId,
  softness: number,
  size: number
): Float32Array {
  const alphas = new Float32Array(size * size);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = centre === 0 ? 0 : (x - centre) / centre;
      const ny = centre === 0 ? 0 : (y - centre) / centre;
      alphas[y * size + x] = sampleStudioBrushTipProceduralAlpha(shape, nx, ny, softness);
    }
  }
  return alphas;
}

function buildCustomAlphaMap(base64: string, size: number): Float32Array | null {
  const bytes = decodeStudioBrushTipAlphaMapBase64(base64);
  if (!bytes || bytes.length !== size * size) return null;
  const alphas = new Float32Array(size * size);
  for (let index = 0; index < bytes.length; index++) {
    alphas[index] = bytes[index]! / 255;
  }
  return alphas;
}

/** Build a reusable tip alpha map (procedural or custom PNG-alpha payload). */
export function buildStudioBrushTipAlphaMap(value?: unknown): StudioBrushTipAlphaMap {
  const tip = normalizeStudioBrushTipSettings(value);
  if (tip.alphaMapBase64) {
    const custom = buildCustomAlphaMap(tip.alphaMapBase64, tip.alphaMapSize);
    if (custom) {
      return {
        size: tip.alphaMapSize,
        alphas: custom,
        shape: tip.shape,
        softness: tip.softness,
        custom: true,
      };
    }
  }
  return {
    size: tip.alphaMapSize,
    alphas: buildProceduralAlphaMap(tip.shape, tip.softness, tip.alphaMapSize),
    shape: tip.shape,
    softness: tip.softness,
    custom: false,
  };
}

/** Sample map alpha at continuous pixel coords with bilinear filtering. */
export function sampleStudioBrushTipAlphaMap(
  map: StudioBrushTipAlphaMap,
  px: number,
  py: number
): number {
  const max = map.size - 1;
  if (map.size <= 0) return 0;
  const x = clamp(px, 0, max);
  const y = clamp(py, 0, max);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(max, x0 + 1);
  const y1 = Math.min(max, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a00 = map.alphas[y0 * map.size + x0] ?? 0;
  const a10 = map.alphas[y0 * map.size + x1] ?? 0;
  const a01 = map.alphas[y1 * map.size + x0] ?? 0;
  const a11 = map.alphas[y1 * map.size + x1] ?? 0;
  const top = a00 + (a10 - a00) * tx;
  const bottom = a01 + (a11 - a01) * tx;
  return clamp01(top + (bottom - top) * ty);
}

/**
 * Convert a planned dab into stamp samples that honor tip alpha, size, angle and roundness.
 * Spacing/scatter are already baked into dab.x/y by the dynamics planner.
 */
export function planStudioBrushTipStamp(
  dab: Pick<StudioDynamicBrushDab, "x" | "y" | "size" | "angle" | "roundness" | "opacity" | "flow">,
  tipSettings?: unknown,
  options?: { grid?: number; alphaMap?: StudioBrushTipAlphaMap | null }
): StudioBrushTipStampPlan {
  const tip = normalizeStudioBrushTipSettings(tipSettings);
  const map = options?.alphaMap ?? buildStudioBrushTipAlphaMap(tip);
  const grid = Math.trunc(clamp(
    finiteNumber(options?.grid, DEFAULT_STUDIO_BRUSH_TIP_STAMP_GRID),
    STUDIO_BRUSH_TIP_STAMP_GRID_RANGE.min,
    STUDIO_BRUSH_TIP_STAMP_GRID_RANGE.max
  ));
  // Prefer odd grids so one sample sits on the tip centre.
  const oddGrid = grid % 2 === 0 ? grid + 1 : grid;
  const half = (oddGrid - 1) / 2;
  const radius = Math.max(0.25, finiteNumber(dab.size, 1) / 2);
  const roundness = clamp(
    finiteNumber(dab.roundness, 1),
    0.08,
    1
  );
  const angleRad = finiteNumber(dab.angle, 0) * Math.PI / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const cell = radius / Math.max(1, half);
  const samples: StudioBrushTipStampSample[] = [];

  for (let gy = -half; gy <= half; gy++) {
    for (let gx = -half; gx <= half; gx++) {
      const localX = half === 0 ? 0 : gx / half;
      const localY = half === 0 ? 0 : gy / half;
      // Map local tip coords [-1,1] onto alpha map pixels.
      const mapX = (localX * 0.5 + 0.5) * (map.size - 1);
      const mapY = (localY * 0.5 + 0.5) * (map.size - 1);
      const alpha = sampleStudioBrushTipAlphaMap(map, mapX, mapY);
      if (alpha <= 0.02) continue;
      // Apply elliptical roundness on the tip Y axis before rotation (matches canvas ellipse path).
      const sx = localX * radius;
      const sy = localY * radius * roundness;
      const dx = sx * cos - sy * sin;
      const dy = sx * sin + sy * cos;
      samples.push({
        dx,
        dy,
        alpha,
        radius: Math.max(0.2, cell * 0.72),
      });
    }
  }

  // Degenerate empty tip: keep a single centre dab so strokes never vanish.
  if (samples.length === 0) {
    samples.push({ dx: 0, dy: 0, alpha: 1, radius: Math.max(0.25, radius * 0.35) });
  }

  return {
    samples,
    tip,
    mapSize: map.size,
    grid: oddGrid,
  };
}

/** Absolute stamp centres for one dab — convenient for SVG multi-circle export. */
export function planStudioBrushTipStampWorldSamples(
  dab: Pick<StudioDynamicBrushDab, "x" | "y" | "size" | "angle" | "roundness" | "opacity" | "flow">,
  tipSettings?: unknown,
  options?: { grid?: number; alphaMap?: StudioBrushTipAlphaMap | null }
): Array<{ x: number; y: number; alpha: number; radius: number }> {
  const plan = planStudioBrushTipStamp(dab, tipSettings, options);
  return plan.samples.map((sample) => ({
    x: dab.x + sample.dx,
    y: dab.y + sample.dy,
    alpha: sample.alpha,
    radius: sample.radius,
  }));
}

/** Build a compact custom tip payload from a procedural shape (tests / default assets). */
export function studioBrushTipAlphaMapToBase64(
  shape: StudioBrushTipShapeId,
  softness = 0.35,
  size = DEFAULT_STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE
): { alphaMapBase64: string; alphaMapSize: number } {
  const safeSize = Math.trunc(clamp(
    size,
    STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE_RANGE.min,
    STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE_RANGE.max
  ));
  const alphas = buildProceduralAlphaMap(shape, clamp01(softness), safeSize);
  const bytes = new Uint8Array(safeSize * safeSize);
  for (let index = 0; index < alphas.length; index++) {
    bytes[index] = Math.round(clamp01(alphas[index]!) * 255);
  }
  return {
    alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(bytes),
    alphaMapSize: safeSize,
  };
}

export function studioBrushTipSettingsEqual(left?: unknown, right?: unknown): boolean {
  return JSON.stringify(normalizeStudioBrushTipSettings(left))
    === JSON.stringify(normalizeStudioBrushTipSettings(right));
}

/**
 * Round tips without a custom PNG-alpha map keep the fast solid-ellipse dab path
 * (Canvas/SVG parity with legacy particle brushes). Textured / custom tips stamp the alpha map.
 */
export function studioBrushTipUsesSolidEllipse(tip?: unknown): boolean {
  const normalized = normalizeStudioBrushTipSettings(tip);
  return normalized.shape === "round" && normalized.alphaMapBase64 === null;
}
