import { describe, expect, it } from "vitest";

import {
  computeProviderScore,
  evaluateLicenseGate,
  SCORE_WEIGHTS,
} from "../descriptor";
import { loadCandidateManifest, findCandidate } from "../manifest";
import {
  HybridExecutionPlanner,
  PlanUnsatisfiableError,
} from "../planner";
import { EngineCapabilityRegistry, ProviderRegistrationError } from "../registry";

import type { ProviderDescriptor } from "../descriptor";

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

describe("license hard gate (V11 §3.1)", () => {
  it("bundles permissive, isolates LGPL/CeCILL, rejects unknown", () => {
    expect(evaluateLicenseGate("MIT").mode).toBe("bundle");
    expect(evaluateLicenseGate("LGPL-2.1-or-later").mode).toBe("isolated");
    expect(evaluateLicenseGate("CeCILL-2.1").mode).toBe("isolated");
    expect(evaluateLicenseGate("GPL-3.0-only").mode).toBe("rejected");
  });

  it("registry refuses providers that fail the gate before scoring", () => {
    const registry = new EngineCapabilityRegistry();
    expect(() =>
      registry.register(descriptor({ id: "gpl-thing", license: "GPL-3.0-only" })),
    ).toThrow(ProviderRegistrationError);
    expect(registry.list()).toHaveLength(0);
  });
});

describe("score weights (V11 §3.2)", () => {
  it("weights total exactly 100", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("computes weighted scores and rejects out-of-range axes", () => {
    const perfect = computeProviderScore({
      visualQuality: 1,
      inputLatency: 1,
      interactiveThroughput: 1,
      largeDocumentThroughput: 1,
      memoryResidency: 1,
      correctnessDeterminism: 1,
      extensibility: 1,
      maturityMaintenance: 1,
    });
    expect(perfect).toBe(100);
    expect(() =>
      computeProviderScore({
        visualQuality: 1.2,
        inputLatency: 0,
        interactiveThroughput: 0,
        largeDocumentThroughput: 0,
        memoryResidency: 0,
        correctnessDeterminism: 0,
        extensibility: 0,
        maturityMaintenance: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("EngineCapabilityRegistry", () => {
  it("queries by kind + capabilities and resolves fallback chains", () => {
    const registry = new EngineCapabilityRegistry();
    registry.register(
      descriptor({
        id: "canvaskit",
        capabilities: ["render.vector.fill", "render.text.paragraph"],
        fallbackProviderId: null,
      }),
    );
    registry.register(
      descriptor({
        id: "vello-cpu",
        capabilities: ["render.vector.fill", "export.deterministic"],
        fallbackProviderId: "canvaskit",
      }),
    );

    const textCapable = registry.query("vector-renderer", ["render.text.paragraph"]);
    expect(textCapable.map((p) => p.descriptor.id)).toEqual(["canvaskit"]);
    expect(registry.fallbackChain("vello-cpu")).toEqual(["vello-cpu", "canvaskit"]);
  });

  it("rejects duplicate registration", () => {
    const registry = new EngineCapabilityRegistry();
    registry.register(descriptor({ id: "dup" }));
    expect(() => registry.register(descriptor({ id: "dup" }))).toThrow(
      ProviderRegistrationError,
    );
  });
});

describe("HybridExecutionPlanner", () => {
  function registryWithRenderers(): EngineCapabilityRegistry {
    const registry = new EngineCapabilityRegistry();
    registry.register(
      descriptor({
        id: "canvaskit",
        capabilities: [
          "render.vector.fill",
          "render.vector.stroke",
          "render.text.paragraph",
          "surface.primary",
        ],
      }),
    );
    registry.register(
      descriptor({
        id: "vello-cpu",
        capabilities: ["render.vector.fill", "render.vector.stroke", "export.deterministic"],
        fallbackProviderId: "canvaskit",
      }),
    );
    return registry;
  }

  it("routes text islands to the capable provider (capability routing)", () => {
    const planner = new HybridExecutionPlanner(registryWithRenderers());
    const plan = planner.plan({
      surfaceId: "main",
      mode: "interactive",
      primaryCandidates: ["canvaskit"],
      islands: [
        {
          islandId: "balloon-text",
          kind: "vector-renderer",
          requiredCapabilities: ["render.text.paragraph"],
          availableTransports: ["image-bitmap"],
        },
        {
          islandId: "lineart",
          kind: "vector-renderer",
          requiredCapabilities: ["render.vector.stroke"],
          availableTransports: ["image-bitmap", "shared-array-buffer-tile"],
        },
      ],
    });
    expect(plan.primaryOwnerId).toBe("canvaskit");
    const balloon = plan.islands.find((i) => i.islandId === "balloon-text");
    expect(balloon?.providerId).toBe("canvaskit");
    const lineart = plan.islands.find((i) => i.islandId === "lineart");
    expect(lineart?.transport).toBe("image-bitmap");
  });

  it("forbids cpu-readback transports on the interactive hot path (rule 8)", () => {
    const planner = new HybridExecutionPlanner(registryWithRenderers());
    const request = {
      surfaceId: "main",
      mode: "interactive" as const,
      primaryCandidates: ["canvaskit"],
      islands: [
        {
          islandId: "bad-island",
          kind: "vector-renderer" as const,
          requiredCapabilities: ["render.vector.fill" as const],
          availableTransports: ["cpu-readback" as const],
        },
      ],
    };
    expect(() => planner.plan(request)).toThrow(PlanUnsatisfiableError);
    // The same island is plannable for final export where readback is legal.
    const finalPlan = planner.plan({ ...request, mode: "final-export" });
    expect(finalPlan.islands[0]?.transport).toBe("cpu-readback");
  });
});

describe("candidate manifest (E01–E28)", () => {
  it("parses all 28 matrix rows with licenses and sources", () => {
    const manifest = loadCandidateManifest();
    expect(manifest.entries).toHaveLength(28);
    expect(findCandidate("E04")?.key).toBe("vello-cpu");
    expect(findCandidate("hokusai")?.id).toBe("E12");
    expect(findCandidate("nonexistent")).toBeNull();
  });
});
