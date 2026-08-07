import { readFileSync } from "node:fs";

import { PlanUnsatisfiableError } from "@toonspectrum/studio-engine-registry";
import { afterEach, describe, expect, it } from "vitest";


import {
  planStudioFilterIslandLanes,
  studioFilterIslandBucket,
  studioFilterLaneProviderId,
} from "./studio-filter-island-plan";
import {
  createStudioTournamentRuntime,
  installStudioTournamentRuntime,
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
