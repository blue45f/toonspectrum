import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsSettingsForBrushId,
  studioDryMediaUnionComposableProgramPin,
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
  pinnedLegacyUnion = false,
): PlannedStroke {
  const authored = studioBrushDynamicsSettingsForBrushId(brushId);
  const identity = resolveStudioDynamicBrushMaterialIdentity(brushId);
  if (!authored || !identity) throw new Error(`missing ${brushId} authority`);
  const dynamics = normalizeStudioBrushDynamicsSettings({
    ...authored,
    seed: 0x51a7_0000 + CORE_DRY_MEDIA.indexOf(brushId),
    width: { ...authored.width, base: authored.width.base * 1.2 },
    ...(pinnedLegacyUnion
      ? { dryMediaUnionProgram: studioDryMediaUnionComposableProgramPin() }
      : {}),
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

function kernelMarks(plan: ReturnType<typeof coverage>) {
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.reason);
  expect(plan.marks.length).toBeGreaterThan(0);
  for (const mark of plan.marks) {
    expect(mark.ribbon).toBeUndefined();
    expect(mark.texture?.kind).toBe("alpha-map");
  }
  return plan.marks;
}

describe("core dry-media long-stroke regression", () => {
  it.each(CORE_DRY_MEDIA)(
    "keeps arbitrary PINNED legacy-union causal chunks byte-identical for %s",
    (brushId) => {
      const stroke = plannedStroke(brushId, 768, 0, true);
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

  it.each(CORE_DRY_MEDIA)(
    "keeps arbitrary KERNEL dab-path causal chunks byte-identical for %s",
    (brushId) => {
      const stroke = plannedStroke(brushId, 512);
      const complete = kernelMarks(coverage(stroke));
      const chunkSizes = [1, 7, 31, 113, 59];
      const appended: Array<(typeof complete)[number]> = [];
      let cursor = 0;
      let chunkIndex = 0;
      while (cursor < stroke.dabs.length) {
        const end = Math.min(
          stroke.dabs.length,
          cursor + chunkSizes[chunkIndex % chunkSizes.length]!,
        );
        // Kernel marks are per-dab: a suffix plan needs no predecessor station context.
        appended.push(...kernelMarks(coverage(
          stroke,
          stroke.dabs.slice(cursor, end),
        )));
        cursor = end;
        chunkIndex += 1;
      }
      expect(appended).toEqual(complete);
    },
  );

  it("plans fresh strokes without union polygons and without the union program pin", () => {
    for (const brushId of CORE_DRY_MEDIA) {
      const stroke = plannedStroke(brushId, 192);
      expect(stroke.dynamics.dryMediaUnionProgram, brushId).toBeUndefined();
      const plan = coverage(stroke);
      expect(plan.ok, brushId).toBe(true);
      if (!plan.ok) continue;
      expect(
        plan.marks.some((mark) =>
          mark.ribbon?.kind === "dry-media-union-ribbon-polygon"),
        brushId,
      ).toBe(false);
      expect(plan.marks.every((mark) => mark.ribbon === undefined), brushId)
        .toBe(true);
    }
  });

  it("keeps 1k/2k source commits linear and inside an interactive planning budget", () => {
    // Warm module/JIT caches before measuring allocation-heavy material lowering.
    kernelMarks(coverage(plannedStroke("charcoal", 128)));
    const measure = (sampleCount: number) => {
      const startedAt = performance.now();
      const stroke = plannedStroke("charcoal", sampleCount);
      const marks = kernelMarks(coverage(stroke));
      return {
        elapsed: performance.now() - startedAt,
        dabCount: stroke.dabs.length,
        markCount: marks.length,
      };
    };
    const oneThousand = measure(1_000);
    const twoThousand = measure(2_000);

    expect(oneThousand.dabCount).toBeGreaterThan(700);
    expect(twoThousand.dabCount).toBeGreaterThan(oneThousand.dabCount * 1.8);
    expect(twoThousand.markCount).toBeGreaterThan(oneThousand.markCount * 1.8);
    expect(oneThousand.elapsed).toBeLessThan(750);
    expect(twoThousand.elapsed).toBeLessThan(1_500);
    // Wide slack absorbs CI/JIT noise while rejecting accidental prefix-quadratic replanning.
    expect(twoThousand.elapsed).toBeLessThan(oneThousand.elapsed * 6 + 150);
  });

  it("soaks 5 consecutive 2000-sample strokes with stable chunk planning and zero failures", () => {
    // Warm-up before timing.
    kernelMarks(coverage(plannedStroke("crayon", 128)));
    const chunkSize = 128;
    const perStrokeElapsed: number[] = [];
    let maxChunkMs = 0;
    for (let strokeIndex = 0; strokeIndex < 5; strokeIndex += 1) {
      const brushId = CORE_DRY_MEDIA[strokeIndex % CORE_DRY_MEDIA.length]!;
      const stroke = plannedStroke(brushId, 2_000, strokeIndex / 3);
      expect(stroke.dabs.length, brushId).toBeGreaterThan(900);
      let cursor = 0;
      const strokeStartedAt = performance.now();
      while (cursor < stroke.dabs.length) {
        const end = Math.min(stroke.dabs.length, cursor + chunkSize);
        const chunkStartedAt = performance.now();
        const plan = coverage(stroke, stroke.dabs.slice(cursor, end));
        const chunkElapsed = performance.now() - chunkStartedAt;
        if (chunkElapsed > maxChunkMs) maxChunkMs = chunkElapsed;
        // Zero budget failures across the whole soak.
        expect(plan.ok, `${brushId} chunk ${cursor}:${end}`).toBe(true);
        cursor = end;
      }
      perStrokeElapsed.push(performance.now() - strokeStartedAt);
    }
    // No live-session freeze: every incremental chunk stays under one 30fps frame.
    expect(maxChunkMs).toBeLessThan(33);
    // No cross-stroke degradation: the union-era failure mode was state accumulating between
    // strokes. Allow 20% relative drift plus a small absolute grace for CI timer noise.
    const first = perStrokeElapsed[0]!;
    const last = perStrokeElapsed.at(-1)!;
    expect(last).toBeLessThan(first * 1.2 + 40);
  });
});
