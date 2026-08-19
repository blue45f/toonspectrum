import { hokusaiProviderDescriptor } from "@toonspectrum/studio-brush-platform";
import { describe, expect, it } from "vitest";

import { deriveStudioV11BackendDescriptors } from "./studio-engine-provider-bridge";

describe("studio-engine-provider-bridge — Hokusai fail-closed fallback agreement", () => {
  // Adversarial-review probe (Lens 2, minor): the wave removed the Hokusai
  // fallback in packages/studio-brush-platform/src/providers.ts (fail-closed,
  // device-incapable ⇒ hide natural-media brushes) but the V11 audit-derived
  // descriptor "hokusai-myb-worker" still documented fallbackProviderId
  // "canvas2d-causal-ink" — a natural-media → pen-family substitution the
  // engine's policy forbids. Both declarations must agree. This test fails on
  // the pre-fix bridge (fallbackProviderId was "canvas2d-causal-ink").
  it("derives hokusai-myb-worker with a null fallback (hide, not substitute)", () => {
    const descriptors = deriveStudioV11BackendDescriptors();
    const hokusai = descriptors.find(({ id }) => id === "hokusai-myb-worker");

    expect(hokusai).toBeDefined();
    expect(hokusai?.fallbackProviderId).toBeNull();
  });

  it("agrees with the platform bootstrap descriptor's fail-closed declaration", () => {
    const descriptors = deriveStudioV11BackendDescriptors();
    const bridged = descriptors.find(({ id }) => id === "hokusai-myb-worker");

    expect(hokusaiProviderDescriptor.fallbackProviderId).toBeNull();
    expect(bridged?.fallbackProviderId).toBe(
      hokusaiProviderDescriptor.fallbackProviderId,
    );
    // The policy rationale is documented on the platform descriptor: an
    // incapable device hides the brush rather than substituting texture.
    expect(
      hokusaiProviderDescriptor.limitations.some((limitation) =>
        limitation.includes("no fallback provider"),
      ),
    ).toBe(true);
  });

  it("keeps every declared fallback pointing at a derivable backend", () => {
    // The registry walks fallbackProviderId chains verbatim
    // (EngineCapabilityRegistry.fallbackChain), so a dangling id would strand
    // the chain. Guard the whole derived table, not just Hokusai.
    const descriptors = deriveStudioV11BackendDescriptors();
    const ids = new Set(descriptors.map(({ id }) => id));
    for (const descriptor of descriptors) {
      if (descriptor.fallbackProviderId !== null) {
        expect(ids.has(descriptor.fallbackProviderId)).toBe(true);
      }
    }
  });
});
