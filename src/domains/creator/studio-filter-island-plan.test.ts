import { readFileSync } from "node:fs";

import { PlanUnsatisfiableError } from "@toonspectrum/studio-engine-registry";
import { afterEach, describe, expect, it } from "vitest";


import {
  installStudioFilterTournamentBootstrap,
  planStudioFilterIslandLanes,
  studioFilterIslandBucket,
  studioFilterLaneProviderId,
} from "./studio-filter-island-plan";
import { STUDIO_FILTER_LANE_COST_SEED } from "./studio-filter-lane-cost-model";
import {
  createStudioTournamentRuntime,
  installStudioTournamentRuntime,
  peekStudioTournamentRuntime,
} from "./studio-renderer-tournament-runtime";

/**
 * First real-path V11 delegation gate (ADR 0001 2차 개정 step c): the image
 * filter lane ladder is planner-owned and must match the shipped GPU→Worker→
 * Konva semantics exactly, and the island must stay illegal in interactive
 * mode (absolute rule 8) so nobody quietly moves it onto the hot path.
 */

describe("V11 filter island plan", () => {
  it("orders lanes GPU→worker→konva when the GPU chain is eligible", () => {
    const { lanes, plan } = planStudioFilterIslandLanes({ gpuChainEligible: true });
    expect(lanes).toEqual(["gpu-chain", "worker", "konva-native"]);
    expect(plan.mode).toBe("final-export");
    expect(plan.primaryOwnerId).toBe("filter-lane-konva-native");
    expect(plan.islands[0]?.transport).toBe("cpu-readback");
  });

  it("skips the GPU lane when ineligible (worker→konva)", () => {
    const { lanes } = planStudioFilterIslandLanes({ gpuChainEligible: false });
    expect(lanes).toEqual(["worker", "konva-native"]);
  });

  it("the same island is rejected in interactive mode (hot-path readback ban)", async () => {
    const { EngineCapabilityRegistry, HybridExecutionPlanner, providerDescriptorSchema } =
      await import("@toonspectrum/studio-engine-registry");
    const registry = new EngineCapabilityRegistry();
    registry.register(
      providerDescriptorSchema.parse({
        id: "filter-lane-probe",
        kind: "filter",
        displayName: "probe",
        version: "1",
        license: "internal",
        attribution: "",
        maturity: "production-baseline",
        runtime: "js",
        capabilities: ["filter.lane.worker"],
        limitations: [],
        previewQuality: "production",
        finalQuality: "production",
        determinism: "tolerance",
        memoryEstimateMb: 1,
        fallbackProviderId: null,
        knownIssues: [],
      }),
    );
    const planner = new HybridExecutionPlanner(registry);
    expect(() =>
      planner.plan({
        surfaceId: "probe",
        mode: "interactive",
        primaryCandidates: ["filter-lane-probe"],
        islands: [
          {
            islandId: "image-filter-chain",
            kind: "filter",
            requiredCapabilities: ["filter.lane.worker"],
            availableTransports: ["cpu-readback"],
          },
        ],
      }),
    ).toThrow(PlanUnsatisfiableError);
  });

  it("StudioKonvaImageNode consumes the plan for its lane decision (wiring contract)", () => {
    const source = readFileSync(
      new URL("./StudioKonvaImageNode.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(
      /import \{ planStudioFilterIslandLanes \} from "\.\/studio-filter-island-plan";/u,
    );
    expect(source).toMatch(
      /const filterIslandPlan = planStudioFilterIslandLanes\(\{\s*gpuChainEligible:/u,
    );
    expect(source).toMatch(
      /filterIslandPlan\.lanes\[0\] === "gpu-chain" && gpuFilterModule/u,
    );
    // Size-aware selection only works if the node hands over its real
    // workload — the plan silently keeps the legacy order without it.
    expect(source).toMatch(
      /workload: \{ width, height, chainSteps: filterChainSteps \}/u,
    );
    expect(source).toMatch(/const filterChainSteps = built\.filters\.length;/u);
    // The legacy direct branch on eligibility alone must not come back.
    expect(source).not.toMatch(
      /if \(gpuFilterModule\?\.isStudioGpuFilterChainEligible\(elRef\.current\)\) \{/u,
    );
  });
});

/**
 * V12 §5 wiring: the tournament runtime (persisted winner cache + remote kill
 * switch) acts on this plan's real call path. The first case pins the
 * backwards contract — a pristine runtime changes nothing about the ladder.
 */
describe("V12 §5 tournament wiring through the filter island plan", () => {
  afterEach(() => {
    // Restore lazy default creation so other suites see a pristine runtime.
    installStudioTournamentRuntime(null);
  });

  it("a pristine runtime (empty cache, no kills) leaves the plan untouched", () => {
    installStudioTournamentRuntime(
      createStudioTournamentRuntime({ persistence: null, deviceHash: "dev-test" }),
    );
    const eligible = planStudioFilterIslandLanes({ gpuChainEligible: true });
    expect(eligible.lanes).toEqual(["gpu-chain", "worker", "konva-native"]);
    expect(eligible.killIgnoredReason).toBeNull();
    expect(planStudioFilterIslandLanes({ gpuChainEligible: false }).lanes).toEqual([
      "worker",
      "konva-native",
    ]);
  });

  it("a cached tournament winner reorders the real lane ladder per bucket", () => {
    const runtime = createStudioTournamentRuntime({
      persistence: null,
      deviceHash: "dev-test",
    });
    runtime.recordWinner(
      studioFilterIslandBucket({ gpuChainEligible: true }),
      runtime.deviceHash,
      {
        providerId: studioFilterLaneProviderId("worker"),
        expectedWarmMs: 3,
        decidedAtSample: 5,
      },
    );
    installStudioTournamentRuntime(runtime);
    expect(planStudioFilterIslandLanes({ gpuChainEligible: true }).lanes).toEqual([
      "worker",
      "gpu-chain",
      "konva-native",
    ]);
    // Bucket separation: the win above lives in the gpu-eligible bucket only,
    // so the ineligible ladder stays the untouched planner product.
    expect(planStudioFilterIslandLanes({ gpuChainEligible: false }).lanes).toEqual([
      "worker",
      "konva-native",
    ]);
  });

  it("a remote kill removes its lane while the fallback chain survives", () => {
    const runtime = createStudioTournamentRuntime({
      persistence: null,
      deviceHash: "dev-test",
    });
    runtime.applyKillList([studioFilterLaneProviderId("gpu-chain")], "remote flag");
    installStudioTournamentRuntime(runtime);
    const { lanes, killIgnoredReason } = planStudioFilterIslandLanes({
      gpuChainEligible: true,
    });
    expect(lanes).toEqual(["worker", "konva-native"]);
    expect(killIgnoredReason).toBeNull();
  });

  it("a workload-less call is byte-identical to the pre-size-aware ladder", () => {
    installStudioTournamentRuntime(
      createStudioTournamentRuntime({ persistence: null, deviceHash: "dev-test" }),
    );
    // A caller that cannot describe its workload must never be re-ordered on
    // a guess: no workload ⇒ no cost ranking ⇒ the original planner ladder.
    const blind = planStudioFilterIslandLanes({ gpuChainEligible: true });
    expect(blind.lanes).toEqual(["gpu-chain", "worker", "konva-native"]);
    expect(blind.laneCosts).toBeNull();
    expect(planStudioFilterIslandLanes({ gpuChainEligible: true, workload: null }).lanes)
      .toEqual(["gpu-chain", "worker", "konva-native"]);
  });

  it("killing every lane is ignored — the chain never goes empty and the reason is logged", () => {
    const runtime = createStudioTournamentRuntime({
      persistence: null,
      deviceHash: "dev-test",
    });
    runtime.applyKillList(
      (["gpu-chain", "worker", "konva-native"] as const).map((lane) =>
        studioFilterLaneProviderId(lane),
      ),
      "panic",
    );
    installStudioTournamentRuntime(runtime);
    const { lanes, killIgnoredReason } = planStudioFilterIslandLanes({
      gpuChainEligible: true,
    });
    expect(lanes).toEqual(["gpu-chain", "worker", "konva-native"]);
    expect(killIgnoredReason).toContain("keeping the original order");
    expect(killIgnoredReason).toContain("panic");
  });
});

/**
 * Size-aware lane order. The GPU lane pays a submit+readback floor that barely
 * moves with the workload, so below the crossover it loses to the CPU lanes it
 * was meant to accelerate (tests/benchmarks/results/filter-lanes.json). These
 * cases pin the boundary itself, the untouched GPU-ineligible ladder, and the
 * seed → measured → tournament-winner precedence.
 */
describe("size-aware filter lane order", () => {
  const PRISTINE = { persistence: null, deviceHash: "dev-test" } as const;

  afterEach(() => {
    installStudioTournamentRuntime(null);
  });

  /** Pixel count where the seed model puts the GPU and CPU lanes at equal cost. */
  function crossoverPixels(chainSteps: number, gpuDispatchCount: number): number {
    const { gpu, cpu } = STUDIO_FILTER_LANE_COST_SEED;
    const cpuPerMp = cpu.perMegapixelMsPerStep * chainSteps;
    const gpuPerMp = gpu.perMegapixelMs + gpu.perMegapixelMsPerDispatch * gpuDispatchCount;
    return (gpu.fixedMs / (cpuPerMp - gpuPerMp)) * 1e6;
  }

  // chainSteps → GPU dispatches after LUT fusion, as measured by the benchmark.
  const CHAINS: Array<{ label: string; chainSteps: number; dispatches: number }> = [
    { label: "single", chainSteps: 1, dispatches: 1 },
    { label: "triple", chainSteps: 3, dispatches: 2 },
    { label: "full5", chainSteps: 6, dispatches: 4 },
  ];

  for (const chain of CHAINS) {
    it(`${chain.label}: one pixel below the crossover puts a CPU lane at the head`, () => {
      installStudioTournamentRuntime(createStudioTournamentRuntime(PRISTINE));
      const pixelCount = Math.floor(crossoverPixels(chain.chainSteps, chain.dispatches)) - 1;
      const { lanes, laneCosts } = planStudioFilterIslandLanes({
        gpuChainEligible: true,
        workload: { pixelCount, chainSteps: chain.chainSteps },
      });
      expect(lanes).toEqual(["worker", "konva-native", "gpu-chain"]);
      expect(laneCosts?.basis).toBe("seed");
    });

    it(`${chain.label}: one pixel above the crossover keeps the GPU lane at the head`, () => {
      installStudioTournamentRuntime(createStudioTournamentRuntime(PRISTINE));
      const pixelCount = Math.ceil(crossoverPixels(chain.chainSteps, chain.dispatches)) + 1;
      const { lanes } = planStudioFilterIslandLanes({
        gpuChainEligible: true,
        workload: { pixelCount, chainSteps: chain.chainSteps },
      });
      expect(lanes).toEqual(["gpu-chain", "worker", "konva-native"]);
    });
  }

  it("accepts width/height as well as a pixel count", () => {
    installStudioTournamentRuntime(createStudioTournamentRuntime(PRISTINE));
    // 256² single-step: the small-canvas case the old boolean got wrong.
    expect(
      planStudioFilterIslandLanes({
        gpuChainEligible: true,
        workload: { width: 256, height: 256, chainSteps: 1 },
      }).lanes[0],
    ).toBe("worker");
    // 4096² five-step: the large-canvas case that must not regress.
    expect(
      planStudioFilterIslandLanes({
        gpuChainEligible: true,
        workload: { width: 4096, height: 4096, chainSteps: 6 },
      }).lanes,
    ).toEqual(["gpu-chain", "worker", "konva-native"]);
  });

  it("leaves a GPU-ineligible ladder exactly as the planner produced it", () => {
    installStudioTournamentRuntime(createStudioTournamentRuntime(PRISTINE));
    for (const workload of [
      { width: 64, height: 64, chainSteps: 1 },
      { width: 4096, height: 4096, chainSteps: 6 },
      { pixelCount: 0, chainSteps: 3 },
    ]) {
      const { lanes, laneCosts } = planStudioFilterIslandLanes({
        gpuChainEligible: false,
        workload,
      });
      expect(lanes).toEqual(["worker", "konva-native"]);
      expect(laneCosts).toBeNull();
    }
  });

  it("ignores a degenerate workload instead of guessing (falls back to size-blind)", () => {
    installStudioTournamentRuntime(createStudioTournamentRuntime(PRISTINE));
    for (const workload of [
      { pixelCount: 0, chainSteps: 1 },
      { pixelCount: Number.NaN, chainSteps: 1 },
      { width: 256, height: 0, chainSteps: 1 },
    ]) {
      const { lanes, laneCosts } = planStudioFilterIslandLanes({
        gpuChainEligible: true,
        workload,
      });
      expect(lanes).toEqual(["gpu-chain", "worker", "konva-native"]);
      expect(laneCosts).toBeNull();
    }
  });

  it("prefers this device's measured samples over the benchmark seed", () => {
    const runtime = createStudioTournamentRuntime(PRISTINE);
    const input = {
      gpuChainEligible: true,
      workload: { width: 256, height: 256, chainSteps: 1 },
    };
    // Seed alone would demote the GPU lane at 256²; a device whose GPU floor is
    // actually cheap must win that argument with its own measurements.
    for (let i = 0; i < 4; i += 1) {
      runtime.recordRenderSample(
        studioFilterLaneProviderId("gpu-chain"),
        studioFilterIslandBucket(input),
        0.05,
      );
      runtime.recordRenderSample(
        studioFilterLaneProviderId("worker"),
        studioFilterIslandBucket(input),
        0.9,
      );
    }
    installStudioTournamentRuntime(runtime);
    const { lanes, laneCosts } = planStudioFilterIslandLanes(input);
    expect(lanes[0]).toBe("gpu-chain");
    expect(laneCosts?.basis).toBe("mixed");
    expect(laneCosts?.entries[0]).toMatchObject({
      lane: "gpu-chain",
      basis: "measured",
      costMs: 0.05,
    });
  });

  it("the tournament winner still has the last word over the cost model", () => {
    const runtime = createStudioTournamentRuntime(PRISTINE);
    const input = {
      gpuChainEligible: true,
      workload: { width: 4096, height: 4096, chainSteps: 6 },
    };
    // Cost model ranks GPU first here; a persisted winner outranks it.
    runtime.recordWinner(studioFilterIslandBucket(input), runtime.deviceHash, {
      providerId: studioFilterLaneProviderId("konva-native"),
      expectedWarmMs: 4,
      decidedAtSample: 9,
    });
    installStudioTournamentRuntime(runtime);
    const { lanes, laneCosts } = planStudioFilterIslandLanes(input);
    expect(laneCosts?.lanes[0]).toBe("gpu-chain");
    expect(lanes).toEqual(["konva-native", "gpu-chain", "worker"]);
  });

  it("a remote kill still outranks everything, including a cheap cost verdict", () => {
    const runtime = createStudioTournamentRuntime(PRISTINE);
    runtime.applyKillList([studioFilterLaneProviderId("worker")], "remote flag");
    installStudioTournamentRuntime(runtime);
    const { lanes } = planStudioFilterIslandLanes({
      gpuChainEligible: true,
      workload: { width: 256, height: 256, chainSteps: 1 },
    });
    expect(lanes).toEqual(["konva-native", "gpu-chain"]);
  });
});

describe("filter island bucket key", () => {
  it("is deterministic for the same input", () => {
    const input = {
      gpuChainEligible: true,
      workload: { width: 1024, height: 1024, chainSteps: 3 },
    };
    expect(studioFilterIslandBucket(input)).toBe(studioFilterIslandBucket(input));
    expect(studioFilterIslandBucket(input)).toBe(
      studioFilterIslandBucket({
        gpuChainEligible: true,
        workload: { pixelCount: 1024 * 1024, chainSteps: 3 },
      }),
    );
  });

  it("separates eligibility, size class and chain-length class", () => {
    const keys = new Set(
      [
        { gpuChainEligible: true, workload: { width: 256, height: 256, chainSteps: 1 } },
        { gpuChainEligible: true, workload: { width: 4096, height: 4096, chainSteps: 1 } },
        { gpuChainEligible: true, workload: { width: 256, height: 256, chainSteps: 6 } },
        { gpuChainEligible: false, workload: { width: 256, height: 256, chainSteps: 1 } },
        { gpuChainEligible: true },
      ].map((input) => studioFilterIslandBucket(input)),
    );
    // Five materially different workloads must never pool their measurements.
    expect(keys.size).toBe(5);
  });

  it("pools power-of-two-adjacent sizes and marks unknown workloads apart", () => {
    // 1024² and 1100² sit in the same quantized class — samples pool there.
    expect(
      studioFilterIslandBucket({
        gpuChainEligible: true,
        workload: { width: 1024, height: 1024, chainSteps: 3 },
      }),
    ).toBe(
      studioFilterIslandBucket({
        gpuChainEligible: true,
        workload: { width: 1100, height: 1100, chainSteps: 3 },
      }),
    );
    expect(studioFilterIslandBucket({ gpuChainEligible: true })).toContain("pu|su");
    expect(
      studioFilterIslandBucket({
        gpuChainEligible: true,
        workload: { pixelCount: Number.NaN, chainSteps: 2 },
      }),
    ).toContain("pu|su");
  });
});

/**
 * Interactive-path budget (docs/perf/heavy-feature-findings.md §4-4).
 *
 * Planning used to install the SQLite/OPFS tournament persistence adapter and
 * hydrate the shared runtime synchronously, so opening the filter dialog
 * pulled `@sqlite.org/sqlite-wasm` — 928 KB of the 1.03 MB transferred, for
 * telemetry the filter feature never reads. Planning must now be a pure,
 * synchronous read of in-memory state, with persistence deferred to idle.
 */
describe("filter island planning never touches persistence (wasm budget)", () => {
  afterEach(() => {
    installStudioFilterTournamentBootstrap(null);
    installStudioTournamentRuntime(null);
  });

  function spyBootstrap(): {
    tasks: Array<() => void>;
    loads: number;
    installs: number;
  } {
    const state = { tasks: [] as Array<() => void>, loads: 0, installs: 0 };
    installStudioFilterTournamentBootstrap({
      schedule: (task) => {
        state.tasks.push(task);
      },
      loadPersistence: () => {
        state.loads += 1;
        return Promise.resolve({
          installStudioTournamentSqlitePersistence: () => {
            state.installs += 1;
          },
        });
      },
    });
    return state;
  }

  it("does not load the persistence adapter while producing a plan", () => {
    const bootstrap = spyBootstrap();
    installStudioTournamentRuntime(
      createStudioTournamentRuntime({ persistence: null, deviceHash: "dev-test" }),
    );
    for (let i = 0; i < 5; i += 1) {
      planStudioFilterIslandLanes({
        gpuChainEligible: true,
        workload: { width: 512, height: 512, chainSteps: 3 },
      });
    }
    // The loader is only ever reached from the deferred task.
    expect(bootstrap.loads).toBe(0);
    expect(bootstrap.installs).toBe(0);
    // …and the idle task is armed exactly once, however many plans ran.
    expect(bootstrap.tasks).toHaveLength(1);
  });

  it("loads persistence only once the deferred idle task runs", async () => {
    const bootstrap = spyBootstrap();
    installStudioTournamentRuntime(
      createStudioTournamentRuntime({ persistence: null, deviceHash: "dev-test" }),
    );
    planStudioFilterIslandLanes({ gpuChainEligible: true });
    expect(bootstrap.loads).toBe(0);
    bootstrap.tasks[0]?.();
    await Promise.resolve();
    expect(bootstrap.loads).toBe(1);
    expect(bootstrap.installs).toBe(1);
  });

  it("plans correctly against an unbooted tournament (no runtime construction)", () => {
    spyBootstrap();
    installStudioTournamentRuntime(null);
    const { lanes, killIgnoredReason, laneCosts } = planStudioFilterIslandLanes({
      gpuChainEligible: true,
      workload: { width: 4096, height: 4096, chainSteps: 6 },
    });
    // No winners and nothing killed ⇒ the ladder is the planner/cost product…
    expect(lanes).toEqual(["gpu-chain", "worker", "konva-native"]);
    expect(killIgnoredReason).toBeNull();
    expect(laneCosts?.basis).toBe("seed");
    // …and planning did not construct the shared runtime behind our back.
    expect(peekStudioTournamentRuntime()).toBeNull();
  });

  it("keeps the sqlite persistence module out of the plan module's static graph", () => {
    const source = readFileSync(
      new URL("./studio-filter-island-plan.ts", import.meta.url),
      "utf8",
    );
    // A static import would put the 865 KB wasm glue in the filter chunk even
    // if the call itself were deferred.
    expect(source).not.toMatch(/^import .*studio-tournament-sqlite-persistence/mu);
    expect(source).toMatch(/import\("\.\/studio-tournament-sqlite-persistence"\)/u);
  });
});
