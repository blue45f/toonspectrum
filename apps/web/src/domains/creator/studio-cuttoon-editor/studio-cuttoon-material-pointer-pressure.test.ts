import { describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke, mapBrushStudioV6Pressure } from "../brush-lab/brush-studio-v6-material-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { initializeStudioBrushVelocityPressure } from "../brush/studio-brush-velocity-pressure";
import { planStudioDrawPointerStart, type StudioDrawPointerStartInput } from "../brush/studio-draw-pointer-start-plan";
import { planStudioMaterialBrush, studioMaterialBrushConfig } from "../brush/studio-material-brush-runtime";
import { planStudioPointerReleaseEndpoint } from "../canvas/studio-pointer-release-endpoint-plan";
import { quantizeFixedRateStrokeSample } from "../studio-fixed-rate-stroke-filter";

import { bindStudioCuttoonStagePointersFreehand } from "./studio-cuttoon-stage-pointers-freehand";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";

const brush = createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));
const pressureSettings = {
  pressureCurve: 2.7,
  pressureMinSize: 0.8,
  useVelocityPressure: true,
  velocitySensitivity: 1,
  stylusPressureProfile: {
    version: 1 as const, enabled: true, deadZone: 0.3, saturation: 0.7,
    points: [{ input: 0, output: 0 }, { input: 0.5, output: 0.1 }, { input: 1, output: 1 }],
  },
};

function pointer(pointerType: string, pressure: number, index: number): PointerEvent {
  return {
    pointerType, pressure, clientX: 20 + index * 30, clientY: 40 + index * 5,
    timeStamp: 100 + index * 8, buttons: 1, tiltX: 0, tiltY: 0, twist: 0,
  } as PointerEvent;
}

function fixture(pointerType: string, initialPressure: number, material = true, causal = false) {
  const down = pointer(pointerType, initialPressure, 0);
  const input: StudioDrawPointerStartInput = {
    id: "material-input", position: { x: down.clientX, y: down.clientY }, pointer: down,
    drawMode: "pen", drawShape: "line", shapeFill: false,
    color: brush.color, strokeWidth: brush.strokeWidth, brushOpacity: 0.73,
    brush: causal ? "pen" : "brush", brushEnginePrograms: material ? brush.enginePrograms : undefined,
    stampTuning: null, brushDynamics: {}, stabilizer: 0, stabilizerMode: "standard",
    positionScale: 1, brushTip: { tiltEnabled: false, angleDeg: 0, roundness: 1 },
    symmetry: { type: "none", centerX: 0, centerY: 0, radialCount: 4 },
    ...pressureSettings,
  };
  const plan = planStudioDrawPointerStart(input);
  const drawingRef = { current: plan.element };
  const settings = { ...pressureSettings, coordinateScale: 1, stabilizer: 0, stabilizerMode: "standard" };
  const host = {
    drawMode: "pen", drawingRef,
    drawingInputSettingsRef: { current: settings },
    drawingVelocityPressureRef: { current: initializeStudioBrushVelocityPressure("pen", down, plan.element, settings) },
    drawingVelocityRef: { current: null }, drawingFixedRateFilterRef: { current: null },
    drawingImmediateCausalInputRef: { current: plan.causalInputPlan.sampleSpacing === 0 },
    drawingThinLineInkInputRef: { current: null }, drawingPredictionPreviewRef: { current: false },
    drawingInkTimeOriginRef: { current: down.timeStamp }, drawingStabilizerRef: { current: null },
    drawingPrecisionStabilizerBridgeRef: { current: null },
    drawingImmediateBatchMutationRef: { current: false }, drawingPredictionBatchMutationRef: { current: false },
    liveDraftDirectRef: { current: false }, liveStampDraftDirectRef: { current: false },
    liveDynamicBrushDraftDirectRef: { current: false }, liveRetainedMediaDraftDirectRef: { current: false },
    liveWetInkDraftDirectRef: { current: false },
    perspectiveRulerActive: false, isometricGridActive: false, vanishingPoints: [], effScale: 1,
    stabilizer: 0, stabilizerMode: "standard", scheduleLiveDrawPressure: vi.fn(), scheduleDraft: vi.fn(),
    ...pressureSettings,
  } as unknown as StudioCuttoonStagePointersHost;
  const api = { applyStrokeObjectSnapToPoint: (x: number, y: number) => ({ x, y }) } as StudioCuttoonStagePointersApi;
  bindStudioCuttoonStagePointersFreehand(host, api);
  return { plan, host, api, drawingRef };
}

function quantizedPressure(value: number): number {
  return quantizeFixedRateStrokeSample({ x: 0, y: 0, pressure: value, positionScale: 1, tiltX: 0, tiltY: 0, timeStamp: 100 }).pressure;
}

describe("material pressure through real pointer start, freehand move and release", () => {
  it.each([0, 0.2, 0.75, 1])("preserves raw pen pressure %s despite device/family curves, floors and velocity", (initialPressure) => {
    const { plan, api, drawingRef } = fixture("pen", initialPressure);
    expect(plan.pressure).toBe(initialPressure);
    const rawPressures = [initialPressure, 0.2, 0.75, 1];
    for (let index = 1; index < rawPressures.length; index += 1) {
      const move = pointer("pen", rawPressures[index]!, index);
      api.appendFreehandStrokePoint({ x: move.clientX, y: move.clientY }, move);
    }
    expect(drawingRef.current.pressures).toEqual(rawPressures);
    const release = planStudioPointerReleaseEndpoint({
      stroke: drawingRef.current, endpoint: { x: 145, y: 62 },
      pointer: { pointerType: "pen", pressure: 0 }, ...pressureSettings,
    });
    expect(release.appended).toBe(true);
    expect(release.stroke.pressures).toEqual([...rawPressures, 1]);

    // Feed identical recorded contact coordinates to the workbench solver. The material program
    // applies its calibration once; editor device and brush-family curves cannot rewrite input.
    const config = studioMaterialBrushConfig(release.stroke)!;
    const workbench = createBrushStudioV6MaterialStroke(config);
    const expected = release.stroke.pressures!.flatMap((pressure, index) => workbench.push({
      x: release.stroke.points[index * 2]!, y: release.stroke.points[index * 2 + 1]!,
      pressure: mapBrushStudioV6Pressure(pressure, config.input), tilt: 0, twist: 0,
    }));
    expect(planStudioMaterialBrush(release.stroke)).toEqual(expected);
  });

  it("keeps a mouse at workbench 0.5 across stationary, fast and release input", () => {
    const { api, drawingRef, plan } = fixture("mouse", 0);
    expect(plan.pressure).toBe(0.5);
    for (const [index, rawPressure] of [0, 0.5, 1].entries()) {
      const move = pointer("mouse", rawPressure, index + 1);
      api.appendFreehandStrokePoint({ x: move.clientX, y: move.clientY }, move);
    }
    expect(drawingRef.current.pressures).toEqual(Array(4).fill(0.5));
    const release = planStudioPointerReleaseEndpoint({
      stroke: drawingRef.current, endpoint: { x: 145, y: 62 },
      pointer: { pointerType: "mouse", pressure: 0 }, ...pressureSettings,
    });
    expect(release.stroke.pressures).toEqual(Array(5).fill(0.5));
  });

  it("preserves the existing causal quantization when a material program uses the immediate pen input route", () => {
    const { plan, api, drawingRef } = fixture("pen", 0.2, true, true);
    expect(plan.causalInputPlan.sampleSpacing).toBe(0);
    expect(plan.pressure).toBe(quantizedPressure(0.2));
    const move = pointer("pen", 0.75, 1);
    api.appendFreehandStrokePoint({ x: move.clientX, y: move.clientY }, move);
    expect(drawingRef.current.pressures).toEqual([quantizedPressure(0.2), quantizedPressure(0.75)]);
  });

  it("accepts a positive final pen contact without applying the editor pressure profile again", () => {
    const { drawingRef } = fixture("pen", 0.75);
    const release = planStudioPointerReleaseEndpoint({
      stroke: drawingRef.current, endpoint: { x: 70, y: 55 },
      pointer: { pointerType: "pen", pressure: 0.2 }, ...pressureSettings,
    });
    expect(release.stroke.pressures?.at(-1)).toBe(0.2);
  });

  it("continues to apply the legacy brush family and stylus profile without a material program", () => {
    const mouse = fixture("mouse", 0.5, false);
    expect(mouse.plan.pressure).toBe(0.65);
    const pen = fixture("pen", 0.2, false);
    expect(pen.plan.pressure).toBe(0);
    const move = pointer("pen", 0.75, 1);
    pen.api.appendFreehandStrokePoint({ x: move.clientX, y: move.clientY }, move);
    expect(pen.drawingRef.current.pressures?.at(-1)).toBe(1);
  });
});
