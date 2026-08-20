import {
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
} from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";

import { INK_MESH_COMMIT } from "../ink-mesh";
import {
  googleInkMeshProviderDescriptor,
  hokusaiProviderDescriptor,
  perfectFreehandProviderDescriptor,
  registerBrushPlatformProviders,
} from "../providers";

describe("google-ink-mesh provider descriptor", () => {
  it("declares the vector-mesh stroke-geometry lane with production wasm identity", () => {
    expect(googleInkMeshProviderDescriptor.id).toBe("google-ink-mesh");
    expect(googleInkMeshProviderDescriptor.kind).toBe("stroke-geometry");
    expect(googleInkMeshProviderDescriptor.runtime).toBe("wasm");
    expect(googleInkMeshProviderDescriptor.maturity).toBe("production-baseline");
    expect(googleInkMeshProviderDescriptor.determinism).toBe("bit-exact");
    expect(googleInkMeshProviderDescriptor.previewQuality).toBe("production");
    expect(googleInkMeshProviderDescriptor.finalQuality).toBe("production");
    expect(googleInkMeshProviderDescriptor.capabilities).toEqual([
      "stroke.geometry.ink-mesh",
      "stroke.geometry.incremental-mesh-delta",
      "stroke.geometry.editable-path",
      "stroke.geometry.deterministic",
    ]);
    // The outline lane token stays exclusive to perfect-freehand: a mesh
    // provider must never be routable as a pressure-outline substitute.
    expect(googleInkMeshProviderDescriptor.capabilities).not.toContain(
      "stroke.geometry.pressure-outline",
    );
  });

  it("pins the same upstream commit as the committed ink WASM artifact", () => {
    // providers.ts stays descriptor-pure (no ./ink-mesh import), so the pin is
    // duplicated there; this assertion is the anti-drift gate.
    expect(googleInkMeshProviderDescriptor.commit).toBe(INK_MESH_COMMIT);
  });

  it("fails closed: no fallback provider and a single-entry fallback chain", () => {
    // Mirrors the hokusai V17.1 policy: no geometry-equivalence certification
    // exists for a perfect-freehand rendition of ink mesh output, so a host
    // without the ink WASM module hides the brush instead of substituting.
    expect(googleInkMeshProviderDescriptor.fallbackProviderId).toBeNull();
    const registry = new EngineCapabilityRegistry();
    registerBrushPlatformProviders(registry);
    expect(registry.fallbackChain("google-ink-mesh")).toEqual([
      "google-ink-mesh",
    ]);
  });
});

describe("registerBrushPlatformProviders", () => {
  it("registers the outline, vector-mesh and natural-media lanes", () => {
    const registry = new EngineCapabilityRegistry();
    registerBrushPlatformProviders(registry);
    expect(registry.get("perfect-freehand")?.descriptor).toEqual(
      perfectFreehandProviderDescriptor,
    );
    expect(registry.get("google-ink-mesh")?.descriptor).toEqual(
      googleInkMeshProviderDescriptor,
    );
    expect(registry.get("hokusai-natural-media")?.descriptor).toEqual(
      hokusaiProviderDescriptor,
    );
  });

  it("routes mesh islands to google-ink-mesh without disturbing outline routing", () => {
    const registry = new EngineCapabilityRegistry();
    registerBrushPlatformProviders(registry);
    const planner = new HybridExecutionPlanner(registry);
    const plan = planner.plan({
      surfaceId: "studio-main",
      mode: "interactive",
      primaryCandidates: ["hokusai-natural-media"],
      islands: [
        {
          islandId: "inking",
          kind: "stroke-geometry",
          requiredCapabilities: ["stroke.geometry.pressure-outline"],
          availableTransports: ["shared-array-buffer-tile"],
        },
        {
          islandId: "mesh-inking",
          kind: "stroke-geometry",
          requiredCapabilities: [
            "stroke.geometry.ink-mesh",
            "stroke.geometry.incremental-mesh-delta",
          ],
          availableTransports: ["shared-array-buffer-tile"],
        },
      ],
    });
    expect(plan.islands.map((island) => island.providerId)).toEqual([
      "perfect-freehand",
      "google-ink-mesh",
    ]);
    expect(
      plan.islands.find((island) => island.islandId === "mesh-inking")
        ?.fallbackChain,
    ).toEqual(["google-ink-mesh"]);
  });
});
