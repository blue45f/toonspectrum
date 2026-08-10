import { providerDescriptorSchema } from "./descriptor";

import type { ProviderDescriptor } from "./descriptor";
import type { EngineCapabilityRegistry } from "./registry";

/**
 * Engine-layer filter/image-pipeline provider descriptors (matrix E01/E16/E17).
 *
 * Op capabilities use the `filter.op.<name>` namespace matching the tail of
 * EffectNodeIR ops ("core.gaussian-blur" → "filter.op.gaussian-blur");
 * `filter.phase.preview|final` declares which side of the preview/final split
 * a provider may serve. Benchmark evidence:
 * tests/benchmarks/results/filter-candidates.json (2026-08-07).
 */

export const canvasKitImageFilterDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "canvaskit-imagefilter",
    kind: "filter",
    displayName: "CanvasKit ImageFilter / RuntimeEffect",
    version: "canvaskit-wasm 0.41.1",
    license: "BSD-3-Clause",
    attribution: "Skia / CanvasKit",
    maturity: "production-baseline",
    runtime: "wasm",
    capabilities: [
      "filter.op.gaussian-blur",
      "filter.op.levels",
      "filter.op.color-balance",
      "filter.op.hsl",
      "filter.op.curve",
      "filter.phase.preview",
      "filter.phase.final",
    ],
    limitations: ["interactive-radius blurs; very large finals belong to the vips lane"],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "tolerance",
    memoryEstimateMb: 34,
    fallbackProviderId: null,
    knownIssues: [],
  });

export const openCvImageWorkerDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "opencv-image-worker",
    kind: "filter",
    displayName: "OpenCV.js analysis worker",
    version: "@techstark/opencv-js 5.0.0-release.1 (pinned production dep)",
    license: "Apache-2.0",
    attribution: "OpenCV",
    maturity: "production-baseline",
    runtime: "wasm-worker",
    capabilities: [
      "filter.op.canny",
      "filter.op.dilate",
      "filter.op.erode",
      "filter.op.morphology",
      "filter.op.threshold",
      "filter.op.contours",
      "filter.op.gaussian-blur",
      "filter.phase.preview",
      "filter.phase.final",
    ],
    limitations: [
      "analysis/mask lane (magic wand, line extraction, dust) — compositing stays with the surface owner",
    ],
    previewQuality: "production",
    finalQuality: "production",
    determinism: "tolerance",
    memoryEstimateMb: 48,
    fallbackProviderId: "canvaskit-imagefilter",
    knownIssues: ["measured: canny 512^2 p50 1.37ms, dilate 0.48ms, gaussian 3.21ms"],
  });

export const wasmVipsPipelineDescriptor: ProviderDescriptor =
  providerDescriptorSchema.parse({
    id: "wasm-vips-pipeline",
    kind: "image-pipeline",
    displayName: "wasm-vips large-image pipeline",
    version: "wasm-vips 0.0.18 (dev-only candidate)",
    license: "LGPL-2.1-or-later",
    attribution: "libvips / wasm-vips",
    maturity: "candidate",
    runtime: "wasm-worker",
    capabilities: [
      "filter.op.resize",
      "filter.op.gaussian-blur",
      "filter.op.pyramid",
      "filter.op.thumbnail",
      "filter.phase.final",
    ],
    limitations: [
      "final/export lane only — no preview phase; LGPL isolated deployment mode required",
      "single-thread baseline measured; SMP requires COOP/COEP workers",
    ],
    previewQuality: "reference",
    finalQuality: "production",
    determinism: "tolerance",
    memoryEstimateMb: 64,
    fallbackProviderId: "canvaskit-imagefilter",
    knownIssues: ["measured: resize 2048->512 p50 16.4ms, gaussblur s4 2048^2 p50 46.7ms"],
  });

export function registerFilterProviders(registry: EngineCapabilityRegistry): void {
  registry.register(canvasKitImageFilterDescriptor);
  registry.register(openCvImageWorkerDescriptor);
  registry.register(wasmVipsPipelineDescriptor);
}
