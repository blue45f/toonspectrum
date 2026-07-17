/**
 * Prefix-stable watercolor dab planner.
 *
 * The legacy watercolor planner fits a fresh set of stations across the current total stroke
 * length. That is useful for bounded export plans, but it means appending one pointer sample can
 * move every station that was already visible. This walker uses a persistent arc-length cursor:
 * once a core/diffuse pair is emitted, later samples can only append new dabs.
 *
 * The active live path deliberately does not paint a provisional endpoint. The exact endpoint is
 * emitted once by `finishCausalWatercolorBrush`; a UI may show a disposable predicted-tail layer
 * above this authoritative surface without ever rewriting retained pigment.
 */

import { hash2 } from "./studio-grain";
import {
  normalizeWatercolorBrushPlanSettings,
  type WatercolorBrushDab,
  type WatercolorBrushPlanSettings,
} from "./studio-watercolor-brush";

const DEFAULT_PRESSURE = 0.55;
const MAX_COORDINATE_ABS = 1_000_000;
const POINT_EPSILON = 1e-6;
const TAU = Math.PI * 2;

export const STUDIO_CAUSAL_WATERCOLOR_DAB_CAP_RANGE = {
  min: 2,
  max: 16_384,
} as const;

export const DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS = 8_192;

export interface StudioCausalWatercolorSample {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface StudioCausalWatercolorSettings extends WatercolorBrushPlanSettings {
  /** A safety ceiling only. Unlike the legacy planner, reaching it never redistributes old dabs. */
  maxDabs: number;
}

export interface StudioCausalWatercolorState {
  settings: StudioCausalWatercolorSettings;
  lastX: number;
  lastY: number;
  lastPressure: number;
  /** Arc length still required before the next permanent station. */
  distanceToNextStation: number;
  /** Stable seed index for the next station. */
  stationIndex: number;
  emittedDabCount: number;
  lastStationX: number;
  lastStationY: number;
  travelled: boolean;
  finished: boolean;
  /** Set only after an actually requested core/diffuse dab could not fit. */
  capped: boolean;
}

export interface StudioCausalWatercolorBeginResult {
  state: StudioCausalWatercolorState;
  dabs: WatercolorBrushDab[];
}

export interface StudioCausalWatercolorPlanInput {
  readonly points: readonly number[];
  readonly pressures?: readonly number[] | null;
  readonly baseWidth?: number;
  readonly seed?: number;
  readonly maxDabs?: number;
  readonly spacing?: number;
  readonly diffuse?: boolean;
}

export interface StudioCausalWatercolorPlan {
  dabs: WatercolorBrushDab[];
  sourcePointCount: number;
  /** True when malformed input contains no drawable coordinate pair. */
  empty: boolean;
  /** True when the safety ceiling prevented one or more new dabs. */
  capped: boolean;
  finalized: boolean;
  settings: StudioCausalWatercolorSettings;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: unknown): number {
  return clamp(finiteNumber(value, DEFAULT_PRESSURE), 0, 1);
}

function safeCoordinate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value, -MAX_COORDINATE_ABS, MAX_COORDINATE_ABS);
}

export function normalizeStudioCausalWatercolorSettings(
  input?: Omit<StudioCausalWatercolorPlanInput, "points" | "pressures"> | null,
): StudioCausalWatercolorSettings {
  const legacy = normalizeWatercolorBrushPlanSettings({
    baseWidth: input?.baseWidth,
    seed: input?.seed,
    spacing: input?.spacing,
    diffuse: input?.diffuse,
  });
  const maxDabs = Math.floor(clamp(
    finiteNumber(input?.maxDabs, DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS),
    STUDIO_CAUSAL_WATERCOLOR_DAB_CAP_RANGE.min,
    STUDIO_CAUSAL_WATERCOLOR_DAB_CAP_RANGE.max,
  ));
  return { ...legacy, maxDabs };
}

function createStationDabs(
  state: Pick<StudioCausalWatercolorState, "settings" | "stationIndex" | "emittedDabCount" | "capped">,
  x: number,
  y: number,
  pressure: number,
): WatercolorBrushDab[] {
  const { settings, stationIndex } = state;
  const available = settings.maxDabs - state.emittedDabCount;
  if (available <= 0) {
    state.capped = true;
    return [];
  }

  const radiusNoise = hash2(stationIndex, 11, settings.seed);
  const opacityNoise = hash2(stationIndex, 13, settings.seed);
  const baseRadius = settings.baseWidth * 0.5;
  const pressureScale = 0.58 + pressure * 0.84;
  const radius = clamp(
    baseRadius * pressureScale * (0.93 + radiusNoise * 0.14),
    0.05,
    settings.baseWidth * 1.1,
  );
  const opacity = clamp(
    0.16 + pressure * 0.38 + (opacityNoise - 0.5) * 0.06,
    0.08,
    0.72,
  );
  const core: WatercolorBrushDab = { x, y, radius, opacity, role: "core" };
  if (!settings.diffuse) return [core];
  if (available < 2) {
    state.capped = true;
    return [core];
  }

  const angle = hash2(stationIndex, 31, settings.seed) * TAU;
  const distance = core.radius * (0.16 + hash2(stationIndex, 37, settings.seed) * 0.54);
  const diffuseRadius = clamp(
    core.radius * (1.2 + hash2(stationIndex, 41, settings.seed) * 0.48),
    0.05,
    settings.baseWidth * 1.7,
  );
  const diffuseOpacity = clamp(
    core.opacity * (0.17 + hash2(stationIndex, 43, settings.seed) * 0.17),
    0.02,
    0.3,
  );
  return [
    core,
    {
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      radius: diffuseRadius,
      opacity: diffuseOpacity,
      role: "diffuse",
    },
  ];
}

function emitStation(
  state: StudioCausalWatercolorState,
  x: number,
  y: number,
  pressure: number,
): WatercolorBrushDab[] {
  const dabs = createStationDabs(state, x, y, pressure);
  state.stationIndex += 1;
  state.emittedDabCount += dabs.length;
  state.lastStationX = x;
  state.lastStationY = y;
  return dabs;
}

function consumeDistanceAfterDabCeiling(
  state: StudioCausalWatercolorState,
  distance: number,
): void {
  if (distance + POINT_EPSILON < state.distanceToNextStation) {
    state.distanceToNextStation = Math.max(
      POINT_EPSILON,
      state.distanceToNextStation - distance,
    );
    return;
  }
  state.capped = true;
  const afterFirstMiss = Math.max(0, distance - state.distanceToNextStation);
  const remainder = afterFirstMiss % state.settings.spacing;
  state.distanceToNextStation = remainder <= POINT_EPSILON
    ? state.settings.spacing
    : state.settings.spacing - remainder;
}

/** Starts a new causal stroke and emits its tap/start pigment. */
export function beginCausalWatercolorBrush(
  sample: StudioCausalWatercolorSample,
  input?: Omit<StudioCausalWatercolorPlanInput, "points" | "pressures"> | null,
): StudioCausalWatercolorBeginResult | null {
  const x = safeCoordinate(sample.x);
  const y = safeCoordinate(sample.y);
  if (x === null || y === null) return null;

  const settings = normalizeStudioCausalWatercolorSettings(input);
  const pressure = clamp01(sample.pressure);
  const state: StudioCausalWatercolorState = {
    settings,
    lastX: x,
    lastY: y,
    lastPressure: pressure,
    distanceToNextStation: settings.spacing,
    stationIndex: 0,
    emittedDabCount: 0,
    lastStationX: x,
    lastStationY: y,
    travelled: false,
    finished: false,
    capped: false,
  };
  return { state, dabs: emitStation(state, x, y, pressure) };
}

/**
 * Consumes one accepted source sample and returns only newly crossed permanent stations.
 * The state is mutated in place to keep the pointer hot path allocation bounded to emitted dabs.
 */
export function appendCausalWatercolorBrush(
  state: StudioCausalWatercolorState,
  sample: StudioCausalWatercolorSample,
): WatercolorBrushDab[] {
  if (state.finished) return [];
  const x = safeCoordinate(sample.x);
  const y = safeCoordinate(sample.y);
  if (x === null || y === null) return [];
  const pressure = clamp01(sample.pressure);
  const dx = x - state.lastX;
  const dy = y - state.lastY;
  const distance = Math.hypot(dx, dy);
  if (distance <= POINT_EPSILON) {
    state.lastX = x;
    state.lastY = y;
    state.lastPressure = pressure;
    return [];
  }

  state.travelled = true;
  if (state.emittedDabCount >= state.settings.maxDabs) {
    consumeDistanceAfterDabCeiling(state, distance);
    state.lastX = x;
    state.lastY = y;
    state.lastPressure = pressure;
    return [];
  }
  const dabs: WatercolorBrushDab[] = [];
  let consumed = 0;
  let distanceToNext = state.distanceToNextStation;
  while (distance - consumed + POINT_EPSILON >= distanceToNext) {
    consumed += distanceToNext;
    const amount = clamp(consumed / distance, 0, 1);
    const stationX = state.lastX + dx * amount;
    const stationY = state.lastY + dy * amount;
    const stationPressure = state.lastPressure + (pressure - state.lastPressure) * amount;
    dabs.push(...emitStation(state, stationX, stationY, stationPressure));
    distanceToNext = state.settings.spacing;
    if (state.emittedDabCount >= state.settings.maxDabs) {
      state.distanceToNextStation = distanceToNext;
      consumeDistanceAfterDabCeiling(state, Math.max(0, distance - consumed));
      state.lastX = x;
      state.lastY = y;
      state.lastPressure = pressure;
      return dabs;
    }
  }

  state.distanceToNextStation = Math.max(
    POINT_EPSILON,
    distanceToNext - Math.max(0, distance - consumed),
  );
  state.lastX = x;
  state.lastY = y;
  state.lastPressure = pressure;
  return dabs;
}

/** Emits the exact endpoint once and seals the stroke. Repeated calls are idempotent. */
export function finishCausalWatercolorBrush(
  state: StudioCausalWatercolorState,
): WatercolorBrushDab[] {
  if (state.finished) return [];
  state.finished = true;
  if (!state.travelled) return [];
  if (
    Math.hypot(
      state.lastX - state.lastStationX,
      state.lastY - state.lastStationY,
    ) <= POINT_EPSILON
  ) {
    return [];
  }
  return emitStation(state, state.lastX, state.lastY, state.lastPressure);
}

/**
 * Deterministic replay for committed (`finalized=true`) or still-active (`false`) strokes.
 * Incremental append and this replay function intentionally share the exact same walker.
 */
export function planCausalWatercolorBrush(
  input?: Partial<StudioCausalWatercolorPlanInput> | null,
  finalized = true,
): StudioCausalWatercolorPlan {
  const sourcePoints = Array.isArray(input?.points) ? input.points : [];
  const sourcePointCount = Math.floor(sourcePoints.length / 2);
  const settings = normalizeStudioCausalWatercolorSettings(input ?? undefined);
  let started: StudioCausalWatercolorBeginResult | null = null;
  let acceptedPointCount = 0;
  const dabs: WatercolorBrushDab[] = [];

  for (let sourceIndex = 0; sourceIndex < sourcePointCount; sourceIndex += 1) {
    const x = safeCoordinate(sourcePoints[sourceIndex * 2]);
    const y = safeCoordinate(sourcePoints[sourceIndex * 2 + 1]);
    if (x === null || y === null) continue;
    const sample = {
      x,
      y,
      pressure: input?.pressures?.[sourceIndex],
    };
    acceptedPointCount += 1;
    if (!started) {
      started = beginCausalWatercolorBrush(sample, settings);
      if (started) dabs.push(...started.dabs);
      continue;
    }
    dabs.push(...appendCausalWatercolorBrush(started.state, sample));
  }

  if (started && finalized) dabs.push(...finishCausalWatercolorBrush(started.state));
  return {
    dabs,
    sourcePointCount: acceptedPointCount,
    empty: started === null,
    capped: started?.state.capped ?? false,
    finalized: Boolean(started && finalized),
    settings: started?.state.settings ?? settings,
  };
}

export function planCausalWatercolorBrushDabs(
  input?: Partial<StudioCausalWatercolorPlanInput> | null,
  finalized = true,
): WatercolorBrushDab[] {
  return planCausalWatercolorBrush(input, finalized).dabs;
}
