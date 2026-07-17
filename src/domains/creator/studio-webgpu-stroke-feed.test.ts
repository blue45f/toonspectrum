import { describe, expect, it } from "vitest";

import { STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1 } from "./studio-ink-pressure-model";
import { STUDIO_GPU_STROKE_FEED_REVISION, type StudioGpuStroke } from "./studio-webgpu-stroke";
import {
  advanceStudioGpuStrokeFeed,
  createStudioGpuStrokeFeedBaseline,
  planStudioGpuPinnedStrokeFeedUpdate,
  studioGpuStrokeFeedSuffixFromPointCount,
  type StudioGpuStrokeSuffixPatch,
} from "./studio-webgpu-stroke-feed";

function stroke(overrides: Partial<StudioGpuStroke> = {}): StudioGpuStroke {
  return {
    id: "live",
    points: [2, 3],
    pressures: [0.5],
    color: "#7c5cff",
    size: 6,
    opacity: 1,
    composite: "normal",
    ...overrides,
  };
}

function inaccessiblePrefix(values: number[], inaccessibleLength: number): readonly number[] {
  return new Proxy(values, {
    get(target, property, receiver) {
      const index = typeof property === "string" && /^\d+$/.test(property)
        ? Number(property)
        : -1;
      if (index >= 0 && index < inaccessibleLength) {
        throw new Error(`historical sample ${index} was read`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

function patch(
  fallbackStrokes: readonly StudioGpuStroke[],
  previousPointCount: number,
  suffixPoints: readonly number[],
  suffixPressures: readonly number[]
): StudioGpuStrokeSuffixPatch {
  return {
    strokeIndex: 0,
    previousPointCount,
    suffixPoints,
    suffixPressures,
    nextStroke: fallbackStrokes[0]!,
    fallbackStrokes,
  };
}

describe("Studio WebGPU append-only stroke feed", () => {
  it("keeps a single-tap baseline and reconstructs only the appended bridge suffix", () => {
    const baseline = createStudioGpuStrokeFeedBaseline([stroke()], "tap-feed");
    expect(baseline).not.toBeNull();
    expect(baseline![0]?.[STUDIO_GPU_STROKE_FEED_REVISION]).toMatchObject({
      pointCount: 1,
      revision: 0,
    });

    const moved = [stroke({ points: [2, 3, 9, 7], pressures: [0.5, 0.8] })];
    const advanced = advanceStudioGpuStrokeFeed(
      baseline!,
      patch(moved, 1, [9, 7], [0.8])
    );

    expect(advanced.status).toBe("appended");
    expect(advanced.strokes[0]?.[STUDIO_GPU_STROKE_FEED_REVISION]).toMatchObject({
      pointCount: 2,
      revision: 1,
      parentPointCount: 1,
    });
    expect(studioGpuStrokeFeedSuffixFromPointCount(advanced.strokes[0]!, 1)).toMatchObject({
      points: [2, 3, 9, 7],
      pressures: [0.5, 0.8],
    });
  });

  it("coalesces skipped pointer frames from revision chunks without reading retained arrays", () => {
    const baseline = createStudioGpuStrokeFeedBaseline([stroke()], "no-history-read")!;
    const firstPoints = inaccessiblePrefix([2, 3, 8, 4], 2);
    const first = [stroke({ points: firstPoints, pressures: [0.5, 0.65] })];
    const advanced = advanceStudioGpuStrokeFeed(
      baseline,
      patch(first, 1, [8, 4], [0.65])
    );
    expect(advanced.status).toBe("appended");

    const secondPoints = inaccessiblePrefix([2, 3, 8, 4, 13, 9], 4);
    const second = [stroke({ points: secondPoints, pressures: [0.5, 0.65, 0.9] })];
    const sealed = advanceStudioGpuStrokeFeed(
      advanced.strokes,
      patch(second, 2, [13, 9], [0.9])
    );
    expect(sealed.status).toBe("appended");

    // A retained GPU frame may still contain only the tap. Reconstructing from point 1 walks the
    // two tiny revision chunks and never touches indices 0..3 of the latest source array.
    expect(studioGpuStrokeFeedSuffixFromPointCount(sealed.strokes[0]!, 1)).toMatchObject({
      points: [2, 3, 8, 4, 13, 9],
      pressures: [0.5, 0.65, 0.9],
    });
  });

  it("treats a final sealed endpoint as one ordinary append and rejects a stale count", () => {
    const initial = stroke({ points: [0, 0, 10, 0], pressures: [0.4, 0.6] });
    const baseline = createStudioGpuStrokeFeedBaseline([initial], "seal-feed")!;
    const final = [stroke({ points: [0, 0, 10, 0, 11, 1], pressures: [0.4, 0.6, 0.7] })];

    expect(advanceStudioGpuStrokeFeed(
      baseline,
      patch(final, 2, [11, 1], [0.7])
    ).status).toBe("appended");
    expect(advanceStudioGpuStrokeFeed(
      baseline,
      patch(final, 1, [11, 1], [0.7])
    )).toEqual({ status: "rejected", strokes: baseline });
  });

  it("adapts compatible full pinned arrays to append/retain and routes edits to replacement", () => {
    const tap = [stroke()];
    const moved = [stroke({ points: [2, 3, 9, 7], pressures: [0.5, 0.8] })];
    const append = planStudioGpuPinnedStrokeFeedUpdate(tap, moved);

    expect(append).toMatchObject({
      mode: "append",
      patch: {
        previousPointCount: 1,
        suffixPoints: [9, 7],
        suffixPressures: [0.8],
      },
    });
    expect(planStudioGpuPinnedStrokeFeedUpdate(moved, [stroke({
      points: [2, 3, 9, 7],
      pressures: [0.5, 0.8],
    })])).toMatchObject({ mode: "retain" });
    expect(planStudioGpuPinnedStrokeFeedUpdate(moved, [stroke({
      points: [2, 3, 9, 7, 12, 9],
      pressures: [0.5, 0.8, 1],
      color: "#ff0000",
    })])).toMatchObject({ mode: "replace" });
    expect(planStudioGpuPinnedStrokeFeedUpdate(moved, [])).toEqual({ mode: "reset" });

    const settled = moved[0]!;
    const nextOperation = stroke({ id: "next", points: [20, 20], pressures: [0.6] });
    expect(planStudioGpuPinnedStrokeFeedUpdate(
      [settled],
      [settled, nextOperation]
    )).toMatchObject({
      mode: "append-operations",
      patch: {
        previousStrokeCount: 1,
        suffixStrokes: [nextOperation],
      },
    });
  });

  it("binds linear pressure semantics into feed style, suffixes, and accumulated bounds", () => {
    const pressureModel = STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1;
    const tap = stroke({
      points: [10, 20],
      pressures: [0],
      size: 10,
      pressureModel,
    });
    const baseline = createStudioGpuStrokeFeedBaseline([tap], "linear-feed")!;
    expect(baseline[0]?.[STUDIO_GPU_STROKE_FEED_REVISION]).toMatchObject({
      minimumX: 10,
      maximumX: 10,
      minimumY: 20,
      maximumY: 20,
    });

    const extended = [stroke({
      points: [10, 20, 30, 20],
      pressures: [0, 1],
      size: 10,
      pressureModel,
    })];
    const advanced = advanceStudioGpuStrokeFeed(
      baseline,
      patch(extended, 1, [30, 20], [1])
    );
    expect(advanced.status).toBe("appended");
    expect(advanced.strokes[0]?.[STUDIO_GPU_STROKE_FEED_REVISION]).toMatchObject({
      minimumX: 10,
      maximumX: 35,
      minimumY: 15,
      maximumY: 25,
    });
    expect(studioGpuStrokeFeedSuffixFromPointCount(advanced.strokes[0]!, 1))
      .toMatchObject({ pressureModel });
    expect(planStudioGpuPinnedStrokeFeedUpdate(baseline, [{ ...extended[0]!, pressureModel: undefined }]))
      .toMatchObject({ mode: "replace" });
  });

  it("records model-specific nominal pressure when a baseline sample is missing", () => {
    const linear = createStudioGpuStrokeFeedBaseline([stroke({
      pressures: [],
      pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
    })], "linear-missing")!;
    const legacy = createStudioGpuStrokeFeedBaseline([stroke({ pressures: [] })], "legacy-missing")!;

    expect(linear[0]?.[STUDIO_GPU_STROKE_FEED_REVISION]?.lastPressure).toBe(1);
    expect(legacy[0]?.[STUDIO_GPU_STROKE_FEED_REVISION]?.lastPressure).toBe(0.5);
  });
});
