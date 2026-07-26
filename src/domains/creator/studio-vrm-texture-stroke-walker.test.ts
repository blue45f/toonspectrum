import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  planStudioVrmTextureStroke,
  type StudioVrmTextureStrokePlanOptions,
  type StudioVrmTextureStrokeSample,
  type StudioVrmTextureStrokeStyle,
} from "./studio-vrm-texture-stroke";
import {
  createStudioVrmTextureStrokeWalker,
  type StudioVrmTextureStrokeWalkerSnapshot,
} from "./studio-vrm-texture-stroke-walker";

import type { StudioVrmTexturePaintOp } from "./studio-vrm-texture-paint-ops";
import type { StudioVrmTextureSize } from "./studio-vrm-texture-uv";

const SIZE: StudioVrmTextureSize = { width: 512, height: 384 };

function style(
  kind: StudioVrmTextureStrokeStyle["kind"],
  overrides: Partial<StudioVrmTextureStrokeStyle> = {},
): StudioVrmTextureStrokeStyle {
  return {
    kind,
    color: "#4263eb",
    sizeTexels: 18,
    opacity: 0.73,
    blend: "normal",
    tuning: { flow: 0.58, hardness: 0.66, minSize: 0.17 },
    ...overrides,
  };
}

function expressiveSamples(): StudioVrmTextureStrokeSample[] {
  return [
    { uv: { u: 0.1, v: 0.2 }, pressure: 0.05, islandId: "body" },
    { uv: { u: 0.13, v: 0.22 }, pressure: 0.24, islandId: "body" },
    { uv: { u: 0.19, v: 0.25 }, pressure: 0.92, islandId: "body" },
    { uv: { u: 0.205, v: 0.31 }, pressure: 0.4, islandId: "body" },
    { uv: { u: 0.29, v: 0.36 }, pressure: 1, islandId: "body" },
    { uv: { u: 0.32, v: 0.4 }, pressure: Number.NaN, islandId: "body" },
  ];
}

function planCounters(
  snapshot: StudioVrmTextureStrokeWalkerSnapshot,
): Pick<StudioVrmTextureStrokeWalkerSnapshot, "runs" | "seamBreaks" | "skipped" | "dabs"> {
  return {
    runs: snapshot.runs,
    seamBreaks: snapshot.seamBreaks,
    skipped: snapshot.skipped,
    dabs: snapshot.dabs,
  };
}

function expectPrefixParity(
  strokeStyle: StudioVrmTextureStrokeStyle,
  samples: readonly StudioVrmTextureStrokeSample[],
  size: StudioVrmTextureSize = SIZE,
  options: StudioVrmTextureStrokePlanOptions = {},
): {
  readonly ops: readonly StudioVrmTexturePaintOp[];
  readonly snapshot: StudioVrmTextureStrokeWalkerSnapshot;
} {
  const walker = createStudioVrmTextureStrokeWalker(strokeStyle, size, options);
  const emitted: StudioVrmTexturePaintOp[] = [];
  let previousBatchOps: readonly StudioVrmTexturePaintOp[] = [];

  for (let index = 0; index < samples.length; index += 1) {
    const append = walker.append(samples[index]!);
    emitted.push(...append.ops);
    const batch = planStudioVrmTextureStroke(
      strokeStyle,
      samples.slice(0, index + 1),
      size,
      options,
    );

    // 이미 방출한 prefix는 바뀌지 않고 이번 append가 정확히 새 suffix만 내야 한다.
    expect(batch.ops.slice(0, previousBatchOps.length)).toEqual(previousBatchOps);
    expect(append.ops).toEqual(batch.ops.slice(previousBatchOps.length));
    expect(emitted).toEqual(batch.ops);
    expect(planCounters(append.snapshot)).toEqual({
      runs: batch.runs,
      seamBreaks: batch.seamBreaks,
      skipped: batch.skipped,
      dabs: batch.dabs,
    });
    expect(append.snapshot.ops).toBe(emitted.length);
    previousBatchOps = batch.ops;
  }

  return { ops: emitted, snapshot: walker.snapshot() };
}

describe("studio-vrm-texture-stroke-walker batch parity", () => {
  it("matches every prefix for all production brush kinds and varying pressure", () => {
    for (const kind of ["airbrush", "pencil", "ink", "watercolor"] as const) {
      const incremental = expectPrefixParity(style(kind), expressiveSamples(), SIZE, {
        seed: 73,
      });
      expect(incremental.ops.length).toBeGreaterThan(3);
      expect(incremental.snapshot.runs).toBe(1);
    }
  });

  it("matches deterministic pencil grain and blend/tuning variants", () => {
    const samples = expressiveSamples();
    const first = expectPrefixParity(
      style("pencil", {
        color: "#e03131",
        blend: "multiply",
        tuning: { flow: 0.21, hardness: 0.9, minSize: 0.02 },
      }),
      samples,
      SIZE,
      { seed: -901 },
    );
    const second = expectPrefixParity(
      style("pencil", {
        color: "#e03131",
        blend: "multiply",
        tuning: { flow: 0.21, hardness: 0.9, minSize: 0.02 },
      }),
      samples,
      SIZE,
      { seed: -901 },
    );
    expect(second.ops).toEqual(first.ops);
  });

  it("breaks on explicit UV islands, geometric seam stretch, and invalid samples", () => {
    const samples: StudioVrmTextureStrokeSample[] = [
      {
        uv: { u: 0.1, v: 0.2 },
        pressure: 0.4,
        islandId: "face",
        world: { x: 0, y: 0, z: 0 },
        texelsPerWorldUnit: 512,
      },
      {
        uv: { u: 0.12, v: 0.2 },
        pressure: 0.6,
        islandId: "face",
        world: { x: 0.02, y: 0, z: 0 },
        texelsPerWorldUnit: 512,
      },
      // ID가 바뀌는 짧은 심.
      {
        uv: { u: 0.121, v: 0.2 },
        pressure: 0.8,
        islandId: "ear",
        world: { x: 0.021, y: 0, z: 0 },
        texelsPerWorldUnit: 512,
      },
      // ID는 같지만 월드 이동 대비 UV가 지나치게 먼 심.
      {
        uv: { u: 0.9, v: 0.8 },
        pressure: 0.2,
        islandId: "ear",
        world: { x: 0.022, y: 0, z: 0 },
        texelsPerWorldUnit: 512,
      },
      // 해석 실패는 심이 아니라 run 경계이며 skipped만 올린다.
      { uv: { u: Number.NaN, v: 0.8 }, pressure: 1, islandId: "ear" },
      { uv: { u: 0.92, v: 0.81 }, pressure: 0.7, islandId: "ear" },
    ];
    const result = expectPrefixParity(style("ink"), samples);
    expect(result.snapshot).toMatchObject({ runs: 4, seamBreaks: 2, skipped: 1 });
  });

  it("matches clamp, repeat, mirror and V-flip coordinate resolution", () => {
    const samples: StudioVrmTextureStrokeSample[] = [
      { uv: { u: -0.12, v: 1.14 }, pressure: 0.1 },
      { uv: { u: -0.04, v: 1.08 }, pressure: 0.4 },
      { uv: { u: 1.06, v: -0.07 }, pressure: 0.8 },
      { uv: { u: 1.18, v: -0.14 }, pressure: 1 },
    ];
    const optionSets: StudioVrmTextureStrokePlanOptions[] = [
      { wrapU: "clamp", wrapV: "clamp" },
      { wrapU: "repeat", wrapV: "mirror", seamBreakTexels: 1_000 },
      { wrapU: "mirror", wrapV: "repeat", flipV: true, seamBreakTexels: 1_000 },
    ];
    for (const options of optionSets) {
      expectPrefixParity(style("watercolor"), samples, SIZE, options);
    }
  });

  it("matches bounded dab output while continuing to count later run boundaries", () => {
    const samples: StudioVrmTextureStrokeSample[] = [
      { uv: { u: 0.1, v: 0.2 }, pressure: 1, islandId: "a" },
      { uv: { u: 0.8, v: 0.2 }, pressure: 1, islandId: "a" },
      { uv: { u: 0.81, v: 0.2 }, pressure: 1, islandId: "b" },
      { uv: { u: Number.NaN, v: 0.2 }, pressure: 1, islandId: "b" },
      { uv: { u: 0.2, v: 0.8 }, pressure: 1, islandId: "c" },
    ];
    const result = expectPrefixParity(style("pencil", { sizeTexels: 2 }), samples, SIZE, {
      maxDabs: 7,
      seed: 9,
      seamBreakTexels: 1_000,
    });
    expect(result.snapshot).toMatchObject({
      dabs: 7,
      exhausted: true,
      runs: 3,
      seamBreaks: 1,
      skipped: 1,
    });
    expect(result.ops).toHaveLength(21);
  });
});

describe("studio-vrm-texture-stroke-walker guards and streaming contract", () => {
  it("preserves batch counters with a zero dab budget and invalid texture size", () => {
    const samples = expressiveSamples();
    const zeroBudget = expectPrefixParity(style("airbrush"), samples, SIZE, { maxDabs: 0 });
    expect(zeroBudget.ops).toHaveLength(0);
    expect(zeroBudget.snapshot).toMatchObject({ runs: 1, dabs: 0, exhausted: true });

    const invalidSize = expectPrefixParity(
      style("ink"),
      samples,
      { width: 0, height: 0 },
    );
    expect(invalidSize.snapshot).toMatchObject({
      runs: 0,
      skipped: samples.length,
      dabs: 0,
    });
  });

  it("matches the batch planner's disabled-style early return", () => {
    const disabledStyle = style("ink", { sizeTexels: 0 });
    const samples = expressiveSamples();
    const walker = createStudioVrmTextureStrokeWalker(disabledStyle, SIZE);
    for (const sample of samples) {
      expect(walker.append(sample).ops).toHaveLength(0);
    }
    expect(walker.snapshot()).toEqual({
      runs: 0,
      seamBreaks: 0,
      skipped: 0,
      dabs: 0,
      ops: 0,
      exhausted: true,
      disabled: true,
    });
    expect(planStudioVrmTextureStroke(disabledStyle, samples, SIZE)).toEqual({
      ops: [],
      runs: 0,
      seamBreaks: 0,
      skipped: 0,
      dabs: 0,
    });
  });

  it("exposes no retained sample/op collection and never calls the batch planner", () => {
    const walker = createStudioVrmTextureStrokeWalker(style("ink"), SIZE);
    expect(Object.keys(walker).sort()).toEqual(["append", "snapshot"]);
    expect(Object.isFrozen(walker)).toBe(true);
    for (const sample of expressiveSamples()) walker.append(sample);
    expect(Object.keys(walker).sort()).toEqual(["append", "snapshot"]);

    const source = readFileSync(
      new URL("./studio-vrm-texture-stroke-walker.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("planStudioVrmTextureStroke(");
    expect(source).not.toContain("planStudioStampBrushDabs(");
  });
});
