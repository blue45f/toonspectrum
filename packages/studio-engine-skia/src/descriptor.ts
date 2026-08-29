import {
  providerDescriptorSchema,
  SKIA_CPU_REFERENCE_EXECUTION,
  SKIA_GPU_EXECUTION,
} from "@toonspectrum/studio-engine-registry";

import type {
  ProviderDescriptor,
  ProviderExecutionContract,
} from "@toonspectrum/studio-engine-registry";

/**
 * Self-declaration for the CanvasKit (Skia) vector renderer adapter (V11 §2.2),
 * split by role (V13 §2.6 / V19 §3.2):
 *
 * - `skia-canvaskit` — the CPU raster lane implemented by render.ts
 *   (MakeSurface + readPixels). Reference, golden, export and GPU-loss
 *   recovery scope; worker-friendly; readPixels is allowed here precisely
 *   because this lane never presents the interactive visible frame. The id is
 *   kept stable because asset metadata fallbacks and the vello descriptors
 *   name it; the honesty fix is the capability set + execution contract, not
 *   a rename.
 * - `skia-canvaskit-gpu` — the interactive live role: OffscreenCanvas WebGL
 *   island transported as ImageBitmap into the FrameGraph. No readPixels on
 *   the hot path.
 *
 * There is no CanvasKit interactive primary-surface descriptor: none of these
 * lanes may claim `surface.primary`, and a future live primary surface must
 * arrive as its own descriptor with its own evidence, not by widening these.
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
      "CPU raster MakeSurface + readPixels lane — reference, golden, export and GPU-loss recovery scope only",
      "never the interactive visible frame; interactive Skia completion routes to skia-canvaskit-gpu (ImageBitmap island, no readPixels)",
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
      // The two V13 gaps no Vello lane can own even as a texture island. They were absent while
      // SKIA_GPU_FEATURE_CONTRACTS already declared both native, so the descriptor understated a
      // lane the router was routing to — and EngineCapabilityRegistry.query matches capability
      // strings exactly, with no wildcard, so the completion lane could never be selected for
      // them. Declared here to make the claim queryable, not merely documented.
      "render.blend.backdrop",
      "render.path-effect",
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

/**
 * Reference-role alias of `skia-canvaskit` — same render.ts implementation,
 * same capability set, declared at reference maturity/quality for callers that
 * bind the CPU lane explicitly (golden, cross-renderer diff, recovery). It
 * does not claim `export.deterministic`: this lane is tolerance-determinism
 * (AA/text rasterization varies across platforms); the bit-exact export
 * baseline is vello-cpu.
 */
export const canvasKitCpuReferenceProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    ...canvasKitProviderDescriptor,
    id: "skia-canvaskit-cpu-reference",
    displayName: "Skia CanvasKit CPU reference",
    maturity: "reference-only",
    previewQuality: "reference",
    finalQuality: "reference",
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
      // Graphite is a Skia GPU backend, so SKIA_GPU_FEATURE_CONTRACTS declares all five Vello gap
      // features native for it too. Without the exact tokens the registry's
      // `capabilities.includes(capability)` match cannot select the challenger for any gap it is
      // named to challenge on — the same understatement corrected on the CanvasKit GPU lane.
      // Selectability is not promotion: `maturity: "experimental"` and the tournament gate still
      // decide whether it is admitted at all.
      "render.text.paragraph",
      "render.mask",
      "render.filter.image",
      "render.blend.backdrop",
      "render.path-effect",
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

/**
 * V13 §5.1 execution contracts for the Skia lanes, keyed by provider id.
 * `ProviderExecutionContract` is the registry's existing metadata shape for
 * this — no parallel schema. "Not interactive" is not a bespoke boolean: the
 * CPU lanes declare `{ accelerator: "cpu", output: "pixels" }`, and the
 * planner already forbids cpu-readback transports in interactive mode, so a
 * pixels-output contract can never be planned as an interactive surface.
 *
 * `skia-graphite-webgpu` is intentionally absent: the registry defines no
 * Graphite execution contract yet and the challenger is not wired as a
 * production provider — inventing one here would be a placeholder claim.
 */
export const skiaExecutionContractByProviderId: Readonly<
  Record<string, ProviderExecutionContract>
> = Object.freeze({
  [canvasKitProviderDescriptor.id]: SKIA_CPU_REFERENCE_EXECUTION,
  [canvasKitCpuReferenceProviderDescriptor.id]: SKIA_CPU_REFERENCE_EXECUTION,
  [canvasKitGpuProviderDescriptor.id]: SKIA_GPU_EXECUTION,
});
