import {
  processFreehandPoints,
  resampleStrokePressures,
  strokeRenderDistance,
} from "./studio-brush";
import {
  planStudioWebGpuCommittedSuffix,
  type StudioWebGpuCommittedElementInput,
  type StudioWebGpuCommittedPlan,
  type StudioWebGpuCommittedPlanGates,
} from "./studio-webgpu-committed-plan";

import type { StudioGpuStroke } from "./studio-webgpu-stroke";

export interface StudioWebGpuCommittedHandoffElement extends StudioWebGpuCommittedElementInput {
  readonly sampleSpacing?: unknown;
}

export type StudioWebGpuCommittedHandoff<
  T extends StudioWebGpuCommittedHandoffElement,
> = StudioWebGpuCommittedPlan<T> & {
  /** Exact default-pen operations in the same back-to-front order as `elementIds`. */
  readonly strokes: readonly StudioGpuStroke[];
};

export interface StudioWebGpuCommittedHandoffInput<
  T extends StudioWebGpuCommittedHandoffElement,
> {
  readonly elements: readonly T[];
  readonly gates?: StudioWebGpuCommittedPlanGates;
}

function committedElementToGpuStroke(
  element: StudioWebGpuCommittedHandoffElement
): StudioGpuStroke {
  // The planner has already validated these fields. Re-running StudioDrawNode's exact point and
  // pressure pipeline here keeps the GPU handoff pixel-compatible with the source renderer.
  const sourcePoints = element.points as readonly number[];
  const sourcePressures = element.pressures as readonly number[];
  const points = processFreehandPoints(
    [...sourcePoints],
    strokeRenderDistance(element.sampleSpacing)
  );
  const pressures = resampleStrokePressures(sourcePressures, points.length / 2, 0.5);

  return {
    id: element.id,
    points,
    pressures,
    color: element.stroke as string,
    // StudioDrawNode clamps legacy sub-pixel widths to one logical pixel before pressure scaling.
    size: Math.max(1, element.strokeWidth as number),
    opacity: element.opacity as number | undefined,
    composite: "normal",
  };
}

/**
 * Plans and converts the frontmost committed drawing suffix that a transparent GPU overlay may
 * own without changing scene z-order. Unsupported content remains an explicit barrier.
 */
export function createStudioWebGpuCommittedHandoff<
  T extends StudioWebGpuCommittedHandoffElement,
>(input: StudioWebGpuCommittedHandoffInput<T>): StudioWebGpuCommittedHandoff<T> {
  const plan = planStudioWebGpuCommittedSuffix(input);
  return {
    ...plan,
    strokes: plan.status === "ready"
      ? plan.elements.map(committedElementToGpuStroke)
      : [],
  };
}
