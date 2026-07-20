import type { StudioGpuBackend } from "./studio-webgpu-frame-contract";
import type { StudioGpuLiveStrokePreparation } from "./studio-webgpu-live-stroke-plan";

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
  | "symmetry"
  | "invalid-preparation";

export interface StudioLiveInkBackendDecisionInput {
  readonly preference: StudioLiveInkBackendPreference;
  readonly resolvedBackend: StudioGpuBackend | null;
  readonly direct: boolean;
  readonly postCorrectionActive: boolean;
  readonly mode: unknown;
  readonly fill: unknown;
  readonly opacity: unknown;
  readonly symmetryType: unknown;
  /**
   * Proof that the caller has converted the document draft into the renderer-neutral stroke
   * contract consumed by the GPU engine. This is required for styles that the historical direct
   * overlay could not represent; omitting or forging one of its fields keeps that feature on the
   * authoritative Canvas2D path instead of rendering a visually different approximation.
   */
  readonly preparedStroke?: StudioGpuLiveStrokePreparation | null;
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
  if (input.fill !== undefined && input.fill !== null && input.fill !== false && input.fill !== "") {
    return { backend: "canvas2d", reason: "fill" };
  }

  const opacity = input.opacity;
  if (
    typeof opacity !== "number"
    || !Number.isFinite(opacity)
    || opacity < 0
    || opacity > 1
  ) {
    return { backend: "canvas2d", reason: "opacity" };
  }
  const composite = input.mode === "eraser" ? "erase" : "normal";
  const symmetryRequested = input.symmetryType !== "none";
  const prepared = input.preparedStroke;
  if (prepared !== undefined && prepared !== null) {
    if (
      (prepared.composite !== "normal" && prepared.composite !== "erase")
      || (prepared.symmetry !== "identity" && prepared.symmetry !== "expanded")
      || (prepared.geometry !== "source" && prepared.geometry !== "post-corrected")
      || (prepared.destination !== "transparent-overlay"
        && prepared.destination !== "retained-layer")
    ) {
      return { backend: "canvas2d", reason: "invalid-preparation" };
    }
    if (prepared.composite !== composite) {
      return { backend: "canvas2d", reason: composite === "erase" ? "eraser" : "invalid-preparation" };
    }
    if (composite === "erase" && prepared.destination !== "retained-layer") {
      // destination-out on a transparent live overlay cannot erase the committed canvas below it.
      return { backend: "canvas2d", reason: "eraser" };
    }
    if (!Object.is(prepared.opacity, opacity)) {
      return { backend: "canvas2d", reason: "opacity" };
    }
    if (symmetryRequested !== (prepared.symmetry === "expanded")) {
      return { backend: "canvas2d", reason: "symmetry" };
    }
    if (input.postCorrectionActive !== (prepared.geometry === "post-corrected")) {
      return { backend: "canvas2d", reason: "post-correction" };
    }
  } else {
    // The old direct-overlay contract is still a valid fast path for an opaque, ordinary pen.
    // Every richer style requires an explicit preparation proof so callers cannot enable WebGPU
    // while still passing the unexpanded/uncomposited source draft.
    if (input.postCorrectionActive) {
      return { backend: "canvas2d", reason: "post-correction" };
    }
    if (composite === "erase") return { backend: "canvas2d", reason: "eraser" };
    if (opacity < 0.999) return { backend: "canvas2d", reason: "opacity" };
    if (symmetryRequested) return { backend: "canvas2d", reason: "symmetry" };
  }
  if (!input.direct && !prepared) {
    return { backend: "canvas2d", reason: "unsupported-draft" };
  }
  if (input.resolvedBackend !== "webgpu") {
    return { backend: "canvas2d", reason: "backend-unavailable" };
  }
  return { backend: "webgpu", reason: "webgpu-ready" };
}
