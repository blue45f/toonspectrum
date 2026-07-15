/**
 * PicsArt / Express-class FX brush planners (glow, glitter, oil, pastel).
 *
 * Pure, deterministic dab/particle plans shared by Canvas (Konva) and SVG export.
 * No Math.random / DOM / Konva — seed + stroke geometry only.
 */

import { hash2 } from "./studio-grain";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const MAX_COORD = 1e6;
const POINT_EPS = 1e-4;
const DEFAULT_PRESSURE = 0.55;
const TAU = Math.PI * 2;

export const FX_BRUSH_SEED_RANGE = { min: 0, max: 9999 } as const;
export const DEFAULT_FX_BRUSH_SEED = 1;
export const FX_BRUSH_PARTICLE_CAP = 768;
export const FX_BRUSH_DAB_CAP = 512;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Stable seed from stroke id (same FNV-style recipe as watercolor). */
export function fxBrushSeedFromKey(key: unknown): number {
  if (typeof key !== "string" || key.length === 0) return DEFAULT_FX_BRUSH_SEED;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % (FX_BRUSH_SEED_RANGE.max + 1);
}

type StrokePoint = { x: number; y: number; pressure: number };

function safeCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value, -MAX_COORD, MAX_COORD);
}

function pressureAt(pressures: unknown, progress: number): number {
  if (!Array.isArray(pressures) || pressures.length === 0) return DEFAULT_PRESSURE;
  if (pressures.length === 1) return clamp01(finiteNumber(pressures[0], DEFAULT_PRESSURE));
  const p = clamp01(progress);
  const pos = p * (pressures.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(pressures.length - 1, Math.ceil(pos));
  const t = pos - lo;
  const a = clamp01(finiteNumber(pressures[lo], DEFAULT_PRESSURE));
  const b = clamp01(finiteNumber(pressures[hi], a));
  return a + (b - a) * t;
}

function sanitizePoints(rawPoints: unknown, rawPressures: unknown): StrokePoint[] {
  if (!Array.isArray(rawPoints)) return [];
  const pairCount = Math.floor(rawPoints.length / 2);
  const out: StrokePoint[] = [];
  for (let i = 0; i < pairCount; i++) {
    const x = safeCoord(rawPoints[i * 2]);
    const y = safeCoord(rawPoints[i * 2 + 1]);
    if (x === null || y === null) continue;
    const pressure = pressureAt(rawPressures, pairCount <= 1 ? 0 : i / (pairCount - 1));
    const prev = out.at(-1);
    if (prev && Math.hypot(x - prev.x, y - prev.y) <= POINT_EPS) {
      prev.pressure = pressure;
      continue;
    }
    out.push({ x, y, pressure });
  }
  return out;
}

/** Arc-length resample stations along a polyline. */
function sampleStations(
  points: readonly StrokePoint[],
  spacing: number
): StrokePoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]!];
  const step = Math.max(0.35, spacing);
  const stations: StrokePoint[] = [points[0]!];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen <= POINT_EPS) continue;
    let consumed = 0;
    while (carry + (segLen - consumed) >= step) {
      const need = step - carry;
      const t = (consumed + need) / segLen;
      stations.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + (b.pressure - a.pressure) * t,
      });
      consumed += need;
      carry = 0;
    }
    carry += segLen - consumed;
  }
  const last = points[points.length - 1]!;
  const tail = stations[stations.length - 1]!;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > POINT_EPS) {
    stations.push(last);
  }
  return stations;
}

// ---------------------------------------------------------------------------
// Glow — multi-pass halo (PicsArt / Express neon-glow depth)
// ---------------------------------------------------------------------------

export type FxGlowPass = {
  /** Stroke width multiplier vs base. */
  widthScale: number;
  /** Relative opacity (0–1), multiplied by element opacity later. */
  opacity: number;
};

/**
 * Outer soft halo → bright core. Renderer draws passes back-to-front.
 * softGlow=true widens the halo (soft-glow preset).
 */
export function planGlowBrushPasses(baseWidth: number, softGlow = false): FxGlowPass[] {
  const w = clamp(finiteNumber(baseWidth, 12), 0.5, 2048);
  if (softGlow) {
    return [
      { widthScale: 4.2, opacity: 0.12 },
      { widthScale: 2.8, opacity: 0.2 },
      { widthScale: 1.6, opacity: 0.38 },
      { widthScale: 0.85, opacity: 0.92 },
    ];
  }
  // Keep scales relative so tiny pens still read as glow.
  const outer = w < 6 ? 3.4 : 3.0;
  return [
    { widthScale: outer, opacity: 0.16 },
    { widthScale: outer * 0.62, opacity: 0.32 },
    { widthScale: 1.05, opacity: 0.95 },
  ];
}

// ---------------------------------------------------------------------------
// Glitter / star-dust — scatter particles along stroke
// ---------------------------------------------------------------------------

export type FxGlitterParticle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  /** 0 = circle spark, 1 = diamond-ish cross (renderer may draw rotated square). */
  kind: 0 | 1;
};

export type FxGlitterPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  /** "glitter" denser; "star-dust" sparser larger sparks. */
  mode?: "glitter" | "star-dust";
  maxParticles?: number;
};

export function planGlitterBrushParticles(input: FxGlitterPlanInput): FxGlitterParticle[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 18), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max)
  );
  const mode = input.mode === "star-dust" ? "star-dust" : "glitter";
  const maxParticles = Math.floor(
    clamp(finiteNumber(input.maxParticles, FX_BRUSH_PARTICLE_CAP), 4, FX_BRUSH_PARTICLE_CAP)
  );
  const spacing = mode === "star-dust" ? Math.max(2.2, baseWidth * 0.55) : Math.max(1.4, baseWidth * 0.28);
  const stations = sampleStations(points, spacing);
  const particles: FxGlitterParticle[] = [];
  const scatter = baseWidth * (mode === "star-dust" ? 0.85 : 0.55);
  const perStation = mode === "star-dust" ? 2 : 4;

  for (let si = 0; si < stations.length; si++) {
    const st = stations[si]!;
    const density = 0.55 + st.pressure * 0.55;
    const count = Math.max(1, Math.round(perStation * density));
    for (let k = 0; k < count; k++) {
      if (particles.length >= maxParticles) return particles;
      const n1 = hash2(si, k * 3 + 1, seed);
      const n2 = hash2(si, k * 3 + 2, seed);
      const n3 = hash2(si, k * 3 + 3, seed);
      const n4 = hash2(si + 17, k + 9, seed);
      // Skip some for organic sparsity
      if (n4 > density * 0.92) continue;
      const ang = n1 * TAU;
      const dist = scatter * Math.sqrt(n2);
      const rBase = mode === "star-dust"
        ? baseWidth * (0.08 + n3 * 0.22)
        : baseWidth * (0.04 + n3 * 0.14);
      particles.push({
        x: st.x + Math.cos(ang) * dist,
        y: st.y + Math.sin(ang) * dist,
        radius: Math.max(0.35, rBase),
        opacity: clamp(0.35 + n2 * 0.6, 0.2, 1),
        kind: n3 > 0.62 ? 1 : 0,
      });
    }
  }
  return particles;
}

// ---------------------------------------------------------------------------
// Oil — chunky elliptical pigment dabs
// ---------------------------------------------------------------------------

export type FxOilDab = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  angleRad: number;
  opacity: number;
};

export type FxOilPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  maxDabs?: number;
};

export function planOilBrushDabs(input: FxOilPlanInput): FxOilDab[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 22), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max)
  );
  const maxDabs = Math.floor(clamp(finiteNumber(input.maxDabs, FX_BRUSH_DAB_CAP), 2, FX_BRUSH_DAB_CAP));
  const spacing = Math.max(0.8, baseWidth * 0.22);
  const stations = sampleStations(points, spacing);
  const dabs: FxOilDab[] = [];

  for (let si = 0; si < stations.length; si++) {
    if (dabs.length >= maxDabs) break;
    const st = stations[si]!;
    const n1 = hash2(si, 5, seed);
    const n2 = hash2(si, 11, seed);
    const n3 = hash2(si, 19, seed);
    // Heading from neighbors for elongated bristle
    let ang = n1 * TAU;
    if (si + 1 < stations.length) {
      const nx = stations[si + 1]!.x - st.x;
      const ny = stations[si + 1]!.y - st.y;
      if (Math.hypot(nx, ny) > POINT_EPS) ang = Math.atan2(ny, nx) + (n1 - 0.5) * 0.45;
    } else if (si > 0) {
      const px = st.x - stations[si - 1]!.x;
      const py = st.y - stations[si - 1]!.y;
      if (Math.hypot(px, py) > POINT_EPS) ang = Math.atan2(py, px) + (n1 - 0.5) * 0.45;
    }
    const size = baseWidth * (0.55 + st.pressure * 0.55) * (0.75 + n2 * 0.45);
    const rx = Math.max(0.4, size * 0.55);
    const ry = Math.max(0.25, size * (0.22 + n3 * 0.18));
    dabs.push({
      x: st.x + (n2 - 0.5) * baseWidth * 0.12,
      y: st.y + (n3 - 0.5) * baseWidth * 0.12,
      radiusX: rx,
      radiusY: ry,
      angleRad: ang,
      opacity: clamp(0.55 + st.pressure * 0.35 + n2 * 0.1, 0.35, 0.98),
    });
  }
  return dabs;
}

// ---------------------------------------------------------------------------
// Pastel — soft overlapping circles (dry chalky build-up)
// ---------------------------------------------------------------------------

export type FxPastelDab = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
};

export type FxPastelPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  maxDabs?: number;
};

export function planPastelBrushDabs(input: FxPastelPlanInput): FxPastelDab[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 20), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max)
  );
  const maxDabs = Math.floor(clamp(finiteNumber(input.maxDabs, FX_BRUSH_DAB_CAP), 2, FX_BRUSH_DAB_CAP));
  const spacing = Math.max(0.7, baseWidth * 0.18);
  const stations = sampleStations(points, spacing);
  const dabs: FxPastelDab[] = [];

  for (let si = 0; si < stations.length; si++) {
    if (dabs.length >= maxDabs) break;
    const st = stations[si]!;
    // 2 soft dabs per station for tooth
    for (let k = 0; k < 2; k++) {
      if (dabs.length >= maxDabs) break;
      const n1 = hash2(si, k * 7 + 3, seed);
      const n2 = hash2(si, k * 7 + 5, seed);
      const scatter = baseWidth * 0.22;
      const r = Math.max(
        0.5,
        (baseWidth / 2) * (0.7 + st.pressure * 0.5) * (0.75 + n1 * 0.4)
      );
      dabs.push({
        x: st.x + (n1 - 0.5) * scatter * 2,
        y: st.y + (n2 - 0.5) * scatter * 2,
        radius: r,
        opacity: clamp(0.12 + st.pressure * 0.22 + n2 * 0.08, 0.08, 0.42),
      });
    }
  }
  return dabs;
}
