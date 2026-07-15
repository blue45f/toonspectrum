import { isStudioGpuColorSupported } from "./studio-webgpu-color";

/**
 * Fail-closed selection for the first committed WebGPU drawing slice.
 *
 * The WebGPU surface currently sits above the authoritative Konva stage. It may therefore take
 * ownership only of a contiguous suffix of the *visible* scene order (array index 0 is back,
 * `length - 1` is front). Hidden elements do not produce pixels and are skipped, while the first
 * visible unsupported element is a hard z-order barrier.
 *
 * This module deliberately knows nothing about StudioPage's large `El` union. Callers must adapt
 * effective group visibility and automatic panel clipping into `hidden` and `panelClip` before
 * asking for a plan. Requiring an explicit panel-clip state prevents a future caller from silently
 * treating an uncomputed clip as safe.
 */

export type StudioWebGpuPanelClipState = "none" | "clipped" | "unknown";

export interface StudioWebGpuCommittedElementInput {
  readonly id: string;
  readonly type: unknown;
  /** Effective visibility, including a hidden parent layer group. */
  readonly hidden?: boolean;
  readonly kind?: unknown;
  readonly mode?: unknown;
  readonly points?: unknown;
  readonly pressures?: unknown;
  readonly stroke?: unknown;
  readonly strokeWidth?: unknown;
  readonly opacity?: unknown;
  readonly brush?: unknown;
  readonly blendMode?: unknown;
  readonly symmetry?: unknown;
  readonly panelClip: StudioWebGpuPanelClipState;
  readonly clipBelow?: unknown;
  readonly maskSrc?: unknown;
  readonly maskEnabled?: unknown;
  readonly alphaLocked?: unknown;
  readonly fill?: unknown;
  readonly gradient?: unknown;
  readonly pattern?: unknown;
  readonly brushDynamics?: unknown;
  readonly brushTip?: unknown;
}

export interface StudioWebGpuCommittedPlanGates {
  readonly exportActive?: boolean;
  readonly masterEditActive?: boolean;
  readonly editActive?: boolean;
  readonly specialDraftActive?: boolean;
  readonly postProcessingActive?: boolean;
}

export type StudioWebGpuCommittedGateReason =
  | "export"
  | "master-edit"
  | "edit"
  | "special-draft"
  | "post-processing";

export type StudioWebGpuCommittedBarrierReason =
  | "non-draw"
  | "non-freehand"
  | "non-pen-mode"
  | "unsupported-brush"
  | "invalid-geometry"
  | "opacity"
  | "blend-mode"
  | "panel-clip"
  | "mask"
  | "symmetry"
  | "unsupported-style";

export interface StudioWebGpuCommittedBarrier {
  readonly elementId: string;
  readonly reason: StudioWebGpuCommittedBarrierReason;
}

export interface StudioWebGpuCommittedPlan<T extends StudioWebGpuCommittedElementInput> {
  readonly status: "ready" | "empty" | "gated";
  /** Selected elements in their original back-to-front scene order. */
  readonly elements: readonly T[];
  readonly elementIds: readonly string[];
  readonly gateReason: StudioWebGpuCommittedGateReason | null;
  /** Unsupported frontmost visible element that prevented any handoff. */
  readonly frontBarrier: StudioWebGpuCommittedBarrier | null;
  /** First unsupported visible element immediately behind a successfully selected suffix. */
  readonly lowerBarrier: StudioWebGpuCommittedBarrier | null;
}

export interface StudioWebGpuCommittedPlanInput<T extends StudioWebGpuCommittedElementInput> {
  /** Scene order: index 0 is back, the final index is front. */
  readonly elements: readonly T[];
  readonly gates?: StudioWebGpuCommittedPlanGates;
}

const SUPPORTED_BRUSHES = new Set(["pen", "fineliner"]);

const EMPTY_ELEMENTS: readonly never[] = Object.freeze([]);
const EMPTY_IDS: readonly string[] = Object.freeze([]);

function activeGate(gates: StudioWebGpuCommittedPlanGates | undefined): StudioWebGpuCommittedGateReason | null {
  if (gates?.exportActive === true) return "export";
  if (gates?.masterEditActive === true) return "master-edit";
  if (gates?.editActive === true) return "edit";
  if (gates?.specialDraftActive === true) return "special-draft";
  if (gates?.postProcessingActive === true) return "post-processing";
  return null;
}

function finitePointArray(value: unknown): value is readonly number[] {
  return Array.isArray(value)
    // Single-point Konva strokes use a circle-specific minimum-radius contract. Keep them on the
    // authoritative renderer until that exact point primitive exists in the GPU compositor.
    && value.length >= 4
    && value.length % 2 === 0
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}

function finitePressureArray(value: unknown): value is readonly number[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((pressure) => (
      typeof pressure === "number"
      && Number.isFinite(pressure)
      && pressure >= 0
      && pressure <= 1
    ));
}

function hasUnsupportedMask(element: StudioWebGpuCommittedElementInput): boolean {
  if (element.clipBelow !== undefined && element.clipBelow !== false) return true;
  if (element.maskEnabled !== undefined && element.maskEnabled !== false) return true;
  if (element.maskSrc !== undefined && element.maskSrc !== null && element.maskSrc !== "") return true;
  if (element.alphaLocked !== undefined && element.alphaLocked !== false) return true;
  return false;
}

function hasUnsupportedStyle(element: StudioWebGpuCommittedElementInput): boolean {
  return element.fill !== undefined
    || element.gradient !== undefined
    || element.pattern !== undefined
    || element.brushDynamics !== undefined
    || element.brushTip !== undefined;
}

/** Returns the first fail-closed reason, or `null` when the element is safe for this slice. */
export function studioWebGpuCommittedBarrierReason(
  element: StudioWebGpuCommittedElementInput
): StudioWebGpuCommittedBarrierReason | null {
  if (element.type !== "draw") return "non-draw";
  if ((element.kind ?? "freehand") !== "freehand") return "non-freehand";
  if ((element.mode ?? "pen") !== "pen") return "non-pen-mode";

  // An omitted brush is the legacy/default pen contract. Unknown aliases must not inherit the
  // renderer's generic pen fallback, because that would opt future brush families into GPU output.
  const brush = element.brush === undefined ? "pen" : element.brush;
  if (typeof brush !== "string" || !SUPPORTED_BRUSHES.has(brush)) return "unsupported-brush";

  if (
    !finitePointArray(element.points)
    || !finitePressureArray(element.pressures)
    || element.pressures.length !== element.points.length / 2
    || !isStudioGpuColorSupported(element.stroke)
    || typeof element.strokeWidth !== "number"
    || !Number.isFinite(element.strokeWidth)
    || element.strokeWidth <= 0
  ) {
    return "invalid-geometry";
  }

  const opacity = element.opacity === undefined ? 1 : element.opacity;
  if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity !== 1) return "opacity";
  if (element.blendMode !== undefined && element.blendMode !== "source-over") return "blend-mode";
  if (element.panelClip !== "none") return "panel-clip";
  if (hasUnsupportedMask(element)) return "mask";

  if (element.symmetry !== undefined) {
    if (
      element.symmetry === null
      || typeof element.symmetry !== "object"
      || Array.isArray(element.symmetry)
      || (element.symmetry as { type?: unknown }).type !== "none"
    ) {
      return "symmetry";
    }
  }

  if (hasUnsupportedStyle(element)) return "unsupported-style";
  return null;
}

function emptyPlan<T extends StudioWebGpuCommittedElementInput>(
  values: Pick<StudioWebGpuCommittedPlan<T>, "status" | "gateReason" | "frontBarrier">
): StudioWebGpuCommittedPlan<T> {
  return {
    ...values,
    elements: EMPTY_ELEMENTS,
    elementIds: EMPTY_IDS,
    lowerBarrier: null,
  };
}

/**
 * Selects the frontmost contiguous suffix that the transparent WebGPU overlay may own safely.
 * The returned element objects are the original references; this planner never mutates scene data.
 */
export function planStudioWebGpuCommittedSuffix<T extends StudioWebGpuCommittedElementInput>(
  input: StudioWebGpuCommittedPlanInput<T>
): StudioWebGpuCommittedPlan<T> {
  const gateReason = activeGate(input.gates);
  if (gateReason) {
    return emptyPlan({ status: "gated", gateReason, frontBarrier: null });
  }

  const selectedFrontToBack: T[] = [];
  let lowerBarrier: StudioWebGpuCommittedBarrier | null = null;

  for (let index = input.elements.length - 1; index >= 0; index -= 1) {
    const element = input.elements[index]!;
    if (element.hidden === true) continue;

    const reason = studioWebGpuCommittedBarrierReason(element);
    if (reason === null) {
      selectedFrontToBack.push(element);
      continue;
    }

    const barrier = { elementId: element.id, reason } as const;
    if (selectedFrontToBack.length === 0) {
      return emptyPlan({ status: "empty", gateReason: null, frontBarrier: barrier });
    }
    lowerBarrier = barrier;
    break;
  }

  if (selectedFrontToBack.length === 0) {
    return emptyPlan({ status: "empty", gateReason: null, frontBarrier: null });
  }

  const elements = selectedFrontToBack.reverse();
  return {
    status: "ready",
    elements,
    elementIds: elements.map((element) => element.id),
    gateReason: null,
    frontBarrier: null,
    lowerBarrier,
  };
}
