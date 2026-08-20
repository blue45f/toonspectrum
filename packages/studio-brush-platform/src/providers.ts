import {
  declareTrustedBootstrapProvider,
  providerDescriptorSchema,
} from "@toonspectrum/studio-engine-registry";

import type {
  EngineCapabilityRegistry,
  ProviderDescriptor,
} from "@toonspectrum/studio-engine-registry";

/**
 * Brush-platform provider descriptors (Phase 2 baseline + V19 §2.3).
 *
 * perfect-freehand is the shipped stroke-geometry outline lane. Google Ink is
 * the vector-mesh lane: the former ADR 0005 PoC gate was promoted after its
 * fixed-commit wasm port (mesh→PathIR conversion and incremental delta parity)
 * was measured in the fidelity harness — see ./compile.ts `compileMeshBrush`.
 * Hokusai is the natural-media lane already carried by
 * packages/studio-hokusai-wasm.
 *
 * This module stays descriptor-pure (no wasm/loader imports): the root app
 * imports it by file path for the asset-metadata capability vocabulary, so
 * pins that live next to loader code (e.g. INK_MESH_COMMIT in ./ink-mesh.ts)
 * are duplicated here as literals and cross-checked by the provider tests.
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

export const googleInkMeshProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "google-ink-mesh",
    kind: "stroke-geometry",
    displayName: "Google Ink mesh (google/ink WASM)",
    version: "google/ink 1.1.0",
    // Duplicates INK_MESH_COMMIT (./ink-mesh.ts) so this module stays
    // descriptor-pure; __tests__/providers.test.ts asserts they never drift.
    commit: "1d0daba661f3035f42f3649b8e6a0061b47aa759",
    license: "Apache-2.0",
    attribution: "Google — ink; ToonSpectrum wasm bridge",
    maturity: "production-baseline",
    runtime: "wasm",
    capabilities: [
      "stroke.geometry.ink-mesh",
      "stroke.geometry.incremental-mesh-delta",
      "stroke.geometry.editable-path",
      "stroke.geometry.deterministic",
    ],
    limitations: [
      "no flow/opacity dynamics, stamp/image tips, hardness or jitter — unsupported program dimensions surface as compile warnings, never silently dropped",
      "consumes pre-modeled input (ink stroke modeler); the JS stabilizer does not apply on this lane",
      "no fallback provider — hosts without the ink WASM module hide mesh brushes (BrushProviderRequiredError) instead of substituting outline geometry",
    ],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "bit-exact",
    memoryEstimateMb: 6,
    // Fail-closed like hokusai-natural-media: no geometry-equivalence
    // certification exists for a perfect-freehand rendition of Google Ink mesh
    // output, so `compileMeshBrush` throws BrushProviderRequiredError when the
    // ink WASM provider is unavailable and the brush is hidden — never
    // silently re-rendered with different stroke geometry. Restore a fallback
    // only together with a checked-in visual-equivalence certification.
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
const googleInkMeshBootstrap = declareTrustedBootstrapProvider(
  googleInkMeshProviderDescriptor,
  {
    classification: "checked-in-production-baseline",
    source: "packages/studio-brush-platform/src/providers.ts",
    owner: "studio-brush-platform",
    justification:
      "checked-in google/ink mesh wasm baseline (V19 §2.3) with mesh→PathIR and incremental-delta parity coverage",
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
  registry.registerTrustedBootstrap(googleInkMeshBootstrap);
  registry.registerTrustedBootstrap(hokusaiBootstrap);
}
