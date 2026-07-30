/**
 * Interactive wet-ink backend rollout boundary.
 *
 * The deterministic physical planner remains available to tests, exports and a future
 * Worker/WebGPU provider. It is intentionally not executed synchronously from React/Konva:
 * even a short 4× field currently performs millions of sparse-field neighbour lookups and the
 * independent 64-cell uploads can expose downsampled tile seams. Until an asynchronous provider
 * owns that work, Studio keeps the same brush identity and persisted causal samples but renders
 * new v2 strokes through the bounded, direction-following wet-ribbon carrier. Persisted legacy
 * watercolor remains on its exact historical radial-dab representation.
 */

import {
  planStudioWetInkBrushReplay,
  studioWetInkBrushRuntimeSupportsElement,
  type StudioWetInkBrushReplayOptions,
  type StudioWetInkBrushReplayPlanResult,
} from "./studio-wet-ink-brush-runtime";

import type { DrawEl } from "./studio-element-model";

export const STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY_VERSION =
  "wet-ink-interactive-backend-capability-v1" as const;

export interface StudioWetInkInteractiveBackendCapability {
  readonly version: typeof STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY_VERSION;
  readonly backendId: "worker-webgpu-wet-ink-v1";
  readonly availability: "available" | "unavailable";
  readonly mainThreadPhysicalField: false;
  readonly fallbackRenderer: "wet-ribbon-carrier-v2";
  readonly reason: "async-provider-not-installed";
}

export const STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY:
  StudioWetInkInteractiveBackendCapability = Object.freeze({
    version: STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY_VERSION,
    backendId: "worker-webgpu-wet-ink-v1",
    availability: "unavailable",
    mainThreadPhysicalField: false,
    fallbackRenderer: "wet-ribbon-carrier-v2",
    reason: "async-provider-not-installed",
  });

export function studioWetInkInteractiveBackendSupportsElement(
  element: DrawEl,
): boolean {
  return STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY.availability
    === "available"
    && studioWetInkBrushRuntimeSupportsElement(element);
}

/**
 * Returns `null` before reading point/pressure arrays while the async backend is unavailable.
 * This ordering is the release safety property: ordinary drawing cannot accidentally invoke the
 * synchronous physical planner as brush length grows.
 */
export function planStudioInteractiveWetInkBrushReplay(
  element: DrawEl,
  options: StudioWetInkBrushReplayOptions,
): StudioWetInkBrushReplayPlanResult | null {
  if (!studioWetInkInteractiveBackendSupportsElement(element)) return null;
  return planStudioWetInkBrushReplay(element, options);
}
