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
    expect(
      validateVelloCapabilityGapCoverage(new Set(byId.keys()))
    ).toEqual([]);
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
