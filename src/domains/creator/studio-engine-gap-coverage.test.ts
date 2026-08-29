/**
 * ADR 0017 governance: every V13 feature the Vello lanes cannot own must keep a NAMED alternative
 * engine in the shipped universe, and the next-gen challenger (Skia Graphite) must keep its
 * declared demotion chain — "모험 적용, 불안정하면 Skia로 교체" is a descriptor-level contract,
 * not a manual swap. Losing any of these fails the build here, loudly.
 */
import { validateVelloCapabilityGapCoverage } from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";

import { STUDIO_KNOWN_ENGINE_DESCRIPTORS } from "./studio-asset-metadata-registry";

const byId = new Map(
  STUDIO_KNOWN_ENGINE_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor])
);

describe("Vello capability-gap alternative-engine coverage", () => {
  it("every Vello gap feature has its named alternative engines in the shipped universe", () => {
    // Validated against the SHIPPED descriptors' own declared capabilities, not against a
    // constant in the registry package: registry queries and activation evidence read
    // descriptor.capabilities, so that is where the completion claim has to hold.
    expect(
      validateVelloCapabilityGapCoverage(STUDIO_KNOWN_ENGINE_DESCRIPTORS)
    ).toEqual([]);
  });

  it("the completion lane declares every gap by the exact token the registry queries", () => {
    // EngineCapabilityRegistry.query matches capabilities.includes(capability) with no wildcard,
    // so an island-completion claim alone would leave this lane unselectable for the gaps it is
    // named to complete.
    const completion = byId.get("skia-canvaskit-gpu");
    const challenger = byId.get("skia-graphite-webgpu");
    for (const feature of [
      "render.text.paragraph",
      "render.mask",
      "render.filter.image",
      "render.blend.backdrop",
      "render.path-effect",
    ]) {
      expect(completion?.capabilities, feature).toContain(feature);
      // The challenger is held to the same standard: a lane that cannot be selected for a gap
      // cannot challenge on it, however it is ranked.
      expect(challenger?.capabilities, feature).toContain(feature);
    }
  });

  it("the Graphite challenger demotes down its declared chain to the production baseline", () => {
    const challenger = byId.get("skia-graphite-webgpu");
    const completion = byId.get("skia-canvaskit-gpu");
    const terminal = byId.get("skia-canvaskit");

    // 모험은 챌린저 신분으로만: 토너먼트 게이트를 통과하기 전까지 experimental이다.
    expect(challenger?.maturity).toBe("experimental");
    expect(challenger?.fallbackProviderId).toBe("skia-canvaskit-gpu");
    expect(completion?.fallbackProviderId).toBe("skia-canvaskit");
    expect(terminal?.maturity).toBe("production-baseline");
  });
});
