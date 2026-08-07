import { providerDescriptorSchema } from "@toonspectrum/studio-engine-registry";

import type { ProviderDescriptor } from "@toonspectrum/studio-engine-registry";

/**
 * Self-declaration for the CanvasKit (Skia) vector renderer adapter (V11 §2.2).
 *
 * Parsed through the descriptor schema at module load so a malformed claim
 * fails fast at import time instead of at registry registration.
 */
export const canvasKitProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "skia-canvaskit",
    kind: "vector-renderer",
    displayName: "Skia CanvasKit",
    version: "0.41.1",
    license: "BSD-3-Clause",
    maturity: "production-baseline",
    runtime: "wasm",
    capabilities: [
      "surface.primary",
      "render.vector.fill",
      "render.vector.stroke",
      "render.vector.gradient",
      "render.group.opacity",
      "render.blend.multiply",
      "render.blend.screen",
      "render.blend.darken",
      "render.blend.lighten",
      "render.text.paragraph",
      "export.png",
    ],
    limitations: [
      "render.text.paragraph requires a registered font asset (no bundled fonts in canvaskit-wasm npm)",
    ],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "tolerance",
    memoryEstimateMb: 34,
    fallbackProviderId: null,
    knownIssues: [],
  });
