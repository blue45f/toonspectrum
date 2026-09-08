import { isStudioBoundedFlowPaintModelCompatible } from "./brush/studio-stroke-paint-model";
import {
  planStudioDynamicBrushCoverageAndLegacyMarks,
  renderStudioDynamicBrushCoverage,
  renderStudioDynamicBrushLegacyMarks,
} from "./studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "./studio-dynamic-brush-render-plan";

import type { StudioPaperSurfaceSettings } from "./brush/studio-paper-granulation-runtime";
import type { StudioEngineWebGpuPresentationConfiguration } from "./render/studio-engine-webgpu-presentation-surface";
import type { DrawEl } from "./studio-element-model";

// Two RGBA readbacks and the temporary reference canvas are bounded independently of GPU memory.
const MAX_DOCUMENT_PARITY_PIXELS = 4_194_304;

export interface StudioDryMediaPixelComparison {
  readonly status: "matched" | "mismatch";
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly mismatchedPixels: number;
  readonly maxChannelDelta: number;
  readonly colorSpace: "srgb";
  readonly alphaEncoding: "straight-rgba8";
  readonly channelTolerance: 0;
}

export interface StudioDryMediaDocumentParityUnavailable {
  readonly status: "unavailable";
  readonly reason: "invalid-pixels" | "surface-budget" | "reference-plan-rejected"
    | "reference-render-failed" | "readback-unavailable";
}

export type StudioDryMediaDocumentParityResult =
  | (StudioDryMediaPixelComparison & { readonly element: DrawEl; readonly layoutKey: string })
  | StudioDryMediaDocumentParityUnavailable;

export type StudioDryMediaDocumentParityReceipt = StudioDryMediaPixelComparison & {
  readonly status: "matched";
  readonly element: DrawEl;
  readonly layoutKey: string;
};

/** Exact comparison, including alpha. No background flattening or rasterizer tolerance. */
export function compareStudioDryMediaDocumentPixels(
  reference: Pick<ImageData, "width" | "height" | "data">,
  presented: Pick<ImageData, "width" | "height" | "data">,
): StudioDryMediaPixelComparison | StudioDryMediaDocumentParityUnavailable {
  const { width, height } = reference;
  const comparedPixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || !Number.isSafeInteger(comparedPixels) || presented.width !== width || presented.height !== height
    || reference.data.length !== comparedPixels * 4 || presented.data.length !== comparedPixels * 4) {
    return { status: "unavailable", reason: "invalid-pixels" };
  }
  if (comparedPixels > MAX_DOCUMENT_PARITY_PIXELS) {
    return { status: "unavailable", reason: "surface-budget" };
  }
  let mismatchedPixels = 0;
  let maxChannelDelta = 0;
  for (let offset = 0; offset < reference.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(reference.data[offset + channel]! - presented.data[offset + channel]!);
      changed ||= delta !== 0;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (changed) mismatchedPixels += 1;
  }
  return Object.freeze({
    status: mismatchedPixels === 0 ? "matched" : "mismatch",
    width, height, comparedPixels, mismatchedPixels, maxChannelDelta,
    colorSpace: "srgb", alphaEncoding: "straight-rgba8", channelTolerance: 0,
  });
}

/**
 * The GPU controller proves only final-live/commit output lineage. This separate oracle replays
 * the ordinary document compositor, including paper, material tips and bounded-flow semantics.
 * Its temporary canvas is never displayed, persisted, or uploaded to impersonate GPU rendering.
 */
export function measureStudioDryMediaDocumentParity(input: Readonly<{
  element: DrawEl;
  layoutKey: string;
  snapshot: HTMLCanvasElement;
  configuration: StudioEngineWebGpuPresentationConfiguration;
  paperSurface?: StudioPaperSurfaceSettings;
}>): StudioDryMediaDocumentParityResult {
  const { element, configuration, snapshot } = input;
  const width = configuration.physicalWidth;
  const height = configuration.physicalHeight;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || snapshot.width !== width || snapshot.height !== height) {
    return { status: "unavailable", reason: "invalid-pixels" };
  }
  if (width * height > MAX_DOCUMENT_PARITY_PIXELS) {
    return { status: "unavailable", reason: "surface-budget" };
  }
  let reference: HTMLCanvasElement | null = null;
  try {
    const planned = planStudioDynamicBrushRender(element, "dry-media", false, input.paperSurface);
    if (planned.status !== "ready") return { status: "unavailable", reason: "reference-plan-rejected" };
    const plan = planned.plan;
    const marks = planStudioDynamicBrushCoverageAndLegacyMarks({
      dabVariations: plan.dabVariations,
      dynamics: plan.dynamics,
      materialIdentity: plan.materialIdentity,
      dynamicSeed: plan.seed,
      stroke: element.stroke,
      stampGrid: plan.renderBudget.stampGrid,
      markBudget: plan.markBudget,
      ...(plan.paper ? { paper: plan.paper } : {}),
    });
    if (plan.usesCausalDepositPlan && !marks.coveragePlan.ok) {
      return { status: "unavailable", reason: "reference-plan-rejected" };
    }
    reference = document.createElement("canvas");
    reference.width = width;
    reference.height = height;
    const context = reference.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
    const presentedContext = snapshot.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
    if (!context || !presentedContext) return { status: "unavailable", reason: "readback-unavailable" };
    // Use the actual configured physical transform, not a second DPR/flip rounding policy.
    const { m11, m12, m21, m22, dx, dy } = configuration.documentToSurface;
    context.setTransform(m11, m12, m21, m22, dx, dy);
    context.globalCompositeOperation = "source-over";
    if (marks.coveragePlan.ok && isStudioBoundedFlowPaintModelCompatible(element)) {
      const rendered = renderStudioDynamicBrushCoverage(context, marks.coveragePlan.marks, {
        activeDraft: false,
        opacity: element.opacity ?? 1,
        // A comparison must not evict or acquire the document's retained tile cache identity.
      });
      if (rendered.status !== "rendered" && rendered.status !== "empty") {
        return { status: "unavailable", reason: "reference-render-failed" };
      }
    } else {
      renderStudioDynamicBrushLegacyMarks(context, marks.legacyMarks, element.opacity ?? 1);
    }
    // Both readbacks are straight sRGB RGBA8, after the GPU presentation's linear conversion.
    const comparison = compareStudioDryMediaDocumentPixels(
      context.getImageData(0, 0, width, height),
      presentedContext.getImageData(0, 0, width, height),
    );
    return comparison.status === "unavailable" ? comparison
      : Object.freeze({ ...comparison, element, layoutKey: input.layoutKey });
  } catch {
    return { status: "unavailable", reason: "readback-unavailable" };
  } finally {
    if (reference) {
      reference.width = 0;
      reference.height = 0;
    }
  }
}
