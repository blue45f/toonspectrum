import { mixStudioSpectralWgm } from "../studio-spectral-wgm-mix-v1";
import type { BrushStudioV6InputPolicy, BrushStudioV6Program, BrushStudioV6Tuning } from "./brush-studio-v6-engine";

/** Portable contact solver. It neither loads graph providers nor reads the canvas. */
export type BrushStudioV6MaterialProgram = Pick<BrushStudioV6Program, "seed" | "slots" | "tuning" | "input">;
export type BrushStudioV6MaterialConfig = BrushStudioV6MaterialProgram & { readonly version: 1 };
export const BRUSH_STUDIO_V6_MATERIAL_ENGINE = Object.freeze({
  id: "cpu-contact-v1",
  backend: "cpu",
  pigment: "libmypaint 10-band spectral WGM",
  contact: "distance-sampled grain, persistent bristle reservoirs, chisel, particles, document patterns",
  wet: "deterministic porous deposition approximation; no fluid grid or canvas color pickup",
});

/** Validate persisted contacts without importing the workbench's graph registry. */
export function normalizeBrushStudioV6MaterialConfig(raw: unknown): BrushStudioV6MaterialConfig | null {
  const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const source = object(raw);
  if (!source || typeof source.seed !== "number" || !Number.isFinite(source.seed) || source.version !== undefined && source.version !== 1 || source.schemaVersion !== undefined && source.schemaVersion !== 6) return null;
  const sourceTuning = object(source.tuning);
  const sourceSlots = object(source.slots);
  const sourceInput = object(source.input);
  if (!sourceTuning || !sourceSlots || !sourceInput) return null;
  const tuning: Record<string, number | string> = {};
  const ranges: Readonly<Record<string, readonly [number, number]>> = { size: [1, 240], opacity: [0, 1], flow: [0, 1], spacing: [0.01, 4], stabilization: [0, 1], surfaceTooth: [0, 1], friction: [0, 1], absorbency: [0, 1], granulation: [0, 1], edgeDarkening: [0, 1], pickup: [0, 1], reservoir: [0, 1], wetness: [0, 1], diffusion: [0, 1], advection: [0, 1], evaporation: [0, 1], viscosity: [0, 1], plasticity: [0, 1], gravity: [-1, 1], bristleStrands: [8, 256], bristleIterations: [1, 12], particleCount: [16, 4096], reactionRate: [0, 1], patternDensity: [0, 1], patternScale: [0.1, 4], patternJitter: [0, 1], relief: [0, 1], gloss: [0, 1] };
  for (const [key, range] of Object.entries(ranges)) {
    const value = sourceTuning[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    tuning[key] = Math.min(range[1], Math.max(range[0], value));
  }
  for (const key of ["primaryColor", "secondaryColor"]) {
    const value = sourceTuning[key];
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) return null;
    tuning[key] = value.toLowerCase();
  }
  const slots: Record<string, string | readonly string[]> = {};
  for (const key of ["input", "motion", "carrier", "tip", "surface", "deposition", "pickup", "pigment", "pattern", "output"]) {
    const value = sourceSlots[key];
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,79}$/u.test(value)) return null;
    slots[key] = value;
  }
  for (const key of ["physics", "finish"]) {
    const value = sourceSlots[key];
    if (!Array.isArray(value) || value.length > 16 || !value.every((entry): entry is string => typeof entry === "string" && /^[a-z][a-z0-9-]{0,79}$/u.test(entry))) return null;
    slots[key] = Object.freeze([...new Set(value)]);
  }
  const input: Record<string, string | number | boolean> = {};
  for (const key of ["predictionPreviewOnly", "palmRejection", "hoverPreview", "tiltEnabled", "audioFeedback", "hapticFeedback"]) {
    if (typeof sourceInput[key] !== "boolean") return null;
    input[key] = sourceInput[key];
  }
  const inputRanges: Readonly<Record<string, readonly [number, number]>> = { pressureOnset: [0, 0.4], pressureSaturation: [0.5, 1], pressureGamma: [0.2, 3], pressureHysteresis: [0, 0.2], tiltDeadZoneDeg: [0, 20], tiltSmoothing: [0, 1], twistSmoothing: [0, 1] };
  for (const [key, range] of Object.entries(inputRanges)) {
    const value = sourceInput[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    input[key] = Math.min(range[1], Math.max(range[0], value));
  }
  const inputOptions: Readonly<Record<string, readonly string[]>> = { transport: ["auto", "raw-coalesced", "move-coalesced", "move-basic"], touchPolicy: ["pen-only", "pen-draw-finger-pan", "pen-draw-two-finger-gesture", "pen-ink-finger-water", "touch-draw"], film: ["glass", "matte", "paperlike-fine", "paperlike-rough"] };
  for (const [key, values] of Object.entries(inputOptions)) {
    const value = sourceInput[key];
    if (typeof value !== "string" || !values.includes(value)) return null;
    input[key] = value;
  }
  return Object.freeze({ version: 1, seed: Math.round(Math.min(2147483647, Math.max(1, source.seed))), tuning: Object.freeze(tuning), slots: Object.freeze(slots), input: Object.freeze(input) }) as unknown as BrushStudioV6MaterialConfig;
}

function contactMode(program: BrushStudioV6MaterialProgram): "bristle" | "particle" | "grain" | "relief" | "wet" | "ink" {
  const physics = program.slots.physics;
  if (physics.includes("physics-bristle")) return "bristle";
  if (program.slots.deposition === "deposit-particles" || program.slots.carrier === "carrier-webgpu-particles") return "particle";
  const wet = physics.includes("physics-inkwash") || program.slots.deposition === "deposit-wet";
  if (program.slots.deposition === "deposit-dry" || program.slots.tip === "tip-grain-exemplar" && !wet) return "grain";
  if (physics.includes("physics-height")) return "relief";
  return wet ? "wet" : "ink";
}

/** Workbench controls use the same branch decision as the contact solver. */
export function brushStudioV6MaterialActiveTuningKeys(program: BrushStudioV6MaterialProgram): ReadonlySet<keyof BrushStudioV6Tuning> {
  const result = new Set<keyof BrushStudioV6Tuning>(["size", "opacity", "flow", "spacing", "primaryColor", "secondaryColor"]);
  const mode = contactMode(program);
  const pattern = program.slots.pattern !== "pattern-none";
  if (pattern) for (const key of ["patternDensity", "patternScale", "patternJitter"] as const) result.add(key);
  if (program.slots.physics.includes("physics-thin-film")) for (const key of ["wetness", "gravity", "viscosity"] as const) result.add(key);
  if (pattern && mode !== "particle") return result;
  const modeKeys: Readonly<Record<typeof mode, readonly (keyof BrushStudioV6Tuning)[]>> = {
    bristle: ["bristleStrands", "friction", "viscosity", "reservoir", "pickup", "relief", "surfaceTooth"],
    particle: ["particleCount", "patternJitter", ...(program.slots.physics.includes("physics-reaction") ? ["reactionRate"] as const : [])],
    grain: ["surfaceTooth", "granulation"],
    relief: ["reservoir", "plasticity", "relief"],
    wet: ["absorbency", "diffusion", "wetness", "granulation", "edgeDarkening", ...(program.slots.physics.includes("physics-dry-contact") ? ["surfaceTooth"] as const : [])],
    ink: program.slots.deposition === "deposit-marker" ? ["edgeDarkening"] : [],
  };
  for (const key of modeKeys[mode]) result.add(key);
  return result;
}
export interface BrushStudioV6MaterialPoint {
  readonly x: number;
  readonly y: number;
  /** Calibrated pressure, 0..1. Predicted samples must not be submitted here. */
  readonly pressure: number;
  /** Tilt magnitude normalized to 0..1; not degrees. */
  readonly tilt?: number;
  /** Degrees, matching PointerEvent.twist. */
  readonly twist?: number;
}
export interface BrushStudioV6MaterialMark {
  readonly kind: "ink" | "grain" | "bristle" | "wet" | "relief" | "particle" | "pattern";
  readonly shape: "ellipse" | "rect" | "ring" | "capsule";
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
  readonly opacity: number;
  readonly color: string;
  readonly secondaryMix: number;
  readonly height: number;
}
export interface BrushStudioV6MaterialStatistics {
  readonly pathLength: number;
  readonly emittedMarks: number;
  readonly resampledDabs: number;
  readonly clippedDabs: number;
}
export interface BrushStudioV6MaterialStroke {
  push(point: BrushStudioV6MaterialPoint): readonly BrushStudioV6MaterialMark[];
  reset(): void;
  statistics(): BrushStudioV6MaterialStatistics;
}

const TAU = Math.PI * 2;
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const unit = (value: number): number => Math.max(0, Math.min(1, finite(value)));
const bounded = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, finite(value, min)));
function noise(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Document-anchored paper height; no view scale, stroke index, or mutable RNG. */
export function sampleBrushStudioV6PaperContact(surface: string, x: number, y: number, seed: number): number {
  const field = (scaleX: number, scaleY: number, salt: number): number => {
    const px = x / scaleX;
    const py = y / scaleY;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const tx = px - ix;
    const ty = py - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = noise(ix, iy, seed ^ salt) * (1 - sx) + noise(ix + 1, iy, seed ^ salt) * sx;
    const bottom = noise(ix, iy + 1, seed ^ salt) * (1 - sx) + noise(ix + 1, iy + 1, seed ^ salt) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  if (surface === "surface-smooth") return 0.08;
  if (surface === "surface-linen") {
    const warp = Math.pow(0.5 + Math.sin(x * TAU / 7) * 0.5, 4);
    const weft = Math.pow(0.5 + Math.sin(y * TAU / 6) * 0.5, 4);
    return unit(0.1 + Math.max(warp, weft) * 0.7 + field(1, 1, 13) * 0.2);
  }
  if (surface === "surface-coldpress") return unit(field(9, 9, 17) * 0.75 + field(1.3, 1.3, 29) * 0.25);
  if (surface === "surface-porous") return unit(field(14, 1.4, 37) * 0.8 + field(2, 2, 41) * 0.2);
  if (surface === "surface-printmaking") return unit(field(3, 5, 43) * 0.55 + field(0.65, 0.65, 47) * 0.45);
  return unit(0.15 + field(1.4, 1.4, 53) * 0.6 + field(11, 0.8, 59) * 0.2);
}

/** Selections with an observable implementation in this portable kernel. */
export function isBrushStudioV6MaterialNodeImplemented(id: string): boolean {
  return ["input-pointer-v3", "motion-direct", "carrier-webgpu-centerline", "carrier-perfect-outline", "carrier-webgpu-particles", "tip-round-sdf", "tip-chisel-sdf", "tip-grain-exemplar", "surface-smooth", "surface-kent", "surface-coldpress", "surface-printmaking", "surface-linen", "surface-porous", "deposit-ink", "deposit-marker", "deposit-dry", "deposit-wet", "deposit-oil", "deposit-particles", "pickup-none", "pigment-rgb", "pigment-spectral", "pigment-inkwash-density", "physics-dry-contact", "physics-inkwash", "physics-thin-film", "physics-bristle", "physics-reaction", "physics-height", "pattern-none", "pattern-dot-tone", "pattern-cross-hatch", "pattern-weave", "pattern-brick", "pattern-foliage", "pattern-stitch", "pattern-kaleido", "finish-neon", "output-raster-tiles", "output-hybrid", "output-vector"].includes(id);
}

export function mapBrushStudioV6Pressure(raw: number, input: Pick<BrushStudioV6InputPolicy, "pressureOnset" | "pressureSaturation" | "pressureGamma">): number {
  return Math.pow(unit((finite(raw) - input.pressureOnset) / Math.max(0.05, input.pressureSaturation - input.pressureOnset)), bounded(input.pressureGamma, 0.2, 3));
}

export function mapBrushStudioV6Tilt(degrees: number, input: Pick<BrushStudioV6InputPolicy, "tiltEnabled" | "tiltDeadZoneDeg">): number {
  return input.tiltEnabled ? unit((finite(degrees) - input.tiltDeadZoneDeg) / Math.max(1, 90 - input.tiltDeadZoneDeg)) : 0;
}

function parseColor(hex: string): { r: number; g: number; b: number } {
  const value = /^#[0-9a-f]{6}$/iu.test(hex) ? Number.parseInt(hex.slice(1), 16) : 0x111827;
  return { r: (value >>> 16) / 255, g: ((value >>> 8) & 255) / 255, b: (value & 255) / 255 };
}
function hexColor(color: { r: number; g: number; b: number }): string {
  return `#${[color.r, color.g, color.b].map((channel) => Math.round(unit(channel) * 255).toString(16).padStart(2, "0")).join("")}`;
}
export function mixBrushStudioV6MaterialColors(first: string, second: string, weight: number, spectral = true): string {
  const a = parseColor(first);
  const b = parseColor(second);
  const ratio = unit(weight);
  // Exact endpoints matter: spectral upsampling is approximate at pure colors.
  if (ratio === 0) return hexColor(a);
  if (ratio === 1) return hexColor(b);
  return hexColor(mixStudioSpectralWgm(a, b, 1 - ratio, spectral ? 1 : 0));
}

/** Fixed work per append, fixed memory per stroke, and no event-count RNG. */
export function createBrushStudioV6MaterialStroke(
  program: BrushStudioV6MaterialProgram,
  options: { readonly maxMarksPerPush?: number } = {},
): BrushStudioV6MaterialStroke {
  const t = program.tuning;
  const size = bounded(t.size, 1, 240);
  const mode = contactMode(program);
  const spacing = mode === "relief" && t.spacing <= 0.3 ? Math.min(t.spacing, 0.035) : t.spacing;
  const step = bounded(size * spacing, 0.35, 96);
  const markBudget = Math.round(bounded(options.maxMarksPerPush ?? 8192, 64, 32768));
  const seed = finite(program.seed) | 0;
  const physics = new Set(program.slots.physics);
  const bristle = mode === "bristle";
  const wet = mode === "wet";
  const knife = mode === "relief";
  const particles = mode === "particle";
  const chisel = program.slots.tip === "tip-chisel-sdf";
  const patternId = program.slots.pattern;
  const laneCount = Math.round(bounded(t.bristleStrands, 8, 128));
  const maxPatternMarks = ["pattern-dot-tone", "pattern-cross-hatch", "pattern-brick"].includes(patternId) ? 169 : patternId === "pattern-weave" ? 338 : patternId === "pattern-stitch" ? 1 : 6;
  const marksPerDab = (patternId !== "pattern-none" ? maxPatternMarks + (particles ? 36 : 0) : bristle ? laneCount : mode === "grain" ? 36 : particles ? 36 : 6) + 4;
  const palette = Array.from({ length: 33 }, (_, index) => mixBrushStudioV6MaterialColors(t.primaryColor, t.secondaryColor, index / 32, program.slots.pigment !== "pigment-rgb"));
  const laneX = new Float64Array(laneCount);
  const laneY = new Float64Array(laneCount);
  const reservoir = new Float64Array(laneCount);
  const wetEdges = new Float64Array(4);
  let previous: BrushStudioV6MaterialPoint | null = null;
  let remaining = step;
  let pathLength = 0;
  let emittedMarks = 0;
  let dabIndex = 0;
  let clippedDabs = 0;
  let initializedBristles = false;
  let initializedWetEdges = false;

  function deposit(point: BrushStudioV6MaterialPoint, direction: number, marks: BrushStudioV6MaterialMark[], densityMultiplier = 1): void {
    const index = dabIndex++;
    const pressure = unit(point.pressure);
    if (pressure === 0 || t.flow <= 0 || t.opacity <= 0) return;
    const tilt = program.input.tiltEnabled ? unit(point.tilt ?? 0) : 0;
    const angle = chisel || knife ? (finite(point.twist ?? 0) * Math.PI / 180 + Math.PI / 4) : direction;
    const widthPressure = program.slots.carrier === "carrier-perfect-outline" ? pressure * pressure : pressure;
    const radius = size * (0.035 + widthPressure * 0.465) * (1 + tilt * 0.7);
    // Optical density per unit distance prevents darker high-Hz input streams.
    const alpha = unit(t.opacity) * -Math.expm1(Math.log1p(-Math.min(0.999, unit(t.flow))) * step * densityMultiplier / Math.max(1, radius * 1.4));
    const random = (lane: number, salt = 0) => noise(index, lane, seed ^ salt);
    const emit = (kind: BrushStudioV6MaterialMark["kind"], x: number, y: number, rx: number, ry: number, rotation: number, opacity: number, mix = 0, height = 0, shape: BrushStudioV6MaterialMark["shape"] = "ellipse"): void => {
      if (marks.length >= markBudget || opacity < 0.00001) return;
      const secondaryMix = unit(mix);
      marks.push({ kind, shape, x, y, radiusX: Math.max(0.12, rx), radiusY: Math.max(0.12, ry), angle: rotation, opacity: unit(opacity), color: palette[Math.round(secondaryMix * 32)]!, secondaryMix, height: unit(height) });
    };

    if (program.slots.finish.includes("finish-neon")) {
      emit("ink", point.x, point.y, radius * 1.7, radius * 1.7, angle, alpha * 0.09, 1);
      emit("ink", point.x, point.y, radius * 1.3, radius * 1.3, angle, alpha * 0.15, 0.7);
    }
    if (physics.has("physics-thin-film") && index % 12 === 0) {
      const length = radius * unit(t.wetness) * Math.abs(t.gravity) * (1 + 3 * (1 - t.viscosity));
      emit("wet", point.x, point.y + Math.sign(t.gravity) * length, Math.max(0.3, radius * 0.12), length, 0, alpha * 0.5, 0.25);
    }

    if (patternId !== "pattern-none") {
      const scale = bounded(12 * t.patternScale, 3, 48);
      if (["pattern-dot-tone", "pattern-cross-hatch", "pattern-weave", "pattern-brick"].includes(patternId)) {
        const cells = Math.min(6, Math.ceil(radius / scale));
        const originX = Math.floor(point.x / scale);
        const originY = Math.floor(point.y / scale);
        for (let row = -cells; row <= cells; row++) for (let column = -cells; column <= cells; column++) {
          const x = (originX + column + 0.5) * scale;
          const y = (originY + row + 0.5) * scale;
          if (Math.hypot(x - point.x, y - point.y) > radius) continue;
          const dot = patternId === "pattern-dot-tone";
          emit("pattern", x, y, dot ? scale * (0.06 + t.patternDensity * 0.25) : scale * 0.6, dot ? scale * (0.06 + t.patternDensity * 0.25) : scale * 0.04, patternId === "pattern-brick" ? 0 : Math.PI / 4, alpha, 0, 0, dot ? "ellipse" : "rect");
          if (patternId === "pattern-weave") emit("pattern", x, y, scale * 0.6, scale * 0.04, -Math.PI / 4, alpha, 0.3, 0, "rect");
        }
      } else if (patternId === "pattern-stitch") {
        emit("pattern", point.x, point.y, radius, radius * 0.42, direction + Math.sin(index * 0.7) * t.patternJitter, alpha * 2, (index % 16) / 15, 0, "ring");
      } else {
        const count = Math.round(1 + t.patternDensity * 5);
        for (let lane = 0; lane < count; lane++) {
          const turn = direction + (random(lane) - 0.5) * TAU * t.patternJitter;
          const distance = radius * Math.sqrt(random(lane, 19));
          emit("pattern", point.x + Math.cos(turn) * distance, point.y + Math.sin(turn) * distance, scale * 0.5, scale * (patternId === "pattern-kaleido" ? 0.08 : 0.18), turn, alpha, random(lane, 91));
        }
      }
      if (!particles) return;
    }

    if (bristle) {
      const normalX = -Math.sin(direction);
      const normalY = Math.cos(direction);
      const compliance = Math.max(0.2, size * (0.015 + t.viscosity * 0.11 + t.friction * 0.07));
      for (let lane = 0; lane < laneCount; lane++) {
        const lanePosition = (lane / (laneCount - 1) - 0.5) * 2;
        const strandSpacing = (noise(lane, 61, seed) - 0.5) * radius / laneCount;
        const splay = lanePosition * radius * (0.6 + pressure * 0.55) + strandSpacing;
        // Real bundles have unequal strand lengths and stiffness. Fixed per-lane
        // offsets stagger contact joints without frame/event dependent jitter.
        const strandLength = (noise(lane, 67, seed) - 0.5) * size * 0.22;
        const response = 1 - Math.exp(-step / (compliance * (0.6 + noise(lane, 71, seed) * 0.85)));
        const targetX = point.x + normalX * splay + Math.cos(direction) * strandLength;
        const targetY = point.y + normalY * splay + Math.sin(direction) * strandLength;
        if (!initializedBristles) { laneX[lane] = targetX; laneY[lane] = targetY; reservoir[lane] = (0.25 + t.reservoir * 0.75) * (0.65 + noise(lane, 0, seed) * 0.35); }
        const previousX = laneX[lane]!;
        const previousY = laneY[lane]!;
        laneX[lane] = previousX + (targetX - previousX) * response;
        laneY[lane] = previousY + (targetY - previousY) * response;
        const loading = reservoir[lane]!;
        const loss = loading * (1 - Math.exp(-step * (0.08 + t.friction * 0.2) / size));
        const refill = (1 - loading) * t.pickup * step / (size * 12);
        reservoir[lane] = unit(loading - loss + refill);
        const paper = sampleBrushStudioV6PaperContact(program.slots.surface, laneX[lane]!, laneY[lane]!, seed);
        const contact = Math.max(0, pressure - Math.abs(lanePosition) * 0.18 - paper * t.surfaceTooth * 0.12);
        const thickness = Math.max(0.18, size / laneCount * (0.35 + contact * 0.45 + t.viscosity * 0.2) * (0.7 + noise(lane, 7, seed) * 0.6));
        const travelX = laneX[lane]! - previousX;
        const travelY = laneY[lane]! - previousY;
        const travel = Math.hypot(travelX, travelY);
        emit("bristle", (previousX + laneX[lane]!) * 0.5, (previousY + laneY[lane]!) * 0.5, travel * 0.5 + thickness, thickness, travel > 0.0001 ? Math.atan2(travelY, travelX) : direction, alpha * contact * loading * 5, noise(lane, 19, seed) * t.pickup, loading * t.relief, "capsule");
      }
      initializedBristles = true;
      return;
    }

    if (mode === "grain") {
      const count = Math.round(12 + t.surfaceTooth * 24);
      const cellSize = Math.max(0.7, 2.8 - t.granulation * 1.9);
      for (let lane = 0; lane < count; lane++) {
        const turn = random(lane) * TAU;
        const distance = Math.sqrt(random(lane, 43)) * radius;
        const x = point.x + Math.cos(turn) * distance;
        const y = point.y + Math.sin(turn) * distance * (1 - tilt * 0.55);
        // The same paper position always has the same tooth, independent of dab seed.
        const tooth = sampleBrushStudioV6PaperContact(program.slots.surface, Math.floor(x / cellSize) * cellSize, Math.floor(y / cellSize) * cellSize, seed);
        const contact = unit((pressure - tooth * t.surfaceTooth * 0.85) * 2);
        const charcoal = program.slots.pickup !== "pickup-none";
        emit("grain", x, y, cellSize * (charcoal ? 1.4 : 0.7), cellSize * (charcoal ? 0.65 : 0.32), angle, alpha * contact * (charcoal ? 1.8 : 1.2), 0);
      }
      return;
    }

    if (particles) {
      const count = Math.round(bounded(t.particleCount / 90, 1, 36));
      for (let lane = 0; lane < count; lane++) {
        const turn = random(lane) * TAU;
        const distance = radius * Math.sqrt(random(lane, 3)) * (1 + t.patternJitter * 2);
        const reaction = physics.has("physics-reaction");
        const gravity = physics.has("physics-thin-film") ? t.gravity * distance * 0.3 : 0;
        emit("particle", point.x + Math.cos(turn) * distance, point.y + Math.sin(turn) * distance + gravity, reaction ? radius * (0.15 + t.reactionRate * 0.45) : 0.3 + radius * random(lane, 9) * 0.12, reaction ? 0.3 : 0.3 + radius * random(lane, 9) * 0.12, turn, alpha * (0.5 + random(lane, 11)), random(lane, 17), 0, reaction ? "rect" : "ellipse");
      }
      return;
    }

    if (knife) {
      const load = Math.exp(-index * step * (1 - t.reservoir) / (size * 35));
      emit("relief", point.x, point.y, radius, radius * (0.16 + t.plasticity * 0.24), angle, alpha * load, 0, t.relief * load, "rect");
      for (let lane = -2; lane <= 2; lane++) {
        const offset = lane * radius * 0.13;
        emit("relief", point.x - Math.sin(angle) * offset, point.y + Math.cos(angle) * offset, radius * 0.9, Math.max(0.2, radius * 0.025), angle, alpha * t.relief * (lane % 2 ? 0.8 : 0.3), lane % 2 ? 0.4 : 0.1, t.relief, "rect");
      }
      return;
    }

    if (wet) {
      const absorbency = unit(t.absorbency);
      const spread = 1 + t.diffusion * t.wetness * (0.3 + absorbency * 0.8);
      emit("wet", point.x, point.y, radius * spread, radius * spread, angle, alpha * t.wetness * 0.24, 0.25);
      const tooth = sampleBrushStudioV6PaperContact(program.slots.surface, Math.floor(point.x / 2) * 2, Math.floor(point.y / 2) * 2, seed);
      const resist = physics.has("physics-dry-contact") ? unit((tooth - t.surfaceTooth * 0.5) * 3) : 1;
      emit("wet", point.x, point.y, radius, radius * (chisel ? 0.38 : 1), angle, alpha * (0.55 + tooth * t.granulation * 0.5) * resist, t.granulation * tooth * 0.35);
      if (t.edgeDarkening > 0) {
        const normalX = -Math.sin(direction);
        const normalY = Math.cos(direction);
        const edgeRadius = radius * spread * (0.96 + tooth * 0.06);
        const thickness = Math.max(0.18, radius * (0.025 + t.granulation * 0.025));
        for (let side = 0; side < 2; side++) {
          const sign = side === 0 ? -1 : 1;
          const x = point.x + normalX * edgeRadius * sign;
          const y = point.y + normalY * edgeRadius * sign;
          const previousX = initializedWetEdges ? wetEdges[side * 2]! : x;
          const previousY = initializedWetEdges ? wetEdges[side * 2 + 1]! : y;
          const dx = x - previousX;
          const dy = y - previousY;
          // Deposit on the two moving wet boundaries, not an entire ring around
          // every dab, which leaves regular dark crossbars inside the wash.
          emit("wet", (x + previousX) * 0.5, (y + previousY) * 0.5, Math.hypot(dx, dy) * 0.5 + thickness, thickness, Math.atan2(dy, dx), alpha * t.edgeDarkening * (0.65 + tooth * 0.35), 0, 0, "capsule");
          wetEdges[side * 2] = x;
          wetEdges[side * 2 + 1] = y;
        }
        initializedWetEdges = true;
      }
      if (program.slots.pigment === "pigment-inkwash-density") emit("wet", point.x, point.y, radius * 0.6, radius * 0.6, angle, alpha, 0);
      return;
    }

    const marker = program.slots.deposition === "deposit-marker";
    emit("ink", point.x, point.y, radius, radius * (chisel ? 0.28 + tilt * 0.2 : 1), angle, alpha * (marker ? 0.65 : 1), 0, 0, chisel ? "rect" : "ellipse");
    if (marker && t.edgeDarkening > 0) emit("ink", point.x, point.y, radius, radius * 0.42, angle, alpha * t.edgeDarkening, 0, 0, "ring");
  }

  return {
    push(input): readonly BrushStudioV6MaterialMark[] {
      if (![input.x, input.y, input.pressure].every(Number.isFinite)) return [];
      const point = { ...input, pressure: unit(input.pressure), tilt: unit(input.tilt ?? 0), twist: finite(input.twist ?? 0) };
      const marks: BrushStudioV6MaterialMark[] = [];
      if (!previous) { deposit(point, 0, marks); previous = point; emittedMarks += marks.length; return marks; }
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (!Number.isFinite(distance)) return marks;
      if (distance < 1e-9) { previous = point; return marks; }
      pathLength += distance;
      const direction = Math.atan2(dy, dx);
      const totalDabs = Math.max(0, Math.floor((distance - remaining + 1e-8) / step) + 1);
      // Exceptional sparse/teleport segments cover their full extent at coarser
      // spacing. Normal input never reaches this explicit, reported degradation.
      const sampleCount = Math.min(totalDabs, 1024, Math.max(1, Math.floor(markBudget / marksPerDab)));
      const initialDabIndex = dabIndex;
      for (let index = 0; index < sampleCount; index++) {
        const sampleIndex = sampleCount === totalDabs ? index : sampleCount === 1 ? totalDabs - 1 : Math.round(index * (totalDabs - 1) / (sampleCount - 1));
        dabIndex = initialDabIndex + sampleIndex;
        const ratio = Math.min(1, (remaining + sampleIndex * step) / distance);
        const twistDelta = ((point.twist - finite(previous.twist ?? 0) + 540) % 360) - 180;
        deposit({ x: previous.x + dx * ratio, y: previous.y + dy * ratio, pressure: previous.pressure + (point.pressure - previous.pressure) * ratio, tilt: finite(previous.tilt ?? 0) + (point.tilt - finite(previous.tilt ?? 0)) * ratio, twist: finite(previous.twist ?? 0) + twistDelta * ratio }, direction, marks, totalDabs / sampleCount);
      }
      clippedDabs += totalDabs - sampleCount;
      dabIndex = initialDabIndex + totalDabs;
      remaining = Math.max(0, remaining + totalDabs * step - distance);
      previous = point;
      emittedMarks += marks.length;
      return marks;
    },
    reset(): void { previous = null; remaining = step; pathLength = 0; emittedMarks = 0; dabIndex = 0; clippedDabs = 0; initializedBristles = false; initializedWetEdges = false; },
    statistics: () => ({ pathLength, emittedMarks, resampledDabs: dabIndex, clippedDabs }),
  };
}

export function renderBrushStudioV6MaterialMarks(context: CanvasRenderingContext2D, marks: readonly BrushStudioV6MaterialMark[]): void {
  context.save();
  const inheritedAlpha = context.globalAlpha;
  for (const mark of marks) {
    context.save();
    context.translate(mark.x, mark.y);
    context.rotate(mark.angle);
    context.globalAlpha = inheritedAlpha * mark.opacity;
    context.fillStyle = mark.color;
    context.strokeStyle = mark.color;
    if (mark.shape === "rect") context.fillRect(-mark.radiusX, -mark.radiusY, mark.radiusX * 2, mark.radiusY * 2);
    else if (mark.shape === "capsule") {
      context.beginPath();
      context.roundRect(-mark.radiusX, -mark.radiusY, mark.radiusX * 2, mark.radiusY * 2, Math.min(mark.radiusX, mark.radiusY));
      context.fill();
    }
    else {
      context.beginPath();
      context.ellipse(0, 0, mark.radiusX, mark.radiusY, 0, 0, TAU);
      context.closePath();
      if (mark.shape === "ring") { context.lineWidth = Math.max(0.3, Math.min(mark.radiusX, mark.radiusY) * 0.2); context.stroke(); }
      else context.fill();
    }
    context.restore();
  }
  context.restore();
}

/** Shared primitives keep saved SVG geometry identical to the live contacts. */
export function brushStudioV6MaterialMarksToSvg(marks: readonly BrushStudioV6MaterialMark[]): string {
  const n = (value: number) => Number(value.toFixed(5));
  return marks.map((mark) => {
    const transform = `translate(${n(mark.x)} ${n(mark.y)}) rotate(${n(mark.angle * 180 / Math.PI)})`;
    const style = `transform="${transform}" opacity="${n(mark.opacity)}"`;
    if (mark.shape === "rect" || mark.shape === "capsule") return `<rect ${style} x="${n(-mark.radiusX)}" y="${n(-mark.radiusY)}" width="${n(mark.radiusX * 2)}" height="${n(mark.radiusY * 2)}"${mark.shape === "capsule" ? ` rx="${n(Math.min(mark.radiusX, mark.radiusY))}"` : ""} fill="${mark.color}"/>`;
    const paint = mark.shape === "ring" ? `fill="none" stroke="${mark.color}" stroke-width="${n(Math.max(0.3, Math.min(mark.radiusX, mark.radiusY) * 0.2))}"` : `fill="${mark.color}"`;
    return `<ellipse ${style} rx="${n(mark.radiusX)}" ry="${n(mark.radiusY)}" ${paint}/>`;
  }).join("");
}
