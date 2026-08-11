/**
 * Product render boundary for the deterministic wet-ink field.
 *
 * This module deliberately sits between immutable DrawEl snapshots and Canvas/Konva. Planning is
 * renderer-neutral and performs the complete fixed-clock deposition/simulation/upload pass before
 * a destination is touched. Rendering then prepares every tile off-destination, rechecks
 * visibility/abort/revision authority, and applies the element opacity exactly once.
 *
 * Only explicitly versioned, causal `watercolor` and `ink-wash` snapshots opt in. Legacy
 * watercolor, gouache, erasers, shapes, malformed imports and every budget failure return an exact
 * fallback result so StudioDrawNode can retain its frozen dab renderer.
 */

import {
  mapStudioBrushAliasPressureSamples,
  resolveStudioBrushAliasWatercolorPlanSettings,
} from "./studio-brush-alias-profile";
import { watercolorBrushSeedFromKey } from "./studio-watercolor-brush";
import { parseStudioGpuColor } from "./studio-webgpu-color";
import {
  createStudioWetInkField,
  depositStudioWetInkStroke,
  planStudioWetInkTileUploads,
  simulateStudioWetInkField,
  studioWetInkFieldDigest,
  type StudioWetInkTileUpload,
} from "./studio-wet-ink-field";

import type { DrawEl } from "./studio-element-model";

export const STUDIO_WET_INK_BRUSH_RUNTIME_VERSION =
  "wet-ink-brush-runtime-v1" as const;
export const STUDIO_WET_INK_BRUSH_FIELD_SCALE = 4;
export const STUDIO_WET_INK_BRUSH_FIXED_RATE_HZ = 240;
export const STUDIO_WET_INK_BRUSH_SIMULATION_STEPS = 16;
export const STUDIO_WET_INK_BRUSH_SURFACE_BYTE_BUDGET = 64 * 1024 * 1024;

const STUDIO_WET_INK_BRUSH_MAX_PHYSICAL_SCALE =
  STUDIO_WET_INK_BRUSH_FIELD_SCALE;
const STUDIO_WET_INK_BRUSH_MAX_DABS = 4_096;
const STUDIO_WET_INK_BRUSH_MAX_TILES = 4_096;
const STUDIO_WET_INK_BRUSH_MAX_CELLS = 4_194_304;
const STUDIO_WET_INK_BRUSH_MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const STUDIO_WET_INK_BRUSH_MAX_COORDINATE_ABS = 1_000_000;
const STUDIO_WET_INK_BRUSH_MAX_POINT_COUNT = 65_536;
const REVISION_HASH_OFFSET = 0x811c9dc5;
const REVISION_HASH_PRIME = 0x01000193;

export type StudioWetInkBrushId =
  | "watercolor"
  | "ink-wash"
  | "inkwash-pen"
  | "inkwash-water-brush"
  | "inkwash-bleed-wash"
  | "inkwash-white-ink";
export type StudioWetInkBrushReplayPhase = "live" | "committed";

export interface StudioWetInkBrushReplayOptions {
  /**
   * Phase is diagnostic only. It is intentionally excluded from the physical plan so the same
   * immutable snapshot has the same seed, field version and digest on both sides of handoff.
   */
  readonly phase: StudioWetInkBrushReplayPhase;
}

export type StudioWetInkBrushPlanFallbackReason =
  | "unsupported-snapshot"
  | "invalid-geometry"
  | "invalid-style"
  | "invalid-color"
  | "field-budget"
  | "deposition-budget"
  | "simulation-budget"
  | "upload-budget";

export interface StudioWetInkBrushReplayPlan {
  readonly runtimeVersion: typeof STUDIO_WET_INK_BRUSH_RUNTIME_VERSION;
  readonly phase: StudioWetInkBrushReplayPhase;
  readonly brushId: StudioWetInkBrushId;
  readonly strokeId: string;
  readonly revision: number;
  readonly seed: number;
  readonly fieldDigest: string;
  /** Fixed physical field samples per document pixel. */
  readonly fieldScale: typeof STUDIO_WET_INK_BRUSH_FIELD_SCALE;
  /** Document-space origin corresponding to field coordinate (0, 0). */
  readonly originX: number;
  readonly originY: number;
  /** Element opacity × embedded CSS color alpha; neither is baked into tile alpha. */
  readonly compositeOpacity: number;
  readonly uploads: readonly StudioWetInkTileUpload[];
  readonly allocatedCells: number;
  readonly simulationSteps: number;
}

export interface StudioInkwashAbsorptionSpectrum {
  readonly name: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const STUDIO_INKWASH_SPECTRA_PRESETS: Readonly<Record<string, StudioInkwashAbsorptionSpectrum>> = Object.freeze({
  "sumi-black": { name: "수묵 먹빛 (Sumi Black)", r: 1.0, g: 0.96, b: 0.88 },
  "indigo-wash": { name: "인디고 수채 (Indigo Wash)", r: 0.2, g: 0.6, b: 1.0 },
  "sepia-ink": { name: "세피아 잉크 (Sepia Ink)", r: 0.9, g: 0.6, b: 0.3 },
  "vermilion-red": { name: "주홍 연지 (Vermilion Red)", r: 1.0, g: 0.25, b: 0.15 },
  "cobalt-blue": { name: "코발트 블루 (Cobalt Blue)", r: 0.1, g: 0.45, b: 0.95 },
  "forest-green": { name: "녹송 수묵 (Forest Green)", r: 0.2, g: 0.75, b: 0.35 },
  "plum-blossom": { name: "매화 자홍 (Plum Blossom Ink)", r: 0.85, g: 0.2, b: 0.55 },
  "pine-smoke": { name: "송묵 연묵 (Pine Smoke Ink)", r: 0.98, g: 0.95, b: 0.90 },
  "bamboo-green": { name: "청죽 먹빛 (Bamboo Ink)", r: 0.25, g: 0.72, b: 0.45 },
  "autumn-gold": { name: "추황 묵빛 (Autumn Gold Ink)", r: 0.88, g: 0.65, b: 0.18 },
  "mineral-azurite": { name: "석청 藍 (Mineral Azurite)", r: 0.15, g: 0.38, b: 0.88 },
  "white-highlight": { name: "화이트 하이라이트 (White Ink)", r: -1.0, g: -1.0, b: -1.0 },
});

export interface StudioWetInkBrushPhysicalMaterial {
  readonly absorption: number;
  readonly bleed: number;
  readonly chromatography?: number;
  readonly dryingRate: number;
  readonly edgeDarkening: number;
  readonly fixationRate: number;
  readonly granulation: number;
  readonly hardness: number;
  readonly paperRoughness: number;
  readonly pigmentLoad: number;
  readonly waterLoad: number;
  readonly wetnessLoad: number;
  readonly spectralAbsorption?: StudioInkwashAbsorptionSpectrum;
}

/**
 * Immutable physical recipe shared by the append-only live overlay and committed replay. Point
 * geometry is intentionally absent: a live owner can consume only the unseen suffix without
 * changing seed, material, opacity or the authoritative 4x field contract.
 */
export interface StudioWetInkBrushPhysicalRecipe {
  readonly runtimeVersion: typeof STUDIO_WET_INK_BRUSH_RUNTIME_VERSION;
  readonly brushId: StudioWetInkBrushId;
  readonly strokeId: string;
  readonly seed: number;
  readonly fieldScale: typeof STUDIO_WET_INK_BRUSH_FIELD_SCALE;
  readonly baseWidth: number;
  readonly spacing: number;
  readonly compositeOpacity: number;
  readonly inkColor: {
    readonly r: number;
    readonly g: number;
    readonly b: number;
  };
  readonly material: StudioWetInkBrushPhysicalMaterial;
}

export type StudioWetInkBrushReplayPlanResult =
  | {
      readonly ok: true;
      readonly value: StudioWetInkBrushReplayPlan;
    }
  | {
      readonly ok: false;
      readonly reason: StudioWetInkBrushPlanFallbackReason;
      readonly detail: string;
    };

export interface StudioWetInkBrushDestinationContext {
  globalAlpha: number;
  save(): void;
  restore(): void;
  drawImage(
    image: CanvasImageSource,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    destinationX: number,
    destinationY: number,
    destinationWidth: number,
    destinationHeight: number,
  ): void;
  /** Konva wraps its native Canvas context here. */
  _context?: Pick<CanvasRenderingContext2D, "getTransform">;
  getTransform?: () => DOMMatrix;
}

export interface StudioWetInkBrushSurfaceContext {
  createImageData(width: number, height: number): ImageData;
  putImageData(imageData: ImageData, destinationX: number, destinationY: number): void;
}

export type StudioWetInkBrushSurface = CanvasImageSource & {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: CanvasRenderingContext2DSettings,
  ): StudioWetInkBrushSurfaceContext | null;
};

export type StudioWetInkBrushSurfaceFactory = (
  width: number,
  height: number,
) => StudioWetInkBrushSurface | null;

export interface StudioWetInkBrushRenderOptions {
  readonly surfaceFactory?: StudioWetInkBrushSurfaceFactory;
  readonly maximumSurfaceBytes?: number;
  readonly signal?: Pick<AbortSignal, "aborted"> | null;
  readonly hidden?: boolean | (() => boolean);
  /**
   * An async/live owner can retain the plan revision and expose its current revision. Both are
   * checked before allocation and again immediately before the first destination draw.
   */
  readonly expectedRevision?: number;
  readonly currentRevision?: number | (() => number);
}

export type StudioWetInkBrushRenderResult =
  | {
      readonly status: "rendered";
      readonly fieldDigest: string;
      readonly nativeScale: number;
      readonly tileCount: number;
      readonly surfaceBytes: number;
    }
  | {
      readonly status: "empty";
      readonly fieldDigest: string;
    }
  | {
      readonly status: "skipped";
      readonly reason: "hidden" | "aborted" | "stale-revision";
    }
  | {
      readonly status: "fallback";
      readonly reason:
        | "native-scale-unsupported"
        | "surface-budget"
        | "surface-unavailable"
        | "surface-preparation-failed";
    }
  | {
      readonly status: "partial";
      readonly reason: "destination-composite-failed";
    };

interface WetInkGeometry {
  readonly originCellX: number;
  readonly originCellY: number;
  readonly width: number;
  readonly height: number;
  readonly samples: readonly {
    readonly x: number;
    readonly y: number;
    readonly pressure: number;
    readonly timeMs: number;
  }[];
}

interface PreparedUpload {
  readonly upload: StudioWetInkTileUpload;
  readonly surface: StudioWetInkBrushSurface;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Math.abs(value) <= STUDIO_WET_INK_BRUSH_MAX_COORDINATE_ABS;
}

function exactWetInkBrushId(value: unknown): StudioWetInkBrushId | null {
  return value === "watercolor"
    || value === "ink-wash"
    || value === "inkwash-pen"
    || value === "inkwash-water-brush"
    || value === "inkwash-bleed-wash"
    || value === "inkwash-white-ink"
    ? (value as StudioWetInkBrushId)
    : null;
}

/**
 * Public rollout gate. A family match is insufficient: legacy documents and aliases remain on
 * their exact historical renderer unless the stored causal watercolor pipeline explicitly opts in.
 */
export function studioWetInkBrushRuntimeSupportsElement(
  element: DrawEl,
): boolean {
  return element.type === "draw"
    && (element.kind ?? "freehand") === "freehand"
    && element.mode !== "eraser"
    && exactWetInkBrushId(element.brush) !== null
    && element.watercolorPipeline === "causal-walker-v2";
}

function planFailure(
  reason: StudioWetInkBrushPlanFallbackReason,
  detail: string,
): StudioWetInkBrushReplayPlanResult {
  return { ok: false, reason, detail };
}

function hashRevisionNumber(hash: number, value: number): number {
  if (!Number.isFinite(value)) return Math.imul(hash ^ 0xff, REVISION_HASH_PRIME) >>> 0;
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  let next = hash;
  for (const byte of bytes) next = Math.imul(next ^ byte, REVISION_HASH_PRIME) >>> 0;
  return next;
}

function hashRevisionText(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    next = Math.imul(next ^ (code & 0xff), REVISION_HASH_PRIME) >>> 0;
    next = Math.imul(next ^ (code >>> 8), REVISION_HASH_PRIME) >>> 0;
  }
  return next;
}

function snapshotRevision(element: DrawEl): number {
  let hash = REVISION_HASH_OFFSET;
  hash = hashRevisionText(hash, STUDIO_WET_INK_BRUSH_RUNTIME_VERSION);
  hash = hashRevisionText(hash, element.id);
  hash = hashRevisionText(hash, element.brush ?? "");
  hash = hashRevisionText(hash, element.stroke);
  hash = hashRevisionNumber(hash, element.strokeWidth);
  for (const value of element.points) hash = hashRevisionNumber(hash, value);
  for (const value of element.pressures ?? []) hash = hashRevisionNumber(hash, value);
  return hash >>> 0;
}

function wetInkGeometry(
  element: DrawEl,
  baseWidth: number,
  pressures: readonly number[],
): WetInkGeometry | null {
  if (
    !Array.isArray(element.points)
    || element.points.length < 2
    || element.points.length % 2 !== 0
  ) return null;
  const pointCount = element.points.length / 2;
  if (
    !Number.isSafeInteger(pointCount)
    || pointCount < 1
    || pointCount > STUDIO_WET_INK_BRUSH_MAX_POINT_COUNT
  ) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < pointCount; index += 1) {
    const x = element.points[index * 2];
    const y = element.points[index * 2 + 1];
    if (!finiteCoordinate(x) || !finiteCoordinate(y)) return null;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const scale = STUDIO_WET_INK_BRUSH_FIELD_SCALE;
  const radiusCells = Math.ceil(baseWidth * scale * 0.72);
  const marginCells = Math.max(
    scale * 2,
    radiusCells + STUDIO_WET_INK_BRUSH_SIMULATION_STEPS + 2,
  );
  const originCellX = Math.floor(minX * scale) - marginCells;
  const originCellY = Math.floor(minY * scale) - marginCells;
  const maximumCellX = Math.ceil(maxX * scale) + marginCells;
  const maximumCellY = Math.ceil(maxY * scale) + marginCells;
  const width = maximumCellX - originCellX + 1;
  const height = maximumCellY - originCellY + 1;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || width > STUDIO_WET_INK_BRUSH_MAX_COORDINATE_ABS
    || height > STUDIO_WET_INK_BRUSH_MAX_COORDINATE_ABS
    || !Number.isSafeInteger(width * height)
  ) return null;

  const interval = 1_000 / STUDIO_WET_INK_BRUSH_FIXED_RATE_HZ;
  const samples = Array.from({ length: pointCount }, (_, index) => ({
    x: element.points[index * 2]! * scale - originCellX,
    y: element.points[index * 2 + 1]! * scale - originCellY,
    pressure: clamp01(pressures[index] ?? 0.55),
    timeMs: index * interval,
  }));
  return { originCellX, originCellY, width, height, samples };
}

function fieldMaterial(
  brushId: StudioWetInkBrushId,
): StudioWetInkBrushPhysicalMaterial {
  if (brushId === "inkwash-water-brush") {
    return {
      absorption: 0.005,
      bleed: 0.52,
      dryingRate: 0.022,
      edgeDarkening: 0.25,
      fixationRate: 0.04,
      granulation: 0.35,
      hardness: 0.2,
      paperRoughness: 0.45,
      pigmentLoad: 0.05,
      waterLoad: 1.5,
      wetnessLoad: 1.5,
      spectralAbsorption: STUDIO_INKWASH_SPECTRA_PRESETS["indigo-wash"],
    };
  }
  if (brushId === "inkwash-bleed-wash") {
    return {
      absorption: 0.032,
      bleed: 0.48,
      dryingRate: 0.028,
      edgeDarkening: 0.75,
      fixationRate: 0.12,
      granulation: 0.72,
      hardness: 0.38,
      paperRoughness: 0.8,
      pigmentLoad: 1.25,
      waterLoad: 1.2,
      wetnessLoad: 1.25,
      spectralAbsorption: STUDIO_INKWASH_SPECTRA_PRESETS["sumi-black"],
    };
  }
  if (brushId === "inkwash-pen") {
    return {
      absorption: 0.04,
      bleed: 0.22,
      dryingRate: 0.05,
      edgeDarkening: 0.82,
      fixationRate: 0.25,
      granulation: 0.25,
      hardness: 0.75,
      paperRoughness: 0.5,
      pigmentLoad: 1.4,
      waterLoad: 0.4,
      wetnessLoad: 0.45,
      spectralAbsorption: STUDIO_INKWASH_SPECTRA_PRESETS["sumi-black"],
    };
  }
  if (brushId === "inkwash-white-ink") {
    return {
      absorption: 0.015,
      bleed: 0.28,
      dryingRate: 0.04,
      edgeDarkening: 0.35,
      fixationRate: 0.2,
      granulation: 0.3,
      hardness: 0.5,
      paperRoughness: 0.5,
      pigmentLoad: 1.2,
      waterLoad: 0.6,
      wetnessLoad: 0.65,
      spectralAbsorption: STUDIO_INKWASH_SPECTRA_PRESETS["white-highlight"],
    };
  }
  if (brushId === "ink-wash") {
    return {
      // Competitive sumi: stronger wet-edge ring, denser core pigment, and tooth-aware granulation
      // that stays materially distinct from soft watercolor (lower bleed, flatter edge).
      absorption: 0.034,
      bleed: 0.46,
      dryingRate: 0.038,
      edgeDarkening: 0.82,
      fixationRate: 0.132,
      granulation: 0.74,
      hardness: 0.52,
      paperRoughness: 0.8,
      pigmentLoad: 1.34,
      waterLoad: 0.86,
      wetnessLoad: 0.94,
      spectralAbsorption: STUDIO_INKWASH_SPECTRA_PRESETS["sumi-black"],
    };
  }
  return {
    absorption: 0.021,
    bleed: 0.34,
    dryingRate: 0.034,
    edgeDarkening: 0.46,
    fixationRate: 0.112,
    granulation: 0.4,
    hardness: 0.3,
    paperRoughness: 0.54,
    pigmentLoad: 0.76,
    waterLoad: 0.98,
    wetnessLoad: 0.96,
    spectralAbsorption: STUDIO_INKWASH_SPECTRA_PRESETS["indigo-wash"],
  };
}

export function resolveStudioWetInkBrushPhysicalRecipe(
  element: DrawEl,
): StudioWetInkBrushPhysicalRecipe | null {
  if (
    !studioWetInkBrushRuntimeSupportsElement(element)
    || typeof element.id !== "string"
    || element.id.length === 0
    || !Number.isFinite(element.strokeWidth)
    || element.strokeWidth <= 0
    || !Number.isFinite(element.opacity ?? 1)
  ) {
    return null;
  }
  const brushId = exactWetInkBrushId(element.brush);
  const parsedColor = parseStudioGpuColor(element.stroke);
  const aliasSettings = resolveStudioBrushAliasWatercolorPlanSettings(
    brushId,
    element.strokeWidth,
  );
  if (!brushId || !parsedColor || !aliasSettings) return null;
  return {
    runtimeVersion: STUDIO_WET_INK_BRUSH_RUNTIME_VERSION,
    brushId,
    strokeId: element.id,
    seed: watercolorBrushSeedFromKey(
      `${element.id}:${STUDIO_WET_INK_BRUSH_RUNTIME_VERSION}`,
    ),
    fieldScale: STUDIO_WET_INK_BRUSH_FIELD_SCALE,
    baseWidth: aliasSettings.baseWidth,
    spacing: aliasSettings.spacing,
    compositeOpacity: clamp01(element.opacity ?? 1) * clamp01(parsedColor[3]),
    inkColor: {
      r: Math.round(parsedColor[0] * 255),
      g: Math.round(parsedColor[1] * 255),
      b: Math.round(parsedColor[2] * 255),
    },
    material: fieldMaterial(brushId),
  };
}

/**
 * Builds the authoritative renderer-neutral replay. `phase` is carried for diagnostics but cannot
 * alter any physical input, which makes live/committed digest parity mechanically testable.
 */
export function planStudioWetInkBrushReplay(
  element: DrawEl,
  options: StudioWetInkBrushReplayOptions,
): StudioWetInkBrushReplayPlanResult {
  if (!studioWetInkBrushRuntimeSupportsElement(element)) {
    return planFailure(
      "unsupported-snapshot",
      "Only causal watercolor and ink-wash freehand snapshots opt into wet ink.",
    );
  }
  const brushId = exactWetInkBrushId(element.brush)!;
  if (
    typeof element.id !== "string"
    || element.id.length === 0
    || !Number.isFinite(element.strokeWidth)
    || element.strokeWidth <= 0
    || !Number.isFinite(element.opacity ?? 1)
  ) {
    return planFailure("invalid-style", "Wet-ink stroke style is invalid.");
  }
  const parsedColor = parseStudioGpuColor(element.stroke);
  if (!parsedColor) {
    return planFailure("invalid-color", "Wet-ink stroke color is unsupported.");
  }
  const recipe = resolveStudioWetInkBrushPhysicalRecipe(element);
  if (!recipe) {
    return planFailure("invalid-style", "Wet-ink physical material is unavailable.");
  }
  const pointCount = Math.floor(element.points.length / 2);
  const aliasSettings = resolveStudioBrushAliasWatercolorPlanSettings(
    brushId,
    element.strokeWidth,
  );
  if (!aliasSettings) {
    return planFailure("invalid-style", "Wet-ink alias material is unavailable.");
  }
  const pressures = mapStudioBrushAliasPressureSamples(
    brushId,
    element.pressures,
    pointCount,
    0.55,
  );
  const geometry = wetInkGeometry(element, aliasSettings.baseWidth, pressures);
  if (!geometry) {
    return planFailure("invalid-geometry", "Wet-ink stroke geometry is invalid or too large.");
  }

  const seed = recipe.seed;
  const material = recipe.material;
  const field = createStudioWetInkField({
    width: geometry.width,
    height: geometry.height,
    tileSize: 64,
    seed,
    maxTiles: STUDIO_WET_INK_BRUSH_MAX_TILES,
    maxCells: STUDIO_WET_INK_BRUSH_MAX_CELLS,
    maxSimulationSteps: 256,
    maxUploadBytes: STUDIO_WET_INK_BRUSH_MAX_UPLOAD_BYTES,
    absorption: material.absorption,
    bleed: material.bleed,
    chromatography: material.chromatography,
    dryingRate: material.dryingRate,
    edgeDarkening: material.edgeDarkening,
    fixationRate: material.fixationRate,
    granulation: material.granulation,
    paperRoughness: material.paperRoughness,
    inkColor: recipe.inkColor,
    spectralAbsorption: material.spectralAbsorption,
  });
  if (!field.ok) return planFailure("field-budget", field.reason);

  const deposited = depositStudioWetInkStroke(field.value, {
    samples: geometry.samples,
    radius: aliasSettings.baseWidth * STUDIO_WET_INK_BRUSH_FIELD_SCALE / 2,
    hardness: material.hardness,
    spacing: aliasSettings.spacing * STUDIO_WET_INK_BRUSH_FIELD_SCALE,
    waterLoad: material.waterLoad,
    pigmentLoad: material.pigmentLoad,
    wetnessLoad: material.wetnessLoad,
    seed,
    maxDabs: STUDIO_WET_INK_BRUSH_MAX_DABS,
    normalization: {
      fixedRateHz: STUDIO_WET_INK_BRUSH_FIXED_RATE_HZ,
      coordinateQuantum: 1 / 4_096,
    },
  });
  if (!deposited.ok) {
    return planFailure(
      deposited.code === "dab-budget-exceeded"
        ? "deposition-budget"
        : "field-budget",
      deposited.reason,
    );
  }
  const simulated = simulateStudioWetInkField(
    field.value,
    STUDIO_WET_INK_BRUSH_SIMULATION_STEPS,
  );
  if (!simulated.ok) {
    return planFailure(
      simulated.code === "step-budget-exceeded"
        ? "simulation-budget"
        : "field-budget",
      simulated.reason,
    );
  }
  const uploads = planStudioWetInkTileUploads(field.value);
  if (!uploads.ok) {
    return planFailure(
      uploads.code === "upload-budget-exceeded" ? "upload-budget" : "field-budget",
      uploads.reason,
    );
  }

  return {
    ok: true,
    value: {
      runtimeVersion: STUDIO_WET_INK_BRUSH_RUNTIME_VERSION,
      phase: options.phase,
      brushId,
      strokeId: element.id,
      revision: snapshotRevision(element),
      seed,
      fieldDigest: studioWetInkFieldDigest(field.value),
      fieldScale: STUDIO_WET_INK_BRUSH_FIELD_SCALE,
      originX: geometry.originCellX / STUDIO_WET_INK_BRUSH_FIELD_SCALE,
      originY: geometry.originCellY / STUDIO_WET_INK_BRUSH_FIELD_SCALE,
      compositeOpacity: recipe.compositeOpacity,
      uploads: uploads.value,
      allocatedCells: field.value.allocatedCells,
      simulationSteps: simulated.value.appliedSteps,
    },
  };
}

function defaultSurfaceFactory(
  width: number,
  height: number,
): StudioWetInkBrushSurface | null {
  try {
    if (typeof globalThis.OffscreenCanvas === "function") {
      const surface = new globalThis.OffscreenCanvas(width, height);
      if (surface.getContext("2d")) return surface as StudioWetInkBrushSurface;
    }
    if (typeof globalThis.document !== "undefined") {
      const surface = globalThis.document.createElement("canvas");
      surface.width = width;
      surface.height = height;
      return surface as StudioWetInkBrushSurface;
    }
  } catch {
    return null;
  }
  return null;
}

function destinationPhysicalScale(
  context: StudioWetInkBrushDestinationContext,
): number | null {
  try {
    const transform = context._context?.getTransform() ?? context.getTransform?.();
    if (!transform) return 1;
    const scaleX = Math.hypot(transform.a, transform.b);
    const scaleY = Math.hypot(transform.c, transform.d);
    const scale = Math.max(scaleX, scaleY);
    return Number.isFinite(scale) && scale > 0 ? scale : null;
  } catch {
    return null;
  }
}

function renderGuard(
  plan: StudioWetInkBrushReplayPlan,
  options: StudioWetInkBrushRenderOptions,
): "hidden" | "aborted" | "stale-revision" | null {
  try {
    const hidden = typeof options.hidden === "function"
      ? options.hidden()
      : options.hidden === true;
    if (hidden) return "hidden";
  } catch {
    return "hidden";
  }
  try {
    if (options.signal?.aborted) return "aborted";
  } catch {
    return "aborted";
  }
  const expected = options.expectedRevision ?? plan.revision;
  if (!Number.isSafeInteger(expected) || expected !== plan.revision) {
    return "stale-revision";
  }
  try {
    const current = typeof options.currentRevision === "function"
      ? options.currentRevision()
      : options.currentRevision ?? plan.revision;
    if (!Number.isSafeInteger(current) || current !== expected) {
      return "stale-revision";
    }
  } catch {
    return "stale-revision";
  }
  return null;
}

function releasePreparedUploads(uploads: readonly PreparedUpload[]): void {
  for (const { surface } of uploads) {
    surface.width = 1;
    surface.height = 1;
  }
}

function prepareUploads(
  uploads: readonly StudioWetInkTileUpload[],
  factory: StudioWetInkBrushSurfaceFactory,
): readonly PreparedUpload[] | null {
  const prepared: PreparedUpload[] = [];
  try {
    for (const upload of uploads) {
      const surface = factory(upload.width, upload.height);
      const context = surface?.getContext("2d", { alpha: true });
      if (!surface || !context) {
        releasePreparedUploads(prepared);
        return null;
      }
      const imageData = context.createImageData(upload.width, upload.height);
      if (
        imageData.width !== upload.width
        || imageData.height !== upload.height
        || imageData.data.length !== upload.rgba.length
      ) {
        releasePreparedUploads(prepared);
        surface.width = 1;
        surface.height = 1;
        return null;
      }
      imageData.data.set(upload.rgba);
      context.putImageData(imageData, 0, 0);
      prepared.push({ upload, surface });
    }
    return prepared;
  } catch {
    releasePreparedUploads(prepared);
    return null;
  }
}

/**
 * Composites a fully prepared physical replay. Hidden/abort/stale exits are checked both before
 * allocation and immediately before `save()`/`drawImage()`, guaranteeing those authority changes
 * cannot leave a partially mutated destination.
 */
export function renderStudioWetInkBrushReplay(
  context: StudioWetInkBrushDestinationContext,
  plan: StudioWetInkBrushReplayPlan,
  options: StudioWetInkBrushRenderOptions = {},
): StudioWetInkBrushRenderResult {
  const initialGuard = renderGuard(plan, options);
  if (initialGuard) return { status: "skipped", reason: initialGuard };
  if (plan.uploads.length === 0 || plan.compositeOpacity <= 0) {
    return { status: "empty", fieldDigest: plan.fieldDigest };
  }

  const nativeScale = destinationPhysicalScale(context);
  if (
    nativeScale === null
    || nativeScale > STUDIO_WET_INK_BRUSH_MAX_PHYSICAL_SCALE
  ) {
    return { status: "fallback", reason: "native-scale-unsupported" };
  }
  const surfaceBytes = plan.uploads.reduce(
    (sum, upload) => sum + upload.width * upload.height * 4,
    0,
  );
  const maximumSurfaceBytes =
    options.maximumSurfaceBytes ?? STUDIO_WET_INK_BRUSH_SURFACE_BYTE_BUDGET;
  if (
    !Number.isSafeInteger(surfaceBytes)
    || !Number.isSafeInteger(maximumSurfaceBytes)
    || maximumSurfaceBytes <= 0
    || surfaceBytes > maximumSurfaceBytes
  ) {
    return { status: "fallback", reason: "surface-budget" };
  }

  const factory = options.surfaceFactory ?? defaultSurfaceFactory;
  const prepared = prepareUploads(plan.uploads, factory);
  if (!prepared) {
    return {
      status: "fallback",
      reason: options.surfaceFactory
        ? "surface-preparation-failed"
        : "surface-unavailable",
    };
  }
  const finalGuard = renderGuard(plan, options);
  if (finalGuard) {
    releasePreparedUploads(prepared);
    return { status: "skipped", reason: finalGuard };
  }

  const inheritedAlpha = clamp01(context.globalAlpha);
  let destinationStarted = false;
  try {
    context.save();
    context.globalAlpha = inheritedAlpha * plan.compositeOpacity;
    for (const { upload, surface } of prepared) {
      destinationStarted = true;
      context.drawImage(
        surface,
        0,
        0,
        upload.width,
        upload.height,
        plan.originX + upload.x / plan.fieldScale,
        plan.originY + upload.y / plan.fieldScale,
        upload.width / plan.fieldScale,
        upload.height / plan.fieldScale,
      );
    }
    context.restore();
  } catch {
    try {
      context.restore();
    } catch {
      // The partial result keeps the exact fallback from double-painting an unknown prefix.
    }
    releasePreparedUploads(prepared);
    return destinationStarted
      ? { status: "partial", reason: "destination-composite-failed" }
      : { status: "fallback", reason: "surface-preparation-failed" };
  }
  releasePreparedUploads(prepared);
  return {
    status: "rendered",
    fieldDigest: plan.fieldDigest,
    nativeScale,
    tileCount: plan.uploads.length,
    surfaceBytes,
  };
}
