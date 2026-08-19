import { describe, expect, it } from "vitest";

import {
  applyStudioBrushAliasWatercolorMaterial,
  resolveStudioBrushAliasWatercolorPlanSettings,
} from "./brush/studio-brush-alias-profile";
import {
  appendCausalWatercolorBrush,
  beginCausalWatercolorBrush,
  DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
  finishCausalWatercolorBrush,
  normalizeStudioCausalWatercolorSettings,
  planCausalWatercolorBrush,
  planCausalWatercolorBrushDabs,
  previewCausalWatercolorBrushEndpoint,
  STUDIO_CAUSAL_WATERCOLOR_DAB_CAP_RANGE,
  type StudioCausalWatercolorSample,
} from "./studio-causal-watercolor-brush";

const SETTINGS = {
  baseWidth: 20,
  spacing: 5,
  seed: 314,
  diffuse: true,
  maxDabs: 200,
} as const;

function incrementalPlan(
  samples: readonly StudioCausalWatercolorSample[],
  finalized: boolean,
) {
  const first = samples[0];
  if (!first) return [];
  const started = beginCausalWatercolorBrush(first, SETTINGS);
  if (!started) return [];
  const dabs = [...started.dabs];
  for (let index = 1; index < samples.length; index += 1) {
    dabs.push(...appendCausalWatercolorBrush(started.state, samples[index]!));
  }
  if (finalized) dabs.push(...finishCausalWatercolorBrush(started.state));
  return dabs;
}

describe("normalizeStudioCausalWatercolorSettings", () => {
  it("uses a long-stroke safety budget and clamps malformed values", () => {
    expect(normalizeStudioCausalWatercolorSettings().maxDabs).toBe(
      DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
    );
    expect(normalizeStudioCausalWatercolorSettings({ maxDabs: 1 }).maxDabs).toBe(
      STUDIO_CAUSAL_WATERCOLOR_DAB_CAP_RANGE.min,
    );
    expect(normalizeStudioCausalWatercolorSettings({ maxDabs: 1e9 }).maxDabs).toBe(
      STUDIO_CAUSAL_WATERCOLOR_DAB_CAP_RANGE.max,
    );
    expect(normalizeStudioCausalWatercolorSettings({ maxDabs: Number.NaN }).maxDabs).toBe(
      DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
    );
  });
});

describe("causal watercolor prefix contract", () => {
  const head = [
    { x: 0, y: 0, pressure: 0.2 },
    { x: 4, y: 0, pressure: 0.3 },
    { x: 11, y: 3, pressure: 0.6 },
    { x: 18, y: 9, pressure: 0.8 },
  ] as const;
  const tail = [
    { x: 24, y: 15, pressure: 0.55 },
    { x: 34, y: 16, pressure: 0.4 },
    { x: 43, y: 10, pressure: 0.9 },
  ] as const;

  it("never mutates or replaces permanent dabs after more samples arrive", () => {
    const started = beginCausalWatercolorBrush(head[0], SETTINGS)!;
    const retained = [...started.dabs];
    for (const sample of head.slice(1)) {
      retained.push(...appendCausalWatercolorBrush(started.state, sample));
    }
    const frozenPrefix = structuredClone(retained);
    const retainedReferences = retained.slice();

    for (const sample of tail) {
      retained.push(...appendCausalWatercolorBrush(started.state, sample));
    }

    expect(retained.slice(0, frozenPrefix.length)).toEqual(frozenPrefix);
    expect(retained.slice(0, retainedReferences.length)).toEqual(retainedReferences);
    for (let index = 0; index < retainedReferences.length; index += 1) {
      expect(retained[index]).toBe(retainedReferences[index]);
    }
  });

  it("matches whole-prefix replay before finalization and whole-stroke replay after it", () => {
    const samples = [...head, ...tail];
    const points = samples.flatMap(({ x, y }) => [x, y]);
    const pressures = samples.map(({ pressure }) => pressure);

    expect(incrementalPlan(samples, false)).toEqual(
      planCausalWatercolorBrushDabs({ ...SETTINGS, points, pressures }, false),
    );
    expect(incrementalPlan(samples, true)).toEqual(
      planCausalWatercolorBrushDabs({ ...SETTINGS, points, pressures }, true),
    );
  });

  it("is independent of append batches when the accepted sample sequence is identical", () => {
    const samples = [...head, ...tail];
    const oneByOne = incrementalPlan(samples, true);
    const started = beginCausalWatercolorBrush(samples[0]!, SETTINGS)!;
    const inTwoUiFrames = [...started.dabs];
    for (const batch of [samples.slice(1, 3), samples.slice(3)]) {
      for (const sample of batch) {
        inTwoUiFrames.push(...appendCausalWatercolorBrush(started.state, sample));
      }
    }
    inTwoUiFrames.push(...finishCausalWatercolorBrush(started.state));
    expect(inTwoUiFrames).toEqual(oneByOne);
  });

  it("keeps a sub-spacing endpoint provisional until finish, then emits it exactly once", () => {
    const started = beginCausalWatercolorBrush(
      { x: 10, y: 20, pressure: 0.25 },
      { ...SETTINGS, spacing: 10 },
    )!;
    expect(started.dabs[0]).toMatchObject({ x: 10, y: 20, role: "core" });
    expect(appendCausalWatercolorBrush(
      started.state,
      { x: 16, y: 23, pressure: 0.85 },
    )).toEqual([]);

    const endpoint = finishCausalWatercolorBrush(started.state);
    expect(endpoint[0]).toMatchObject({ x: 16, y: 23, role: "core" });
    expect(finishCausalWatercolorBrush(started.state)).toEqual([]);
    expect(appendCausalWatercolorBrush(
      started.state,
      { x: 40, y: 40, pressure: 1 },
    )).toEqual([]);
  });

  it("previews the exact finish endpoint without mutating causal state", () => {
    const started = beginCausalWatercolorBrush(
      { x: 10, y: 20, pressure: 0.25 },
      { ...SETTINGS, spacing: 10 },
    )!;
    appendCausalWatercolorBrush(
      started.state,
      { x: 16, y: 23, pressure: 0.85 },
    );
    const stateBeforePreview = structuredClone(started.state);

    const firstPreview = previewCausalWatercolorBrushEndpoint(started.state);
    const secondPreview = previewCausalWatercolorBrushEndpoint(started.state);

    expect(firstPreview).toEqual(secondPreview);
    expect(started.state).toEqual(stateBeforePreview);
    expect(finishCausalWatercolorBrush(started.state)).toEqual(firstPreview);
  });

  it("does not add a duplicate endpoint when a permanent station lands on it", () => {
    const started = beginCausalWatercolorBrush(
      { x: 0, y: 0, pressure: 0.5 },
      SETTINGS,
    )!;
    const crossed = appendCausalWatercolorBrush(
      started.state,
      { x: SETTINGS.spacing * 2, y: 0, pressure: 0.5 },
    );
    expect(crossed.filter(({ role }) => role === "core")).toHaveLength(2);
    expect(previewCausalWatercolorBrushEndpoint(started.state)).toEqual([]);
    expect(finishCausalWatercolorBrush(started.state)).toEqual([]);
  });

  it("does not preview a tap before travel", () => {
    const started = beginCausalWatercolorBrush(
      { x: 4, y: 7, pressure: 0.6 },
      SETTINGS,
    )!;
    const before = structuredClone(started.state);
    expect(previewCausalWatercolorBrushEndpoint(started.state)).toEqual([]);
    expect(started.state).toEqual(before);
  });

  it.each(["watercolor", "ink-wash", "gouache"] as const)(
    "keeps the disposable %s endpoint identical to committed alias geometry",
    (brush) => {
      const alias = resolveStudioBrushAliasWatercolorPlanSettings(brush, 20);
      if (!alias) throw new Error(`missing watercolor alias ${brush}`);
      const input = {
        ...SETTINGS,
        ...alias,
        points: [10, 20, 47.3, 26.7],
        pressures: [0.25, 0.87],
      };
      const permanent = applyStudioBrushAliasWatercolorMaterial(
        brush,
        planCausalWatercolorBrushDabs(input, false),
      );
      const preview = applyStudioBrushAliasWatercolorMaterial(
        brush,
        planCausalWatercolorBrushDabs(
          { ...input, previewEndpoint: true },
          false,
        ),
      );
      const committed = applyStudioBrushAliasWatercolorMaterial(
        brush,
        planCausalWatercolorBrushDabs(input, true),
      );

      expect(preview.slice(0, permanent.length)).toEqual(permanent);
      expect(preview).toEqual(committed);
      expect(preview.findLast(({ role }) => role === "core")).toMatchObject({
        x: 47.3,
        y: 26.7,
      });
    },
  );

  it("keeps constant-pressure ink-wash pigment variation below the visible station frequency", () => {
    const brush = "ink-wash";
    const settings = resolveStudioBrushAliasWatercolorPlanSettings(brush, 30)!;
    const pointCount = 81;
    const dabs = applyStudioBrushAliasWatercolorMaterial(
      brush,
      planCausalWatercolorBrushDabs({
        ...settings,
        seed: 441,
        diffuse: true,
        maxDabs: 8_192,
        points: Array.from(
          { length: pointCount },
          (_, index) => [20 + index * 5, 80],
        ).flat(),
        pressures: Array.from({ length: pointCount }, () => 0.659479341998814),
      }, true),
    );
    const coreOpacities = dabs
      .filter(({ role }) => role === "core")
      .map(({ opacity }) => opacity);
    const firstDifferences = coreOpacities.slice(1).map(
      (opacity, index) => opacity - coreOpacities[index]!,
    );
    const secondDifferences = firstDifferences.slice(1).map(
      (difference, index) => difference - firstDifferences[index]!,
    );

    expect(coreOpacities.length).toBeGreaterThan(60);
    expect(Math.max(...firstDifferences.map(Math.abs)))
      .toBeLessThanOrEqual(0.007);
    // Per-station hash noise previously measured above 0.06 here, producing a tonal crossbar at
    // nearly every 5.8px carrier station. The causal low-frequency material envelope stays smooth
    // without looking numerically flat or changing any previously emitted station.
    expect(Math.max(...secondDifferences.map(Math.abs)))
      .toBeLessThanOrEqual(0.002);
    expect(new Set(coreOpacities.map((opacity) => opacity.toFixed(4))).size)
      .toBeGreaterThan(20);
  });
});

describe("causal watercolor safety and cap behavior", () => {
  it("renders a tap once and ignores zero-length pressure-only updates", () => {
    const started = beginCausalWatercolorBrush(
      { x: 5, y: 6, pressure: 0.2 },
      SETTINGS,
    )!;
    const tap = [...started.dabs];
    expect(appendCausalWatercolorBrush(
      started.state,
      { x: 5, y: 6, pressure: 0.9 },
    )).toEqual([]);
    expect(finishCausalWatercolorBrush(started.state)).toEqual([]);
    expect(tap.filter(({ role }) => role === "core")).toHaveLength(1);
  });

  it("skips invalid coordinate pairs while keeping all generated values finite", () => {
    const plan = planCausalWatercolorBrush({
      ...SETTINGS,
      points: [Number.NaN, 2, 0, 0, 14, 5, Infinity, 9, 30, 7],
      pressures: [0.1, Number.NaN, 0.7, 0.8, 2],
    });
    expect(plan.sourcePointCount).toBe(3);
    expect(plan.empty).toBe(false);
    expect(plan.dabs.length).toBeGreaterThan(2);
    expect(plan.dabs.every((dab) => (
      Number.isFinite(dab.x)
      && Number.isFinite(dab.y)
      && Number.isFinite(dab.radius)
      && Number.isFinite(dab.opacity)
    ))).toBe(true);
  });

  it("stops appending at the safety ceiling without redistributing its retained prefix", () => {
    const input = {
      ...SETTINGS,
      maxDabs: 6,
      points: [0, 0, 100, 0, 200, 0],
      pressures: [0.5, 0.5, 0.5],
    };
    const short = planCausalWatercolorBrush({ ...input, points: [0, 0, 100, 0] });
    const extended = planCausalWatercolorBrush(input);
    expect(short.dabs).toHaveLength(6);
    expect(extended.dabs).toHaveLength(6);
    expect(extended.dabs).toEqual(short.dabs);
    expect(extended.capped).toBe(true);
  });

  it("fails the disposable endpoint closed at the same dab ceiling without mutating the plan", () => {
    const input = {
      ...SETTINGS,
      maxDabs: 2,
      points: [0, 0, 100, 0],
      pressures: [0.5, 0.5],
    };
    const permanent = planCausalWatercolorBrush(input, false);
    const preview = planCausalWatercolorBrush(
      { ...input, previewEndpoint: true },
      false,
    );
    const committed = planCausalWatercolorBrush(input, true);

    expect(preview.dabs).toEqual(permanent.dabs);
    expect(preview.dabs).toEqual(committed.dabs);
    expect(preview.capped).toBe(true);
    expect(preview.finalized).toBe(false);
  });

  it("returns a well-formed empty plan for missing or fully invalid input", () => {
    expect(planCausalWatercolorBrush()).toMatchObject({
      dabs: [],
      sourcePointCount: 0,
      empty: true,
      capped: false,
      finalized: false,
    });
    expect(planCausalWatercolorBrush({ points: [Number.NaN, Infinity] })).toMatchObject({
      dabs: [],
      sourcePointCount: 0,
      empty: true,
      finalized: false,
    });
  });
});
