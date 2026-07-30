import { describe, expect, it } from "vitest";

import {
  planStudioInteractiveWetInkBrushReplay,
  STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY,
  STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY_VERSION,
  studioWetInkInteractiveBackendSupportsElement,
} from "./studio-wet-ink-backend-capability";

import type { DrawEl } from "./studio-element-model";

function wetStroke(id: string): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [0, 0],
    pressures: [0.55],
    stroke: "#315f9b",
    strokeWidth: 28,
    opacity: 0.55,
    brush: "watercolor",
    watercolorPipeline: "causal-walker-v2",
  };
}

describe("interactive wet-ink backend capability", () => {
  it("keeps physical wet ink fail-closed until an async provider owns it", () => {
    expect(STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY).toEqual({
      version: STUDIO_WET_INK_INTERACTIVE_BACKEND_CAPABILITY_VERSION,
      backendId: "worker-webgpu-wet-ink-v1",
      availability: "unavailable",
      mainThreadPhysicalField: false,
      fallbackRenderer: "wet-ribbon-carrier-v2",
      reason: "async-provider-not-installed",
    });
    expect(studioWetInkInteractiveBackendSupportsElement(
      wetStroke("watercolor-gate"),
    )).toBe(false);
    expect(studioWetInkInteractiveBackendSupportsElement({
      ...wetStroke("ink-wash-gate"),
      brush: "ink-wash",
    })).toBe(false);
  });

  it("does not read or plan 50/100/200-sample physical fields on the interactive main thread", () => {
    for (const sampleCount of [50, 100, 200]) {
      const element = wetStroke(`blocked-${sampleCount}`);
      let geometryReads = 0;
      Object.defineProperty(element, "points", {
        configurable: true,
        enumerable: true,
        get() {
          geometryReads += 1;
          throw new Error("physical wet-ink planner must not read interactive geometry");
        },
      });
      Object.defineProperty(element, "pressures", {
        configurable: true,
        enumerable: true,
        get() {
          geometryReads += 1;
          throw new Error("physical wet-ink planner must not read interactive pressure");
        },
      });

      expect(planStudioInteractiveWetInkBrushReplay(
        element,
        { phase: "committed" },
      )).toBeNull();
      expect(geometryReads, `${sampleCount}-sample planner access`).toBe(0);
      expect(element.brush).toBe("watercolor");
      expect(element.watercolorPipeline).toBe("causal-walker-v2");
    }
  });
});
