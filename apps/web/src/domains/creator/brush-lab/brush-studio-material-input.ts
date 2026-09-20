import { mapBrushStudioV6Pressure, mapBrushStudioV6Tilt } from "./brush-studio-v6-material-engine";
import type { BrushStudioV6InputPolicy } from "./brush-studio-v6-engine";

/** Recorded device values, before the material's own response curve. Zero is not absence. */
export interface BrushStudioMaterialInputPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number | null;
  readonly tiltX?: number | null;
  readonly tiltY?: number | null;
  readonly twist?: number | null;
}

/** Exactly the existing manuscript mapping; no extra device/family/velocity calibration. */
export function mapBrushStudioMaterialInput(point: BrushStudioMaterialInputPoint, input: BrushStudioV6InputPolicy) {
  return {
    x: point.x, y: point.y,
    pressure: mapBrushStudioV6Pressure(point.pressure ?? 0.5, input),
    tilt: mapBrushStudioV6Tilt(Math.hypot(point.tiltX ?? 0, point.tiltY ?? 0), input),
    twist: point.twist ?? 0,
  };
}
