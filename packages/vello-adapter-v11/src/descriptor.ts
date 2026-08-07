import { providerDescriptorSchema } from "@toonspectrum/provider-catalog-v11";

import type { ProviderDescriptor } from "@toonspectrum/provider-catalog-v11";

/**
 * Vello CPU provider descriptor (matrix E04, ADR 0004).
 *
 * Role: deterministic CPU reference lane — cross-renderer diff, golden images,
 * GPU-loss recovery, background export. It intentionally does NOT claim
 * surface.primary: interactive surfaces belong to the production baseline
 * (CanvasKit today) until Vello Classic/Hybrid pass their capability gates.
 */
export const velloCpuProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "vello-cpu",
    kind: "vector-renderer",
    displayName: "Vello CPU (sparse strips)",
    version: "vello_cpu 0.2.0 / crate 0.1.0",
    license: "MIT / Apache-2.0",
    attribution: "Linebender Vello project",
    maturity: "candidate",
    runtime: "wasm",
    capabilities: [
      "render.vector.fill",
      "render.vector.stroke",
      "render.vector.gradient",
      "render.group.opacity",
      "render.blend.multiply",
      "render.blend.screen",
      "render.blend.darken",
      "render.blend.lighten",
      "export.deterministic",
    ],
    limitations: [
      "no text shaping lane yet — text islands must route to a paragraph-capable provider",
      "single-threaded baseline SIMD level pinned for bit-stable golden images",
    ],
    previewQuality: "reference",
    finalQuality: "reference",
    determinism: "bit-exact",
    memoryEstimateMb: 12,
    fallbackProviderId: "skia-canvaskit",
    knownIssues: [
      "upstream vello repository declares alpha status; adapter pins vello_cpu 0.2.0",
    ],
  });
