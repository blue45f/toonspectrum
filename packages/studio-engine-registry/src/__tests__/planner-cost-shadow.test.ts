import { beforeAll, describe, expect, it } from "vitest";

import { HybridExecutionPlanner, PlanUnsatisfiableError } from "../planner";
import {
  COST_MODEL_COEFFICIENTS,
  COST_MODEL_PROVENANCE,
  COST_MODEL_REFERENCE,
  costLaneForRuntime,
  estimateProviderCost,
  isUsableCostShadowFingerprint,
  laneCrossoverMegapixels,
  planWithCostShadow,
  presentedMegapixels,
} from "../planner-cost-shadow";
import { EngineCapabilityRegistry } from "../registry";
import { emptyWorkloadFingerprint } from "../workload-fingerprint";

import type { ProviderDescriptor } from "../descriptor";
import type {
  CostLane,
  CostShadowFingerprint,
  CostShadowPlanRequest,
  LaneCostCoefficients,
} from "../planner-cost-shadow";
import type { RenderWorkloadFingerprint } from "../workload-fingerprint";

function descriptor(overrides: Partial<ProviderDescriptor>): ProviderDescriptor {
  return {
    id: "test-provider",
    kind: "vector-renderer",
    displayName: "Test Provider",
    version: "1.0.0",
    license: "MIT",
    attribution: "",
    maturity: "candidate",
    runtime: "wasm",
    capabilities: ["render.vector.fill"],
    limitations: [],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "tolerance",
    memoryEstimateMb: 16,
    knownIssues: [],
    ...overrides,
  };
}

/** webgpu / webgl / cpu lanes that all satisfy the same stroke capability. */
function threeLaneRegistry(): EngineCapabilityRegistry {
  const registry = EngineCapabilityRegistry.forTestFixtures();
  registry.registerTestFixture(
    descriptor({
      id: "surface-owner",
      runtime: "wasm",
      capabilities: ["surface.primary", "render.vector.fill", "render.vector.stroke"],
      memoryEstimateMb: 32,
    }),
  );
  registry.registerTestFixture(
    descriptor({
      id: "vello-gpu",
      runtime: "webgpu",
      capabilities: ["render.vector.fill", "render.vector.stroke"],
      memoryEstimateMb: 64,
    }),
  );
  registry.registerTestFixture(
    descriptor({
      id: "skia-webgl",
      runtime: "webgl",
      capabilities: ["render.vector.fill", "render.vector.stroke"],
      memoryEstimateMb: 128,
    }),
  );
  registry.registerTestFixture(
    descriptor({
      id: "vello-cpu",
      runtime: "wasm",
      capabilities: ["render.vector.fill", "render.vector.stroke"],
      memoryEstimateMb: 16,
    }),
  );
  return registry;
}

function strokeRequest(
  fingerprint: CostShadowFingerprint | undefined,
): CostShadowPlanRequest {
  return {
    surfaceId: "main",
    mode: "interactive",
    primaryOwnerId: "surface-owner",
    islands: [
      {
        islandId: "lineart",
        kind: "vector-renderer",
        requiredCapabilities: ["render.vector.stroke"],
        availableTransports: ["image-bitmap"],
        ...(fingerprint === undefined ? {} : { fingerprint }),
      },
    ],
  };
}

/**
 * A filter island's fingerprint, encoded the way the product seam encodes it
 * (studio-filter-island-plan.deriveStudioFilterIslandCostFingerprint): one
 * source bitmap, one forced offscreen isolation, one filter node per chain
 * step, and the island's megapixels folded into the area factor so that
 * `visibleAreaRatio × dpr²` *is* the presented megapixel count.
 *
 * The model floors dpr at 1, so sub-megapixel islands are expressed through
 * visibleAreaRatio instead. (The product seam encodes only
 * `dpr = √max(1, MP)`, so it currently cannot express the sub-megapixel
 * regime at all — see the followup noted for the main loop.)
 */
function filterFingerprint(megapixels: number, chainSteps: number): CostShadowFingerprint {
  const fingerprint = emptyWorkloadFingerprint({
    changedPathRatio: 1,
    imageCount: 1,
    isolatedLayerCount: 1,
    filterNodeCount: chainSteps,
    visibleAreaRatio: megapixels >= 1 ? 1 : megapixels,
    dpr: megapixels >= 1 ? Math.sqrt(megapixels) : 1,
  });
  expect(presentedMegapixels(fingerprint)).toBeCloseTo(megapixels, 10);
  return fingerprint;
}

function costOf(runtime: ProviderDescriptor["runtime"], fingerprint: CostShadowFingerprint) {
  return estimateProviderCost(descriptor({ id: runtime, runtime }), fingerprint);
}

describe("costLaneForRuntime", () => {
  it("maps runtimes onto the V13 execution-contract lanes", () => {
    expect(costLaneForRuntime("webgpu")).toBe("webgpu");
    expect(costLaneForRuntime("webgl")).toBe("webgl");
    expect(costLaneForRuntime("js")).toBe("cpu");
    expect(costLaneForRuntime("wasm")).toBe("cpu");
    expect(costLaneForRuntime("wasm-worker")).toBe("cpu");
    expect(costLaneForRuntime("native-bridge")).toBe("cpu");
  });
});

describe("isUsableCostShadowFingerprint (fail closed)", () => {
  it("accepts a full RenderWorkloadFingerprint", () => {
    expect(isUsableCostShadowFingerprint(emptyWorkloadFingerprint())).toBe(true);
  });

  it("rejects missing, non-finite, and negative fields", () => {
    expect(isUsableCostShadowFingerprint(undefined)).toBe(false);
    expect(isUsableCostShadowFingerprint(null)).toBe(false);
    expect(
      isUsableCostShadowFingerprint(emptyWorkloadFingerprint({ dpr: Number.NaN })),
    ).toBe(false);
    expect(
      isUsableCostShadowFingerprint(
        emptyWorkloadFingerprint({ segmentCount: Number.POSITIVE_INFINITY }),
      ),
    ).toBe(false);
    expect(
      isUsableCostShadowFingerprint(emptyWorkloadFingerprint({ pathCount: -1 })),
    ).toBe(false);
  });
});

describe("estimateProviderCost", () => {
  it("is a pure deterministic function of descriptor + fingerprint", () => {
    const provider = descriptor({ id: "vello-gpu", runtime: "webgpu" });
    const fingerprint = emptyWorkloadFingerprint({ pathCount: 12, segmentCount: 90 });
    expect(estimateProviderCost(provider, fingerprint)).toEqual(
      estimateProviderCost(provider, fingerprint),
    );
  });

  it("charges cpu+pixels lanes more than shared-device gpu on large fingerprints", () => {
    const large = emptyWorkloadFingerprint({
      pathCount: 1024,
      segmentCount: 8192,
      changedPathRatio: 1,
      visibleAreaRatio: 1,
      dpr: 2,
    });
    const gpu = estimateProviderCost(descriptor({ id: "gpu", runtime: "webgpu" }), large);
    const cpu = estimateProviderCost(descriptor({ id: "cpu", runtime: "wasm" }), large);
    expect(cpu.total).toBeGreaterThan(gpu.total);
    // The pixels-output readback penalty is what the shared-device lane skips.
    expect(gpu.transfer).toBe(0);
    expect(cpu.transfer).toBeGreaterThan(0);
  });

  it("decomposes into the measured model's fixed + per-megapixel shape", () => {
    const fingerprint = emptyWorkloadFingerprint({
      pathCount: 40,
      segmentCount: 900,
      changedPathRatio: 1,
      imageCount: 2,
      glyphCount: 300,
      gradientCount: 5,
      isolatedLayerCount: 2,
      maskDepth: 1,
      filterNodeCount: 3,
      visibleAreaRatio: 0.6,
      dpr: 2,
    });
    for (const runtime of ["webgpu", "webgl", "wasm"] as const) {
      const cost = costOf(runtime, fingerprint);
      expect(cost.areaMegapixels).toBeCloseTo(presentedMegapixels(fingerprint), 12);
      // total === fixedMs + perMegapixelMs × areaMegapixels (the shape the
      // product's measured filter-lane model is fitted in).
      expect(cost.total).toBeCloseTo(cost.fixedMs + cost.perMegapixelMs * cost.areaMegapixels, 10);
      // …and the reported components still sum to the same total.
      expect(cost.total).toBeCloseTo(
        cost.base
        + cost.geometry
        + cost.raster
        + cost.text
        + cost.gradients
        + cost.layering
        + cost.transfer
        + cost.memory,
        10,
      );
      // The fixed share is exactly the area-independent terms.
      expect(cost.fixedMs).toBeCloseTo(cost.base + cost.text + cost.gradients + cost.memory, 12);
    }
  });

  it("keeps the incremental floor: zero changed paths still pays 25% geometry", () => {
    const still = emptyWorkloadFingerprint({
      pathCount: 100,
      segmentCount: 1000,
      changedPathRatio: 0,
    });
    const full = emptyWorkloadFingerprint({
      pathCount: 100,
      segmentCount: 1000,
      changedPathRatio: 1,
    });
    const provider = descriptor({ id: "gpu", runtime: "webgpu" });
    const stillCost = estimateProviderCost(provider, still);
    const fullCost = estimateProviderCost(provider, full);
    expect(stillCost.geometry).toBeCloseTo(
      fullCost.geometry * COST_MODEL_COEFFICIENTS.incrementalFloor,
      10,
    );
    expect(stillCost.geometry).toBeGreaterThan(0);
  });
});

describe("planWithCostShadow — authority and fail-closed behavior", () => {
  it("returns the legacy plan unchanged as the routing authority", () => {
    const registry = threeLaneRegistry();
    const request = strokeRequest(emptyWorkloadFingerprint({ pathCount: 500, segmentCount: 4000 }));
    const legacy = new HybridExecutionPlanner(registry).plan(request);
    const shadow = planWithCostShadow(registry, request);
    expect(shadow.plan).toEqual(legacy);
  });

  it("records absent and defers to legacy when the fingerprint is missing", () => {
    const registry = threeLaneRegistry();
    const shadow = planWithCostShadow(registry, strokeRequest(undefined));
    const island = shadow.receipt.islands[0]!;
    expect(island.fingerprint).toBe("absent");
    expect(island.costs).toEqual([]);
    expect(island.costWinner).toBeNull();
    expect(island.agreed).toBe(true);
    expect(shadow.receipt.agreed).toBe(true);
    expect(shadow.plan.islands[0]?.providerId).toBe(island.legacyWinner);
  });

  it("treats an unusable fingerprint exactly like a missing one", () => {
    const registry = threeLaneRegistry();
    const shadow = planWithCostShadow(
      registry,
      strokeRequest(emptyWorkloadFingerprint({ dpr: Number.NaN })),
    );
    const island = shadow.receipt.islands[0]!;
    expect(island.fingerprint).toBe("absent");
    expect(island.costs).toEqual([]);
    expect(island.costWinner).toBeNull();
    expect(island.agreed).toBe(true);
  });

  it("propagates PlanUnsatisfiableError without rescuing (fail closed)", () => {
    const registry = threeLaneRegistry();
    const request: CostShadowPlanRequest = {
      surfaceId: "main",
      mode: "interactive",
      primaryOwnerId: "surface-owner",
      islands: [
        {
          islandId: "impossible",
          kind: "vector-renderer",
          requiredCapabilities: ["render.text.paragraph"],
          availableTransports: ["image-bitmap"],
          fingerprint: emptyWorkloadFingerprint(),
        },
      ],
    };
    expect(() => planWithCostShadow(registry, request)).toThrow(PlanUnsatisfiableError);
  });

  it("exact-total ties defer to the legacy winner, not lexicographic order", () => {
    const registry = EngineCapabilityRegistry.forTestFixtures();
    registry.registerTestFixture(
      descriptor({ id: "surface-owner", capabilities: ["surface.primary"] }),
    );
    // Identical runtime + memory ⇒ identical totals. Legacy picks the
    // first-registered ("z-first"); "a-second" sorts lexicographically first.
    registry.registerTestFixture(
      descriptor({ id: "z-first", runtime: "wasm", memoryEstimateMb: 16 }),
    );
    registry.registerTestFixture(
      descriptor({ id: "a-second", runtime: "wasm", memoryEstimateMb: 16 }),
    );
    const shadow = planWithCostShadow(registry, {
      surfaceId: "main",
      mode: "interactive",
      primaryOwnerId: "surface-owner",
      islands: [
        {
          islandId: "tie",
          kind: "vector-renderer",
          requiredCapabilities: ["render.vector.fill"],
          availableTransports: ["image-bitmap"],
          fingerprint: emptyWorkloadFingerprint({ pathCount: 4, segmentCount: 16 }),
        },
      ],
    });
    const island = shadow.receipt.islands[0]!;
    expect(island.legacyWinner).toBe("z-first");
    expect(island.costWinner).toBe("z-first");
    expect(island.agreed).toBe(true);
    // The ranking itself stays deterministic-lexicographic on ties.
    expect(island.costs.map((cost) => cost.providerId)).toContain("a-second");
  });
});

describe("planWithCostShadow — fingerprint lattice parity (receipt total + deterministic)", () => {
  const registry = threeLaneRegistry();
  const candidateIds = ["surface-owner", "vello-gpu", "skia-webgl", "vello-cpu"];

  const lattice: RenderWorkloadFingerprint[] = [];
  for (const pathCount of [0, 4, 64, 1024]) {
    for (const segmentCount of [0, 32, 4096]) {
      for (const imageCount of [0, 8]) {
        for (const filterNodeCount of [0, 6]) {
          for (const visibleAreaRatio of [0.05, 1]) {
            for (const dpr of [1, 3]) {
              for (const changedPathRatio of [0, 1]) {
                lattice.push(
                  emptyWorkloadFingerprint({
                    pathCount,
                    segmentCount,
                    imageCount,
                    filterNodeCount,
                    visibleAreaRatio,
                    dpr,
                    changedPathRatio,
                  }),
                );
              }
            }
          }
        }
      }
    }
  }

  it("covers the intended lattice", () => {
    expect(lattice).toHaveLength(4 * 3 * 2 * 2 * 2 * 2 * 2);
  });

  it("every lattice point yields a total, deterministic receipt with the legacy authority intact", () => {
    const winningLanes = new Set<CostLane>();
    for (const fingerprint of lattice) {
      const request = strokeRequest(fingerprint);
      const first = planWithCostShadow(registry, request);
      const second = planWithCostShadow(registry, request);
      // Deterministic: identical input ⇒ identical plan and receipt.
      expect(second).toEqual(first);

      // Authority parity: the shadow's plan is the legacy plan.
      const legacy = new HybridExecutionPlanner(registry).plan(request);
      expect(first.plan).toEqual(legacy);

      // Receipt totality: one receipt per planned island, one breakdown per
      // capability-admitted candidate, all totals finite and non-negative.
      expect(first.receipt.islands).toHaveLength(first.plan.islands.length);
      const island = first.receipt.islands[0]!;
      expect(island.legacyWinner).toBe(legacy.islands[0]!.providerId);
      expect(island.fingerprint).not.toBe("absent");
      expect(island.costs).toHaveLength(4);
      for (const cost of island.costs) {
        expect(candidateIds).toContain(cost.providerId);
        expect(Number.isFinite(cost.total)).toBe(true);
        expect(cost.total).toBeGreaterThanOrEqual(0);
        // Calibrated shape holds everywhere: total is linear in presented area.
        expect(cost.areaMegapixels).toBeCloseTo(presentedMegapixels(fingerprint), 12);
        expect(cost.total).toBeCloseTo(
          cost.fixedMs + cost.perMegapixelMs * cost.areaMegapixels,
          10,
        );
      }
      // Ranking is sorted cheapest-first with deterministic id tie-break.
      for (let index = 1; index < island.costs.length; index += 1) {
        const prev = island.costs[index - 1]!;
        const next = island.costs[index]!;
        expect(
          prev.total < next.total
          || (prev.total === next.total && prev.providerId < next.providerId),
        ).toBe(true);
      }
      expect(island.costWinner).not.toBeNull();
      expect(candidateIds).toContain(island.costWinner);
      expect(island.agreed).toBe(island.costWinner === island.legacyWinner);
      const winner = island.costs.find((cost) => cost.providerId === island.costWinner);
      if (winner !== undefined) winningLanes.add(winner.lane);
    }
    // The calibrated model must not be a constant verdict: the same lattice
    // has to rank a cpu lane cheapest somewhere (small / low-coverage points
    // that cannot amortize the gpu submit floor) and the shared-device gpu
    // lane cheapest somewhere else (large, high-dpr, filter-heavy points).
    // Before the calibration this set was `{ "webgpu" }` for every filter
    // fingerprint, which made the accumulated evidence meaningless.
    expect([...winningLanes].sort()).toEqual(["cpu", "webgpu"]);
  });
});

describe("planWithCostShadow — targeted disagreements (promotion evidence)", () => {
  it("tiny low-coverage island: legacy insists on webgpu, cost prefers cpu", () => {
    // A 4%-viewport sticker with 2 paths presents 0.04 MP, two orders under
    // the single-pass crossover, so it cannot amortize the measured 2.4 ms
    // WebGPU submit floor (cpu pays no lane entry cost at all), and its
    // pixels-upload penalty is negligible at that area (0.85 x 0.04). The cost
    // winner is better because the accelerator-rank heuristic pays a fixed GPU
    // floor for almost no scalable work.
    const registry = threeLaneRegistry();
    const shadow = planWithCostShadow(
      registry,
      strokeRequest(
        emptyWorkloadFingerprint({
          pathCount: 2,
          segmentCount: 8,
          changedPathRatio: 1,
          visibleAreaRatio: 0.04,
          dpr: 1,
        }),
      ),
    );
    const island = shadow.receipt.islands[0]!;
    expect(island.legacyWinner).toBe("vello-gpu");
    expect(island.costWinner).toBe("vello-cpu");
    expect(island.agreed).toBe(false);
    expect(shadow.receipt.agreed).toBe(false);
    // Authority unchanged: routing still follows the legacy winner.
    expect(shadow.plan.islands[0]?.providerId).toBe("vello-gpu");
  });

  it("heavy lineart: legacy and cost agree on webgpu with a wide margin", () => {
    const registry = threeLaneRegistry();
    const shadow = planWithCostShadow(
      registry,
      strokeRequest(
        emptyWorkloadFingerprint({
          pathCount: 1024,
          segmentCount: 8192,
          changedPathRatio: 1,
          visibleAreaRatio: 1,
          dpr: 2,
        }),
      ),
    );
    const island = shadow.receipt.islands[0]!;
    expect(island.legacyWinner).toBe("vello-gpu");
    expect(island.costWinner).toBe("vello-gpu");
    expect(island.agreed).toBe(true);
    const gpu = island.costs.find((cost) => cost.providerId === "vello-gpu")!;
    const cpu = island.costs.find((cost) => cost.providerId === "vello-cpu")!;
    expect(cpu.total).toBeGreaterThan(gpu.total * 5);
  });

  it("small filter island: legacy insists on webgpu, cost prefers cpu (calibrated case)", () => {
    // The exact class the calibration exists for. A 0.1 MP filter island with
    // one pass sits below the 0.375 MP crossover, so the measured cpu per-pass
    // rate still beats the gpu submit floor — the pre-calibration model ranked
    // webgpu first here (and at every other filter size), so this receipt
    // could never have been produced.
    const registry = threeLaneRegistry();
    const shadow = planWithCostShadow(registry, strokeRequest(filterFingerprint(0.1, 1)));
    const island = shadow.receipt.islands[0]!;
    expect(island.legacyWinner).toBe("vello-gpu");
    expect(island.costWinner).toBe("vello-cpu");
    expect(island.agreed).toBe(false);
    // Authority unchanged: routing still follows the legacy winner.
    expect(shadow.plan.islands[0]?.providerId).toBe("vello-gpu");
    const gpu = island.costs.find((cost) => cost.providerId === "vello-gpu")!;
    const cpu = island.costs.find((cost) => cost.providerId === "vello-cpu")!;
    // The disagreement is a fixed-cost story, not a slope story.
    expect(gpu.fixedMs).toBeGreaterThan(cpu.fixedMs);
    expect(gpu.perMegapixelMs).toBeLessThan(cpu.perMegapixelMs);
    expect(laneCrossoverMegapixels(cpu, gpu) ?? 0).toBeGreaterThan(island.costs[0]!.areaMegapixels);
  });

  it("large filter island: the same lanes agree on webgpu above the crossover", () => {
    // Same registry, same fingerprint shape, 40x the area: the shadow now
    // agrees with the legacy accelerator ranking. Agreement and disagreement
    // both being reachable is what makes the receipt evidence.
    const registry = threeLaneRegistry();
    const shadow = planWithCostShadow(registry, strokeRequest(filterFingerprint(4, 1)));
    const island = shadow.receipt.islands[0]!;
    expect(island.legacyWinner).toBe("vello-gpu");
    expect(island.costWinner).toBe("vello-gpu");
    expect(island.agreed).toBe(true);
    const gpu = island.costs.find((cost) => cost.providerId === "vello-gpu")!;
    const cpu = island.costs.find((cost) => cost.providerId === "vello-cpu")!;
    expect(cpu.total).toBeGreaterThan(gpu.total * 5);
  });

  it("same-runtime candidates: legacy picks first-registered, cost prefers the lighter provider", () => {
    // Legacy's registration-order tie-break ignores residency footprint. The
    // cost winner is better because, with identical workload terms, the
    // 8 MB provider leaves 504 MB more headroom than the 512 MB one — the
    // documented memoryPressurePerMb coefficient is the only difference.
    const registry = EngineCapabilityRegistry.forTestFixtures();
    registry.registerTestFixture(
      descriptor({ id: "surface-owner", capabilities: ["surface.primary"] }),
    );
    registry.registerTestFixture(
      descriptor({ id: "heavy-first", runtime: "wasm", memoryEstimateMb: 512 }),
    );
    registry.registerTestFixture(
      descriptor({ id: "light-second", runtime: "wasm", memoryEstimateMb: 8 }),
    );
    const shadow = planWithCostShadow(registry, {
      surfaceId: "main",
      mode: "interactive",
      primaryOwnerId: "surface-owner",
      islands: [
        {
          islandId: "fill",
          kind: "vector-renderer",
          requiredCapabilities: ["render.vector.fill"],
          availableTransports: ["image-bitmap"],
          fingerprint: emptyWorkloadFingerprint({ pathCount: 16, segmentCount: 128 }),
        },
      ],
    });
    const island = shadow.receipt.islands[0]!;
    expect(island.legacyWinner).toBe("heavy-first");
    expect(island.costWinner).toBe("light-second");
    expect(island.agreed).toBe(false);
    expect(shadow.plan.islands[0]?.providerId).toBe("heavy-first");
  });
});

/**
 * Calibration honesty gates. The shadow's whole purpose is to accumulate
 * promotion evidence, so a model that cannot be wrong is worse than no model:
 * before this calibration the abstract coefficients made the webgpu lane
 * strictly cheaper than every cpu lane for *every* filter fingerprint, which
 * contradicts the measured filter-lane model the product already trusts.
 * These cases pin (a) that every coefficient is documented, (b) that the
 * unmeasured ones stay small enough to be ordering-only, and (c) that the
 * measured ones still match the benchmark files they cite.
 */
describe("cost-model calibration — provenance and magnitude discipline", () => {
  const lanes: readonly CostLane[] = ["webgpu", "webgl", "cpu"];

  it("documents a provenance class for every coefficient of every lane", () => {
    const coefficientKeys = Object.keys(COST_MODEL_COEFFICIENTS.lane.cpu).sort();
    expect(Object.keys(COST_MODEL_PROVENANCE.lane).sort()).toEqual([...lanes].sort());
    for (const lane of lanes) {
      expect(Object.keys(COST_MODEL_COEFFICIENTS.lane[lane]).sort()).toEqual(coefficientKeys);
      expect(Object.keys(COST_MODEL_PROVENANCE.lane[lane]).sort()).toEqual(coefficientKeys);
    }
    // The terms that decide a gpu-vs-cpu filter verdict may never be ordinal:
    // the lane entry cost, the filter pass rate and the output transfer are
    // exactly what the crossover is made of.
    expect(COST_MODEL_PROVENANCE.lane.cpu.perFilterNode).toBe("measured");
    expect(COST_MODEL_PROVENANCE.lane.webgpu.perFilterNode).toBe("measured");
    expect(COST_MODEL_PROVENANCE.lane.cpu.base).toBe("measured");
    expect(COST_MODEL_PROVENANCE.lane.webgpu.base).toBe("measured");
    expect(COST_MODEL_PROVENANCE.lane.cpu.outputPenaltyPerArea).not.toBe("ordinal");
    // Top-level (non-lane) coefficients are documented too.
    const topLevel = Object.keys(COST_MODEL_COEFFICIENTS).filter((key) => key !== "lane").sort();
    expect(Object.keys(COST_MODEL_PROVENANCE).filter((key) => key !== "lane").sort()).toEqual(
      topLevel,
    );
    expect(COST_MODEL_REFERENCE.unit).toBe("milliseconds");
  });

  it("keeps every coefficient finite and non-negative", () => {
    for (const lane of lanes) {
      for (const [key, value] of Object.entries(COST_MODEL_COEFFICIENTS.lane[lane])) {
        expect(Number.isFinite(value), `${lane}.${key}`).toBe(true);
        expect(value, `${lane}.${key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("caps the ordinal (unmeasured) per-element terms under 1% of a measured cpu pass", () => {
    // 3.7 ms/MP is the measured cost of one full-surface cpu filter pass. A
    // glyph or a gradient ramp is not measured anywhere in this repo, so its
    // coefficient is only allowed to order lanes the measured terms already
    // tie — never to outweigh a pass.
    const passRate = COST_MODEL_COEFFICIENTS.lane.cpu.perFilterNode;
    for (const lane of lanes) {
      const c: LaneCostCoefficients = COST_MODEL_COEFFICIENTS.lane[lane];
      expect(c.perGlyph, `${lane}.perGlyph`).toBeLessThan(passRate / 100);
      expect(c.perGradient, `${lane}.perGradient`).toBeLessThan(passRate / 100);
    }
  });

  it("keeps residency pressure an order of magnitude under the gpu submit floor", () => {
    // The heaviest descriptor this repo declares is 512 MB.
    const heaviest = 512 * COST_MODEL_COEFFICIENTS.memoryPressurePerMb;
    expect(heaviest).toBeLessThan(COST_MODEL_COEFFICIENTS.lane.webgpu.base / 10);
    expect(COST_MODEL_COEFFICIENTS.memoryPressurePerMb).toBeGreaterThan(0);
  });

  it("orders the lane entry cost: cpu pays no setup, webgpu amortizes, webgl pays most", () => {
    expect(COST_MODEL_COEFFICIENTS.lane.cpu.base).toBe(0);
    expect(COST_MODEL_COEFFICIENTS.lane.webgpu.base).toBeGreaterThan(
      COST_MODEL_COEFFICIENTS.lane.cpu.base,
    );
    expect(COST_MODEL_COEFFICIENTS.lane.webgl.base).toBeGreaterThan(
      COST_MODEL_COEFFICIENTS.lane.webgpu.base,
    );
    // …and inverts on the scaling terms, which is what creates a crossover.
    expect(COST_MODEL_COEFFICIENTS.lane.cpu.perFilterNode).toBeGreaterThan(
      COST_MODEL_COEFFICIENTS.lane.webgpu.perFilterNode,
    );
    expect(COST_MODEL_COEFFICIENTS.lane.cpu.perSegment).toBeGreaterThan(
      COST_MODEL_COEFFICIENTS.lane.webgpu.perSegment,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Measured parity — the cited benchmark files, read at test time      */
/* ------------------------------------------------------------------ */

interface MeasuredLaneFit {
  readonly fixedMs: number;
  readonly perMegapixelMs: number;
}
interface FilterLanesResult {
  readonly crossover: {
    readonly thresholdByChain: readonly {
      readonly chain: string;
      readonly gpuWinsFromSize: number;
      readonly largestCpuWinSize: number;
    }[];
    readonly costModelSeed: {
      readonly byChain: readonly {
        readonly chain: string;
        readonly gpuDispatches: number;
        readonly lanes: Record<string, MeasuredLaneFit>;
      }[];
    };
  };
}
interface LargeSceneResult {
  readonly config: { readonly pointsPerStroke: number };
  readonly gpuBrowser: {
    readonly scenes: readonly {
      readonly paths: number;
      readonly canvas: string;
      readonly gpuP50Ms: number;
      readonly cpuInBrowserP50Ms: number;
    }[];
  };
}

// This package's tsconfig carries no @types/node, so node built-ins are
// reached through a variable-specifier dynamic import — the same workaround
// filter-lanes-browser-probe.test.ts / wgsl-variants-pipeline-probe.test.ts use.
const dynamicImport = (specifier: string): Promise<unknown> =>
  import(/* @vite-ignore */ specifier);

async function readJson<T>(relative: string): Promise<T> {
  const fs = (await dynamicImport("node:fs")) as {
    readFileSync: (path: URL, encoding: string) => string;
  };
  const url = new URL(relative, import.meta.url);
  return JSON.parse(fs.readFileSync(url, "utf8")) as T;
}

/**
 * The coefficients claim specific numbers from specific files. If either
 * benchmark is re-run and the fit moves, this suite fails and the shadow's
 * documented provenance has to be re-derived rather than silently drifting.
 */
describe("cost-model calibration — parity with the cited measurements", () => {
  let filterLanes: FilterLanesResult;
  let largeScene: LargeSceneResult;

  beforeAll(async () => {
    filterLanes = await readJson<FilterLanesResult>(
      "../../../../tests/benchmarks/results/filter-lanes.json",
    );
    largeScene = await readJson<LargeSceneResult>(
      "../../../../tests/benchmarks/results/large-scene.json",
    );
  });

  function fit(chain: string, lane: string): MeasuredLaneFit {
    const entry = filterLanes.crossover.costModelSeed.byChain.find(
      (candidate) => candidate.chain === chain,
    );
    if (entry === undefined) throw new Error(`no measured chain ${chain}`);
    const laneFit = entry.lanes[lane];
    if (laneFit === undefined) throw new Error(`no measured lane ${lane} for ${chain}`);
    return laneFit;
  }

  it("webgpu base is the measured gpu submit/readback floor", () => {
    const measured =
      filterLanes.crossover.costModelSeed.byChain
        .map((entry) => entry.lanes["gpu-fused-apply"]?.fixedMs ?? Number.NaN)
        .reduce((sum, value) => sum + value, 0)
      / filterLanes.crossover.costModelSeed.byChain.length;
    expect(measured).toBeGreaterThan(0);
    expect(COST_MODEL_COEFFICIENTS.lane.webgpu.base).toBeCloseTo(measured, 0);
    expect(
      Math.abs(COST_MODEL_COEFFICIENTS.lane.webgpu.base - measured) / measured,
    ).toBeLessThan(0.15);
  });

  it("cpu base stays inside the measured intercept noise band", () => {
    // Every measured cpu intercept is noise around zero, so the model charges
    // cpu lanes no entry cost at all.
    for (const entry of filterLanes.crossover.costModelSeed.byChain) {
      for (const lane of ["worker-cpu", "direct-cpu", "konva-fallback"]) {
        expect(Math.abs(entry.lanes[lane]?.fixedMs ?? Number.NaN)).toBeLessThan(2.5);
      }
    }
    expect(COST_MODEL_COEFFICIENTS.lane.cpu.base).toBe(0);
  });

  it("cpu perFilterNode is the measured single-pass cpu rate", () => {
    for (const lane of ["worker-cpu", "direct-cpu", "konva-fallback"]) {
      const measured = fit("single", lane).perMegapixelMs;
      expect(
        Math.abs(COST_MODEL_COEFFICIENTS.lane.cpu.perFilterNode - measured) / measured,
      ).toBeLessThan(0.1);
    }
  });

  it("webgpu perFilterNode matches the measured fused pure-compute add-on", () => {
    // gpu-fused-pure-pass is the on-device compute without the readback the
    // apply lane pays: 0.076 / 1, 0.154 / 2, 0.16 / 4 dispatches.
    for (const entry of filterLanes.crossover.costModelSeed.byChain) {
      const perDispatch =
        (entry.lanes["gpu-fused-pure-pass"]?.perMegapixelMs ?? Number.NaN) / entry.gpuDispatches;
      expect(perDispatch).toBeGreaterThan(0);
      const ratio = COST_MODEL_COEFFICIENTS.lane.webgpu.perFilterNode / perDispatch;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    }
  });

  it("isolated-layer and image terms track the measured full-surface pure pass", () => {
    const purePass = fit("single", "gpu-fused-pure-pass").perMegapixelMs;
    // One full-surface on-device pass.
    expect(COST_MODEL_COEFFICIENTS.lane.webgpu.perIsolatedLayer).toBeCloseTo(purePass, 1);
    expect(COST_MODEL_COEFFICIENTS.lane.webgl.perIsolatedLayer).toBeCloseTo(purePass, 1);
    // A bind + sample is a fraction of a pass.
    expect(COST_MODEL_COEFFICIENTS.lane.webgpu.perImage).toBeLessThan(purePass);
    // The cpu blit is charged well under the measured per-pass math rate.
    expect(COST_MODEL_COEFFICIENTS.lane.cpu.perImage).toBeLessThan(
      COST_MODEL_COEFFICIENTS.lane.cpu.perFilterNode / 3,
    );
    expect(COST_MODEL_COEFFICIENTS.lane.cpu.perIsolatedLayer).toBe(
      COST_MODEL_COEFFICIENTS.lane.cpu.perImage,
    );
  });

  it("output transfer is the measured gpu round trip (webgl) and its upload half (cpu)", () => {
    const roundTrip =
      fit("single", "gpu-fused-apply").perMegapixelMs
      - fit("single", "gpu-fused-pure-pass").perMegapixelMs;
    expect(roundTrip).toBeGreaterThan(1);
    expect(COST_MODEL_COEFFICIENTS.lane.webgl.outputPenaltyPerArea).toBeCloseTo(roundTrip, 1);
    expect(COST_MODEL_COEFFICIENTS.lane.cpu.outputPenaltyPerArea).toBeCloseTo(roundTrip / 2, 1);
    // Shared-device gpu-texture output composites in place — no transfer.
    expect(COST_MODEL_COEFFICIENTS.lane.webgpu.outputPenaltyPerArea).toBe(0);
  });

  it("geometry coefficients reproduce the measured vello gpu-vs-cpu path slopes", () => {
    const scenes = [...largeScene.gpuBrowser.scenes].sort((a, b) => a.paths - b.paths);
    const [small, large] = scenes;
    if (small === undefined || large === undefined) throw new Error("expected two gpu scenes");
    expect(small.canvas).toBe(large.canvas);
    const [width, height] = large.canvas.split("x").map((value) => Number(value));
    const megapixels = ((width ?? 0) * (height ?? 0)) / 1_000_000;
    const paths = large.paths - small.paths;
    const gpuPerPathPerMp = (large.gpuP50Ms - small.gpuP50Ms) / paths / megapixels;
    const cpuPerPathPerMp =
      (large.cpuInBrowserP50Ms - small.cpuInBrowserP50Ms) / paths / megapixels;
    // The harness draws fixed 24-point strokes, so a path carries 23 segments
    // and per-path / per-segment work cannot be separated by measurement; the
    // model splits the measured slope and must re-sum to it at that shape.
    const segmentsPerPath = largeScene.config.pointsPerStroke - 1;
    expect(segmentsPerPath).toBe(23);
    const modelled = (lane: CostLane): number =>
      COST_MODEL_COEFFICIENTS.lane[lane].perPath
      + COST_MODEL_COEFFICIENTS.lane[lane].perSegment * segmentsPerPath;
    expect(Math.abs(modelled("cpu") - cpuPerPathPerMp) / cpuPerPathPerMp).toBeLessThan(0.02);
    expect(Math.abs(modelled("webgpu") - gpuPerPathPerMp) / gpuPerPathPerMp).toBeLessThan(0.02);
    // The measured gpu advantage on vector geometry is ~37x, not the ~5x the
    // pre-calibration coefficients implied.
    expect(cpuPerPathPerMp / gpuPerPathPerMp).toBeGreaterThan(30);
    expect(modelled("cpu") / modelled("webgpu")).toBeGreaterThan(30);
  });

  it("more chain steps move the crossover to smaller islands, as measured", () => {
    // Measured thresholdByChain: single flips at 2048², triple already at 512².
    const single = filterLanes.crossover.thresholdByChain.find((e) => e.chain === "single");
    const triple = filterLanes.crossover.thresholdByChain.find((e) => e.chain === "triple");
    expect(single?.gpuWinsFromSize).toBeGreaterThan(triple?.gpuWinsFromSize ?? Number.NaN);
    const crossoverFor = (steps: number): number => {
      const fingerprint = filterFingerprint(1, steps);
      const value = laneCrossoverMegapixels(
        costOf("wasm", fingerprint),
        costOf("webgpu", fingerprint),
      );
      if (value === null) throw new Error("expected a crossover");
      return value;
    };
    expect(crossoverFor(3)).toBeLessThan(crossoverFor(1));
  });
});

/**
 * The behaviour the calibration exists for: a filter island has a real
 * crossover. Below it the cpu lane is cheaper because the gpu lane cannot
 * amortize its submit floor; above it the shared-device gpu lane wins because
 * every cpu pass is linear in pixels. The pre-calibration model had no such
 * point — webgpu was cheaper at every size, so every receipt it produced was
 * the same verdict and carried no information.
 */
describe("cost-model crossover — small islands favour cpu, large favour gpu", () => {
  const SINGLE_STEP = filterFingerprint(1, 1);
  const cpuAt1Mp = costOf("wasm", SINGLE_STEP);
  const gpuAt1Mp = costOf("webgpu", SINGLE_STEP);
  const webglAt1Mp = costOf("webgl", SINGLE_STEP);

  /**
   * 0.375 MP — a 612² device-pixel island — for a single-pass filter chain:
   * webgpu's 2.4 ms floor over the 6.4 ms/MP slope gap (cpu 6.55 ms/MP vs
   * webgpu 0.15 ms/MP). Lower than the product model's fitted 1.3 MP
   * single-step crossover on purpose: that lane reads its result back to a
   * canvas, while the shadow's webgpu lane is a shared-device island that
   * composites in place and pays no transfer. The webgl lane, which *does*
   * pay the measured readback, is the closer analogue and lands nearer the
   * product number (asserted below).
   */
  const DOCUMENTED_CROSSOVER_MP = 0.375;

  it("the documented single-pass crossover matches the analytic one", () => {
    const crossover = laneCrossoverMegapixels(cpuAt1Mp, gpuAt1Mp);
    expect(crossover).not.toBeNull();
    expect(crossover ?? 0).toBeCloseTo(DOCUMENTED_CROSSOVER_MP, 3);
    // At the crossover the two lanes cost the same, by construction.
    const at = filterFingerprint(crossover ?? 0, 1);
    expect(costOf("wasm", at).total).toBeCloseTo(costOf("webgpu", at).total, 10);
  });

  it("below the crossover the cpu lane is strictly cheaper", () => {
    const small = filterFingerprint(DOCUMENTED_CROSSOVER_MP / 2, 1);
    expect(costOf("wasm", small).total).toBeLessThan(costOf("webgpu", small).total);
    // A 256² island — the smallest cell the filter-lane benchmark measured,
    // where the measured cpu lane beat the gpu lane by ~5.6x.
    const tiny = filterFingerprint((256 * 256) / 1_000_000, 1);
    expect(costOf("wasm", tiny).total).toBeLessThan(costOf("webgpu", tiny).total);
  });

  it("above the crossover the shared-device gpu lane is strictly cheaper", () => {
    const large = filterFingerprint(DOCUMENTED_CROSSOVER_MP * 2, 1);
    expect(costOf("webgpu", large).total).toBeLessThan(costOf("wasm", large).total);
    // A 4096² island — the largest measured cell, where the gpu lane won by
    // an order of magnitude.
    const huge = filterFingerprint((4096 * 4096) / 1_000_000, 1);
    expect(costOf("webgpu", huge).total * 5).toBeLessThan(costOf("wasm", huge).total);
  });

  it("the winner flips exactly once along a size ladder (monotone, no flapping)", () => {
    const ladder = [256, 512, 1024, 2048, 4096].map((size) => (size * size) / 1_000_000);
    const winners = ladder.map((megapixels) => {
      const fingerprint = filterFingerprint(megapixels, 1);
      return costOf("wasm", fingerprint).total < costOf("webgpu", fingerprint).total
        ? "cpu"
        : "webgpu";
    });
    expect(winners[0]).toBe("cpu");
    expect(winners.at(-1)).toBe("webgpu");
    const flips = winners.filter((winner, index) => index > 0 && winner !== winners[index - 1]);
    expect(flips).toHaveLength(1);
  });

  it("the readback-paying webgl lane needs more area to pay off than webgpu", () => {
    const gpuCrossover = laneCrossoverMegapixels(cpuAt1Mp, gpuAt1Mp) ?? 0;
    const webglCrossover = laneCrossoverMegapixels(cpuAt1Mp, webglAt1Mp) ?? 0;
    expect(webglCrossover).toBeGreaterThan(gpuCrossover);
    // Bracket around the product model's fitted 1.3 MP single-step crossover
    // (2.4 fixed / (3.7 − 1.85) per MP) — same order, within ~2x.
    expect(webglCrossover).toBeGreaterThan(0.3);
    expect(webglCrossover).toBeLessThan(2);
  });

  it("laneCrossoverMegapixels reports null when the lanes never cross", () => {
    // Same lane on both sides: parallel lines, no crossover.
    expect(laneCrossoverMegapixels(cpuAt1Mp, cpuAt1Mp)).toBeNull();
    // A cpu lane that is both cheaper at zero AND flatter than another cpu
    // lane never yields a positive crossover.
    const lighter = estimateProviderCost(
      descriptor({ id: "light", runtime: "wasm", memoryEstimateMb: 1 }),
      SINGLE_STEP,
    );
    const heavier = estimateProviderCost(
      descriptor({ id: "heavy", runtime: "wasm", memoryEstimateMb: 512 }),
      SINGLE_STEP,
    );
    expect(laneCrossoverMegapixels(lighter, heavier)).toBeNull();
  });
});
