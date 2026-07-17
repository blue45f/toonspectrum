import { describe, expect, it } from "vitest";

import {
  planStudioCausalInk,
  planStudioCausalInkDabs,
  selectStudioCausalInkSamples,
  STUDIO_CAUSAL_INK_DEFAULT_PRESSURE,
} from "./studio-causal-ink";
import { planStudioGpuDabs } from "./studio-webgpu-engine";
import { studioGpuPressureRadius } from "./studio-webgpu-stroke";

describe("studio causal ink", () => {
  it("consumes only the longest finite coordinate-pair prefix", () => {
    const samples = selectStudioCausalInkSamples({
      points: [0, 1, 4, 5, Number.NaN, 8, 20, 30, 99],
      pressures: [0.1, 0.2, 0.3, 0.4],
      minDistance: 0,
    });

    expect(samples).toEqual([
      { x: 0, y: 1, pressure: 0.1, sourceIndex: 0 },
      { x: 4, y: 5, pressure: 0.2, sourceIndex: 1 },
    ]);
    expect(selectStudioCausalInkSamples({
      points: [Number.POSITIVE_INFINITY, 0, 4, 5],
      minDistance: 0,
    })).toEqual([]);
    expect(selectStudioCausalInkSamples({
      points: [2, 3, 99],
      pressures: [0.7, 1],
      minDistance: 0,
    })).toEqual([{ x: 2, y: 3, pressure: 0.7, sourceIndex: 0 }]);
  });

  it("keeps the first sample and seals the final distinct endpoint below minDistance", () => {
    const samples = selectStudioCausalInkSamples({
      points: [0, 0, 1, 0, 2, 0, 6, 0, 7, 0],
      pressures: [0.1, 0.25, 0.5, 0.75, 0.9],
      minDistance: 5,
    });

    expect(samples).toEqual([
      { x: 0, y: 0, pressure: 0.1, sourceIndex: 0 },
      { x: 6, y: 0, pressure: 0.75, sourceIndex: 3 },
      { x: 7, y: 0, pressure: 0.9, sourceIndex: 4 },
    ]);
  });

  it("exposes an append-stable unsealed prefix for a replaceable pointer tail", () => {
    const before = selectStudioCausalInkSamples({
      points: [0, 0, 1, 0, 2, 0],
      pressures: [0.2, 0.4, 0.6],
      minDistance: 5,
      sealEndpoint: false,
    });
    const after = selectStudioCausalInkSamples({
      points: [0, 0, 1, 0, 2, 0, 6, 0],
      pressures: [0.2, 0.4, 0.6, 0.8],
      minDistance: 5,
      sealEndpoint: false,
    });

    expect(before).toEqual([{ x: 0, y: 0, pressure: 0.2, sourceIndex: 0 }]);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toEqual({ x: 6, y: 0, pressure: 0.8, sourceIndex: 3 });
  });

  it("preserves retained source-index pressure instead of progress-resampling it", () => {
    const samples = selectStudioCausalInkSamples({
      points: [0, 0, 1, 0, 2, 0, 10, 0, 20, 0],
      pressures: [0, 0.25, 0.5, 0.75, 1],
      minDistance: 3,
    });

    expect(samples.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 3, 4]);
    expect(samples.map(({ pressure }) => pressure)).toEqual([0, 0.75, 1]);
  });

  it("sanitizes pressure at its source index and omits exact duplicate endpoints", () => {
    const samples = selectStudioCausalInkSamples({
      points: [0, 0, 0, 0, 4, 0, 4, 0],
      pressures: [-1, Number.NaN, 2, Number.POSITIVE_INFINITY],
      minDistance: 10,
    });

    expect(samples).toEqual([
      { x: 0, y: 0, pressure: 0, sourceIndex: 0 },
      {
        x: 4,
        y: 0,
        pressure: STUDIO_CAUSAL_INK_DEFAULT_PRESSURE,
        sourceIndex: 3,
      },
    ]);
  });

  it("plans the initial dab and pressure-linear segment dabs with the GPU spacing formula", () => {
    const samples = [
      { x: 0, y: 0, pressure: 0.25, sourceIndex: 0 },
      { x: 12, y: 0, pressure: 0.75, sourceIndex: 1 },
    ] as const;
    const size = 8;
    const startRadius = studioGpuPressureRadius(size, 0.25);
    const endRadius = studioGpuPressureRadius(size, 0.75);
    const spacing = Math.max(0.5, Math.min(startRadius, endRadius) * 0.45);
    const steps = Math.max(1, Math.ceil(12 / spacing));
    const plan = planStudioCausalInkDabs({ samples, size });

    expect(plan.complete).toBe(true);
    expect(plan.dabs).toHaveLength(1 + steps);
    expect(plan.dabs[0]).toEqual({
      x: 0,
      y: 0,
      pressure: 0.25,
      radius: startRadius,
    });
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps;
      const pressure = 0.25 + (0.75 - 0.25) * amount;
      expect(plan.dabs[step]).toEqual({
        x: 12 * amount,
        y: 0,
        pressure,
        radius: studioGpuPressureRadius(size, pressure),
      });
    }
    expect(plan.dabs.at(-1)).toEqual({
      x: 12,
      y: 0,
      pressure: 0.75,
      radius: endRadius,
    });
  });

  it("emits one initial dab and no duplicate segment-start dabs across a polyline", () => {
    const samples = [
      { x: 0, y: 0, pressure: 0.5, sourceIndex: 0 },
      { x: 4, y: 0, pressure: 0.5, sourceIndex: 1 },
      { x: 4, y: 4, pressure: 1, sourceIndex: 2 },
    ] as const;
    const size = 10;
    const firstSteps = Math.ceil(4 / (studioGpuPressureRadius(size, 0.5) * 0.45));
    const secondSteps = Math.ceil(
      4 / (Math.min(
        studioGpuPressureRadius(size, 0.5),
        studioGpuPressureRadius(size, 1)
      ) * 0.45)
    );
    const plan = planStudioCausalInkDabs({ samples, size });

    expect(plan.dabs).toHaveLength(1 + firstSteps + secondSteps);
    expect(plan.dabs.filter(({ x, y }) => x === 4 && y === 0)).toHaveLength(1);
    expect(plan.dabs.at(-1)).toMatchObject({ x: 4, y: 4, pressure: 1 });
  });

  it("matches the current GPU planner's dab centers and radii exactly", () => {
    const samples = selectStudioCausalInkSamples({
      points: [0, 0, 1, 0, 7, 3, 12, -2],
      pressures: [0.2, 0.4, 0.75, 1],
      minDistance: 2,
    });
    const size = 9;
    const causal = planStudioCausalInkDabs({ samples, size });
    const gpu = planStudioGpuDabs([{
      id: "parity",
      points: samples.flatMap(({ x, y }) => [x, y]),
      pressures: samples.map(({ pressure }) => pressure),
      color: "#000000",
      size,
      opacity: 1,
      composite: "normal",
    }]);

    expect(causal.complete).toBe(true);
    expect(gpu.complete).toBe(true);
    expect(causal.dabs.map(({ x, y, radius }) => ({ x, y, radius }))).toEqual(
      gpu.dabs.map(({ x, y, radius }) => ({ x, y, radius }))
    );
  });

  it("combines sample selection and dab planning while failing closed at the dab cap", () => {
    const plan = planStudioCausalInk({
      points: [0, 0, 10, 0],
      pressures: [0.5, 0.5],
      minDistance: 0,
      size: 6,
      maximumDabs: 2,
    });

    expect(plan.samples.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 1]);
    expect(plan.dabs).toHaveLength(2);
    expect(plan.complete).toBe(false);
  });
});
