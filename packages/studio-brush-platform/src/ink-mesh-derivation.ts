/**
 * Canonical ink-mesh input derivation shared by the compiled vector-mesh lane
 * (`compileMeshBrush`, V19 §2.3) and the /studio Google Ink live preview, so
 * the tilt/orientation mapping cannot drift between preview and commit.
 *
 * Pure and side-effect-free by contract: importing this module must never pull
 * ink WASM init or GPU state into a chunk. Two altitude entry points exist
 * because the two lanes receive different sensor encodings — `ModeledSampleIR`
 * carries degrees while the live DrawEl channels carry radians — and each
 * keeps its lane's historical bit-exact arithmetic (routing one domain through
 * the other shifts results by an ulp and breaks the byte-identity gates).
 */

import type { InkMeshBrushParams, InkMeshInputPoint } from "./ink-mesh";
import type { ModeledSampleIR } from "@toonspectrum/studio-project-model";

const DEG_TO_RAD = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

/** Clamps a tilt-from-vertical angle into ink's admitted `[0, π/2]` domain. */
export function clampInkMeshTiltRad(tiltRad: number): number {
  return Math.min(HALF_PI, Math.max(0, tiltRad));
}

/** Pen altitude above the tablet (radians, `π/2` = vertical) → ink tilt-from-vertical. */
export function inkMeshTiltRadFromAltitudeRad(altitudeRad: number): number {
  return clampInkMeshTiltRad(HALF_PI - altitudeRad);
}

/** Pen altitude above the tablet (degrees, `ModeledSampleIR` domain) → ink tilt-from-vertical. */
export function inkMeshTiltRadFromAltitudeDeg(altitudeDeg: number): number {
  return clampInkMeshTiltRad((90 - altitudeDeg) * DEG_TO_RAD);
}

/** Wraps a barrel/azimuth angle into ink's `[0, 2π)` orientation domain. */
export function normalizedInkMeshOrientationRad(orientationRad: number): number {
  const wrapped = orientationRad % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/** Verbatim `ModeledSampleIR` → ink input point conversion (no JS stabilizer). */
export function inkMeshInputPointFromModeledSample(
  sample: ModeledSampleIR,
): InkMeshInputPoint {
  return {
    x: sample.x,
    y: sample.y,
    tMs: sample.tMs,
    pressure: sample.pressure,
    tiltRad: inkMeshTiltRadFromAltitudeDeg(sample.altitudeDeg),
    orientationRad: normalizedInkMeshOrientationRad(sample.azimuthDeg * DEG_TO_RAD),
  };
}

/* -------------------------------------------------------------------------- *
 * /studio live-lane derivation (DrawEl channel domain).
 *
 * The Google Ink live preview feeds Pointer Events Level 3 radians
 * (altitudeAngles/azimuthAngles) with degree-domain tiltX/tiltY/twist
 * fallbacks, and derives its brush params from the persisted DrawEl brushTip
 * snapshot. These helpers are that lane's single derivation home — the live
 * preview delegates here so preview and committed-program output cannot
 * drift — and they keep the lane's historical bit-exact arithmetic (the
 * `value * Math.PI / 180` evaluation order included).
 * -------------------------------------------------------------------------- */

/** Linear pressure→size response pinned for the /studio Google Ink live lane. */
export const STUDIO_LIVE_INK_MESH_PRESSURE_TO_SIZE: {
  readonly minMultiplier: number;
  readonly maxMultiplier: number;
} = Object.freeze({ minMultiplier: 0.3, maxMultiplier: 1.7 });

/** One /studio live sample's pen-pose channels (radians preferred, degree fallbacks). */
export interface StudioLiveInkPoseChannels {
  /** Pen altitude above the tablet in radians; non-finite means unavailable. */
  readonly altitudeRad: number;
  /** Pen azimuth in radians; non-finite means unavailable. */
  readonly azimuthRad: number;
  /** Pointer Events tiltX in degrees (finite; 0 when the channel is absent). */
  readonly tiltXDeg: number;
  /** Pointer Events tiltY in degrees (finite; 0 when the channel is absent). */
  readonly tiltYDeg: number;
  /** Barrel twist in degrees (finite; 0 when the channel is absent). */
  readonly twistDeg: number;
}

/** Live pose → ink tilt-from-vertical: true altitude first, tiltX/Y magnitude fallback. */
export function inkMeshTiltRadFromStudioLivePose(
  pose: StudioLiveInkPoseChannels,
): number {
  return Number.isFinite(pose.altitudeRad)
    ? inkMeshTiltRadFromAltitudeRad(pose.altitudeRad)
    : clampInkMeshTiltRad(Math.hypot(pose.tiltXDeg, pose.tiltYDeg) * Math.PI / 180);
}

/** Live pose → ink orientation: true azimuth first, tilt-direction plus twist fallback. */
export function inkMeshOrientationRadFromStudioLivePose(
  pose: StudioLiveInkPoseChannels,
): number {
  if (Number.isFinite(pose.azimuthRad)) {
    return normalizedInkMeshOrientationRad(pose.azimuthRad);
  }
  const twistRad = pose.twistDeg * Math.PI / 180;
  return normalizedInkMeshOrientationRad(
    Math.atan2(pose.tiltYDeg, pose.tiltXDeg) + twistRad,
  );
}

/** Raw /studio DrawEl brush-tip snapshot fields (pass NaN for an absent field). */
export interface StudioLiveInkBrushTipInput {
  /** Base stroke diameter in document pixels (caller validates finite-positive). */
  readonly sizePx: number;
  /** Tip roundness; clamped into ink's `[0.08, 1]` x-scale, `1` when non-finite. */
  readonly roundness: number;
  /** Tip rotation in degrees; `0` when non-finite. */
  readonly angleDeg: number;
  readonly tiltEnabled: boolean;
}

/** DrawEl brushTip snapshot → ink brush params (the /studio live-lane derivation). */
export function inkMeshBrushParamsFromStudioBrushTip(
  tip: StudioLiveInkBrushTipInput,
): InkMeshBrushParams {
  return {
    size: tip.sizePx,
    pressureToSize: STUDIO_LIVE_INK_MESH_PRESSURE_TO_SIZE,
    rotationRad: Number.isFinite(tip.angleDeg) ? tip.angleDeg * Math.PI / 180 : 0,
    scale: {
      x: Number.isFinite(tip.roundness) ? Math.max(0.08, Math.min(1, tip.roundness)) : 1,
      y: 1,
    },
    tiltToRotation: tip.tiltEnabled
      ? { minOffsetRad: 0, maxOffsetRad: HALF_PI }
      : null,
  };
}
