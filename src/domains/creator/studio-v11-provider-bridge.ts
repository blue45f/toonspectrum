import {
  providerDescriptorSchema,
  type ProviderDescriptor,
  type ProviderKind,
  type ProviderRuntime,
} from "@toonspectrum/provider-catalog-v11";

import {
  STUDIO_BRUSH_BACKEND_INTEGRATION_AUDIT,
  type StudioBrushBackendId,
  type StudioBrushBackendIntegrationAudit,
} from "./studio-brush-backend-quality-policy";

/**
 * V11 strangler bridge, step (a) of ADR 0001(개정): the existing studio's
 * code-audited backend inventory becomes the source of V11 ProviderDescriptors.
 * The audit table stays the single truth — this module only derives, so policy
 * edits propagate to the V11 registry without a second ledger.
 *
 * Two audit rows are deliberately not derivable as providers:
 * - "vnext-provider-router" is routing, not a renderer; V11 replaces it with
 *   HybridExecutionPlanner rather than registering it.
 * - "pixi-scene-overlay" is permanently banned from brush pixel authority and
 *   only exists as a scene overlay stage.
 */
export const STUDIO_V11_NON_PROVIDER_BACKENDS = Object.freeze([
  "vnext-provider-router",
  "pixi-scene-overlay",
] as const) satisfies readonly StudioBrushBackendId[];

interface BackendDerivation {
  kind: ProviderKind;
  runtime: ProviderRuntime;
  license: string;
  determinism: "bit-exact" | "tolerance" | "nondeterministic";
  fallbackProviderId: string | null;
}

/**
 * Per-backend facts the audit table does not carry (engine kind, runtime
 * substrate, license, deterministic replay class, documented fallback lane).
 * Licenses follow docs/candidates/<subsystem>/license-deployment.md: first-party code is
 * "internal"; vendored engines carry their upstream license so the V11 license
 * hard gate (bundle vs isolated) applies to the real obligation.
 */
const BACKEND_DERIVATIONS: Readonly<
  Record<Exclude<StudioBrushBackendId, (typeof STUDIO_V11_NON_PROVIDER_BACKENDS)[number]>, BackendDerivation>
> = Object.freeze({
  "canvas2d-causal-ink": {
    kind: "raster-brush",
    runtime: "js",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: null,
  },
  "webgpu-live-causal-ink": {
    kind: "raster-brush",
    runtime: "webgpu",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-causal-ink",
  },
  "perfect-freehand-outline": {
    kind: "stroke-geometry",
    runtime: "js",
    license: "MIT",
    determinism: "bit-exact",
    fallbackProviderId: null,
  },
  "canvas2d-material-specialist": {
    kind: "raster-brush",
    runtime: "js",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-causal-ink",
  },
  "canvas2d-dynamic-coverage": {
    kind: "raster-brush",
    runtime: "js",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-causal-ink",
  },
  "canvas2d-wet-field": {
    kind: "natural-media",
    runtime: "js",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-wet-ribbon",
  },
  "canvas2d-wet-ribbon": {
    kind: "natural-media",
    runtime: "js",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-causal-ink",
  },
  "canvas2d-stamp-pattern": {
    kind: "raster-brush",
    runtime: "js",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-causal-ink",
  },
  "deferred-raster-tool-preview": {
    kind: "raster-brush",
    runtime: "js",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: null,
  },
  "pixel-edit-worker": {
    kind: "raster-brush",
    runtime: "wasm-worker",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: null,
  },
  "canonical-webgpu-analytic": {
    kind: "raster-brush",
    runtime: "webgpu",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-causal-ink",
  },
  "canonical-webgpu-textured": {
    kind: "raster-brush",
    runtime: "webgpu",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-material-specialist",
  },
  "canonical-webgpu-wet-specialist": {
    kind: "natural-media",
    runtime: "webgpu",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-wet-ribbon",
  },
  "professional-bristle-webgpu": {
    kind: "natural-media",
    runtime: "webgpu",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-material-specialist",
  },
  "fiber-bristle-worker": {
    kind: "natural-media",
    runtime: "wasm-worker",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-material-specialist",
  },
  "physics-particle-worker": {
    kind: "natural-media",
    runtime: "wasm-worker",
    license: "internal",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-dynamic-coverage",
  },
  "procedural-artistic-worker": {
    kind: "raster-brush",
    runtime: "wasm-worker",
    license: "LGPL-2.1-or-later",
    determinism: "nondeterministic",
    fallbackProviderId: null,
  },
  "p5-webgl-artistic": {
    kind: "raster-brush",
    runtime: "webgl",
    license: "LGPL-2.1-or-later",
    determinism: "nondeterministic",
    fallbackProviderId: "procedural-artistic-worker",
  },
  "paper-vector-refinement": {
    kind: "vector-renderer",
    runtime: "wasm-worker",
    license: "MIT",
    determinism: "bit-exact",
    fallbackProviderId: null,
  },
  "canvaskit-path-specialist": {
    kind: "vector-renderer",
    runtime: "wasm",
    license: "BSD-3-Clause",
    determinism: "tolerance",
    fallbackProviderId: null,
  },
  "hokusai-myb-worker": {
    kind: "natural-media",
    runtime: "wasm-worker",
    license: "MIT / Apache-2.0",
    determinism: "tolerance",
    fallbackProviderId: "canvas2d-causal-ink",
  },
});

function maturityFor(
  connection: StudioBrushBackendIntegrationAudit["connection"],
): ProviderDescriptor["maturity"] {
  switch (connection) {
    case "active-product":
      return "production-baseline";
    case "conditional-product":
    case "active-settled-tool":
    case "active-layer-generator":
      return "conditional";
    case "implemented-live-provider-unwired":
    case "implemented-unwired":
      return "candidate";
    case "not-a-brush-backend":
      return "reference-only";
  }
}

export function deriveStudioV11BackendDescriptors(): ProviderDescriptor[] {
  return STUDIO_BRUSH_BACKEND_INTEGRATION_AUDIT.filter(
    (entry) =>
      !(STUDIO_V11_NON_PROVIDER_BACKENDS as readonly StudioBrushBackendId[]).includes(
        entry.id,
      ),
  ).map((entry) => {
    const derivation =
      BACKEND_DERIVATIONS[entry.id as keyof typeof BACKEND_DERIVATIONS];
    const capabilities = [
      ...entry.phases.map((phase) => `brush.phase.${phase}`),
      ...(entry.brushPixelAuthority ? ["surface.primary"] : []),
    ];
    return providerDescriptorSchema.parse({
      id: entry.id,
      kind: derivation.kind,
      displayName: entry.implementation,
      version: "studio-backend-audit-v7",
      license: derivation.license,
      attribution: "",
      maturity: maturityFor(entry.connection),
      runtime: derivation.runtime,
      capabilities,
      limitations: [],
      previewQuality: entry.phases.includes("live") ? "production" : "reference",
      finalQuality:
        entry.phases.includes("commit") || entry.phases.includes("settled")
          ? "production"
          : "preview",
      determinism: derivation.determinism,
      memoryEstimateMb: entry.asynchronous ? 24 : 4,
      fallbackProviderId: derivation.fallbackProviderId,
      knownIssues: [entry.evidence],
    });
  });
}
