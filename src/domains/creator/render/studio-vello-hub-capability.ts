export const STUDIO_VELLO_HUB_PRODUCT_CAPABILITY = Object.freeze({
  id: "studio-vello-hub-selection-overlay-v1",
  enabledByDefault: true,
  scope: "accelerated-selection-overlay",
  primarySurfaceOwnership: "exclusive-within-island",
  documentAuthority: false,
  inputAuthority: false,
  brushPixelAuthority: false,
  canonicalDocumentAuthority: false,
  maxCssDimension: 2_048,
  maxBackingPixelArea: 16_777_216,
  visualMismatchPctGate: 0.6,
  /** Per-scene, in-memory admission; this is not a product-wide provider promotion. */
  admissionMode: "scene-local-shadow-candidate",
  persistentWinnerStorage: false,
  productWidePromotionRequiresSoak: true,
});

export const STUDIO_VELLO_HYBRID_SPARSE_CANDIDATE = Object.freeze({
  id: "vello-hybrid-sparse-gpu",
  status: "unavailable-upstream-api" as const,
  eligible: false,
  reason:
    "Vello 0.9 exposes the Classic browser WebGPU renderer; sparse strips are "
    + "available only through the vello_cpu reference lane, not a Hybrid GPU backend.",
  promotionCondition:
    "Upstream or toon-vello must expose a browser Hybrid/Sparse GPU renderer "
    + "that passes the same SceneIR visual gate, device-loss and product-island tests.",
});

export interface StudioVelloHubCapabilityDecision {
  readonly enabled: boolean;
  readonly capabilityId: typeof STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.id;
  readonly scope: typeof STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.scope;
  readonly reason: "product-default" | "emergency-disabled" | "explicit-disabled";
}

interface StudioVelloHubGlobalFlags {
  readonly __TOONSPECTRUM_STUDIO_VELLO_HUB_DISABLED__?: boolean;
}

export function resolveStudioVelloHubProductCapability(options?: {
  readonly enabled?: boolean;
  readonly globalObject?: StudioVelloHubGlobalFlags;
}): StudioVelloHubCapabilityDecision {
  const globalObject = options?.globalObject
    ?? (globalThis as StudioVelloHubGlobalFlags);
  if (options?.enabled === false) {
    return {
      enabled: false,
      capabilityId: STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.id,
      scope: STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.scope,
      reason: "explicit-disabled",
    };
  }
  if (globalObject.__TOONSPECTRUM_STUDIO_VELLO_HUB_DISABLED__ === true) {
    return {
      enabled: false,
      capabilityId: STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.id,
      scope: STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.scope,
      reason: "emergency-disabled",
    };
  }
  return {
    enabled: true,
    capabilityId: STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.id,
    scope: STUDIO_VELLO_HUB_PRODUCT_CAPABILITY.scope,
    reason: "product-default",
  };
}
