import { providerDescriptorSchema } from "@toonspectrum/studio-engine-registry";

import type { ProviderDescriptor } from "@toonspectrum/studio-engine-registry";

/**
 * Vello CPU provider descriptor (matrix E04, ADR 0004).
 *
 * Role: deterministic CPU lane — cross-renderer diff, golden images, GPU-loss
 * recovery, background export, and (ADR-0010 승격) vector-island preview
 * rendering. It does not claim surface.primary yet: interactive surface
 * ownership moves with the Vello Classic/Hybrid GPU validation track, which
 * ADR-0010 prioritizes under the product-owner risk acceptance — candidates
 * are gated by quality + fallback chains, not by maturity labels.
 */
export const velloCpuProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "vello-cpu",
    kind: "vector-renderer",
    displayName: "Vello CPU (sparse strips)",
    version: "vello_cpu 0.2.0 / crate 0.1.0",
    license: "MIT / Apache-2.0",
    attribution: "Linebender Vello project",
    maturity: "conditional",
    runtime: "wasm",
    capabilities: [
      "render.vector.fill",
      "render.vector.stroke",
      "render.vector.gradient",
      "render.group.opacity",
      "render.group.clip",
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
    previewQuality: "production",
    finalQuality: "reference",
    determinism: "bit-exact",
    memoryEstimateMb: 12,
    fallbackProviderId: "skia-canvaskit",
    knownIssues: [
      "upstream vello repository declares alpha status; adapter pins vello_cpu 0.2.0",
    ],
  });
