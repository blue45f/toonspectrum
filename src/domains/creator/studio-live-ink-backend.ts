import type { StudioGpuBackend } from "./studio-webgpu-frame-contract";

/**
 * `auto` is the production default: use the already-warmed WebGPU surface when the browser
 * resolved a real device, otherwise keep the exact Canvas2D/Konva-compatible path. The explicit
 * values remain useful for visual regression comparison and emergency rollout control.
 */
export type StudioLiveInkBackendPreference = "auto" | "webgpu" | "canvas2d";

export type StudioLiveInkBackendDecisionReason =
  | "webgpu-ready"
  | "canvas2d-forced"
  | "backend-unavailable"
  | "unsupported-draft"
  | "post-correction"
  | "eraser"
  | "fill"
  | "opacity"
  | "symmetry";

export interface StudioLiveInkBackendDecisionInput {
  readonly preference: StudioLiveInkBackendPreference;
  readonly resolvedBackend: StudioGpuBackend | null;
  readonly direct: boolean;
  readonly postCorrectionActive: boolean;
  readonly mode: unknown;
  readonly fill: unknown;
  readonly opacity: unknown;
  readonly symmetryType: unknown;
}

export interface StudioLiveInkBackendDecision {
  readonly backend: StudioGpuBackend;
  readonly reason: StudioLiveInkBackendDecisionReason;
}

/**
 * Missing configuration enables capability-driven selection. Unknown non-empty values fail
 * closed to Canvas2D so a deployment typo cannot silently change the renderer fleet-wide.
 */
export function resolveStudioLiveInkBackendPreference(
  value: unknown
): StudioLiveInkBackendPreference {
  if (value === undefined || value === null || value === "" || value === "auto") return "auto";
  if (value === "webgpu") return "webgpu";
  return "canvas2d";
}

/**
 * Stroke-scoped renderer selection. Callers run this once at pointer down and retain the result
 * until pointer up, so a late device initialization can never switch rasterizers mid-stroke.
 */
export function decideStudioLiveInkBackend(
  input: StudioLiveInkBackendDecisionInput
): StudioLiveInkBackendDecision {
  if (input.preference === "canvas2d") {
    return { backend: "canvas2d", reason: "canvas2d-forced" };
  }
  if (!input.direct) return { backend: "canvas2d", reason: "unsupported-draft" };
  if (input.postCorrectionActive) return { backend: "canvas2d", reason: "post-correction" };
  if (input.mode === "eraser") return { backend: "canvas2d", reason: "eraser" };
  if (input.fill !== undefined && input.fill !== null && input.fill !== false && input.fill !== "") {
    return { backend: "canvas2d", reason: "fill" };
  }
  if (typeof input.opacity !== "number" || !Number.isFinite(input.opacity) || input.opacity < 0.999) {
    return { backend: "canvas2d", reason: "opacity" };
  }
  if (input.symmetryType !== "none") return { backend: "canvas2d", reason: "symmetry" };
  if (input.resolvedBackend !== "webgpu") {
    return { backend: "canvas2d", reason: "backend-unavailable" };
  }
  return { backend: "webgpu", reason: "webgpu-ready" };
}
