import { afterEach, describe, expect, it } from "vitest";

import {
  clearSkiaGraphiteArtifact,
  probeSkiaGraphiteAdoption,
  registerSkiaGraphiteArtifact,
  SKIA_GRAPHITE_PROVIDER_ID,
} from "../graphite-probe";

afterEach(() => {
  clearSkiaGraphiteArtifact();
});

describe("probeSkiaGraphiteAdoption", () => {
  it("refuses without WebGPU, naming the precondition", () => {
    const probe = probeSkiaGraphiteAdoption({ gpu: undefined });
    expect(probe.status).toBe("no-webgpu");
    if (probe.status === "no-webgpu") {
      expect(probe.reason).toContain("navigator.gpu");
    }
  });

  it("refuses without a registered Graphite build and names the upstream gap honestly", () => {
    const probe = probeSkiaGraphiteAdoption({ gpu: {} });
    expect(probe.status).toBe("missing-artifact");
    if (probe.status === "missing-artifact") {
      expect(probe.reason).toContain("Ganesh");
    }
  });

  it("flips to adoptable the moment an artifact is registered, and back after clearing", () => {
    const artifact = {
      loadCanvasKit: async () => ({}),
      sourcePin: { version: "m0.0.0-test", commit: "0".repeat(40) },
    };
    registerSkiaGraphiteArtifact(artifact);

    const probe = probeSkiaGraphiteAdoption({ gpu: {} });
    expect(probe.status).toBe("adoptable");
    if (probe.status === "adoptable") {
      expect(probe.artifact).toBe(artifact);
    }

    clearSkiaGraphiteArtifact();
    expect(probeSkiaGraphiteAdoption({ gpu: {} }).status).toBe("missing-artifact");
  });

  it("pins the challenger provider id the tournament and fallback chain use", () => {
    expect(SKIA_GRAPHITE_PROVIDER_ID).toBe("skia-graphite-webgpu");
  });
});
