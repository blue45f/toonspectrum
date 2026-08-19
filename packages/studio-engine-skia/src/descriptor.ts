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
      "render.vector.gradient.sweep",
      "render.group.opacity",
      "render.group.clip",
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

/**
 * Interactive Skia GPU island — CanvasKit WebGL OffscreenCanvas, ImageBitmap
 * transport into the Studio FrameGraph. Not a same-device WebGPU pass.
 */
export const canvasKitGpuProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "skia-canvaskit-gpu",
    kind: "vector-renderer",
    displayName: "Skia CanvasKit GPU island",
    version: "0.41.1",
    license: "BSD-3-Clause",
    maturity: "conditional",
    runtime: "webgl",
    capabilities: [
      "render.vector.fill",
      "render.vector.stroke",
      "render.vector.gradient",
      "render.vector.gradient.sweep",
      "render.group.opacity",
      "render.group.clip",
      "render.blend.multiply",
      "render.blend.screen",
      "render.blend.darken",
      "render.blend.lighten",
      "render.text.paragraph",
      "render.image",
      "render.mask",
      "render.filter.image",
      "surface.island.skia-complete",
    ],
    limitations: [
      "Ganesh WebGL queue cannot share GPUTexture with Vello; dirty ImageBitmap bridge only",
      "interactive path must not readPixels; island transfer happens on revision change",
    ],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "tolerance",
    memoryEstimateMb: 48,
    fallbackProviderId: "skia-canvaskit",
    knownIssues: [],
  });

export const canvasKitCpuReferenceProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "skia-canvaskit-cpu-reference",
    kind: "vector-renderer",
    displayName: "Skia CanvasKit CPU reference",
    version: "0.41.1",
    license: "BSD-3-Clause",
    maturity: "reference-only",
    runtime: "wasm",
    capabilities: [
      "render.vector.fill",
      "render.vector.stroke",
      "render.vector.gradient",
      "render.text.paragraph",
      "export.png",
      "export.deterministic",
    ],
    limitations: [
      "MakeSurface + readPixels — export, golden and recovery only",
      "forbidden as the interactive visible first frame",
    ],
    previewQuality: "reference",
    finalQuality: "reference",
    determinism: "tolerance",
    memoryEstimateMb: 34,
    fallbackProviderId: null,
    knownIssues: [],
  });

/** Experimental Graphite/WebGPU same-device challenger — not production. */
export const skiaGraphiteWebgpuProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "skia-graphite-webgpu",
    kind: "vector-renderer",
    displayName: "Skia Graphite WebGPU challenger",
    version: "experimental",
    license: "BSD-3-Clause",
    maturity: "experimental",
    runtime: "webgpu",
    capabilities: [
      "render.vector.fill",
      "render.gpu.webgpu",
      "surface.island.skia-complete",
    ],
    limitations: [
      "same-device Graphite is gated until the visual/performance tournament passes",
    ],
    previewQuality: "preview",
    finalQuality: "preview",
    determinism: "tolerance",
    memoryEstimateMb: 64,
    fallbackProviderId: "skia-canvaskit-gpu",
    knownIssues: ["not wired as a production provider"],
  });
