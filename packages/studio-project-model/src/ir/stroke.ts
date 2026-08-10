import { z } from "zod";

/**
 * InputIR / StrokeIR — tablet input and modeled stroke layer (V11 §10.1).
 *
 * Raw, coalesced and predicted samples are kept distinguishable so the
 * stabilizer and the fidelity lab can replay exactly what the hardware
 * delivered. Predicted samples never enter the committed stroke.
 */

export const rawInputSampleIRSchema = z.object({
  x: z.number(),
  y: z.number(),
  tMs: z.number().nonnegative(),
  pressure: z.number().min(0).max(1),
  tiltXDeg: z.number().min(-90).max(90).default(0),
  tiltYDeg: z.number().min(-90).max(90).default(0),
  twistDeg: z.number().min(0).max(359).default(0),
  pointerType: z.enum(["pen", "touch", "mouse"]),
  phase: z.enum(["down", "move", "up"]),
  source: z.enum(["raw", "coalesced", "predicted"]),
});
export type RawInputSampleIR = z.infer<typeof rawInputSampleIRSchema>;

/**
 * Per-device calibration profile. The pressure curve is a monotonic LUT
 * sampled uniformly on [0, 1]; adapters interpolate linearly between taps.
 */
export const deviceCalibrationIRSchema = z.object({
  deviceId: z.string().min(1),
  label: z.string().default(""),
  pressureCurve: z.array(z.number().min(0).max(1)).min(2),
  pressureDeadZone: z.number().min(0).max(0.5).default(0),
  tiltXOffsetDeg: z.number().min(-45).max(45).default(0),
  tiltYOffsetDeg: z.number().min(-45).max(45).default(0),
  predictionMs: z.number().min(0).max(50).default(0),
});
export type DeviceCalibrationIR = z.infer<typeof deviceCalibrationIRSchema>;

export const modeledSampleIRSchema = z.object({
  x: z.number(),
  y: z.number(),
  tMs: z.number().nonnegative(),
  pressure: z.number().min(0).max(1),
  /** px/ms in scene space, computed by the input modeler. */
  velocity: z.number().nonnegative(),
  altitudeDeg: z.number().min(0).max(90).default(90),
  azimuthDeg: z.number().min(0).max(360).default(0),
});
export type ModeledSampleIR = z.infer<typeof modeledSampleIRSchema>;

export const strokeIRSchema = z.object({
  id: z.string().min(1),
  brushPresetId: z.string().min(1),
  /** Deterministic seed for any stochastic brush stage (stamp jitter …). */
  seed: z.number().int().nonnegative(),
  color: z
    .object({
      r: z.number().min(0).max(1),
      g: z.number().min(0).max(1),
      b: z.number().min(0).max(1),
      a: z.number().min(0).max(1),
    })
    .default({ r: 0, g: 0, b: 0, a: 1 }),
  baseSizePx: z.number().positive(),
  samples: z.array(modeledSampleIRSchema),
});
export type StrokeIR = z.infer<typeof strokeIRSchema>;

export function applyPressureCurve(
  calibration: DeviceCalibrationIR,
  pressure: number,
): number {
  const { pressureCurve, pressureDeadZone } = calibration;
  if (pressure <= pressureDeadZone) return 0;
  const normalized = Math.min(
    1,
    (pressure - pressureDeadZone) / (1 - pressureDeadZone),
  );
  const scaled = normalized * (pressureCurve.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(pressureCurve.length - 1, lower + 1);
  const t = scaled - lower;
  const lowerValue = pressureCurve[lower] ?? 0;
  const upperValue = pressureCurve[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * t;
}
