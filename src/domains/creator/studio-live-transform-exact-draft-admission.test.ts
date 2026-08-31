import { describe, expect, it } from "vitest";

import { studioCalligraphyRibbonWorkUpperBound } from "./brush/studio-calligraphy-ribbon";
import { studioCalligraphyMaximumNibRadius } from "./studio-brush";
import {
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_CALLIGRAPHY_SAMPLES,
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS,
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DABS,
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_SAMPLES,
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_SCENE_ELEMENTS,
  admitStudioLiveTransformExactDraft,
} from "./studio-live-transform-exact-draft-admission";
import {
  studioPerfectFreehandMaximumPaintRadius,
  studioPerfectFreehandWorkUpperBound,
} from "./studio-perfect-freehand";

const sourceBounds = { x: 0, y: 0, width: 100, height: 50 };
const targetBounds = { x: 20, y: 30, width: 200, height: 75 };

function decide(overrides: Partial<Parameters<typeof admitStudioLiveTransformExactDraft>[0]> = {}) {
  return admitStudioLiveTransformExactDraft({
    complexity: {
      rendererEngine: "causal-ink",
      sampleCount: 40,
      pathLength: 240,
      strokeWidth: 4,
      causalMaxDabRadius: 3.4,
    },
    sourceBounds,
    targetBounds,
    sceneElementCount: 200,
    rasterScale: 1,
    sceneCanvasBackingPixels: 1_000_000,
    ...overrides,
  });
}

function calligraphyComplexity(sampleCount: number, strokeWidth = 4) {
  const work = studioCalligraphyRibbonWorkUpperBound(sampleCount)!;
  return {
    rendererEngine: "calligraphy-segments",
    sampleCount,
    pathLength: Math.max(0, sampleCount - 1) * 3,
    strokeWidth,
    rendererExpandedScalarWork: work.outlineCoordinateScalars,
    rendererPathCommandUpperBound: work.canvasPathCommands,
    rendererMaxPaintRadius: studioCalligraphyMaximumNibRadius(strokeWidth, sampleCount),
  } as const;
}

function perfectComplexity(sampleCount: number, strokeWidth = 4) {
  const work = studioPerfectFreehandWorkUpperBound(sampleCount)!;
  return {
    rendererEngine: "perfect-outline",
    sampleCount,
    pathLength: Math.max(0, sampleCount - 1) * 3,
    strokeWidth,
    rendererExpandedScalarWork: work.pathCoordinateScalars,
    rendererPathCommandUpperBound: work.pathCommands,
    rendererMaxPaintRadius: studioPerfectFreehandMaximumPaintRadius(strokeWidth),
  } as const;
}

describe("admitStudioLiveTransformExactDraft", () => {
  it("bounds calligraphy's one-point pressure Ellipse separately from its ribbon nib", () => {
    expect(studioCalligraphyMaximumNibRadius(4, 1, 1)).toBeCloseTo(3.4, 12);
    expect(studioCalligraphyMaximumNibRadius(4, 1, 1.3)).toBeCloseTo(4.24, 12);
    expect(studioCalligraphyMaximumNibRadius(0.1, 1, 0)).toBe(0.35);
    expect(studioCalligraphyMaximumNibRadius(4, 2)).toBe(2.5);
  });

  it("admits a bounded causal frame using the 0.5px worst-case dab spacing", () => {
    expect(decide()).toEqual({
      admitted: true,
      lane: "causal-dabs",
      estimatedWork: 1_000,
    });
  });

  it("rejects a two-point causal segment whose transformed dab field exceeds the frame budget", () => {
    const pathLength = STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DABS;
    expect(decide({
      complexity: {
        rendererEngine: "causal-ink",
        sampleCount: 2,
        pathLength,
        strokeWidth: 4,
        causalMaxDabRadius: 3.4,
      },
    })).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });
  });

  it("rejects a 100k-sample zero-length causal stroke despite its one-dab estimate", () => {
    expect(decide({
      complexity: {
        rendererEngine: "causal-ink",
        sampleCount: 100_000,
        pathLength: 0,
        strokeWidth: 4,
        causalMaxDabRadius: 3.4,
      },
    })).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });
    expect(decide({
      complexity: {
        rendererEngine: "causal-ink",
        sampleCount: STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_SAMPLES,
        pathLength: 0,
        strokeWidth: 4,
        causalMaxDabRadius: 3.4,
      },
    }).admitted).toBe(true);
  });

  it("charges calligraphy's 32-step ribbon expansion instead of its raw sample count", () => {
    const oversized = decide({ complexity: calligraphyComplexity(3_200) });
    expect(oversized).toMatchObject({ admitted: false, reason: "renderer-budget" });
    expect(oversized.estimatedWork).toBeGreaterThan(3_200);

    const adversarial = decide({
      complexity: calligraphyComplexity(STUDIO_LIVE_TRANSFORM_EXACT_MAX_CALLIGRAPHY_SAMPLES),
    });
    expect(adversarial).toEqual({
      admitted: false,
      reason: "renderer-budget",
      // 255 accepted segments * 208 final outline scalars - the first polygon's shared bridge.
      estimatedWork: 53_038,
    });

    expect(decide({ complexity: calligraphyComplexity(19) }).admitted).toBe(true);
    expect(decide({ complexity: calligraphyComplexity(20) })).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });
  });

  it("charges perfect-freehand outline/path expansion instead of raw samples", () => {
    expect(decide({ complexity: perfectComplexity(71) }).admitted).toBe(true);
    expect(decide({ complexity: perfectComplexity(72) })).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });
    const maximumRawCandidate = decide({ complexity: perfectComplexity(2_048) });
    expect(maximumRawCandidate).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });
    expect(maximumRawCandidate.estimatedWork).toBeGreaterThan(2_048);
  });

  it("rejects scene and malformed input before any renderer work", () => {
    expect(decide({
      sceneElementCount: STUDIO_LIVE_TRANSFORM_EXACT_MAX_SCENE_ELEMENTS + 1,
    })).toMatchObject({ admitted: false, reason: "scene-budget" });
    expect(decide({
      complexity: {
        rendererEngine: "causal-ink",
        sampleCount: 1,
        pathLength: Number.NaN,
        strokeWidth: 4,
        causalMaxDabRadius: 3.4,
      },
    })).toMatchObject({ admitted: false, reason: "invalid" });
    expect(decide({ sceneCanvasBackingPixels: Number.NaN })).toMatchObject({
      admitted: false,
      reason: "invalid",
    });
  });

  it("charges the full Layer SceneCanvas clear even when the object AABB is tiny", () => {
    const tinyBounds = { x: 0, y: 0, width: 1, height: 1 };
    expect(decide({
      sourceBounds: tinyBounds,
      targetBounds: tinyBounds,
      sceneCanvasBackingPixels: STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS,
    }).admitted).toBe(true);
    expect(decide({
      sourceBounds: tinyBounds,
      targetBounds: tinyBounds,
      sceneCanvasBackingPixels: STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS + 1,
    })).toEqual({
      admitted: false,
      reason: "renderer-budget",
      estimatedWork: STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS + 1,
    });
  });

  it("rejects a valid maximum-width causal stroke before full-canvas dab overdraw", () => {
    expect(decide({
      complexity: {
        rendererEngine: "causal-ink",
        sampleCount: 128,
        pathLength: 500,
        strokeWidth: 8_192,
        causalMaxDabRadius: 6_963.2,
      },
    })).toMatchObject({ admitted: false, reason: "renderer-budget" });
  });

  it("charges every short causal segment and its backing-pixel footprint", () => {
    // 2,048 tiny, non-zero segments each emit at least one legacy dab even though their combined
    // path is only ~1px. The old total-length estimate counted four dabs and admitted this frame.
    expect(decide({
      complexity: {
        rendererEngine: "causal-ink",
        sampleCount: 2_048,
        pathLength: 1,
        strokeWidth: 64,
        causalMaxDabRadius: 54.4,
      },
    })).toMatchObject({ admitted: false, reason: "renderer-budget" });

    const retinaCandidate = {
      rendererEngine: "causal-ink",
      sampleCount: 100,
      pathLength: 0,
      strokeWidth: 58,
      causalMaxDabRadius: 50,
    } as const;
    expect(decide({ complexity: retinaCandidate, rasterScale: 1 }).admitted).toBe(true);
    expect(decide({ complexity: retinaCandidate, rasterScale: 2 })).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });
  });

  it("rejects wide calligraphy and perfect fills when zoom times DPR exceeds backing pixels", () => {
    const identityBounds = { sourceBounds, targetBounds: sourceBounds };
    const calligraphy = calligraphyComplexity(2, 400);
    expect(decide({ ...identityBounds, complexity: calligraphy, rasterScale: 1 }).admitted)
      .toBe(true);
    expect(decide({ ...identityBounds, complexity: calligraphy, rasterScale: 4 })).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });

    const perfect = perfectComplexity(2, 256);
    expect(decide({ ...identityBounds, complexity: perfect, rasterScale: 1 }).admitted)
      .toBe(true);
    expect(decide({ ...identityBounds, complexity: perfect, rasterScale: 4 })).toMatchObject({
      admitted: false,
      reason: "renderer-budget",
    });
  });

  it("applies the same zoom/DPR backing and path-sweep ceiling to the generic lane", () => {
    const generic = {
      rendererEngine: "future-path-adapter",
      sampleCount: 100,
      pathLength: 100,
      strokeWidth: 100,
    } as const;
    expect(decide({
      sourceBounds,
      targetBounds: sourceBounds,
      complexity: generic,
      rasterScale: 1,
    })).toEqual({ admitted: true, lane: "generic", estimatedWork: 100 });
    expect(decide({
      sourceBounds,
      targetBounds: sourceBounds,
      complexity: generic,
      rasterScale: 8,
    })).toMatchObject({ admitted: false, reason: "renderer-budget" });
  });
});
