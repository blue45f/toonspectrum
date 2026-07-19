/**
 * Pure stabilizer-endpoint planning for one released Studio stroke.
 *
 * The Page owns pointer transport, stabilizer state, CRDT publication, render surfaces, and the
 * final React/history commit. This leaf only decides whether a flushed endpoint extends the
 * immutable stroke and keeps every persisted hardware channel aligned with that new point.
 */

import {
  normalizeCalligraphyStylusInput,
  resolveBrushReleasePressureSample,
} from "./studio-brush";
import { resolveStudioBrushDynamicsPresetId } from "./studio-brush-dynamics";
import { studioInkFallbackPressure } from "./studio-ink-pressure-model";

import type { DrawEl } from "./studio-element-model";

const RELEASE_ENDPOINT_EPSILON = 1e-6;

export interface StudioPointerReleaseEndpointSample {
  readonly pointerType?: unknown;
  readonly pressure?: unknown;
  readonly tiltX?: unknown;
  readonly tiltY?: unknown;
  readonly twist?: unknown;
  readonly tangentialPressure?: unknown;
}

export interface StudioPointerReleaseEndpointPlanInput {
  readonly stroke: DrawEl;
  readonly endpoint: Readonly<{ x: number; y: number }>;
  readonly pointer: StudioPointerReleaseEndpointSample;
  readonly pressureCurve: number;
}

export interface StudioPointerReleaseEndpointPlan {
  readonly stroke: DrawEl;
  readonly appended: boolean;
}

function appendAlignedChannel(
  values: readonly number[] | undefined,
  previousPointCount: number,
  value: number,
  fallback = 0
): number[] {
  return [
    ...Array.from(
      { length: previousPointCount },
      (_, index) => values?.[index] ?? fallback
    ),
    value,
  ];
}

/** Plans the immutable endpoint extension without reading refs or publishing the new sample. */
export function planStudioPointerReleaseEndpoint(
  input: StudioPointerReleaseEndpointPlanInput
): StudioPointerReleaseEndpointPlan {
  const { endpoint, pointer, stroke } = input;
  const lastX = stroke.points[stroke.points.length - 2] ?? endpoint.x;
  const lastY = stroke.points[stroke.points.length - 1] ?? endpoint.y;
  if (!(Math.hypot(endpoint.x - lastX, endpoint.y - lastY) > RELEASE_ENDPOINT_EPSILON)) {
    return { stroke, appended: false };
  }

  const previousPointCount = Math.floor(stroke.points.length / 2);
  const fallbackPressure = studioInkFallbackPressure(stroke.pressureModel);
  const lastPressure = stroke.pressures?.at(-1) ?? fallbackPressure;
  const pressure = pointer.pointerType === "pen"
    ? resolveBrushReleasePressureSample({
        pointerType: "pen",
        rawPressure: pointer.pressure,
        lastContactPressure: lastPressure,
        velocityFallbackEnabled: false,
        pressureCurve: input.pressureCurve,
        fallbackPressure: lastPressure,
      })
    : lastPressure;
  const capturePointerDynamics =
    stroke.mode === "pen" && resolveStudioBrushDynamicsPresetId(stroke.brush) !== null;
  const captureStylus =
    stroke.mode === "pen" && (stroke.brush === "calligraphy" || capturePointerDynamics);
  const stylus = captureStylus ? normalizeCalligraphyStylusInput(pointer) : null;
  const tangentialPressure =
    typeof pointer.tangentialPressure === "number"
    && Number.isFinite(pointer.tangentialPressure)
      ? Math.min(1, Math.max(-1, pointer.tangentialPressure))
      : (stroke.tangentialPressures?.at(-1) ?? 0);

  return {
    appended: true,
    stroke: {
      ...stroke,
      points: [...stroke.points, endpoint.x, endpoint.y],
      pressures: appendAlignedChannel(
        stroke.pressures,
        previousPointCount,
        pressure,
        fallbackPressure
      ),
      tiltXs: stylus
        ? appendAlignedChannel(stroke.tiltXs, previousPointCount, stylus.tiltX)
        : stroke.tiltXs,
      tiltYs: stylus
        ? appendAlignedChannel(stroke.tiltYs, previousPointCount, stylus.tiltY)
        : stroke.tiltYs,
      twists: stylus
        ? appendAlignedChannel(stroke.twists, previousPointCount, stylus.twist)
        : stroke.twists,
      speeds: capturePointerDynamics
        ? appendAlignedChannel(
            stroke.speeds,
            previousPointCount,
            stroke.speeds?.at(-1) ?? 0
          )
        : stroke.speeds,
      tangentialPressures: capturePointerDynamics
        ? appendAlignedChannel(
            stroke.tangentialPressures,
            previousPointCount,
            tangentialPressure
          )
        : stroke.tangentialPressures,
    },
  };
}
