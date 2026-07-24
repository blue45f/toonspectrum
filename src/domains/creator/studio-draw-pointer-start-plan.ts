/**
 * Pure stroke-start planning boundary for Studio pointer input.
 *
 * The Page owns gesture priority, collaboration leases, pointer capture, CRDT publication, React
 * state, and live-surface I/O. This leaf only snapshots one contact's immutable brush contract and
 * creates the first serializable draw element. Keeping those decisions together prevents the
 * pointer-move and replay pipelines from seeing a partially configured stroke.
 */

import {
  normalizeCalligraphyStylusInput,
  resolveBrushPressureSample,
  resolveStudioBrushRenderFamily,
  strokeSampleDistanceForScale,
  type NormalizedCalligraphyStylusInput,
} from "./studio-brush";
import {
  normalizeStudioBrushDynamicsSettings,
  resolveStudioBrushDynamicsPresetId,
} from "./studio-brush-dynamics";
import {
  resolveStudioStampBrushKind,
  type StudioStampBrushTuning,
} from "./studio-brush-stamp-engine";
import { normalizeStudioBrushCatalogIdentityMetadata, type DrawEl } from "./studio-element-model";
import {
  resolveStudioCausalInkInputPlan,
  type StudioCausalInkInputPlan,
} from "./studio-fixed-rate-input-eligibility";
import {
  quantizeFixedRateStrokeSample,
  type FixedRateStrokeQuantizedSample,
} from "./studio-fixed-rate-stroke-filter";
import {
  STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
  STUDIO_INK_PRESSURE_MODEL_LINEAR_RESIDUAL_PATH_V3,
} from "./studio-ink-pressure-model";
import { STUDIO_PIXEL_PENCIL_RENDER_MODE } from "./studio-pixel-pencil";
import { STUDIO_STROKE_PAINT_MODEL_LAYERED_FLOW_V1 } from "./studio-stroke-paint-model";

import type { DrawMode, DrawShapeKind } from "./studio-editor-tool-model";
import type { StudioStabilizerMode } from "./studio-stroke-stabilizer";

export interface StudioDrawPointerStartSample {
  readonly pointerType?: unknown;
  readonly pressure?: unknown;
  readonly tiltX?: unknown;
  readonly tiltY?: unknown;
  readonly twist?: unknown;
  readonly tangentialPressure?: unknown;
  readonly timeStamp: number;
}

export interface StudioDrawPointerStartInput {
  readonly id: string;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly pointer: StudioDrawPointerStartSample;
  readonly drawMode: DrawMode;
  readonly drawShape: DrawShapeKind;
  readonly shapeFill: boolean;
  readonly color: string;
  readonly strokeWidth: number;
  readonly brushOpacity: number;
  readonly brush: string;
  readonly brushCatalogId?: unknown;
  readonly brushCatalogName?: unknown;
  readonly stampTuning?: StudioStampBrushTuning | null;
  readonly brushDynamics?: unknown;
  readonly stabilizer: number;
  readonly stabilizerMode: StudioStabilizerMode;
  readonly velocitySensitivity: number;
  readonly pressureCurve: number;
  /** CSP min size ratio (0..1) for residual pen/marker pressure floor. */
  readonly pressureMinSize?: number;
  readonly positionScale: number;
  readonly brushTip: Readonly<{
    tiltEnabled: boolean;
    angleDeg: number;
    roundness: number;
  }>;
  readonly symmetry: Readonly<{
    type: NonNullable<DrawEl["symmetry"]>["type"];
    centerX: number;
    centerY: number;
    radialCount: number;
  }>;
}

export interface StudioDrawPointerStartPlan {
  readonly element: DrawEl;
  readonly strokeOrigin: Readonly<{ x: number; y: number }>;
  readonly pressure: number;
  readonly stylus: NormalizedCalligraphyStylusInput;
  readonly causalInitialSample: FixedRateStrokeQuantizedSample | null;
  readonly causalInputPlan: StudioCausalInkInputPlan;
  readonly capturePointerDynamics: boolean;
}

function tangentialPressureOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(-1, value))
    : 0;
}

/** Builds one immutable stroke-start snapshot without touching browser, renderer, or app state. */
export function planStudioDrawPointerStart(
  input: StudioDrawPointerStartInput
): StudioDrawPointerStartPlan {
  const {
    brush,
    brushOpacity,
    brushTip,
    color,
    drawMode,
    drawShape,
    pointer,
    position,
    positionScale,
    shapeFill,
    stampTuning,
    strokeWidth,
    symmetry,
  } = input;
  const brushFamily = resolveStudioBrushRenderFamily(brush);
  const stampKind = drawMode === "pen" ? resolveStudioStampBrushKind(brush) : null;
  const causalWatercolor = drawMode === "pen" && brushFamily === "watercolor";
  // Eraser/pixel input contracts do not carry the currently selected pen's whole-stroke dynamics.
  // Letting that unrelated brush id affect eligibility sent the eraser through the slower legacy
  // stabilizer whenever an artist happened to switch from a dynamics brush.
  const hasBrushDynamics = drawMode === "pen"
    && resolveStudioBrushDynamicsPresetId(brush) !== null;
  const causalInputPlan = resolveStudioCausalInkInputPlan({
    stabilizerMode: input.stabilizerMode,
    stabilizerStrength: input.stabilizer,
    drawMode,
    brushFamily,
    hasBrushDynamics,
    causalStampV2: stampKind !== null,
    causalWatercolorV2: causalWatercolor,
  });
  const linearPressureEligible =
    drawMode === "eraser"
    || (drawMode === "pen" && (brushFamily === "pen" || brushFamily === "marker"));
  const residualPressureEligible =
    drawMode === "pen" && (brushFamily === "pen" || brushFamily === "marker");
  const pressureModel = linearPressureEligible
    ? residualPressureEligible
      ? STUDIO_INK_PRESSURE_MODEL_LINEAR_RESIDUAL_PATH_V3
      : STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1
    : undefined;
  const layeredFlowPaintEligible =
    drawMode === "pen"
    && brushOpacity < 1
    && (brushFamily === "pen" || brushFamily === "marker")
    && !hasBrushDynamics
    && stampKind === null
    && symmetry.type === "none";
  const resolvedPressure = resolveBrushPressureSample({
    pointerType: pointer.pointerType,
    rawPressure: pointer.pressure,
    distance: 0,
    // The first sample has no velocity. Real pen pressure still takes precedence.
    velocityFallbackEnabled: false,
    velocitySensitivity: input.velocitySensitivity,
    pressureCurve: input.pressureCurve,
    // Residual pen/marker only: stamp/dynamics own independent min floors.
    minSizeRatio: linearPressureEligible ? input.pressureMinSize : 0,
    // Versioned linear ink treats the selected size as full-pressure diameter. Specialty and
    // legacy engines retain their historical nominal-pressure contract.
    fallbackPressure: pressureModel ? 1 : 0.5,
  });
  const stylus = normalizeCalligraphyStylusInput(pointer);
  const causalInitialSample = causalInputPlan.sampleSpacing === 0
    ? quantizeFixedRateStrokeSample({
        x: position.x,
        y: position.y,
        positionScale,
        pressure: resolvedPressure,
        tiltX: stylus.tiltX,
        tiltY: stylus.tiltY,
        timeStamp: pointer.timeStamp,
      })
    : null;
  const strokeOrigin = causalInitialSample
    ? { x: causalInitialSample.x, y: causalInitialSample.y }
    : { x: position.x, y: position.y };
  const pressure = causalInitialSample?.pressure ?? resolvedPressure;
  const capturePointerDynamics = drawMode === "pen" && hasBrushDynamics;
  const captureStylus = drawMode === "pen" && (brush === "calligraphy" || capturePointerDynamics);
  const brushCatalogIdentity = drawMode === "pen"
    ? normalizeStudioBrushCatalogIdentityMetadata(input)
    : {};
  const common = {
    id: input.id,
    type: "draw" as const,
    stroke: color,
    strokeWidth,
    opacity: brushOpacity,
    brush: drawMode === "pen"
      ? brush
      : drawMode === "pixel"
        ? STUDIO_PIXEL_PENCIL_RENDER_MODE
        : undefined,
    ...brushCatalogIdentity,
    brushTip: drawMode === "pen" && brush === "calligraphy" ? { ...brushTip } : undefined,
    stamp: drawMode === "pen" && stampTuning && stampKind ? { ...stampTuning } : undefined,
    stampPipeline: drawMode === "pen" && stampKind ? "causal-walker-v2" as const : undefined,
    watercolorPipeline: causalWatercolor ? "causal-walker-v2" as const : undefined,
    brushDynamics: capturePointerDynamics
      ? normalizeStudioBrushDynamicsSettings(input.brushDynamics)
      : undefined,
    symmetry: drawMode === "pixel" || symmetry.type === "none"
      ? undefined
      : {
          type: symmetry.type,
          centerX: symmetry.centerX,
          centerY: symmetry.centerY,
          radialCount: symmetry.radialCount,
        },
  };
  const element: DrawEl = drawMode === "shape"
    ? {
        ...common,
        kind: drawShape,
        mode: "pen",
        points: [position.x, position.y, position.x, position.y],
        fill: shapeFill && drawShape !== "line" ? color : undefined,
        pressures: [pressure, pressure],
      }
    : {
        ...common,
        kind: "freehand",
        mode: drawMode === "eraser" ? "eraser" : "pen",
        points: [strokeOrigin.x, strokeOrigin.y],
        strokeWidth: drawMode === "pixel" ? 1 : strokeWidth,
        fill: drawMode === "lasso-fill" ? color : undefined,
        pressures: [drawMode === "pixel" ? 1 : pressure],
        pressureModel,
        paintModel: layeredFlowPaintEligible
          ? STUDIO_STROKE_PAINT_MODEL_LAYERED_FLOW_V1
          : undefined,
        sampleSpacing: drawMode === "pixel"
          ? 1
          : causalInputPlan.sampleSpacing ?? strokeSampleDistanceForScale(positionScale),
        tiltXs: captureStylus ? [stylus.tiltX] : undefined,
        tiltYs: captureStylus ? [stylus.tiltY] : undefined,
        twists: captureStylus ? [stylus.twist] : undefined,
        speeds: capturePointerDynamics ? [0] : undefined,
        tangentialPressures: capturePointerDynamics
          ? [tangentialPressureOf(pointer.tangentialPressure)]
          : undefined,
      };

  return {
    element,
    strokeOrigin,
    pressure,
    stylus,
    causalInitialSample,
    causalInputPlan,
    capturePointerDynamics,
  };
}
