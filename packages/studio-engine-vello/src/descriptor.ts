import { providerDescriptorSchema } from "@toonspectrum/studio-engine-registry";

import type { ProviderDescriptor } from "@toonspectrum/studio-engine-registry";

/**
 * Vello CPU provider descriptor (matrix E04, ADR 0004).
 *
 * Role: deterministic CPU lane — cross-renderer diff, golden images, GPU-loss
 * recovery, background export, and (ADR-0010 승격) vector-island preview
 * rendering. It does not claim the whole-canvas `surface.primary`; the product
 * VelloHub grants it only CPU fallback/reference ownership inside the bounded
 * selection-overlay island. Wider ownership still moves through the Classic/
 * Hybrid validation track and remains gated by quality + fallback evidence.
 */
/**
 * Vello GPU browser (WebGPU wasm) provider descriptor — ADR-0011 lane 2,
 * V12 §4.1 vello 0.9 Classic.
 *
 * Conditions of use (enforced by the gpu-browser wrapper, not by hope):
 * - Requires `navigator.gpu`; `loadVelloGpuBrowser()` rejects with an explicit
 *   error and `probeWebGpu()` reports `{ supported: false }` when absent —
 *   callers route to the vello_cpu wasm lane (fallbackProviderId).
 * - Ships as the separate `pkg-gpu/` artifact (`wasm-pack --features gpu`,
 *   INTEGRITY-pinned); the default CPU artifact never carries GPU code.
 * - Parity contract: δ48 3×3 fuzzy mismatch vs vello_cpu ≤ 0.6% (the native
 *   Metal gate in crates/studio-engine-vello/tests/gpu_parity.rs); browser
 *   runs are measured by compareGpuVsCpu and recorded in
 *   tests/benchmarks/results/vello-gpu-browser.json.
 * - Product authority is conditional and scoped: the existing `/studio`
 *   selection-overlay SceneIR island only. It does not claim the document,
 *   input, brush-pixel or whole-canvas primary surface.
 */
export const velloGpuBrowserProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "vello-gpu-browser",
    kind: "vector-renderer",
    displayName: "Vello GPU (browser WebGPU)",
    version: "vello 0.9.0 / wgpu 29.0.4 / velato 0.11.0 / crate 0.1.0",
    license: "MIT / Apache-2.0",
    attribution: "Linebender Vello project",
    // The engine stays experimental for whole-canvas authority. The product
    // VelloHub capability separately grants only the measured selection island.
    maturity: "experimental",
    runtime: "webgpu",
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
      "render.gpu.webgpu",
      "render.lottie.frame",
      "render.text.vertical",
      "render.text.simple",
      "surface.island.selection-overlay",
      "surface.island.document-vector",
    ],
    limitations: [
      "requires navigator.gpu — load/probe surface explicit errors when WebGPU is absent (no silent downgrade)",
      "bounded single-style vertical glyph-path shaping uses HarfRust TTB vert/vrt2 plus Skrifa (including tate-chu-yoko); rich paragraph editing still routes to Parley/CanvasKit",
      "readback (render-to-pixels) is an evidence/parity surface; the product document/selection islands present the adopted fabric texture on-GPU",
      "product path-heavy document islands are Vello Classic; FrameGraphCompositor owns the swapchain, not this provider",
      "tolerance determinism only — parity vs vello_cpu gated by the δ48 fuzzy metric, not bit-equality",
      "lottie lane covers the velato 0.11 subset — text/image layers, split transforms and Add/HardMix blends reject with explicit lottie-* errors (no silent frame drop)",
    ],
    previewQuality: "production",
    finalQuality: "preview",
    determinism: "tolerance",
    memoryEstimateMb: 64,
    fallbackProviderId: "vello-cpu",
    knownIssues: [
      "upstream vello repository declares alpha status; adapter pins vello 0.9.0 + wgpu 29.0.4",
      "browser WebGPU availability varies by OS/driver; probeWebGpu() is the runtime gate",
    ],
  });

/**
 * V12 native SVG island: strict source audit -> usvg 0.46 -> vello_svg 0.10
 * scene, with a sibling vello_cpu lowering of the same normalized tree.
 */
export const velloSvgNativeProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "vello-svg-native",
    kind: "format",
    displayName: "Vello SVG native (strict subset)",
    version:
      "vello_svg 0.10.0 / usvg 0.46.0 / vello 0.9.0 / vello_cpu 0.2.0",
    license: "MIT / Apache-2.0",
    attribution: "Linebender vello_svg and usvg projects",
    maturity: "conditional",
    runtime: "webgpu",
    capabilities: [
      "format.svg.strict-audit",
      "format.svg.path",
      "format.svg.gradient",
      "format.svg.single-path-clip",
      "render.svg.vello-native",
      "render.svg.cpu-reference",
    ],
    limitations: [
      "text, raster images, patterns, masks, filters, markers, use/symbol, nested SVG and external references reject before rendering",
      "clipPath must contain exactly one direct geometry path after usvg normalization; no bbox approximation is accepted",
      "GPU pixel return is an evidence/export readback surface, never the interactive hot path",
      "unsupported SVG routes through an explicit provider tournament; this adapter performs no automatic fallback",
    ],
    previewQuality: "production",
    finalQuality: "preview",
    determinism: "tolerance",
    memoryEstimateMb: 72,
    fallbackProviderId: "skia-canvaskit",
    knownIssues: [
      "vello_svg documents conformance gaps and recommends resvg for correctness; the source/tree audits intentionally expose a narrower subset",
      "vello_svg 0.10 complex-clip and unsupported-paint approximations are bypassed by strict rejection gates",
    ],
  });

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
      "render.vector.gradient.sweep",
      "render.group.opacity",
      "render.group.clip",
      "render.blend.multiply",
      "render.blend.screen",
      "render.blend.darken",
      "render.blend.lighten",
      "render.text.vertical",
      "export.deterministic",
      "surface.island.selection-overlay",
      "surface.island.document-vector",
    ],
    limitations: [
      "bounded single-style vertical glyph-path shaping uses HarfRust TTB vert/vrt2 plus Skrifa (including tate-chu-yoko); rich paragraph editing still routes to Parley/CanvasKit",
      "single-threaded baseline SIMD level pinned for bit-stable golden images",
      "V13 quality reference / GPU-loss recovery only — not the visible first frame when WebGPU is available",
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

/** Alias used by V13 planner keys — same artifact as `vello-gpu-browser`. */
export const velloClassicWgpuProviderDescriptor: ProviderDescriptor = {
  ...velloGpuBrowserProviderDescriptor,
  id: "vello-classic-wgpu",
  displayName: "Vello Classic GPU (path-heavy)",
};

/**
 * FrameGraph Hybrid compositor provider. Uses the Classic WebGPU renderer for
 * vector subsets and binds external textures in the same fabric device.
 * This is not the upstream vello_hybrid sparse-strip GPU API.
 */
export const velloHybridWgpuProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "vello-hybrid-wgpu",
    kind: "vector-renderer",
    displayName: "Vello Hybrid compositor (WebGPU)",
    version: "vello 0.9.0 / frame-graph hybrid / crate 0.1.0",
    license: "MIT / Apache-2.0",
    attribution: "Linebender Vello project + ToonSpectrum FrameGraph",
    maturity: "conditional",
    runtime: "webgpu",
    capabilities: [
      "render.vector.fill",
      "render.vector.stroke",
      "render.vector.gradient",
      "render.vector.gradient.sweep",
      "render.group.opacity",
      "render.group.clip",
      "render.gpu.webgpu",
      "render.text.simple",
      "render.image",
      "render.external-texture",
      "surface.island.document-vector",
    ],
    limitations: [
      "Hybrid here is compositor + Classic path islands + external texture binding",
      "upstream vello_hybrid 0.2 sparse GPU remains a separate unavailable candidate",
      "paragraph, complex mask, ImageFilter and backdrop blends route to Skia islands",
    ],
    previewQuality: "production",
    finalQuality: "preview",
    determinism: "tolerance",
    memoryEstimateMb: 80,
    fallbackProviderId: "vello-gpu-browser",
    knownIssues: [],
  });

export const velloCpuReferenceProviderDescriptor: ProviderDescriptor = {
  ...velloCpuProviderDescriptor,
  id: "vello-cpu-reference",
  displayName: "Vello CPU reference",
};
