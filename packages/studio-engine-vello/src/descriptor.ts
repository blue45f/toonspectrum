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
 * - Stays `experimental` until the ledger promotes lane 2 on real-browser
 *   measurements (docs/adr/0011-v12-frontier-quarantine-ledger.md).
 */
export const velloGpuBrowserProviderDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "vello-gpu-browser",
    kind: "vector-renderer",
    displayName: "Vello GPU (browser WebGPU)",
    version: "vello 0.9.0 / wgpu 29.0.4 / crate 0.1.0",
    license: "MIT / Apache-2.0",
    attribution: "Linebender Vello project",
    maturity: "experimental",
    runtime: "webgpu",
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
      "render.gpu.webgpu",
    ],
    limitations: [
      "requires navigator.gpu — load/probe surface explicit errors when WebGPU is absent (no silent downgrade)",
      "no text shaping lane — text islands must route to a paragraph-capable provider",
      "readback (render-to-pixels) is an evidence/parity surface; interactive compositing must stay on-GPU",
      "tolerance determinism only — parity vs vello_cpu gated by the δ48 fuzzy metric, not bit-equality",
    ],
    previewQuality: "preview",
    finalQuality: "preview",
    determinism: "tolerance",
    memoryEstimateMb: 64,
    fallbackProviderId: "vello-cpu",
    knownIssues: [
      "upstream vello repository declares alpha status; adapter pins vello 0.9.0 + wgpu 29.0.4",
      "browser WebGPU availability varies by OS/driver; probeWebGpu() is the runtime gate",
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
