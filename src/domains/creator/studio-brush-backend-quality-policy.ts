/**
 * Material-aware brush backend quality policy.
 *
 * The brush catalogue identifies an artistic material, not permission to draw that material with
 * any available primitive. This router keeps live/commit backend pairs explicit and rejects
 * cross-family approximations. In particular, dry and wet media may never silently collapse to a
 * generic row of round circles when their texture/physical backend is loading or unavailable.
 *
 * This module is intentionally renderer-neutral and side-effect free. Product code supplies a
 * capability snapshot at stroke start; the returned pair is then pinned for the whole stroke.
 */

import {
  studioBrushPackDescriptorById,
  type StudioBrushPackCategory,
} from "./studio-brush-pack-index";
import {
  STUDIO_BRUSH_RUNTIME_CONTRACT,
  type StudioBrushRuntimePresetId,
} from "./studio-brush-runtime-contract";
import {
  STUDIO_HOKUSAI_LIVE_ADAPTER_VERSION,
  STUDIO_HOKUSAI_LIVE_BRUSH_PROTOCOL_VERSION,
} from "./studio-hokusai-live-brush-protocol";
import { resolveStudioHokusaiLivePreset } from "./studio-hokusai-live-brush-router";
import {
  STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION,
} from "./studio-hokusai-natural-media-worker-protocol";
import { STUDIO_PIXEL_PENCIL_RENDER_MODE } from "./studio-pixel-pencil";

export const STUDIO_BRUSH_BACKEND_QUALITY_POLICY_VERSION = 7 as const;

export type StudioBrushBackendQualityFamily =
  | "continuous-ink"
  | "dry-media"
  | "wet-media"
  | "spray-particle"
  | "stamp-pattern"
  | "eraser-mixer";

export type StudioBrushBackendQualityOperation = "paint" | "erase" | "mix";

export type StudioBrushBackendAvailability =
  | "ready"
  | "loading"
  | "unavailable"
  | "failed";

export type StudioBrushBackendId =
  | "canvas2d-causal-ink"
  | "webgpu-live-causal-ink"
  | "perfect-freehand-outline"
  | "canvas2d-material-specialist"
  | "canvas2d-dynamic-coverage"
  | "canvas2d-wet-field"
  | "canvas2d-wet-ribbon"
  | "canvas2d-stamp-pattern"
  | "deferred-raster-tool-preview"
  | "pixel-edit-worker"
  | "canonical-webgpu-analytic"
  | "canonical-webgpu-textured"
  | "canonical-webgpu-wet-specialist"
  | "professional-bristle-webgpu"
  | "fiber-bristle-worker"
  | "physics-particle-worker"
  | "procedural-artistic-worker"
  | "p5-webgl-artistic"
  | "paper-vector-refinement"
  | "canvaskit-path-specialist"
  | "hokusai-myb-worker"
  | "vnext-provider-router"
  | "pixi-scene-overlay";

export type StudioBrushBackendConnection =
  | "active-product"
  | "conditional-product"
  | "active-settled-tool"
  | "active-layer-generator"
  | "implemented-live-provider-unwired"
  | "implemented-unwired"
  | "not-a-brush-backend";

export type StudioBrushBackendPhase =
  | "live"
  | "commit"
  | "settled"
  | "layer-generator"
  | "scene-overlay"
  | "routing";

export interface StudioBrushBackendIntegrationAudit {
  readonly id: StudioBrushBackendId;
  readonly implementation: string;
  readonly connection: StudioBrushBackendConnection;
  readonly phases: readonly StudioBrushBackendPhase[];
  readonly asynchronous: boolean;
  readonly defaultAvailability: StudioBrushBackendAvailability;
  readonly brushPixelAuthority: boolean;
  readonly evidence: string;
}

export const STUDIO_HOKUSAI_MYB_PROVIDER_POLICY_VERSION = 6 as const;

/**
 * Admission policy for the installed Hokusai/libmypaint natural-media provider.
 *
 * The upstream 0.3.0 WASM facade returns a full surface composited over opaque white. That stock
 * facade is intentionally not admissible for Studio. The installed local wrapper pins the three
 * Hokusai crates exactly, reads the dirty rectangle as packed transparent RGBA8 inside a Dedicated
 * Worker and returns packed dirty live frames plus a verified crop-sized canonical PNG and parity
 * receipt. Pencil, charcoal, oil, calligraphy and marker identities may opt into this automatic
 * live route only after prewarm and the complete admission receipt. The explicit selected-stroke
 * settled transform remains available as a conversion fallback.
 */
export const STUDIO_HOKUSAI_MYB_PROVIDER_POLICY = Object.freeze({
  policyVersion: STUDIO_HOKUSAI_MYB_PROVIDER_POLICY_VERSION,
  backendId: "hokusai-myb-worker" as const,
  crate: "hokusai-wasm" as const,
  exactVersion: "0.3.0" as const,
  exactCargoRequirement: "=0.3.0" as const,
  license: "MIT OR Apache-2.0" as const,
  brushFormat: ".myb/libmypaint-v3" as const,
  execution: "dedicated-worker-wasm-packed-dirty-frame" as const,
  adapterVersion: STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION,
  customBinding: "toonspectrum-packed-dirty-frame" as const,
  eligibleFamilies: Object.freeze([
    "continuous-ink",
    "dry-media",
    "wet-media",
  ] as const),
  surface: Object.freeze({
    internalTileSize: 64 as const,
    internalFormat: "premultiplied-linear-rgba-fix15" as const,
    transferFormat: "packed-dirty-rgba8" as const,
    productBoundary:
      "transferable-packed-dirty-live-plus-canonical-png-parity-receipt" as const,
    stockOpaqueWhiteFlatteningAllowed: false as const,
  }),
  rollout: Object.freeze({
    defaultMode: "automatic-natural-media-live-provider-active-19-presets" as const,
    settledRequiresExplicitOptIn: true as const,
    fullLiveCoreInstalled: true as const,
    runtimeMustBeReady: true as const,
    defaultBrushRoutesChanged: true as const,
    verifiedAutomaticRouteCount: 19 as const,
    prewarmAtBrushSelection: true as const,
    admissionPinnedAtStrokeStart: true as const,
    midStrokeProviderSwitchAllowed: false as const,
    inFlightTransferableFrameLimit: 1 as const,
    stalePresentationPolicy: "coalesce-latest" as const,
    inputDropAllowed: false as const,
    explicitSelectedStrokeConversionFallback: true as const,
    licenseGatePassed: true as const,
    reproducibleReleaseGatePassed: true as const,
    realBrowserRuntimeGatePassed: true as const,
  }),
  determinism: Object.freeze({
    persistSeed: true as const,
    persistEngineAndAdapterVersion: true as const,
    requireInputAndPixelHashReceipt: true as const,
    crossPlatformBitIdentityGuaranteed: false as const,
    risk:
      "Young upstream project: libm, final-ULP, smudge and RNG implementation changes require "
      + "version-pinned replay plus bounded visual-parity verification.",
  }),
});

interface StudioHokusaiMybProviderOptInBase {
  readonly backendId: "hokusai-myb-worker";
  readonly engineVersion: "0.3.0";
  readonly adapterVersion: typeof STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION;
  readonly customBinding: "toonspectrum-packed-dirty-frame";
  readonly surfaceContract: "packed-dirty-rgba8";
}

export interface StudioHokusaiMybSettledProviderOptIn
  extends StudioHokusaiMybProviderOptInBase {
  readonly mode: "settled";
}

export interface StudioHokusaiMybLiveProviderOptIn
  extends StudioHokusaiMybProviderOptInBase {
  readonly mode: "live";
  readonly liveAdapterVersion: typeof STUDIO_HOKUSAI_LIVE_ADAPTER_VERSION;
  readonly protocolVersion: typeof STUDIO_HOKUSAI_LIVE_BRUSH_PROTOCOL_VERSION;
  readonly admission: Readonly<{
    readonly prewarmedAtStrokeStart: true;
    readonly packedDirtyTransfer: true;
    readonly singleInFlightFrame: true;
    readonly stalePresentationCoalesced: true;
    readonly inputSamplesPreserved: true;
    readonly epochCancellation: true;
    readonly canonicalPng: true;
    readonly exactLiveCommitParity: true;
    readonly midStrokePromotion: false;
  }>;
}

export type StudioHokusaiMybProviderOptIn =
  | StudioHokusaiMybSettledProviderOptIn
  | StudioHokusaiMybLiveProviderOptIn;

/**
 * Code-audited connection state. "implemented-unwired" is deliberately different from missing:
 * those providers have contracts/tests, but the normal brush shelf does not submit strokes to
 * them yet. Availability may be promoted to ready only by the owning runtime after initialization.
 */
export const STUDIO_BRUSH_BACKEND_INTEGRATION_AUDIT:
readonly StudioBrushBackendIntegrationAudit[] = Object.freeze([
  {
    id: "canvas2d-causal-ink",
    implementation: "studio-live-ink-overlay + StudioDrawNode",
    connection: "active-product",
    phases: ["live", "commit"],
    asynchronous: false,
    defaultAvailability: "ready",
    brushPixelAuthority: true,
    evidence: "StudioPage pins the live overlay and StudioDrawNode replays the retained contract.",
  },
  {
    id: "webgpu-live-causal-ink",
    implementation: "StudioWebGpuCanvas + studio-webgpu-live-stroke-plan",
    connection: "conditional-product",
    phases: ["live"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence: "StudioPage admits it only after rollout, device, plan and receipt gates.",
  },
  {
    id: "perfect-freehand-outline",
    implementation: "studio-perfect-freehand",
    connection: "active-product",
    phases: ["live", "commit", "settled"],
    asynchronous: false,
    defaultAvailability: "ready",
    brushPixelAuthority: true,
    evidence:
      "The outline stroker is statically ready before the first live frame and synchronous SVG export.",
  },
  {
    id: "canvas2d-material-specialist",
    implementation:
      "StudioDrawNode material branches + professional shelf connected ribbon carrier",
    connection: "active-product",
    phases: ["live", "commit"],
    asynchronous: false,
    defaultAvailability: "ready",
    brushPixelAuthority: true,
    evidence:
      "Calligraphy, highlighter, pencil, oil and FX retain dedicated planners; audited bristle, "
      + "filbert and palette-knife shelf presets share one causal connected-polygon plan across "
      + "live, retained Canvas and SVG export.",
  },
  {
    id: "canvas2d-dynamic-coverage",
    implementation: "studio-live-dynamic-brush-overlay + dynamic coverage renderer",
    connection: "active-product",
    phases: ["live", "commit"],
    asynchronous: false,
    defaultAvailability: "ready",
    brushPixelAuthority: true,
    evidence:
      "Core air/dry dynamics (including anisotropic pastel and oil-pastel fibres) and the full "
      + "procedural catalogue share deterministic causal dab settings.",
  },
  {
    id: "canvas2d-wet-field",
    implementation: "studio-live-wet-ink-overlay + studio-wet-ink-brush-runtime",
    connection: "implemented-unwired",
    phases: ["live", "commit"],
    asynchronous: false,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence:
      "The physical wet field exists, but the current product capability denies main-thread "
      + "admission; radial fallback is not an acceptable wet-media quality backend.",
  },
  {
    id: "canvas2d-wet-ribbon",
    implementation: "studio-wet-ribbon-carrier + retained Canvas/SVG adapters",
    connection: "active-product",
    phases: ["live", "commit"],
    asynchronous: false,
    defaultAvailability: "ready",
    brushPixelAuthority: true,
    evidence:
      "New causal watercolor and ink-wash strokes share one prefix-stable directional polygon "
      + "plan across retained live, committed Canvas and SVG export.",
  },
  {
    id: "canvas2d-stamp-pattern",
    implementation: "studio-live-stamp-overlay + retained stamp/tone renderers",
    connection: "active-product",
    phases: ["live", "commit"],
    asynchronous: false,
    defaultAvailability: "ready",
    brushPixelAuthority: true,
    evidence: "Stamp brushes, screentone and discrete catalogue tips retain seeded placement.",
  },
  {
    id: "deferred-raster-tool-preview",
    implementation: "StudioPage raster retouch cursor/gesture",
    connection: "active-product",
    phases: ["live"],
    asynchronous: false,
    defaultAvailability: "ready",
    brushPixelAuthority: false,
    evidence: "Smudge/wet-mix preview is intentionally non-authoritative until transaction commit.",
  },
  {
    id: "pixel-edit-worker",
    implementation: "studio-pixel-edit-brush-runtime + smudge/wet-mix workers",
    connection: "active-product",
    phases: ["commit"],
    asynchronous: true,
    defaultAvailability: "loading",
    brushPixelAuthority: true,
    evidence: "Raster mixer operations lazy-load and commit one bounded image transaction.",
  },
  {
    id: "canonical-webgpu-analytic",
    implementation: "canonical plan + analytic WebGPU lowering/controller",
    connection: "implemented-unwired",
    phases: ["live", "commit"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence: "The future/durable controllers are not imported by the normal Studio brush shelf.",
  },
  {
    id: "canonical-webgpu-textured",
    implementation:
      "StudioCanonicalVNextDryMediaCanvas + textured-brush runtime + receipt-gated presentation controller",
    connection: "conditional-product",
    phases: ["live", "commit", "settled"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence:
      "The normal Studio viewport conditionally promotes one selected, top-most, unclipped "
      + "dry-media DrawEl to the shared RGBA16F surface only after exact final-live/commit and "
      + "presentation receipts. Konva remains an atomic recoverable fallback; pointer-live "
      + "drawing and the default shelf are not yet routed through this specialist.",
  },
  {
    id: "canonical-webgpu-wet-specialist",
    implementation: "vNext wet-media specialist capability",
    connection: "implemented-unwired",
    phases: ["live", "commit"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence: "Canonical wet recipes are defined; product submission remains on the wet field path.",
  },
  {
    id: "professional-bristle-webgpu",
    implementation: "studio-professional-bristle-webgpu-lowering",
    connection: "implemented-unwired",
    phases: ["live", "commit"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence: "The specialist lowerer is tested but not selected by the normal brush shelf.",
  },
  {
    id: "fiber-bristle-worker",
    implementation: "studio-fiber-bristle-brush-provider/worker",
    connection: "implemented-unwired",
    phases: ["live", "commit"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence: "The individual-fiber oracle is independent and has no StudioPage stroke consumer.",
  },
  {
    id: "physics-particle-worker",
    implementation: "studio-physics-particle-brush-provider/worker",
    connection: "implemented-unwired",
    phases: ["live", "commit"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: true,
    evidence: "The particle oracle is independent and has no normal shelf stroke consumer.",
  },
  {
    id: "procedural-artistic-worker",
    implementation: "studio-procedural-artistic-brush-product",
    connection: "active-layer-generator",
    phases: ["layer-generator"],
    asynchronous: true,
    defaultAvailability: "loading",
    brushPixelAuthority: false,
    evidence: "The inspector generates a bounded PNG layer; it does not replay a live vector stroke.",
  },
  {
    id: "p5-webgl-artistic",
    implementation: "studio-p5-brush-standalone-runtime-adapter",
    connection: "active-layer-generator",
    phases: ["layer-generator"],
    asynchronous: true,
    defaultAvailability: "loading",
    brushPixelAuthority: false,
    evidence: "p5.brush is isolated behind the procedural artistic Worker adapter.",
  },
  {
    id: "paper-vector-refinement",
    implementation: "studio-paper-vector-refinement worker",
    connection: "active-settled-tool",
    phases: ["settled"],
    asynchronous: true,
    defaultAvailability: "loading",
    brushPixelAuthority: false,
    evidence: "StudioPage exposes explicit simplify/smooth operations after a vector is selected.",
  },
  {
    id: "canvaskit-path-specialist",
    implementation: "studio-canvaskit-quality-engine/worker",
    connection: "implemented-unwired",
    phases: ["settled"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: false,
    evidence: "Skia path ops exist behind a Worker, but no normal brush stroke consumer imports them.",
  },
  {
    id: "hokusai-myb-worker",
    implementation:
      "installed studio-hokusai-wasm with exact Hokusai 0.3.0 crates and a packed dirty-frame Dedicated Worker",
    connection: "active-product",
    phases: ["live", "commit", "settled"],
    asynchronous: true,
    defaultAvailability: "loading",
    brushPixelAuthority: true,
    evidence:
      "StudioPage and StudioCanvasViewport automatically route the 19 verified pencil, charcoal "
      + "and oil identities through the prewarmed packed-dirty provider. StudioKonvaImageNode "
      + "holds canonical PNG commit ownership until its hash-keyed drawScene receipt; the prior "
      + "runtime-stroke-boundary path remains the atomic failure fallback.",
  },
  {
    id: "vnext-provider-router",
    implementation: "studio-engine-vnext-brush-provider-router",
    connection: "implemented-unwired",
    phases: ["routing"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: false,
    evidence: "The capability router is infrastructure, not a renderer or current shelf authority.",
  },
  {
    id: "pixi-scene-overlay",
    implementation: "studio-pixi-scene-provider",
    connection: "not-a-brush-backend",
    phases: ["scene-overlay"],
    asynchronous: true,
    defaultAvailability: "unavailable",
    brushPixelAuthority: false,
    evidence: "Pixi owns a pointer-inactive selectable overlay and must never rasterize brush paint.",
  },
]);

export type StudioBrushBackendForbiddenFallback =
  | "generic-round-circle-carrier"
  | "cross-family-round-dab"
  | "silent-backend-substitution"
  | "unversioned-async-placeholder"
  | "live-only-approximation"
  | "pixi-scene-as-brush-authority";

export interface StudioBrushBackendFamilyPolicy {
  readonly family: StudioBrushBackendQualityFamily;
  readonly allowedPrimaryBackends: readonly StudioBrushBackendId[];
  readonly allowedSettledEnhancers: readonly StudioBrushBackendId[];
  readonly forbiddenFallbacks: readonly StudioBrushBackendForbiddenFallback[];
  readonly parity: Readonly<{
    readonly requirement: "explicit-live-commit-pair";
    readonly source: "same-authoritative-samples";
    readonly recipe: "same-versioned-recipe";
    readonly seed: "same-persisted-seed";
    readonly handoff: "receipt-before-authority-switch";
  }>;
  readonly unavailablePolicy: Readonly<{
    readonly behavior: "fail-closed";
    readonly preserveExistingSurface: true;
    readonly emitApproximation: false;
  }>;
}

const COMMON_FORBIDDEN: readonly StudioBrushBackendForbiddenFallback[] = [
  "silent-backend-substitution",
  "unversioned-async-placeholder",
  "live-only-approximation",
  "pixi-scene-as-brush-authority",
];

function familyPolicy(
  family: StudioBrushBackendQualityFamily,
  allowedPrimaryBackends: readonly StudioBrushBackendId[],
  allowedSettledEnhancers: readonly StudioBrushBackendId[],
  forbiddenFallbacks: readonly StudioBrushBackendForbiddenFallback[],
): StudioBrushBackendFamilyPolicy {
  return Object.freeze({
    family,
    allowedPrimaryBackends: Object.freeze([...allowedPrimaryBackends]),
    allowedSettledEnhancers: Object.freeze([...allowedSettledEnhancers]),
    forbiddenFallbacks: Object.freeze([...forbiddenFallbacks]),
    parity: Object.freeze({
      requirement: "explicit-live-commit-pair",
      source: "same-authoritative-samples",
      recipe: "same-versioned-recipe",
      seed: "same-persisted-seed",
      handoff: "receipt-before-authority-switch",
    }),
    unavailablePolicy: Object.freeze({
      behavior: "fail-closed",
      preserveExistingSurface: true,
      emitApproximation: false,
    }),
  });
}

export const STUDIO_BRUSH_BACKEND_FAMILY_POLICIES:
Readonly<Record<StudioBrushBackendQualityFamily, StudioBrushBackendFamilyPolicy>> =
  Object.freeze({
    "continuous-ink": familyPolicy(
      "continuous-ink",
      [
        "canvas2d-causal-ink",
        "webgpu-live-causal-ink",
        "perfect-freehand-outline",
        "canvas2d-material-specialist",
        "canvas2d-dynamic-coverage",
        "canvas2d-stamp-pattern",
        "canonical-webgpu-analytic",
        "canonical-webgpu-textured",
        "hokusai-myb-worker",
      ],
      ["paper-vector-refinement", "canvaskit-path-specialist"],
      COMMON_FORBIDDEN,
    ),
    "dry-media": familyPolicy(
      "dry-media",
      [
        "canvas2d-material-specialist",
        "canvas2d-dynamic-coverage",
        "canvas2d-stamp-pattern",
        "canonical-webgpu-textured",
        "professional-bristle-webgpu",
        "fiber-bristle-worker",
        "hokusai-myb-worker",
      ],
      ["hokusai-myb-worker"],
      ["generic-round-circle-carrier", "cross-family-round-dab", ...COMMON_FORBIDDEN],
    ),
    "wet-media": familyPolicy(
      "wet-media",
      [
        "canvas2d-material-specialist",
        "canvas2d-dynamic-coverage",
        "canvas2d-wet-ribbon",
        "canvas2d-stamp-pattern",
        "canonical-webgpu-textured",
        "canonical-webgpu-wet-specialist",
        "professional-bristle-webgpu",
        "fiber-bristle-worker",
        "hokusai-myb-worker",
      ],
      ["hokusai-myb-worker"],
      ["generic-round-circle-carrier", "cross-family-round-dab", ...COMMON_FORBIDDEN],
    ),
    "spray-particle": familyPolicy(
      "spray-particle",
      [
        "canvas2d-material-specialist",
        "canvas2d-dynamic-coverage",
        "canvas2d-stamp-pattern",
        "canonical-webgpu-textured",
        "physics-particle-worker",
      ],
      [],
      ["cross-family-round-dab", ...COMMON_FORBIDDEN],
    ),
    "stamp-pattern": familyPolicy(
      "stamp-pattern",
      [
        "canvas2d-dynamic-coverage",
        "canvas2d-stamp-pattern",
        "canonical-webgpu-textured",
      ],
      [],
      [
        "generic-round-circle-carrier",
        "cross-family-round-dab",
        ...COMMON_FORBIDDEN,
      ],
    ),
    "eraser-mixer": familyPolicy(
      "eraser-mixer",
      [
        "canvas2d-causal-ink",
        "webgpu-live-causal-ink",
        "deferred-raster-tool-preview",
        "pixel-edit-worker",
        "canonical-webgpu-analytic",
      ],
      [],
      COMMON_FORBIDDEN,
    ),
  });

export type StudioBrushBackendRouteProfile =
  | "continuous-analytic"
  | "continuous-outline"
  | "continuous-specialist"
  | "continuous-stamp"
  | "continuous-catalog-dynamics"
  | "dry-specialist"
  | "dry-dynamics"
  | "dry-stamp"
  | "wet-field"
  | "wet-specialist"
  | "wet-dynamics"
  | "wet-stamp"
  | "spray-specialist"
  | "spray-dynamics"
  | "spray-stamp"
  | "stamp-specialist"
  | "stamp-catalog-dynamics"
  | "eraser"
  | "mixer";

export interface StudioBrushBackendRouteCandidate {
  readonly live: StudioBrushBackendId;
  readonly commit: StudioBrushBackendId;
  readonly semanticContract: string;
}

function candidates(
  ...items: readonly StudioBrushBackendRouteCandidate[]
): readonly StudioBrushBackendRouteCandidate[] {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

export const STUDIO_BRUSH_BACKEND_ROUTE_CANDIDATES:
Readonly<Record<StudioBrushBackendRouteProfile, readonly StudioBrushBackendRouteCandidate[]>> =
  Object.freeze({
    "continuous-analytic": candidates(
      {
        live: "webgpu-live-causal-ink",
        commit: "canvas2d-causal-ink",
        semanticContract: "causal-ink-residual-v3",
      },
      {
        live: "canvas2d-causal-ink",
        commit: "canvas2d-causal-ink",
        semanticContract: "causal-ink-residual-v3",
      },
      {
        live: "canonical-webgpu-analytic",
        commit: "canonical-webgpu-analytic",
        semanticContract: "canonical-analytic-v1",
      },
    ),
    "continuous-outline": candidates({
      live: "perfect-freehand-outline",
      commit: "perfect-freehand-outline",
      semanticContract: "perfect-outline-profile-v1",
    }),
    "continuous-specialist": candidates({
      live: "canvas2d-material-specialist",
      commit: "canvas2d-material-specialist",
      semanticContract: "retained-material-specialist-v1",
    }),
    "continuous-stamp": candidates({
      live: "canvas2d-stamp-pattern",
      commit: "canvas2d-stamp-pattern",
      semanticContract: "causal-stamp-walker-v2",
    }),
    "continuous-catalog-dynamics": candidates(
      {
        live: "canonical-webgpu-textured",
        commit: "canonical-webgpu-textured",
        semanticContract: "canonical-textured-dynamics-v1",
      },
      {
        live: "canvas2d-dynamic-coverage",
        commit: "canvas2d-dynamic-coverage",
        semanticContract: "dynamic-coverage-v3",
      },
    ),
    "dry-specialist": candidates(
      {
        live: "professional-bristle-webgpu",
        commit: "professional-bristle-webgpu",
        semanticContract: "professional-dry-bristle-v1",
      },
      {
        live: "fiber-bristle-worker",
        commit: "fiber-bristle-worker",
        semanticContract: "individual-fiber-dry-v1",
      },
      {
        live: "canvas2d-material-specialist",
        commit: "canvas2d-material-specialist",
        semanticContract: "retained-dry-material-v1",
      },
    ),
    "dry-dynamics": candidates(
      {
        live: "canonical-webgpu-textured",
        commit: "canonical-webgpu-textured",
        semanticContract: "canonical-dry-texture-v1",
      },
      {
        live: "canvas2d-dynamic-coverage",
        commit: "canvas2d-dynamic-coverage",
        semanticContract: "dynamic-dry-coverage-v3",
      },
    ),
    "dry-stamp": candidates({
      live: "canvas2d-stamp-pattern",
      commit: "canvas2d-stamp-pattern",
      semanticContract: "seeded-dry-stamp-v2",
    }),
    "wet-field": candidates(
      {
        live: "canonical-webgpu-wet-specialist",
        commit: "canonical-webgpu-wet-specialist",
        semanticContract: "canonical-pigment-water-v1",
      },
      {
        live: "canvas2d-wet-ribbon",
        commit: "canvas2d-wet-ribbon",
        semanticContract: "wet-ribbon-carrier-v2",
      },
    ),
    "wet-specialist": candidates(
      {
        live: "professional-bristle-webgpu",
        commit: "professional-bristle-webgpu",
        semanticContract: "professional-loaded-bristle-v1",
      },
      {
        live: "fiber-bristle-worker",
        commit: "fiber-bristle-worker",
        semanticContract: "individual-fiber-wet-v1",
      },
      {
        live: "canvas2d-material-specialist",
        commit: "canvas2d-material-specialist",
        semanticContract: "retained-wet-material-v1",
      },
    ),
    "wet-dynamics": candidates(
      {
        live: "canonical-webgpu-textured",
        commit: "canonical-webgpu-textured",
        semanticContract: "canonical-wet-texture-v1",
      },
      {
        live: "canvas2d-dynamic-coverage",
        commit: "canvas2d-dynamic-coverage",
        semanticContract: "dynamic-wet-coverage-v3",
      },
    ),
    "wet-stamp": candidates({
      live: "canvas2d-stamp-pattern",
      commit: "canvas2d-stamp-pattern",
      semanticContract: "seeded-wet-stamp-v2",
    }),
    "spray-specialist": candidates(
      {
        live: "physics-particle-worker",
        commit: "physics-particle-worker",
        semanticContract: "physics-particle-v1",
      },
      {
        live: "canvas2d-material-specialist",
        commit: "canvas2d-material-specialist",
        semanticContract: "retained-fx-particle-v1",
      },
    ),
    "spray-dynamics": candidates(
      {
        live: "canonical-webgpu-textured",
        commit: "canonical-webgpu-textured",
        semanticContract: "canonical-particle-texture-v1",
      },
      {
        live: "canvas2d-dynamic-coverage",
        commit: "canvas2d-dynamic-coverage",
        semanticContract: "dynamic-particle-coverage-v3",
      },
    ),
    "spray-stamp": candidates({
      live: "canvas2d-stamp-pattern",
      commit: "canvas2d-stamp-pattern",
      semanticContract: "seeded-spray-stamp-v2",
    }),
    "stamp-specialist": candidates({
      live: "canvas2d-stamp-pattern",
      commit: "canvas2d-stamp-pattern",
      semanticContract: "document-aligned-pattern-v1",
    }),
    "stamp-catalog-dynamics": candidates(
      {
        live: "canonical-webgpu-textured",
        commit: "canonical-webgpu-textured",
        semanticContract: "canonical-discrete-texture-v1",
      },
      {
        live: "canvas2d-dynamic-coverage",
        commit: "canvas2d-dynamic-coverage",
        semanticContract: "dynamic-discrete-coverage-v3",
      },
    ),
    eraser: candidates(
      {
        live: "webgpu-live-causal-ink",
        commit: "canvas2d-causal-ink",
        semanticContract: "destination-out-causal-v3",
      },
      {
        live: "canvas2d-causal-ink",
        commit: "canvas2d-causal-ink",
        semanticContract: "destination-out-causal-v3",
      },
      {
        live: "canonical-webgpu-analytic",
        commit: "canonical-webgpu-analytic",
        semanticContract: "canonical-destination-out-v1",
      },
    ),
    mixer: candidates({
      live: "deferred-raster-tool-preview",
      commit: "pixel-edit-worker",
      semanticContract: "raster-mix-transaction-v1",
    }),
  });

const CORE_ROUTE_PROFILE_BY_ID = Object.freeze({
  pen: "continuous-analytic",
  fineliner: "continuous-analytic",
  ballpoint: "continuous-analytic",
  "gel-pen": "continuous-analytic",
  "glass-pen": "continuous-analytic",
  "ruling-pen": "continuous-analytic",
  "technical-pen": "continuous-analytic",
  gpen: "continuous-outline",
  "school-pen": "continuous-outline",
  "maru-pen": "continuous-outline",
  "mapping-pen": "continuous-outline",
  kaburapen: "continuous-outline",
  liner: "continuous-outline",
  "ink-brush": "continuous-stamp",
  calligraphy: "continuous-specialist",
  "fountain-pen": "continuous-specialist",
  "parallel-pen": "continuous-specialist",
  "brush-pen": "continuous-specialist",
  "perfect-ink": "continuous-outline",
  "perfect-marker": "continuous-outline",
  "kneaded-eraser": "continuous-analytic",
  marker: "continuous-analytic",
  "felt-tip": "continuous-analytic",
  "marker-bold": "continuous-analytic",
  "alcohol-marker": "continuous-analytic",
  highlighter: "continuous-specialist",
  "chisel-highlighter": "continuous-specialist",
  "pastel-highlighter": "continuous-specialist",
  neon: "spray-specialist",
  glow: "spray-specialist",
  "soft-glow": "spray-specialist",
  glitter: "spray-specialist",
  "star-dust": "spray-specialist",
  "sparkle-star": "spray-specialist",
  brush: "wet-specialist",
  "flat-brush": "wet-specialist",
  watercolor: "wet-field",
  "ink-wash": "wet-field",
  "inkwash-pen": "wet-field",
  "inkwash-water-brush": "wet-field",
  "inkwash-bleed-wash": "wet-field",
  "inkwash-white-ink": "wet-field",
  gouache: "wet-specialist",
  oil: "wet-specialist",
  acrylic: "wet-specialist",
  "paint-tube": "wet-specialist",
  airbrush: "spray-dynamics",
  "hard-airbrush": "spray-dynamics",
  "airbrush-fine": "spray-stamp",
  "wash-brush": "wet-stamp",
  "soft-brush": "spray-dynamics",
  spray: "spray-dynamics",
  splatter: "spray-dynamics",
  pencil: "dry-specialist",
  "erodible-pencil": "dry-dynamics",
  "pencil-2b": "dry-specialist",
  "pencil-6b": "dry-specialist",
  "soft-pencil": "dry-specialist",
  "pencil-grain": "dry-stamp",
  "colored-pencil": "dry-specialist",
  "dry-media": "dry-dynamics",
  crayon: "dry-dynamics",
  chalk: "dry-dynamics",
  charcoal: "dry-dynamics",
  pastel: "dry-dynamics",
  "oil-pastel": "dry-dynamics",
  "ink-particle": "spray-dynamics",
  "tangent-normal-brush": "continuous-catalog-dynamics",
  screentone: "stamp-specialist",
  crosshatch: "stamp-specialist",
} as const satisfies Readonly<Record<
  StudioBrushRuntimePresetId,
  StudioBrushBackendRouteProfile
>>);

export const STUDIO_CORE_BRUSH_BACKEND_ROUTE_PROFILES:
Readonly<Record<StudioBrushRuntimePresetId, StudioBrushBackendRouteProfile>> =
  CORE_ROUTE_PROFILE_BY_ID;

function familyForProfile(
  profile: StudioBrushBackendRouteProfile,
): StudioBrushBackendQualityFamily {
  if (profile.startsWith("continuous-")) return "continuous-ink";
  if (profile.startsWith("dry-")) return "dry-media";
  if (profile.startsWith("wet-")) return "wet-media";
  if (profile.startsWith("spray-")) return "spray-particle";
  if (profile.startsWith("stamp-")) return "stamp-pattern";
  return "eraser-mixer";
}

function proProfileForCategory(
  category: StudioBrushPackCategory,
): StudioBrushBackendRouteProfile {
  switch (category) {
    case "ink":
    case "flat":
    case "marker":
      return "continuous-catalog-dynamics";
    case "sketch":
    case "chalk":
    case "texture":
    case "rake":
      return "dry-dynamics";
    case "paint":
      return "wet-dynamics";
    case "foliage":
    case "effect":
      return "spray-dynamics";
    case "pattern":
    case "stamp":
    case "pixel":
    case "tone":
      return "stamp-catalog-dynamics";
  }
}

const PRO_SPECIALIST_ROUTE_PROFILE_BY_ID = Object.freeze({
  "bristle-round-loaded": "wet-specialist",
  "bristle-fan-dry": "dry-specialist",
  "bristle-flat-streak": "wet-specialist",
  "oil-filbert": "wet-specialist",
  "palette-knife-edge": "wet-specialist",
} as const satisfies Readonly<Record<string, StudioBrushBackendRouteProfile>>);

export interface StudioBrushBackendQualityIdentity {
  readonly source: "core" | "pro" | "tool";
  readonly catalogId: string;
  readonly runtimeBrushId: string;
  readonly family: StudioBrushBackendQualityFamily;
  readonly routeProfile: StudioBrushBackendRouteProfile;
}

export type StudioBrushBackendQualityClassification =
  | Readonly<{
      status: "classified";
      identity: StudioBrushBackendQualityIdentity;
      policy: StudioBrushBackendFamilyPolicy;
    }>
  | Readonly<{
      status: "rejected";
      reason: "invalid-operation" | "unknown-brush" | "identity-mismatch";
    }>;

export interface StudioBrushBackendQualityClassificationInput {
  readonly operation?: unknown;
  readonly brushId?: unknown;
  readonly catalogId?: unknown;
}

function normalizeOperation(
  operation: unknown,
): StudioBrushBackendQualityOperation | null {
  if (operation === undefined || operation === "paint") return "paint";
  if (operation === "erase" || operation === "mix") return operation;
  return null;
}

function classified(
  identity: StudioBrushBackendQualityIdentity,
): StudioBrushBackendQualityClassification {
  return Object.freeze({
    status: "classified",
    identity: Object.freeze({ ...identity }),
    policy: STUDIO_BRUSH_BACKEND_FAMILY_POLICIES[identity.family],
  });
}

export function classifyStudioBrushBackendQuality(
  input: StudioBrushBackendQualityClassificationInput,
): StudioBrushBackendQualityClassification {
  const operation = normalizeOperation(input.operation);
  if (!operation) return { status: "rejected", reason: "invalid-operation" };
  if (operation !== "paint") {
    const routeProfile = operation === "erase" ? "eraser" : "mixer";
    return classified({
      source: "tool",
      catalogId: operation,
      runtimeBrushId: operation,
      family: "eraser-mixer",
      routeProfile,
    });
  }

  const catalogId = typeof input.catalogId === "string" ? input.catalogId : null;
  const brushId = typeof input.brushId === "string" ? input.brushId : null;
  const proDescriptor =
    studioBrushPackDescriptorById(catalogId)
    ?? studioBrushPackDescriptorById(brushId);
  if (proDescriptor) {
    if (
      catalogId !== null
      && catalogId !== proDescriptor.catalogId
    ) {
      return { status: "rejected", reason: "identity-mismatch" };
    }
    if (
      brushId !== null
      && brushId !== proDescriptor.catalogId
      && brushId !== proDescriptor.runtimeBrushId
    ) {
      return { status: "rejected", reason: "identity-mismatch" };
    }
    const routeProfile =
      PRO_SPECIALIST_ROUTE_PROFILE_BY_ID[
        proDescriptor.catalogId as keyof typeof PRO_SPECIALIST_ROUTE_PROFILE_BY_ID
      ]
      ?? proProfileForCategory(proDescriptor.category);
    const family = familyForProfile(routeProfile);
    return classified({
      source: "pro",
      catalogId: proDescriptor.catalogId,
      runtimeBrushId: proDescriptor.runtimeBrushId,
      family,
      routeProfile,
    });
  }

  const resolvedCoreId =
    catalogId && catalogId in CORE_ROUTE_PROFILE_BY_ID
      ? catalogId as StudioBrushRuntimePresetId
      : brushId && brushId in CORE_ROUTE_PROFILE_BY_ID
        ? brushId as StudioBrushRuntimePresetId
        : null;
  if (resolvedCoreId) {
    if (
      (catalogId !== null && catalogId !== resolvedCoreId)
      || (brushId !== null && brushId !== resolvedCoreId)
    ) {
      return { status: "rejected", reason: "identity-mismatch" };
    }
    const routeProfile = CORE_ROUTE_PROFILE_BY_ID[resolvedCoreId];
    return classified({
      source: "core",
      catalogId: resolvedCoreId,
      runtimeBrushId: resolvedCoreId,
      family: familyForProfile(routeProfile),
      routeProfile,
    });
  }

  if (brushId === STUDIO_PIXEL_PENCIL_RENDER_MODE && catalogId === null) {
    return classified({
      source: "core",
      catalogId: STUDIO_PIXEL_PENCIL_RENDER_MODE,
      runtimeBrushId: STUDIO_PIXEL_PENCIL_RENDER_MODE,
      family: "stamp-pattern",
      routeProfile: "stamp-specialist",
    });
  }
  return { status: "rejected", reason: "unknown-brush" };
}

export interface StudioBrushBackendQualityRouteInput
  extends StudioBrushBackendQualityClassificationInput {
  readonly availability?: Readonly<Partial<
    Record<StudioBrushBackendId, StudioBrushBackendAvailability>
  >>;
  readonly naturalMediaProviderOptIn?: StudioHokusaiMybProviderOptIn | null;
}

export type StudioBrushBackendQualityRouteResult =
  | Readonly<{
      status: "ready";
      identity: StudioBrushBackendQualityIdentity;
      policy: StudioBrushBackendFamilyPolicy;
      liveBackend: StudioBrushBackendId;
      commitBackend: StudioBrushBackendId;
      semanticContract: string;
      parity: StudioBrushBackendFamilyPolicy["parity"];
      settledEnhancer?: "hokusai-myb-worker";
      providerOptInMode?: "live" | "settled";
    }>
  | Readonly<{
      status: "pending";
      reason: "backend-loading";
      identity: StudioBrushBackendQualityIdentity;
      policy: StudioBrushBackendFamilyPolicy;
      preserveExistingSurface: true;
      emitApproximation: false;
    }>
  | Readonly<{
      status: "rejected";
      reason:
        | "invalid-operation"
        | "unknown-brush"
        | "identity-mismatch"
        | "backend-unavailable"
        | "provider-family-ineligible"
        | "provider-opt-in-invalid";
      identity?: StudioBrushBackendQualityIdentity;
      policy?: StudioBrushBackendFamilyPolicy;
      preserveExistingSurface: true;
      emitApproximation: false;
    }>;

const BACKEND_AUDIT_BY_ID: ReadonlyMap<
  StudioBrushBackendId,
  StudioBrushBackendIntegrationAudit
> = new Map(STUDIO_BRUSH_BACKEND_INTEGRATION_AUDIT.map((entry) => [entry.id, entry]));

function availabilityOf(
  id: StudioBrushBackendId,
  availability: StudioBrushBackendQualityRouteInput["availability"],
): StudioBrushBackendAvailability {
  const explicit = availability?.[id];
  if (
    explicit === "ready"
    || explicit === "loading"
    || explicit === "unavailable"
    || explicit === "failed"
  ) {
    return explicit;
  }
  return BACKEND_AUDIT_BY_ID.get(id)?.defaultAvailability ?? "unavailable";
}

function candidateAllowed(
  candidate: StudioBrushBackendRouteCandidate,
  policy: StudioBrushBackendFamilyPolicy,
): boolean {
  if (
    !policy.allowedPrimaryBackends.includes(candidate.live)
    || !policy.allowedPrimaryBackends.includes(candidate.commit)
  ) {
    return false;
  }
  const live = BACKEND_AUDIT_BY_ID.get(candidate.live);
  const commit = BACKEND_AUDIT_BY_ID.get(candidate.commit);
  const liveCanPreviewWithoutOwningPixels =
    candidate.live === "deferred-raster-tool-preview"
    && live?.brushPixelAuthority === false;
  return Boolean(
    (live?.brushPixelAuthority || liveCanPreviewWithoutOwningPixels)
    && commit?.brushPixelAuthority
    && live.phases.includes("live")
    && commit.phases.includes("commit"),
  );
}

function validHokusaiProviderOptIn(
  value: StudioHokusaiMybProviderOptIn,
): boolean {
  if (
    value.backendId !== STUDIO_HOKUSAI_MYB_PROVIDER_POLICY.backendId
    || value.engineVersion !== STUDIO_HOKUSAI_MYB_PROVIDER_POLICY.exactVersion
    || value.adapterVersion !== STUDIO_HOKUSAI_MYB_PROVIDER_POLICY.adapterVersion
    || value.customBinding !== STUDIO_HOKUSAI_MYB_PROVIDER_POLICY.customBinding
    || value.surfaceContract
      !== STUDIO_HOKUSAI_MYB_PROVIDER_POLICY.surface.transferFormat
  ) {
    return false;
  }
  if (value.mode === "settled") return true;
  return value.mode === "live"
    && value.liveAdapterVersion === STUDIO_HOKUSAI_LIVE_ADAPTER_VERSION
    && value.protocolVersion === STUDIO_HOKUSAI_LIVE_BRUSH_PROTOCOL_VERSION
    && value.admission.prewarmedAtStrokeStart === true
    && value.admission.packedDirtyTransfer === true
    && value.admission.singleInFlightFrame === true
    && value.admission.stalePresentationCoalesced === true
    && value.admission.inputSamplesPreserved === true
    && value.admission.epochCancellation === true
    && value.admission.canonicalPng === true
    && value.admission.exactLiveCommitParity === true
    && value.admission.midStrokePromotion === false;
}

export function resolveStudioBrushBackendQualityRoute(
  input: StudioBrushBackendQualityRouteInput,
): StudioBrushBackendQualityRouteResult {
  const classification = classifyStudioBrushBackendQuality(input);
  if (classification.status === "rejected") {
    return {
      status: "rejected",
      reason: classification.reason,
      preserveExistingSurface: true,
      emitApproximation: false,
    };
  }
  const { identity, policy } = classification;
  const naturalMediaOptIn = input.naturalMediaProviderOptIn ?? null;
  let settledEnhancer: "hokusai-myb-worker" | undefined;
  if (naturalMediaOptIn !== null) {
    if (!validHokusaiProviderOptIn(naturalMediaOptIn)) {
      return {
        status: "rejected",
        reason: "provider-opt-in-invalid",
        identity,
        policy,
        preserveExistingSurface: true,
        emitApproximation: false,
      };
    }
    if (
      !STUDIO_HOKUSAI_MYB_PROVIDER_POLICY.eligibleFamilies.some(
        (family) => family === identity.family,
      )
      || (
        identity.family === "continuous-ink"
        && !resolveStudioHokusaiLivePreset(
          identity.runtimeBrushId,
          identity.catalogId,
        )
      )
    ) {
      return {
        status: "rejected",
        reason: "provider-family-ineligible",
        identity,
        policy,
        preserveExistingSurface: true,
        emitApproximation: false,
      };
    }
    const providerAvailability = availabilityOf(
      naturalMediaOptIn.backendId,
      input.availability,
    );
    if (providerAvailability === "loading") {
      return {
        status: "pending",
        reason: "backend-loading",
        identity,
        policy,
        preserveExistingSurface: true,
        emitApproximation: false,
      };
    }
    if (providerAvailability !== "ready") {
      return {
        status: "rejected",
        reason: "backend-unavailable",
        identity,
        policy,
        preserveExistingSurface: true,
        emitApproximation: false,
      };
    }
    if (naturalMediaOptIn.mode === "live") {
      if (!resolveStudioHokusaiLivePreset(
        identity.runtimeBrushId,
        identity.catalogId,
      )) {
        return {
          status: "rejected",
          reason: "provider-family-ineligible",
          identity,
          policy,
          preserveExistingSurface: true,
          emitApproximation: false,
        };
      }
      return Object.freeze({
        status: "ready",
        identity,
        policy,
        liveBackend: "hokusai-myb-worker",
        commitBackend: "hokusai-myb-worker",
        semanticContract: "hokusai-live-canonical-v1",
        parity: policy.parity,
        providerOptInMode: "live" as const,
      });
    }
    settledEnhancer = naturalMediaOptIn.backendId;
  }
  const routeCandidates = STUDIO_BRUSH_BACKEND_ROUTE_CANDIDATES[identity.routeProfile];
  let hasLoadingCandidate = false;
  for (const candidate of routeCandidates) {
    if (!candidateAllowed(candidate, policy)) continue;
    const liveAvailability = availabilityOf(candidate.live, input.availability);
    const commitAvailability = availabilityOf(candidate.commit, input.availability);
    if (liveAvailability === "ready" && commitAvailability === "ready") {
      return Object.freeze({
        status: "ready",
        identity,
        policy,
        liveBackend: candidate.live,
        commitBackend: candidate.commit,
        semanticContract: candidate.semanticContract,
        parity: policy.parity,
        ...(settledEnhancer === undefined
          ? {}
          : {
              settledEnhancer,
              providerOptInMode: "settled" as const,
            }),
      });
    }
    if (liveAvailability === "loading" || commitAvailability === "loading") {
      hasLoadingCandidate = true;
    }
  }
  if (hasLoadingCandidate) {
    return {
      status: "pending",
      reason: "backend-loading",
      identity,
      policy,
      preserveExistingSurface: true,
      emitApproximation: false,
    };
  }
  return {
    status: "rejected",
    reason: "backend-unavailable",
    identity,
    policy,
    preserveExistingSurface: true,
    emitApproximation: false,
  };
}

/** Core runtime inventory used by policy-audit tests without duplicating the source catalogue. */
export function listStudioCoreBrushBackendQualityIds(): readonly string[] {
  return STUDIO_BRUSH_RUNTIME_CONTRACT.map((contract) => contract.id);
}
