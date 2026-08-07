import { readFileSync } from "node:fs";

import { PlanUnsatisfiableError } from "@toonspectrum/provider-catalog-v11";
import { describe, expect, it } from "vitest";


import { planStudioFilterIslandLanes } from "./studio-v11-filter-island-plan";

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
      await import("@toonspectrum/provider-catalog-v11");
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
      /import \{ planStudioFilterIslandLanes \} from "\.\/studio-v11-filter-island-plan";/u,
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
