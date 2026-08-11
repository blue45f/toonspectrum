import { describe, expect, it } from "vitest";

import {
  planNormalizedStudioDynamicBrushDabs,
  studioBrushDynamicsSettingsForBrushId,
} from "./studio-brush-dynamics";
import {
  isStudioWebDrawingBrushId,
  planStudioWebAwareDynamicBrushDabs,
  planStudioWebDrawingDynamicDabs,
  STUDIO_WEB_DRAWING_ALL_BRUSH_IDS,
} from "./studio-web-drawing-stroke-bridge";

const POINTS = Object.freeze([100, 100, 120, 108, 150, 120, 180, 140, 200, 160]);
const PRESSURES = Object.freeze([0.4, 0.7, 0.9, 0.55, 0.35]);

describe("studio web drawing stroke bridge", () => {
  it("lists every competitive+coloring+assist web brush", () => {
    expect(STUDIO_WEB_DRAWING_ALL_BRUSH_IDS.length).toBeGreaterThanOrEqual(25);
    expect(isStudioWebDrawingBrushId("web-multi-agent")).toBe(true);
    expect(isStudioWebDrawingBrushId("web-cross-hatch-pen")).toBe(true);
    expect(isStudioWebDrawingBrushId("pen")).toBe(false);
  });

  it("maps web kit samples into dynamic dabs for each web brush", () => {
    for (const brushId of STUDIO_WEB_DRAWING_ALL_BRUSH_IDS) {
      const settings = studioBrushDynamicsSettingsForBrushId(brushId);
      expect(settings, brushId).not.toBeNull();
      const dabs = planStudioWebDrawingDynamicDabs(
        {
          brushId,
          points: POINTS,
          pressures: PRESSURES,
          baseWidth: 10,
          baseOpacity: 1,
          seed: 7,
          maxDabs: 512,
          centerX: 150,
          centerY: 130,
        },
        settings!,
      );
      expect(dabs, brushId).not.toBeNull();
      expect(dabs!.length, brushId).toBeGreaterThan(0);
      expect(dabs!.every((d) => d.size > 0 && d.opacity > 0), brushId).toBe(true);
    }
  });

  it("falls through to ordinary dynamics for non-web brushes", () => {
    const settings = studioBrushDynamicsSettingsForBrushId("airbrush")!;
    const dabs = planStudioWebAwareDynamicBrushDabs(
      {
        brushId: "airbrush",
        points: POINTS,
        pressures: PRESSURES,
        baseWidth: 20,
        baseOpacity: 1,
        seed: 1,
        maxDabs: 64,
        settings,
      },
      (input, s) => planNormalizedStudioDynamicBrushDabs(input, s),
    );
    expect(dabs.length).toBeGreaterThan(0);
    expect(planStudioWebDrawingDynamicDabs({
      brushId: "airbrush",
      points: POINTS,
    }, settings)).toBeNull();
  });

  it("respects maxDabs budget on multi-agent swarm", () => {
    const settings = studioBrushDynamicsSettingsForBrushId("web-multi-agent")!;
    const dabs = planStudioWebDrawingDynamicDabs(
      {
        brushId: "web-multi-agent",
        points: POINTS,
        pressures: PRESSURES,
        baseWidth: 8,
        maxDabs: 12,
        seed: 3,
      },
      settings,
    );
    expect(dabs).not.toBeNull();
    expect(dabs!.length).toBeLessThanOrEqual(12);
  });
});
