import { BrushStudioV6MaterialPaletteCache } from "./brush-studio-v6-material-palette-cache";
import { brushStudioV6MaterialExecutionForNode } from "./brush-studio-v6-license-profile";
import { brushStudioV6Topology } from "./brush-studio-v6-topology-catalog";
import { isBrushStudioV7AdvancedSurface, sampleBrushStudioV7SurfaceContact } from "./brush-studio-v7-surface-library";
import { sampleBrushStudioV7BackrunLobes, sampleBrushStudioV7BristleBundle, sampleBrushStudioV7Sediment, sampleBrushStudioV7VectorField, shadeBrushStudioV7ReliefColor } from "./brush-studio-v7-advanced-physics";
import { createBrushStudioV6TopologyStroke } from "./brush-studio-v6-topology-engine";
import { brushStudioV6TopologyActiveTuning, brushStudioV6TopologyStep, paintBrushStudioV6TopologyPrimitive } from "./brush-studio-v6-topology-material";
import {
  normalizeStudioBrushMaterialProgramContract,
  type StudioBrushMaterialRuntimeContract,
} from "../../../shared/lib/studio-brush-material-program-contract";
import {
  brushStudioV6PigmentProviderForNode,
  createBrushStudioV6PigmentPalette,
  mixBrushStudioV6PigmentColors,
} from "./brush-studio-v6-pigment-provider";
import type { BrushStudioV6InputPolicy, BrushStudioV6Program, BrushStudioV6Tuning } from "./brush-studio-v6-engine";

/** Portable contact solver. It neither loads graph providers nor reads the canvas. */
type BrushStudioV6MaterialProgramCore = Pick<
  BrushStudioV6Program,
  "seed" | "slots" | "tuning" | "input"
>;

export type BrushStudioV6MaterialProgram = BrushStudioV6MaterialProgramCore & {
  /** Omitted means a newly authored in-memory program; persisted receipts always specify a version. */
  readonly version?: 1 | 2;
  readonly runtime?: StudioBrushMaterialRuntimeContract;
};

export type BrushStudioV6MaterialConfig = BrushStudioV6MaterialProgramCore & (
  | { readonly version: 1; readonly runtime?: never }
  | { readonly version: 2; readonly runtime: StudioBrushMaterialRuntimeContract }
);
export const BRUSH_STUDIO_V6_MATERIAL_ENGINE = Object.freeze({
  id: "cpu-contact-v2",
  backend: "cpu",
  pigments: Object.freeze([
    "rgb-linear-v1",
    "spectral-wgm-v1",
    "mixbox-js-v2",
    "ks-reference-wgm-v1",
    "inkwash-density-wgm-v1",
  ]),
  contact: "distance-sampled grain, dual tips, persistent reservoirs, bristles, particles and patterns",
  wet: "deterministic porous deposition approximation; no canvas readback",
});

/** Validate persisted contacts through the schema also used by the collaboration server. */
export function normalizeBrushStudioV6MaterialConfig(raw: unknown): BrushStudioV6MaterialConfig | null {
  return normalizeStudioBrushMaterialProgramContract(raw) as unknown as BrushStudioV6MaterialConfig | null;
}

function usesEnhancedMaterialAdapters(program: BrushStudioV6MaterialProgram): boolean {
  // V1 receipts predate the dual-tip and stroke-local smudge adapters. Replaying those receipts
  // through the newer adapters would alter already-saved artwork. Omitted versions are live/new
  // authoring programs; persisted V2 receipts explicitly opt into the enhanced provider behavior.
  return program.version !== 1;
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
  const topologyKeys = brushStudioV6TopologyActiveTuning(program);
  if (topologyKeys) return topologyKeys;
  const result = new Set<keyof BrushStudioV6Tuning>(["size", "opacity", "flow", "spacing", "primaryColor"]);
  const mode = contactMode(program);
  const enhancedAdapters = usesEnhancedMaterialAdapters(program);
  const reservoirPickup = program.slots.pickup === "pickup-pigment-reservoir";
  const smudgePickup = enhancedAdapters && program.slots.pickup === "pickup-krita-smudge";
  const bristlePickup = mode === "bristle" && (reservoirPickup || smudgePickup);
  const pickupActive = bristlePickup || smudgePickup;
  const pattern = program.slots.pattern !== "pattern-none";
  const gridUsesOnlyPrimary = ["pattern-dot-tone", "pattern-cross-hatch", "pattern-brick"].includes(program.slots.pattern);
  const secondaryInBase = mode === "particle" || mode === "bristle" && bristlePickup && program.tuning.pickup > 0
    || mode === "relief" && program.tuning.relief > 0
    || mode === "wet" && (program.tuning.wetness > 0 || program.tuning.granulation > 0);
  if (program.slots.finish.includes("finish-neon") || program.slots.physics.includes("physics-thin-film")
    || (pattern ? !gridUsesOnlyPrimary || mode === "particle" : secondaryInBase)) result.add("secondaryColor");
  if (pickupActive) {
    result.add("pickup");
    result.add("secondaryColor");
  }
  if (pattern) {
    result.add("patternJitter");
    // Stitch rings use nib size/spacing; density and patternScale do not participate.
    if (program.slots.pattern !== "pattern-stitch") {
      result.add("patternDensity");
      result.add("patternScale");
    }
  }
  if (program.slots.physics.includes("physics-thin-film")) for (const key of ["wetness", "gravity", "viscosity"] as const) result.add(key);
  if (program.slots.physics.includes("physics-backrun-capillary")) for (const key of ["wetness", "diffusion", "absorbency", "evaporation", "advection"] as const) result.add(key);
  if (program.slots.physics.includes("physics-pigment-sedimentation")) for (const key of ["granulation", "absorbency"] as const) result.add(key);
  if (program.slots.physics.includes("physics-bristle-split-merge")) for (const key of ["bristleStrands", "friction", "viscosity"] as const) result.add(key);
  if (program.slots.finish.includes("finish-directional-relief")) for (const key of ["relief", "gloss"] as const) result.add(key);
  if (pattern && mode !== "particle") return result;
  const modeKeys: Readonly<Record<typeof mode, readonly (keyof BrushStudioV6Tuning)[]>> = {
    bristle: ["bristleStrands", "friction", "viscosity", "reservoir", ...(bristlePickup ? ["pickup"] as const : []), "relief", "surfaceTooth"],
    particle: ["particleCount", "patternJitter", ...(program.slots.physics.includes("physics-reaction") ? ["reactionRate"] as const : [])],
    grain: ["surfaceTooth", "granulation"],
    relief: ["reservoir", "plasticity", "relief"],
    wet: [
      "absorbency", "diffusion", "wetness", "granulation",
      ...(program.slots.finish.includes("finish-edge-bloom") ? ["edgeDarkening"] as const : []),
      ...(program.slots.physics.includes("physics-dry-contact") ? ["surfaceTooth"] as const : []),
    ],
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

/** Document-anchored paper height; legacy IDs preserve their previous scalar tooth. */
export function sampleBrushStudioV6PaperContact(surface: string, x: number, y: number, seed: number): number {
  return sampleBrushStudioV7SurfaceContact(surface, x, y, seed).tooth;
}

export type BrushStudioV6MaterialNodeExecution = "native" | "adapter" | "unavailable";

/** Exact product kernels and explicit, persisted compatibility adapters share one provider manifest. */
export function brushStudioV6MaterialNodeExecution(
  id: string,
): BrushStudioV6MaterialNodeExecution {
  if (brushStudioV6Topology(id)) return "native";
  const execution = brushStudioV6MaterialExecutionForNode(id);
  if (execution === "native") return "native";
  if (execution === "compatibility-adapter") return "adapter";
  return "unavailable";
}

export function isBrushStudioV6MaterialNodeImplemented(id: string): boolean {
  return brushStudioV6MaterialNodeExecution(id) !== "unavailable";
}

export function mapBrushStudioV6Pressure(raw: number, input: Pick<BrushStudioV6InputPolicy, "pressureOnset" | "pressureSaturation" | "pressureGamma">): number {
  return Math.pow(unit((finite(raw) - input.pressureOnset) / Math.max(0.05, input.pressureSaturation - input.pressureOnset)), bounded(input.pressureGamma, 0.2, 3));
}

export function mapBrushStudioV6Tilt(degrees: number, input: Pick<BrushStudioV6InputPolicy, "tiltEnabled" | "tiltDeadZoneDeg">): number {
  return input.tiltEnabled ? unit((finite(degrees) - input.tiltDeadZoneDeg) / Math.max(1, 90 - input.tiltDeadZoneDeg)) : 0;
}

export function mixBrushStudioV6MaterialColors(
  first: string,
  second: string,
  weight: number,
  provider: import("./brush-studio-v6-pigment-provider").BrushStudioV6PigmentProviderId | boolean = "spectral-wgm-v1",
): string {
  const providerId = typeof provider === "boolean"
    ? provider ? "spectral-wgm-v1" : "rgb-linear-v1"
    : provider;
  return mixBrushStudioV6PigmentColors(first, second, weight, providerId);
}

const materialPaletteCache = new BrushStudioV6MaterialPaletteCache(
  createBrushStudioV6PigmentPalette,
);

/** Fixed work per append, fixed memory per stroke, and no event-count RNG. */
export function createBrushStudioV6MaterialStroke(
  program: BrushStudioV6MaterialProgram,
  options: { readonly maxMarksPerPush?: number } = {},
): BrushStudioV6MaterialStroke {
  const t = program.tuning;
  const enhancedAdapters = usesEnhancedMaterialAdapters(program);
  // The V2 compatibility smudge adapter is explicit and persisted; it never impersonates canvas pickup.
  const pickup = program.slots.pickup === "pickup-pigment-reservoir"
    || (enhancedAdapters && program.slots.pickup === "pickup-krita-smudge")
    ? unit(t.pickup)
    : 0;
  const smudgeAdapter = enhancedAdapters && program.slots.pickup === "pickup-krita-smudge";
  const size = bounded(t.size, 1, 240);
  const mode = contactMode(program);
  const spacing = mode === "relief" && t.spacing <= 0.3 ? Math.min(t.spacing, 0.035) : t.spacing;
  const step = brushStudioV6TopologyStep(program, bounded(size * spacing, 0.35, 96));
  const markBudget = Math.round(bounded(options.maxMarksPerPush ?? 8192, 64, 32768));
  const seed = finite(program.seed) | 0;
  const physics = new Set(program.slots.physics);
  const backrun = enhancedAdapters && physics.has("physics-backrun-capillary");
  const sedimentation = enhancedAdapters && physics.has("physics-pigment-sedimentation");
  const splitMerge = enhancedAdapters && physics.has("physics-bristle-split-merge");
  const directionalRelief = enhancedAdapters && program.slots.finish.includes("finish-directional-relief");
  const bristle = mode === "bristle";
  const wet = mode === "wet";
  const knife = mode === "relief";
  const particles = mode === "particle";
  const chisel = program.slots.tip === "tip-chisel-sdf";
  const dualTip = enhancedAdapters && program.slots.tip === "tip-krita-dual";
  const motifTip = enhancedAdapters && program.slots.tip === "tip-motif-atlas";
  const luminousDeposit = enhancedAdapters && program.slots.deposition === "deposit-light";
  const wetSheen = enhancedAdapters && program.slots.finish.includes("finish-wet-sheen");
  const chromaFringe = enhancedAdapters && program.slots.finish.includes("finish-chroma");
  const patternId = program.slots.pattern;
  const nativeVectorPattern = ["pattern-vector-flow", "pattern-vector-vortex", "pattern-vector-contour", "pattern-textile-satin", "pattern-textile-twill"].includes(patternId);
  const laneCount = Math.round(bounded(t.bristleStrands, 8, 128));
  const maxPatternMarks = ["pattern-dot-tone", "pattern-cross-hatch", "pattern-brick"].includes(patternId) ? 169 : patternId === "pattern-weave" ? 338 : patternId === "pattern-stitch" ? 1 : nativeVectorPattern ? 18 : 6;
  const topology = createBrushStudioV6TopologyStroke(program, step);
  const advancedWetMarks = (backrun ? 4 : 0) + (sedimentation ? 5 : 0);
  const directionalReliefMarks = directionalRelief && mode === "relief" ? 5 : 0;
  const bristleMarks = bristle ? laneCount * (splitMerge ? 2 : 1) : 0;
  const baseMarksPerDab = topology ? topology.maxPrimitivesPerDab * 3 : (patternId !== "pattern-none" ? maxPatternMarks + (particles ? 36 : 0) : bristle ? bristleMarks : mode === "grain" ? 36 : particles ? 36 : 6) + 4 + advancedWetMarks + directionalReliefMarks;
  const marksPerDab = baseMarksPerDab * (1 + (dualTip ? 1 : 0) + (motifTip ? 1 : 0));
  const pigmentProvider = brushStudioV6PigmentProviderForNode(program.slots.pigment);
  if (!pigmentProvider) {
    throw new Error(`안료 노드 ${program.slots.pigment}는 제품 재료 엔진에 연결되지 않았습니다.`);
  }
  const palette = materialPaletteCache.get(
    t.primaryColor,
    t.secondaryColor,
    pigmentProvider.id,
  );
  const laneX = new Float64Array(topology ? 0 : laneCount);
  const laneY = new Float64Array(topology ? 0 : laneCount);
  const reservoir = new Float64Array(topology ? 0 : laneCount);
  const wetEdges = new Float64Array(topology ? 0 : 4);
  let previous: BrushStudioV6MaterialPoint | null = null;
  let remaining = step;
  let pathLength = 0;
  let emittedMarks = 0;
  let dabIndex = 0;
  let clippedDabs = 0;
  let initializedBristles = false;
  let initializedWetEdges = false;
  let smudgeMix = 0;

  function deposit(point: BrushStudioV6MaterialPoint, direction: number, marks: BrushStudioV6MaterialMark[], densityMultiplier = 1, directional = true): void {
    const index = dabIndex++;
    const pressure = unit(point.pressure);
    if (pressure === 0 || t.flow <= 0 || t.opacity <= 0) { topology?.reset(); return; }
    const tilt = program.input.tiltEnabled ? unit(point.tilt ?? 0) : 0;
    const angle = chisel || knife ? (finite(point.twist ?? 0) * Math.PI / 180 + Math.PI / 4) : direction;
    const widthPressure = program.slots.carrier === "carrier-perfect-outline" ? pressure * pressure : pressure;
    const radius = size * (0.035 + widthPressure * 0.465) * (1 + tilt * 0.7);
    // Optical density per unit distance prevents darker high-Hz input streams.
    const alpha = unit(t.opacity) * -Math.expm1(Math.log1p(-Math.min(0.999, unit(t.flow))) * step * densityMultiplier / Math.max(1, radius * 1.4));
    const random = (lane: number, salt = 0) => noise(index, lane, seed ^ salt);
    const pushMark = (kind: BrushStudioV6MaterialMark["kind"], x: number, y: number,
      rx: number, ry: number, rotation: number, opacity: number, secondaryMix: number,
      height: number, shape: BrushStudioV6MaterialMark["shape"]): void => {
      if (marks.length >= markBudget || opacity < 0.00001) return;
      const resolvedMix = unit(secondaryMix);
      const baseColor = palette[Math.round(resolvedMix * 32)]!;
      const resolvedHeight = unit(height);
      const color = directionalRelief && resolvedHeight > 0
        ? shadeBrushStudioV7ReliefColor(baseColor, rotation, resolvedHeight, t.gloss)
        : baseColor;
      marks.push({ kind, shape, x, y, radiusX: Math.max(0.12, rx), radiusY: Math.max(0.12, ry),
        angle: rotation, opacity: unit(opacity), color, secondaryMix: resolvedMix, height: resolvedHeight });
    };
    const emit = (kind: BrushStudioV6MaterialMark["kind"], x: number, y: number, rx: number,
      ry: number, rotation: number, opacity: number, mix = 0, height = 0,
      shape: BrushStudioV6MaterialMark["shape"] = "ellipse"): void => {
      const sourceMix = unit(mix);
      const resolvedMix = smudgeAdapter
        ? unit(sourceMix * (1 - pickup) + smudgeMix * pickup)
        : sourceMix;
      pushMark(kind, x, y, rx, ry, rotation, opacity, resolvedMix, height, shape);
      if (smudgeAdapter) {
        const gathered = unit(sourceMix + random(37, 0x534d5544) * 0.28);
        smudgeMix = unit(smudgeMix * (0.86 + (1 - pickup) * 0.1) + gathered * pickup * 0.08);
      }
      if (motifTip && kind !== "pattern") {
        pushMark(
          "pattern",
          x,
          y,
          rx * 0.55,
          Math.max(0.12, ry * 0.16),
          rotation + Math.PI / 4,
          opacity * 0.72,
          unit(resolvedMix * 0.55 + 0.2),
          height * 0.6,
          "rect",
        );
      }
      if (!dualTip || kind === "pattern") return;
      const offset = Math.max(0.2, Math.min(Math.abs(rx), Math.abs(ry)) * 0.42);
      const secondaryRotation = rotation + 0.28;
      pushMark(kind, x - Math.sin(rotation) * offset, y + Math.cos(rotation) * offset,
        rx * 0.82, ry * 0.58, secondaryRotation, opacity * 0.62,
        unit(resolvedMix * 0.72 + 0.18), height * 0.75, shape);
    };

    if (topology) {
      topology.deposit({ x: point.x, y: point.y, radius, pressure, direction, index, directional,
        discontinuity: densityMultiplier > 1 }, (mark) => {
        const paper = sampleBrushStudioV6PaperContact(program.slots.surface, mark.x, mark.y, seed);
        paintBrushStudioV6TopologyPrimitive(program, mark, pressure, paper, finite(point.twist ?? 0), emit);
      });
      return;
    }

    if (program.slots.finish.includes("finish-neon") || luminousDeposit) {
      const lightScale = luminousDeposit ? 1.18 : 1;
      emit("ink", point.x, point.y, radius * 1.7, radius * 1.7, angle, alpha * 0.09 * lightScale, 1);
      emit("ink", point.x, point.y, radius * 1.3, radius * 1.3, angle, alpha * 0.15 * lightScale, 0.7);
    }
    if (physics.has("physics-thin-film") && index % 12 === 0) {
      const length = radius * unit(t.wetness) * Math.abs(t.gravity) * (1 + 3 * (1 - t.viscosity));
      emit("wet", point.x, point.y + Math.sign(t.gravity) * length, Math.max(0.3, radius * 0.12), length, 0, alpha * 0.5, 0.25);
    }

    if (patternId !== "pattern-none") {
      const scale = bounded(12 * t.patternScale, 3, 48);
      if (nativeVectorPattern) {
        const count = Math.max(2, Math.round(2 + t.patternDensity * 6));
        const textile = patternId === "pattern-textile-satin" || patternId === "pattern-textile-twill";
        for (let lane = 0; lane < count; lane++) {
          const lanePosition = lane / Math.max(1, count - 1) - 0.5;
          const probeX = point.x - Math.sin(direction) * lanePosition * radius * 1.7;
          const probeY = point.y + Math.cos(direction) * lanePosition * radius * 1.7;
          const turn = sampleBrushStudioV7VectorField(patternId, probeX, probeY, seed, t.patternScale, t.patternJitter);
          const length = scale * (0.32 + t.patternDensity * 0.68) * (textile ? 1.2 : 0.9);
          const thickness = Math.max(0.16, scale * (0.018 + t.patternDensity * 0.055));
          const height = textile ? unit(t.relief) * (0.28 + (lane % 3) * 0.1) : 0;
          emit("pattern", probeX, probeY, length, thickness, turn, alpha * (0.8 + t.patternDensity * 0.45),
            lane / Math.max(1, count - 1) * 0.42, height, "capsule");
          if (textile && lane % 2 === 0) {
            const crossTurn = turn + Math.PI / 2 + (patternId === "pattern-textile-twill" ? 0.22 : 0);
            emit("pattern", probeX, probeY, length * 0.56, thickness * 0.82, crossTurn,
              alpha * (0.48 + t.patternDensity * 0.32), 0.52, height * 0.72, "capsule");
          }
        }
      } else if (["pattern-dot-tone", "pattern-cross-hatch", "pattern-weave", "pattern-brick"].includes(patternId)) {
        const cells = Math.min(6, Math.ceil(radius / scale));
        const originX = Math.floor(point.x / scale);
        const originY = Math.floor(point.y / scale);
        for (let row = -cells; row <= cells; row++) for (let column = -cells; column <= cells; column++) {
          const cellX = originX + column;
          const cellY = originY + row;
          // Stable document-cell offsets preserve the same pattern through replay and event batching.
          const x = (cellX + 0.5 + (noise(cellX, cellY, seed + 101) - 0.5) * t.patternJitter * 0.7) * scale;
          const y = (cellY + 0.5 + (noise(cellX, cellY, seed + 103) - 0.5) * t.patternJitter * 0.7) * scale;
          if (Math.hypot(x - point.x, y - point.y) > radius) continue;
          const dot = patternId === "pattern-dot-tone";
          const lineRadius = scale * (0.01 + t.patternDensity * 0.12);
          emit("pattern", x, y, dot ? scale * (0.06 + t.patternDensity * 0.25) : scale * 0.6, dot ? scale * (0.06 + t.patternDensity * 0.25) : lineRadius, patternId === "pattern-brick" ? 0 : Math.PI / 4, alpha, 0, 0, dot ? "ellipse" : "rect");
          if (patternId === "pattern-weave") emit("pattern", x, y, scale * 0.6, lineRadius, -Math.PI / 4, alpha, 0.3, 0, "rect");
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
        const initialLoading = (0.25 + t.reservoir * 0.75) * (0.65 + noise(lane, 0, seed) * 0.35);
        if (!directional) {
          // A stationary nib leaves a seeded, round contact patch. Its unknown heading
          // must not initialize the strand positions later connected by the first movement.
          const turn = noise(lane, 79, seed) * TAU;
          const distance = radius * Math.sqrt(noise(lane, 83, seed)) * 0.8;
          const thickness = Math.max(0.18, size / laneCount * (0.35 + pressure * 0.45 + t.viscosity * 0.2))
            * (1 + initialLoading * unit(t.relief) * 0.6);
          emit("bristle", point.x + Math.cos(turn) * distance, point.y + Math.sin(turn) * distance,
            thickness, thickness, 0, alpha * pressure * initialLoading * 5,
            noise(lane, 19, seed) * pickup, initialLoading * t.relief);
          continue;
        }
        const bundle = splitMerge ? sampleBrushStudioV7BristleBundle({
          lane, laneCount, pathLength: index * step, size, seed, pressure, friction: t.friction, viscosity: t.viscosity,
        }) : null;
        const strandSpacing = (noise(lane, 61, seed) - 0.5) * radius / laneCount;
        const splay = lanePosition * radius * (0.6 + pressure * 0.55) * (bundle?.splayGain ?? 1) + strandSpacing;
        // Real bundles have unequal strand lengths and stiffness. Fixed per-lane
        // offsets stagger contact joints without frame/event dependent jitter.
        const strandLength = (noise(lane, 67, seed) - 0.5) * size * 0.22;
        const response = 1 - Math.exp(-step / (compliance * (0.6 + noise(lane, 71, seed) * 0.85)));
        const targetX = point.x + normalX * splay + Math.cos(direction) * strandLength;
        const targetY = point.y + normalY * splay + Math.sin(direction) * strandLength;
        if (!initializedBristles) { laneX[lane] = targetX; laneY[lane] = targetY; reservoir[lane] = initialLoading; }
        const previousX = laneX[lane]!;
        const previousY = laneY[lane]!;
        laneX[lane] = previousX + (targetX - previousX) * response;
        laneY[lane] = previousY + (targetY - previousY) * response;
        const loading = reservoir[lane]!;
        const loss = loading * (1 - Math.exp(-step * (0.08 + t.friction * 0.2) / size));
        const refill = (1 - loading) * pickup * step / (size * 12);
        reservoir[lane] = unit(loading - loss + refill);
        const paper = sampleBrushStudioV6PaperContact(program.slots.surface, laneX[lane]!, laneY[lane]!, seed);
        const contact = Math.max(0, pressure - Math.abs(lanePosition) * 0.18 - paper * t.surfaceTooth * 0.12);
        // Loaded paint forms a wider raised ridge. Encode that relief in the actual
        // shared contact geometry, so both Canvas and SVG show the same contribution.
        const thickness = Math.max(0.18, size / laneCount * (0.35 + contact * 0.45 + t.viscosity * 0.2) * (0.7 + noise(lane, 7, seed) * 0.6))
          * (1 + loading * unit(t.relief) * 0.6) * (bundle?.widthGain ?? 1);
        const travelX = laneX[lane]! - previousX;
        const travelY = laneY[lane]! - previousY;
        const travel = Math.hypot(travelX, travelY);
        const travelAngle = travel > 0.0001 ? Math.atan2(travelY, travelX) : direction;
        const centerX = (previousX + laneX[lane]!) * 0.5;
        const centerY = (previousY + laneY[lane]!) * 0.5;
        emit("bristle", centerX, centerY, travel * 0.5 + thickness, thickness, travelAngle,
          alpha * contact * loading * 5, noise(lane, 19, seed) * pickup, loading * t.relief, "capsule");
        if (bundle && bundle.branchOpacity > 0.08 && lane % 3 === 0) {
          const branchAngle = travelAngle + (noise(lane, index, seed ^ 0x4252414e) - 0.5) * 0.22 * bundle.split;
          const branchThickness = thickness * (0.5 + bundle.split * 0.28);
          emit("bristle", centerX + normalX * bundle.branchOffset, centerY + normalY * bundle.branchOffset,
            travel * 0.42 + branchThickness, branchThickness, branchAngle,
            alpha * contact * loading * bundle.branchOpacity * 3.2,
            unit(noise(lane, 29, seed) * pickup + bundle.split * 0.12), loading * t.relief * 0.72, "capsule");
        }
      }
      if (directional) initializedBristles = true;
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
        const surfaceContact = sampleBrushStudioV7SurfaceContact(program.slots.surface,
          Math.floor(x / cellSize) * cellSize, Math.floor(y / cellSize) * cellSize, seed);
        const tooth = surfaceContact.tooth;
        const contact = unit((pressure - tooth * t.surfaceTooth * 0.85) * 2);
        const charcoal = program.slots.pickup !== "pickup-none";
        const advancedSurface = isBrushStudioV7AdvancedSurface(program.slots.surface);
        const grainAngle = advancedSurface
          ? angle + Math.sin(surfaceContact.fiberAngle - angle) * surfaceContact.anisotropy * 0.72
          : angle;
        const major = advancedSurface ? 1 + surfaceContact.anisotropy * 0.9 : 1;
        const minor = advancedSurface ? 1 - surfaceContact.anisotropy * 0.42 : 1;
        emit("grain", x, y, cellSize * (charcoal ? 1.4 : 0.7) * major,
          cellSize * (charcoal ? 0.65 : 0.32) * minor, grainAngle,
          alpha * contact * (charcoal ? 1.8 : 1.2), 0);
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
      const advancedSurface = isBrushStudioV7AdvancedSurface(program.slots.surface);
      const surfaceContact = sampleBrushStudioV7SurfaceContact(program.slots.surface, point.x, point.y, seed);
      const ridgeAngle = advancedSurface
        ? angle + Math.sin(surfaceContact.fiberAngle - angle) * surfaceContact.anisotropy * 0.34
        : angle;
      const drag = advancedSurface ? 0.78 + (1 - surfaceContact.tooth) * 0.32 : 1;
      const reliefGain = advancedSurface ? 0.82 + surfaceContact.tooth * 0.36 : 1;
      emit("relief", point.x, point.y, radius * drag, radius * (0.16 + t.plasticity * 0.24),
        ridgeAngle, alpha * load * reliefGain, 0, t.relief * load * reliefGain, "rect");
      for (let lane = -2; lane <= 2; lane++) {
        const offset = lane * radius * 0.13;
        emit("relief", point.x - Math.sin(ridgeAngle) * offset, point.y + Math.cos(ridgeAngle) * offset,
          radius * 0.9 * drag, Math.max(0.2, radius * 0.025), ridgeAngle,
          alpha * t.relief * (lane % 2 ? 0.8 : 0.3) * reliefGain, lane % 2 ? 0.4 : 0.1, t.relief, "rect");
      }
      if (directionalRelief) {
        for (let lane = -2; lane <= 2; lane++) {
          const phase = noise(index, lane + 5, seed ^ 0x52414b45) - 0.5;
          const offset = (lane + phase * 0.42) * radius * 0.105;
          const ridgeTurn = ridgeAngle + phase * 0.16 + Math.sin(index * 0.37 + lane) * 0.035;
          const ridgeHeight = unit(t.relief) * (0.48 + Math.abs(lane) * 0.08 + noise(index, lane + 11, seed) * 0.24);
          emit("relief", point.x - Math.sin(ridgeAngle) * offset, point.y + Math.cos(ridgeAngle) * offset,
            radius * (0.62 + noise(index, lane + 19, seed) * 0.24) * drag,
            Math.max(0.16, radius * (0.012 + unit(t.gloss) * 0.018)), ridgeTurn,
            alpha * (0.18 + unit(t.gloss) * 0.34) * reliefGain, lane % 2 === 0 ? 0.08 : 0.5, ridgeHeight, "capsule");
        }
      }
      return;
    }

    if (wet) {
      const advancedSurface = isBrushStudioV7AdvancedSurface(program.slots.surface);
      const surfaceContact = sampleBrushStudioV7SurfaceContact(program.slots.surface,
        Math.floor(point.x / 2) * 2, Math.floor(point.y / 2) * 2, seed);
      const absorbency = unit(t.absorbency);
      const effectiveAbsorbency = advancedSurface
        ? unit(absorbency * (0.58 + surfaceContact.localAbsorbency * 0.72))
        : absorbency;
      const spread = 1 + t.diffusion * t.wetness * (0.3 + effectiveAbsorbency * 0.8);
      if (advancedSurface) {
        const capillary = surfaceContact.anisotropy * t.diffusion * t.wetness * 0.34;
        emit("wet", point.x, point.y, radius * spread * (1 + capillary),
          radius * spread * (1 - capillary * 0.58), surfaceContact.fiberAngle,
          alpha * t.wetness * 0.24, 0.25);
      } else {
        emit("wet", point.x, point.y, radius * spread, radius * spread, angle, alpha * t.wetness * 0.24, 0.25);
      }
      const tooth = surfaceContact.tooth;
      const resist = physics.has("physics-dry-contact") ? unit((tooth - t.surfaceTooth * 0.5) * 3) : 1;
      const bodyAngle = advancedSurface
        ? angle + Math.sin(surfaceContact.fiberAngle - angle) * surfaceContact.anisotropy * 0.48
        : angle;
      const bodyAspect = chisel ? 0.38 : advancedSurface ? 1 - surfaceContact.anisotropy * 0.16 : 1;
      emit("wet", point.x, point.y, radius, radius * bodyAspect, bodyAngle,
        alpha * (0.55 + tooth * t.granulation * 0.5) * resist, t.granulation * tooth * 0.35);
      if (backrun && directional) {
        const lobes = sampleBrushStudioV7BackrunLobes({
          x: point.x, y: point.y, radius, direction, index, seed, wetness: t.wetness, diffusion: t.diffusion,
          absorbency: effectiveAbsorbency, evaporation: t.evaporation, advection: t.advection,
          fiberAngle: surfaceContact.fiberAngle, anisotropy: surfaceContact.anisotropy, tooth,
        });
        lobes.forEach((lobe, lobeIndex) => emit("wet", lobe.x, lobe.y, lobe.radiusX, lobe.radiusY,
          lobe.angle, alpha * lobe.opacity * 3.4, lobe.mix, 0, lobeIndex % 2 === 0 ? "ring" : "ellipse"));
      }
      if (sedimentation) {
        const sediment = sampleBrushStudioV7Sediment({
          x: point.x, y: point.y, radius, index, seed, granulation: t.granulation,
          absorbency: effectiveAbsorbency, tooth, fiberAngle: surfaceContact.fiberAngle, anisotropy: surfaceContact.anisotropy,
        });
        for (const grain of sediment) emit("grain", grain.x, grain.y, grain.radiusX, grain.radiusY,
          grain.angle, alpha * grain.opacity * 4.2, grain.mix, 0, "ellipse");
      }
      const normalX = -Math.sin(direction);
      const normalY = Math.cos(direction);
      if (wetSheen) {
        emit(
          "wet",
          point.x - normalX * radius * 0.16,
          point.y - normalY * radius * 0.16,
          radius * 0.72,
          Math.max(0.16, radius * 0.16),
          direction,
          alpha * unit(t.wetness) * 0.2,
          0.82,
          0,
          "ellipse",
        );
      }
      if (chromaFringe && directional) {
        const fringe = radius * spread * (0.08 + unit(t.diffusion) * 0.12);
        emit(
          "wet",
          point.x + normalX * fringe,
          point.y + normalY * fringe,
          radius * 1.05,
          Math.max(0.18, radius * 0.2),
          direction,
          alpha * 0.13,
          1,
          0,
          "capsule",
        );
        emit(
          "wet",
          point.x - normalX * fringe,
          point.y - normalY * fringe,
          radius,
          Math.max(0.18, radius * 0.16),
          direction,
          alpha * 0.08,
          0.42,
          0,
          "capsule",
        );
      }
      if (program.slots.finish.includes("finish-edge-bloom")
        && t.edgeDarkening > 0 && directional) {
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
    const advancedSurface = isBrushStudioV7AdvancedSurface(program.slots.surface);
    if (advancedSurface) {
      const surfaceContact = sampleBrushStudioV7SurfaceContact(program.slots.surface, point.x, point.y, seed);
      const fiberInfluence = surfaceContact.anisotropy * (marker ? 0.24 : 0.1);
      const contactAngle = angle + Math.sin(surfaceContact.fiberAngle - angle) * fiberInfluence;
      const bleed = marker ? 1 + surfaceContact.localAbsorbency * unit(t.absorbency) * 0.2 : 1;
      const toothGain = 1 - surfaceContact.tooth * unit(t.surfaceTooth) * 0.14;
      const aspect = chisel ? 0.28 + tilt * 0.2 : 1 - surfaceContact.anisotropy * 0.09;
      emit("ink", point.x, point.y, radius * bleed, radius * aspect, contactAngle,
        alpha * (marker ? 0.65 : 1) * toothGain, 0, 0, chisel ? "rect" : "ellipse");
      if (marker && t.edgeDarkening > 0) {
        emit("ink", point.x, point.y, radius * bleed, radius * 0.42, contactAngle,
          alpha * t.edgeDarkening * (0.82 + surfaceContact.localAbsorbency * 0.24), 0, 0, "ring");
      }
    } else {
      emit("ink", point.x, point.y, radius, radius * (chisel ? 0.28 + tilt * 0.2 : 1), angle, alpha * (marker ? 0.65 : 1), 0, 0, chisel ? "rect" : "ellipse");
      if (marker && t.edgeDarkening > 0) emit("ink", point.x, point.y, radius, radius * 0.42, angle, alpha * t.edgeDarkening, 0, 0, "ring");
    }
  }

  return {
    push(input): readonly BrushStudioV6MaterialMark[] {
      if (![input.x, input.y, input.pressure].every(Number.isFinite)) return [];
      const point = { ...input, pressure: unit(input.pressure), tilt: unit(input.tilt ?? 0), twist: finite(input.twist ?? 0) };
      const marks: BrushStudioV6MaterialMark[] = [];
      if (!previous) { deposit(point, 0, marks, 1, false); previous = point; emittedMarks += marks.length; return marks; }
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
    reset(): void { topology?.reset(); previous = null; remaining = step; pathLength = 0; emittedMarks = 0; dabIndex = 0; clippedDabs = 0; initializedBristles = false; initializedWetEdges = false; smudgeMix = 0; },
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
