import {
  declareTrustedBootstrapProvider,
  providerDescriptorSchema,
} from "@toonspectrum/studio-engine-registry";

import type {
  EngineCapabilityRegistry,
  ProviderDescriptor,
} from "@toonspectrum/studio-engine-registry";

/**
 * Brush-platform provider descriptors (Phase 2 baseline).
 *
 * perfect-freehand is the shipped stroke-geometry lane; Google Ink stays a
 * PoC candidate (ADR 0005) and is intentionally NOT registered until its
 * fixed-commit wasm port passes the fidelity gate. Hokusai is the natural-
 * media lane already carried by packages/studio-hokusai-wasm.
 */

export const perfectFreehandProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "perfect-freehand",
    kind: "stroke-geometry",
    displayName: "Perfect Freehand outline",
    version: "1.2.3",
    license: "MIT",
    attribution: "Steve Ruiz — perfect-freehand",
    maturity: "production-baseline",
    runtime: "js",
    capabilities: [
      "stroke.geometry.pressure-outline",
      "stroke.geometry.editable-path",
      "stroke.geometry.deterministic",
    ],
    limitations: [
      "no brush-tip texture or natural-media dynamics — raster lanes own those",
      "outline is polygonal; Kurbo fitting lane will provide curve-fit proxies",
    ],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "bit-exact",
    memoryEstimateMb: 1,
    fallbackProviderId: null,
    knownIssues: [],
  });

export const hokusaiProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "hokusai-natural-media",
    kind: "natural-media",
    displayName: "Hokusai natural media (studio-hokusai-wasm)",
    version: "hokusai 0.3.0 / crate 0.1.0",
    license: "MIT / Apache-2.0",
    attribution: "Re:Earth Hokusai; ToonSpectrum wasm wrapper",
    maturity: "production-baseline",
    runtime: "wasm-worker",
    capabilities: [
      "brush.natural-media.dynamics",
      "brush.natural-media.myb",
      "brush.natural-media.straight-alpha-tiles",
    ],
    limitations: [
      "tile output composites through the raster surface owner — no direct surface ownership",
      "libmypaint parity lab pending for the full .myb corpus (matrix E11/E12 gate)",
      "no fallback provider — device-incapable hosts hide natural-media brushes instead of substituting texture",
    ],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "bit-exact",
    memoryEstimateMb: 24,
    // V17.1 fail-closed policy: the former "skia-canvaskit" fallback is removed because no
    // texture-equivalence certification exists for a Skia rendition of Hokusai natural-media
    // output (사용자 지시 3: a brush must never silently render with a different texture — a
    // device that cannot run this provider hides the brush rather than substituting). Restore a
    // fallback only together with a checked-in texture-equivalence certification.
    fallbackProviderId: null,
    knownIssues: [],
  });

const perfectFreehandBootstrap = declareTrustedBootstrapProvider(
  perfectFreehandProviderDescriptor,
  {
    classification: "checked-in-production-baseline",
    source: "packages/studio-brush-platform/src/providers.ts",
    owner: "studio-brush-platform",
    justification: "checked-in pressure-outline baseline used by the vector brush fallback",
  },
);
const hokusaiBootstrap = declareTrustedBootstrapProvider(
  hokusaiProviderDescriptor,
  {
    classification: "checked-in-production-baseline",
    source: "packages/studio-brush-platform/src/providers.ts",
    owner: "studio-brush-platform",
    justification: "checked-in natural-media wasm baseline with fidelity goldens",
  },
);

export function registerBrushPlatformProviders(
  registry: EngineCapabilityRegistry,
): void {
  registry.registerTrustedBootstrap(perfectFreehandBootstrap);
  registry.registerTrustedBootstrap(hokusaiBootstrap);
}
