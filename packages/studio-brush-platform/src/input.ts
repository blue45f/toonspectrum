import { applyPressureCurve } from "@toonspectrum/studio-project-model";

import type {
  DeviceCalibrationIR,
  ModeledSampleIR,
  RawInputSampleIR,
} from "@toonspectrum/studio-project-model";

/**
 * Input modeling stage (V11 §10.1): raw/coalesced samples become calibrated
 * ModeledSampleIR. Predicted samples are preview-only by contract — they are
 * dropped here so a committed stroke never contains speculative points.
 */

export interface InputModelOptions {
  /** EMA factor for velocity smoothing, 0..1 (higher = snappier). */
  velocitySmoothing?: number;
}

export function modelRawInput(
  samples: readonly RawInputSampleIR[],
  calibration: DeviceCalibrationIR,
  options: InputModelOptions = {},
): ModeledSampleIR[] {
  const velocitySmoothing = options.velocitySmoothing ?? 0.5;
  const modeled: ModeledSampleIR[] = [];
  let previous: RawInputSampleIR | null = null;
  let smoothedVelocity = 0;

  for (const sample of samples) {
    if (sample.source === "predicted") continue;
    let velocity = 0;
    if (previous !== null) {
      const dt = sample.tMs - previous.tMs;
      if (dt > 0) {
        const dx = sample.x - previous.x;
        const dy = sample.y - previous.y;
        velocity = Math.hypot(dx, dy) / dt;
      } else {
        velocity = smoothedVelocity;
      }
    }
    smoothedVelocity =
      previous === null
        ? velocity
        : smoothedVelocity + (velocity - smoothedVelocity) * velocitySmoothing;

    const altitude =
      90 -
      Math.min(
        90,
        Math.hypot(
          sample.tiltXDeg - calibration.tiltXOffsetDeg,
          sample.tiltYDeg - calibration.tiltYOffsetDeg,
        ),
      );
    const azimuth =
      (Math.atan2(
        sample.tiltYDeg - calibration.tiltYOffsetDeg,
        sample.tiltXDeg - calibration.tiltXOffsetDeg,
      ) *
        180) /
        Math.PI +
      180;

    modeled.push({
      x: sample.x,
      y: sample.y,
      tMs: sample.tMs,
      pressure: applyPressureCurve(calibration, sample.pressure),
      velocity: smoothedVelocity,
      altitudeDeg: altitude,
      azimuthDeg: azimuth,
    });
    previous = sample;
  }
  return modeled;
}
