import { applyStabilizer } from "./stabilizer";

import type { InkStrokeModeler, InkStrokeModelerParams } from "./ink-modeler";
import type { ModeledSampleIR, StabilizerGraphIR } from "@toonspectrum/studio-project-model";

/**
 * Stabilizer provider seam (ADR-0011 lane 3 promotion prep).
 *
 * One deterministic `StabilizerBackend` interface over the three smoothing
 * lanes so the drawing pipeline can swap backends without touching call
 * sites:
 *
 * - "ema" / "spring" — the shipped first-party lanes, delegating verbatim to
 *   ./stabilizer.ts (ADR 0005).
 * - "ink-stroke-modeler" — the quarantined Google Ink wasm lane, delegating
 *   to ./ink-modeler.ts. Opt-in only (ADR-0009 explicit-selection principle): selecting
 *   it requires `allowInk: true`, and processing requires a preloaded wasm
 *   modeler injected by the host — this module never loads wasm itself and
 *   stays pure/synchronous.
 *
 * Contract: import this file by direct path
 * (`@toonspectrum/studio-brush-platform/src/stabilizer-provider` semantics —
 * it is intentionally NOT re-exported from the package barrel). Barrel
 * integration is a coordinator decision once lane 3 clears the blind-lab
 * gate (ADR-0009), recorded in ADR-0011.
 */

export type StabilizerBackendId = "ema" | "spring" | "ink-stroke-modeler";

export const STABILIZER_BACKEND_IDS: readonly StabilizerBackendId[] = [
  "ema",
  "spring",
  "ink-stroke-modeler",
];

/** Production default: the shipped first-party lane (ink stays opt-in). */
export const DEFAULT_STABILIZER_BACKEND_ID: StabilizerBackendId = "ema";

/** Mirrors stabilizerGraphIRSchema's strength default. */
const DEFAULT_STRENGTH = 0.35;

export class StabilizerProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StabilizerProviderError";
  }
}

export interface StabilizerProcessParams {
  /** First-party lanes: 0..1 smoothing strength (StabilizerGraphIR.strength). */
  strength?: number;
  /** First-party lanes: 0..50ms prediction budget (StabilizerGraphIR.predictionMs). */
  predictionMs?: number;
  /** Ink lane: forwarded model params (INK_DEFAULT_PARAMS when omitted). */
  ink?: InkStrokeModelerParams;
}

export interface StabilizerBackend {
  readonly id: StabilizerBackendId;
  /**
   * Deterministic: identical `rawPoints` + `params` always produce an
   * identical, freshly-allocated output array (input is never mutated).
   */
  process(
    rawPoints: readonly ModeledSampleIR[],
    params?: StabilizerProcessParams,
  ): ModeledSampleIR[];
}

export interface SelectStabilizerBackendOptions {
  /**
   * ADR-0009 explicit-selection principle: the ink lane must be explicitly opted into.
   * First-party lanes ignore this flag.
   */
  allowInk?: boolean;
  /**
   * Preloaded wasm boundary for the ink lane (`await loadInkStrokeModeler()`).
   * Without it, selecting the ink backend still succeeds but `process` throws
   * an explicit error — environments that never load wasm fail loudly, not
   * silently.
   */
  inkModeler?: InkStrokeModeler;
}

/**
 * Resolve a backend by id. Defaults to the shipped first-party lane; unknown
 * ids and non-opted-in ink selection fail with explicit errors.
 */
export function selectStabilizerBackend(
  id: string = DEFAULT_STABILIZER_BACKEND_ID,
  options?: SelectStabilizerBackendOptions,
): StabilizerBackend {
  if (id === "ema" || id === "spring") {
    return createFirstPartyBackend(id);
  }
  if (id === "ink-stroke-modeler") {
    if (options?.allowInk !== true) {
      throw new StabilizerProviderError(
        'stabilizer backend "ink-stroke-modeler" is quarantined opt-in (ADR-0009 ' +
          "explicit-selection principle / ADR-0011 lane 3) — pass { allowInk: true } to select it",
      );
    }
    return createInkBackend(options.inkModeler);
  }
  throw new StabilizerProviderError(
    `unknown stabilizer backend "${id}" — known backends: ${STABILIZER_BACKEND_IDS.join(", ")}`,
  );
}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new StabilizerProviderError(
      `stabilizer param ${name} must be a finite number in [${min}, ${max}], got ${value}`,
    );
  }
}

function createFirstPartyBackend(id: "ema" | "spring"): StabilizerBackend {
  return {
    id,
    process(rawPoints, params) {
      const strength = params?.strength ?? DEFAULT_STRENGTH;
      const predictionMs = params?.predictionMs ?? 0;
      // Mirror stabilizerGraphIRSchema bounds so the seam rejects what the IR
      // schema would reject, instead of silently producing out-of-model output.
      assertRange("strength", strength, 0, 1);
      assertRange("predictionMs", predictionMs, 0, 50);
      const config: StabilizerGraphIR = { kind: id, strength, predictionMs };
      return applyStabilizer(rawPoints, config);
    },
  };
}

function createInkBackend(modeler: InkStrokeModeler | undefined): StabilizerBackend {
  return {
    id: "ink-stroke-modeler",
    process(rawPoints, params) {
      if (modeler === undefined) {
        throw new StabilizerProviderError(
          'stabilizer backend "ink-stroke-modeler" has no loaded wasm modeler in this ' +
            "environment — pass { inkModeler: await loadInkStrokeModeler() } to " +
            "selectStabilizerBackend before processing",
        );
      }
      const modeled = modeler.modelStroke(
        rawPoints.map((sample) => ({
          x: sample.x,
          y: sample.y,
          tMs: sample.tMs,
          pressure: sample.pressure,
        })),
        params?.ink,
      );
      return modeled.map((point) => ({
        x: point.x,
        y: point.y,
        tMs: point.tMs,
        // Inputs are IR samples (pressure always known, [0,1]); the modeler
        // interpolates within the raw range, so clamping only guards float
        // edge noise — the -1 "unknown" sentinel cannot occur on this path.
        pressure: Math.min(1, Math.max(0, point.pressure)),
        velocity: Math.hypot(point.velocityX, point.velocityY),
        // The ink lane does not model tilt; reset to IR schema defaults. The
        // production integration decision for tilt passthrough belongs to the
        // lane-3 promotion (coordinator, ADR-0011).
        altitudeDeg: 90,
        azimuthDeg: 0,
      }));
    },
  };
}
