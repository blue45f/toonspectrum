import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsSettingsForBrushId,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import {
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
} from "./studio-brush-render-budget";
import { planStudioCausalDynamicBrushDepositSegmentsV3 } from "./studio-causal-dynamic-brush-deposit-v2";
import {
  resolveStudioDynamicBrushMaterialIdentity,
  type StudioDynamicBrushMaterialIdentity,
} from "./studio-dry-media-dynamic-bridge";
import { planStudioDynamicBrushCoverageMarks } from "./studio-dynamic-brush-coverage-renderer";

const CORE_DRY_MEDIA = [
  "crayon",
  "chalk",
  "charcoal",
  "pastel",
  "oil-pastel",
] as const;

interface PlannedStroke {
  readonly dabs: readonly StudioDynamicBrushDab[];
  readonly dynamics: NormalizedStudioBrushDynamicsSettings;
  readonly identity: StudioDynamicBrushMaterialIdentity;
  readonly origin: Readonly<{ x: number; y: number }>;
}

function sourceArrays(sampleCount: number, phase = 0) {
  const points = Array.from({ length: sampleCount }, (_, index) => [
    12 + index * 2.35,
    80 + Math.sin(index / 13 + phase) * 9 + Math.sin(index / 47) * 3,
  ]).flat();
  return {
    points,
    pressures: Array.from(
      { length: sampleCount },
      (_, index) => 0.42 + (index % 17) / 40,
    ),
    tangentialPressures: Array.from({ length: sampleCount }, () => 0),
    speeds: Array.from(
      { length: sampleCount },
      (_, index) => 0.35 + (index % 11) * 0.06,
    ),
    tiltXs: Array.from({ length: sampleCount }, (_, index) => 8 + index % 15),
    tiltYs: Array.from({ length: sampleCount }, (_, index) => -12 + index % 9),
    twists: Array.from({ length: sampleCount }, (_, index) => index % 360),
  };
}

function plannedStroke(
  brushId: (typeof CORE_DRY_MEDIA)[number],
  sampleCount: number,
  phase = 0,
): PlannedStroke {
  const authored = studioBrushDynamicsSettingsForBrushId(brushId);
  const identity = resolveStudioDynamicBrushMaterialIdentity(brushId);
  if (!authored || !identity) throw new Error(`missing ${brushId} authority`);
  const dynamics = normalizeStudioBrushDynamicsSettings({
    ...authored,
    seed: 0x51a7_0000 + CORE_DRY_MEDIA.indexOf(brushId),
    width: { ...authored.width, base: authored.width.base * 1.2 },
  });
  const source = sourceArrays(sampleCount, phase);
  const causal = planStudioCausalDynamicBrushDepositSegmentsV3({
    ...source,
    settings: dynamics,
  });
  if (!causal.ok) throw new Error(causal.reason);
  return {
    dabs: causal.segments.flatMap(({ dabs }) => dabs),
    dynamics,
    identity,
    origin: { x: source.points[0]!, y: source.points[1]! },
  };
}

function coverage(
  stroke: PlannedStroke,
  dabs: readonly StudioDynamicBrushDab[] = stroke.dabs,
  leadingSourceDabsToSkip = 0,
) {
  return planStudioDynamicBrushCoverageMarks({
    dabVariations: [dabs],
    materialIdentity: stroke.identity,
    strokeOrigins: [stroke.origin],
    dynamics: stroke.dynamics,
    dynamicSeed: stroke.dynamics.seed,
    stroke: "#2b211c",
    stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
    markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    ...(leadingSourceDabsToSkip > 0
      ? { dryMediaUnionLeadingSourceDabsToSkip: leadingSourceDabsToSkip }
      : {}),
  });
}

function unionPolygons(plan: ReturnType<typeof coverage>) {
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.reason);
  expect(plan.marks).toHaveLength(1);
  const mark = plan.marks[0]!;
  expect(mark).toMatchObject({
    alpha: 1,
    ribbon: {
      kind: "dry-media-union-ribbon-polygon",
      role: "stroke-union",
    },
  });
  expect(mark.texture).toBeUndefined();
  expect(mark.falloff).toBeUndefined();
  return mark.ribbon!.polygons;
}

describe("core dry-media long-stroke regression", () => {
  it.each(CORE_DRY_MEDIA)(
    "keeps arbitrary causal chunks byte-identical for %s",
    (brushId) => {
      const stroke = plannedStroke(brushId, 768);
      const complete = unionPolygons(coverage(stroke));
      const chunkSizes = [1, 7, 31, 113, 257, 59];
      const appended: Array<readonly number[]> = [];
      let cursor = 0;
      let chunkIndex = 0;
      while (cursor < stroke.dabs.length) {
        const end = Math.min(
          stroke.dabs.length,
          cursor + chunkSizes[chunkIndex % chunkSizes.length]!,
        );
        const predecessor = cursor > 0 ? cursor - 1 : cursor;
        appended.push(...unionPolygons(coverage(
          stroke,
          stroke.dabs.slice(predecessor, end),
          cursor > 0 ? 1 : 0,
        )));
        cursor = end;
        chunkIndex += 1;
      }
      expect(appended).toEqual(complete);
    },
  );

  it("keeps 1k/2k source commits linear and inside an interactive planning budget", () => {
    // Warm module/JIT caches before measuring allocation-heavy material lowering.
    unionPolygons(coverage(plannedStroke("charcoal", 128)));
    const measure = (sampleCount: number) => {
      const startedAt = performance.now();
      const stroke = plannedStroke("charcoal", sampleCount);
      const polygons = unionPolygons(coverage(stroke));
      return {
        elapsed: performance.now() - startedAt,
        dabCount: stroke.dabs.length,
        polygonCount: polygons.length,
      };
    };
    const oneThousand = measure(1_000);
    const twoThousand = measure(2_000);

    expect(oneThousand.dabCount).toBeGreaterThan(700);
    expect(twoThousand.dabCount).toBeGreaterThan(oneThousand.dabCount * 1.8);
    expect(twoThousand.polygonCount).toBeGreaterThan(
      oneThousand.polygonCount * 1.8,
    );
    expect(oneThousand.elapsed).toBeLessThan(750);
    expect(twoThousand.elapsed).toBeLessThan(1_500);
    // Wide slack absorbs CI/JIT noise while rejecting accidental prefix-quadratic replanning.
    expect(twoThousand.elapsed).toBeLessThan(oneThousand.elapsed * 6 + 150);
  });

  it("does not retain per-dab texture objects across 40 consecutive material strokes", () => {
    const startedAt = performance.now();
    let totalDabs = 0;
    let totalPolygons = 0;
    for (let strokeIndex = 0; strokeIndex < 40; strokeIndex += 1) {
      const brushId = CORE_DRY_MEDIA[strokeIndex % CORE_DRY_MEDIA.length]!;
      const stroke = plannedStroke(brushId, 240, strokeIndex / 7);
      totalDabs += stroke.dabs.length;
      totalPolygons += unionPolygons(coverage(stroke)).length;
    }
    const elapsed = performance.now() - startedAt;

    expect(totalDabs).toBeGreaterThan(7_000);
    expect(totalPolygons).toBeGreaterThan(totalDabs * 5);
    expect(elapsed).toBeLessThan(5_000);
  });

  it("keeps long crayon suffix planning interactive under multi-lane expansion", () => {
    // Competitive long-stroke freeze regression: multi-lane crayon must remain O(suffix) so a
    // continuous 2k-sample stroke never collapses into all-or-nothing mark-budget failure.
    const long = plannedStroke("crayon", 2_000);
    expect(long.dabs.length).toBeGreaterThan(900);
    expect(long.dabs.length).toBeLessThan(3_200);
    const startedAt = performance.now();
    const full = coverage(long);
    const fullElapsed = performance.now() - startedAt;
    expect(full.ok).toBe(true);
    if (!full.ok) throw new Error(full.reason);
    // Full 2k-sample crayon coverage must stay interactive; >200ms freezes pointer-up seal.
    expect(fullElapsed).toBeLessThan(200);

    const chunkSize = 64;
    let cursor = 0;
    let chunkPlans = 0;
    let maxChunkMs = 0;
    const chunkStartedAt = performance.now();
    while (cursor < long.dabs.length) {
      const end = Math.min(long.dabs.length, cursor + chunkSize);
      const predecessor = cursor > 0 ? cursor - 1 : cursor;
      const t0 = performance.now();
      const plan = coverage(
        long,
        long.dabs.slice(predecessor, end),
        cursor > 0 ? 1 : 0,
      );
      maxChunkMs = Math.max(maxChunkMs, performance.now() - t0);
      expect(plan.ok, `crayon chunk ${cursor}:${end}`).toBe(true);
      if (!plan.ok) throw new Error(plan.reason);
      chunkPlans += 1;
      cursor = end;
    }
    const chunkElapsed = performance.now() - chunkStartedAt;
    expect(chunkPlans).toBeGreaterThan(15);
    // Suffix chunking must remain competitive with one full plan; a quadratic replan freezes.
    expect(chunkElapsed).toBeLessThan(fullElapsed * 8 + 400);
    expect(chunkElapsed).toBeLessThan(2_500);
    expect(maxChunkMs).toBeLessThan(33);
  });

  it.each(CORE_DRY_MEDIA)(
    "guarantees O(1) suffix chunking latency and freeze prevention across 5k-sample strokes for %s",
    (brushId) => {
      const long = plannedStroke(brushId, 5_000);
      expect(long.dabs.length).toBeGreaterThan(2_800);

      const chunkSize = 128;
      let cursor = 0;
      let chunkPlans = 0;
      let maxChunkLatencyMs = 0;
      const chunkStartedAt = performance.now();
      while (cursor < long.dabs.length) {
        const end = Math.min(long.dabs.length, cursor + chunkSize);
        const predecessor = cursor > 0 ? cursor - 1 : cursor;
        const startMs = performance.now();
        const plan = coverage(
          long,
          long.dabs.slice(predecessor, end),
          cursor > 0 ? 1 : 0,
        );
        const elapsedMs = performance.now() - startMs;
        if (elapsedMs > maxChunkLatencyMs) maxChunkLatencyMs = elapsedMs;
        expect(plan.ok, `${brushId} chunk ${cursor}:${end}`).toBe(true);
        if (!plan.ok) throw new Error(plan.reason);
        chunkPlans += 1;
        cursor = end;
      }
      const totalChunkElapsed = performance.now() - chunkStartedAt;
      expect(chunkPlans).toBeGreaterThan(20);
      // Every individual 128-dab chunk must process in under 50ms (no frame freeze)
      expect(maxChunkLatencyMs).toBeLessThan(50);
      // Total 5k-sample incremental chunking across all dabs must take < 1,500ms
      expect(totalChunkElapsed).toBeLessThan(1_500);
    },
  );
});
