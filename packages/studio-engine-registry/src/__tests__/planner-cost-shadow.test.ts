import { describe, expect, it } from "vitest";

import { HybridExecutionPlanner, PlanUnsatisfiableError } from "../planner";
import {
  COST_MODEL_COEFFICIENTS,
  costLaneForRuntime,
  estimateProviderCost,
  isUsableCostShadowFingerprint,
  planWithCostShadow,
} from "../planner-cost-shadow";
import { EngineCapabilityRegistry } from "../registry";
import { emptyWorkloadFingerprint } from "../workload-fingerprint";

import type { ProviderDescriptor } from "../descriptor";
import type {
  CostShadowFingerprint,
  CostShadowPlanRequest,
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
    fallbackProviderId: null,
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
    primaryCandidates: ["surface-owner"],
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
      primaryCandidates: ["surface-owner"],
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
      primaryCandidates: ["surface-owner"],
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
    }
  });
});

describe("planWithCostShadow — targeted disagreements (promotion evidence)", () => {
  it("tiny low-coverage island: legacy insists on webgpu, cost prefers cpu", () => {
    // A 4%-viewport sticker with 2 paths cannot amortize WebGPU pipeline
    // setup (base 10 vs cpu base 4) and its pixels-readback penalty is
    // negligible at that area (8 x 0.04). The cost winner is better because
    // the accelerator-rank heuristic pays fixed GPU overhead for almost no
    // scalable work.
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
      primaryCandidates: ["surface-owner"],
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
