import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  augmentStudioLivingInkSettledBakeDabs,
  requestStudioLivingInkSettledBakeDabs,
  resetStudioLivingInkSettledBakeCacheForTests,
  STUDIO_LIVING_INK_SETTLED_BAKE_PROGRAMS,
} from "./studio-living-ink-settled-bake-v1";

import type { WatercolorBrushDab } from "./studio-watercolor-brush";

/**
 * Adversarial-review regression (Lens 3, major — living-ink settled-bake stall).
 *
 * Probe being reproduced: `applyStudioBrushAliasWatercolorMaterial(..., "settled")` ran the
 * whole-stroke fluid solve synchronously in StudioDrawNode's render body — measured 30–36ms
 * per ~1000-dab stroke on the reviewer's machine and 70–116ms here, re-paid on EVERY render
 * of every committed living-ink stroke × symmetry variation, with no memoization anywhere in
 * the chain. Repo freeze budget is <33ms per main-thread chunk.
 *
 * Before the fix these tests fail:
 * - the memo assertions fail because every call re-ran the full ~24-tick solve and returned a
 *   fresh array (no cache — the repeat-call probe measured full solve cost every time);
 * - the scheduling API (`requestStudioLivingInkSettledBakeDabs`) did not exist, and no code
 *   path could produce the settled plan without a single synchronous over-budget stall.
 * After the fix: byte-equal inputs hit a deterministic cache, and the cold solve advances a
 * few fixed ticks per macrotask slice, each slice bounded under the 33ms chunk budget.
 */

/** Repo main-thread freeze budget per chunk (docs/toonstudio quality gates). */
const CHUNK_FREEZE_BUDGET_MS = 33;

/** The causal watercolor planner caps plans at DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS. */
const PLANNER_DAB_CAP = 8_192;

const SETTLED_SUMI = {
  ...STUDIO_LIVING_INK_SETTLED_BAKE_PROGRAMS["sumi-flow-bake"],
  seed: 4242,
  phase: "settled",
} as const;

function makePlan(stations: number): WatercolorBrushDab[] {
  const dabs: WatercolorBrushDab[] = [];
  for (let index = 0; index < stations; index += 1) {
    const t = index / Math.max(1, stations - 1);
    const x = 40 + t * 900 + Math.sin(t * 19) * 30;
    const y = 300 + Math.sin(t * 6.2) * 140;
    const radius = 6 + Math.sin(t * 12) * 2.5;
    dabs.push({ x, y, radius, opacity: 0.42, role: "core" });
    dabs.push({
      x: x + 1.5,
      y: y - 1,
      radius: radius * 1.7,
      opacity: 0.18,
      role: "diffuse",
    });
  }
  return dabs;
}

type TimeoutLike = typeof globalThis.setTimeout;

/** Captures the module's macrotask slices so the test can run and time each one. */
function captureScheduledSlices(): {
  runNextSlice: () => number | null;
  restore: () => void;
} {
  const queue: Array<() => void> = [];
  const original = globalThis.setTimeout;
  const capture = ((handler: () => void) => {
    queue.push(handler);
    return 0 as unknown as ReturnType<TimeoutLike>;
  }) as unknown as TimeoutLike;
  globalThis.setTimeout = capture;
  return {
    runNextSlice: () => {
      const slice = queue.shift();
      if (!slice) return null;
      const startedAt = performance.now();
      slice();
      return performance.now() - startedAt;
    },
    restore: () => {
      globalThis.setTimeout = original;
    },
  };
}

beforeEach(() => {
  resetStudioLivingInkSettledBakeCacheForTests();
});

afterEach(() => {
  resetStudioLivingInkSettledBakeCacheForTests();
});

describe("deterministic settled-bake memo cache", () => {
  it("returns the identical plan without re-solving for byte-equal inputs", () => {
    const plan = makePlan(500);

    const first = augmentStudioLivingInkSettledBakeDabs(plan, SETTLED_SUMI);
    expect(first.length).toBeGreaterThan(plan.length);

    // Same array instance → same output instance, no recompute.
    expect(augmentStudioLivingInkSettledBakeDabs(plan, SETTLED_SUMI)).toBe(first);

    // Content-equal but distinct array (every React render replans): identical
    // bytes, passthrough cores re-anchored to the CALLER's own objects, and a
    // repeat cost far under the freeze budget (pre-fix: a full 30–116ms solve).
    const replanned = makePlan(500);
    const startedAt = performance.now();
    const second = augmentStudioLivingInkSettledBakeDabs(replanned, SETTLED_SUMI);
    const repeatMs = performance.now() - startedAt;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    const secondCores = second.filter((dab) => dab.role === "core");
    const replannedCores = replanned.filter((dab) => dab.role === "core");
    expect(secondCores.length).toBe(replannedCores.length);
    for (let index = 0; index < secondCores.length; index += 1) {
      expect(secondCores[index]).toBe(replannedCores[index]);
    }
    expect(repeatMs).toBeLessThan(CHUNK_FREEZE_BUDGET_MS / 2);
  });

  it("keeps different seeds/settings in distinct entries", () => {
    const plan = makePlan(120);
    const seedA = augmentStudioLivingInkSettledBakeDabs(plan, SETTLED_SUMI);
    const seedB = augmentStudioLivingInkSettledBakeDabs(plan, {
      ...SETTLED_SUMI,
      seed: 7,
    });
    expect(JSON.stringify(seedA)).not.toBe(JSON.stringify(seedB));
    // Both remain cached independently.
    expect(augmentStudioLivingInkSettledBakeDabs(plan, SETTLED_SUMI)).toBe(seedA);
    expect(
      augmentStudioLivingInkSettledBakeDabs(plan, { ...SETTLED_SUMI, seed: 7 }),
    ).toBe(seedB);
  });
});

describe("time-sliced settled bake at the planner cap", () => {
  it("keeps every main-thread slice under the 33ms chunk freeze budget and matches the synchronous bytes", () => {
    // 1. Synchronous reference (what SVG export computes) at the planner cap.
    const referenceInput = makePlan(PLANNER_DAB_CAP / 2);
    expect(referenceInput.length).toBe(PLANNER_DAB_CAP);
    const referenceBytes = JSON.stringify(
      augmentStudioLivingInkSettledBakeDabs(referenceInput, SETTLED_SUMI),
    );
    resetStudioLivingInkSettledBakeCacheForTests();

    // 2. Cold render-path request: must NOT solve synchronously.
    const scheduler = captureScheduledSlices();
    try {
      const input = makePlan(PLANNER_DAB_CAP / 2);
      let readyCount = 0;
      const onReady = () => {
        readyCount += 1;
      };
      const requestStartedAt = performance.now();
      const immediate = requestStudioLivingInkSettledBakeDabs(
        input,
        SETTLED_SUMI,
        onReady,
      );
      const requestMs = performance.now() - requestStartedAt;
      expect(immediate).toBeNull();
      // The render-body call only snapshots + enqueues — far under budget.
      expect(requestMs).toBeLessThan(CHUNK_FREEZE_BUDGET_MS / 2);

      // A joining request (content-equal array, e.g. a symmetry sibling or a
      // second render) shares the pending job instead of re-enqueueing.
      expect(
        requestStudioLivingInkSettledBakeDabs(makePlan(PLANNER_DAB_CAP / 2), SETTLED_SUMI, onReady),
      ).toBeNull();

      // 3. Drive the macrotask slices; each one must stay under the budget.
      const sliceDurations: number[] = [];
      for (let slice = 0; slice < 200 && readyCount === 0; slice += 1) {
        const elapsed = scheduler.runNextSlice();
        expect(elapsed).not.toBeNull();
        sliceDurations.push(elapsed ?? 0);
      }
      expect(readyCount).toBe(1);
      expect(sliceDurations.length).toBeGreaterThan(1);
      for (const duration of sliceDurations) {
        expect(duration).toBeLessThan(CHUNK_FREEZE_BUDGET_MS);
      }

      // 4. Completion: the cached plan is byte-identical to the synchronous
      //    solve — slicing changed scheduling, never bytes — and the cores are
      //    the requesting array's own objects.
      const settled = requestStudioLivingInkSettledBakeDabs(
        input,
        SETTLED_SUMI,
        onReady,
      );
      expect(settled).not.toBeNull();
      expect(JSON.stringify(settled)).toBe(referenceBytes);
      const settledCores = (settled ?? []).filter((dab) => dab.role === "core");
      const inputCores = input.filter((dab) => dab.role === "core");
      for (let index = 0; index < inputCores.length; index += 1) {
        expect(settledCores[index]).toBe(inputCores[index]);
      }
    } finally {
      scheduler.restore();
    }
  });

  it("returns identity plans immediately for non-settled phases and empty plans", () => {
    const plan = makePlan(8);
    const live = requestStudioLivingInkSettledBakeDabs(
      plan,
      { ...SETTLED_SUMI, phase: "live" },
      () => {},
    );
    expect(live).toBe(plan);
    const empty: WatercolorBrushDab[] = [];
    expect(
      requestStudioLivingInkSettledBakeDabs(empty, SETTLED_SUMI, () => {}),
    ).toBe(empty);
  });

  it("falls back to a synchronous solve when no scheduler exists (fail-closed on correctness)", () => {
    const original = globalThis.setTimeout;
    // @ts-expect-error — simulating a host without timers.
    globalThis.setTimeout = undefined;
    try {
      const input = makePlan(40);
      const settled = requestStudioLivingInkSettledBakeDabs(
        input,
        SETTLED_SUMI,
        () => {},
      );
      expect(settled).not.toBeNull();
      expect((settled ?? []).length).toBeGreaterThan(input.length);
    } finally {
      globalThis.setTimeout = original;
    }
  });
});
