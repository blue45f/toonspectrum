import {
  probeStudioCapabilitySnapshot,
  studioCapabilityProbeInputFromGlobals,
} from "./studio-capability-probe";

import {
  CREATOR_MARKETPLACE_RESOURCE_ENGINES,
  type CreatorMarketplaceResourceEngine,
} from "@/lib/creator-marketplace-resource-contract";

/**
 * Marketplace manifests target this Studio compatibility contract, not the npm application
 * version. Keep this value source-controlled and advance it only when the install/runtime
 * contract changes; package.json is currently a pre-release product version and is not an
 * authority for marketplace compatibility.
 */
export const STUDIO_MARKETPLACE_COMPATIBILITY_VERSION = "1.0.0" as const;

type CanvasContextId = "2d" | "webgl2";

export interface StudioMarketplaceRuntimeCompatibilityContext {
  readonly currentStudioVersion: typeof STUDIO_MARKETPLACE_COMPATIBILITY_VERSION;
  readonly supportedEngines: readonly CreatorMarketplaceResourceEngine[] | null;
}

export interface StudioMarketplaceRuntimeCompatibilityProbeOptions {
  /** `null` means this environment cannot measure the context, not that the engine failed. */
  readonly probeCanvasContext?: (contextId: CanvasContextId) => boolean | null;
  /** `null` means WebGPU was not measurable in this environment. */
  readonly probeWebGpuAdapter?: () => Promise<boolean | null>;
}

function probeCanvasContextFromGlobals(contextId: CanvasContextId): boolean | null {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext(contextId) !== null;
  } catch {
    // A sandbox or privacy policy can reject context creation. That is a measured unavailable
    // engine for the current document rather than a reason to guess from the user agent.
    return false;
  }
}

async function probeWebGpuAdapterFromGlobals(): Promise<boolean | null> {
  if (typeof navigator === "undefined") return null;
  const snapshot = await probeStudioCapabilitySnapshot(
    studioCapabilityProbeInputFromGlobals(),
  );
  if (snapshot.adapterAvailable) return true;
  // Missing APIs and an explicit null adapter are conclusive for this document. A timeout,
  // cancellation, or driver exception is not evidence that the device lacks WebGPU; keep the
  // whole engine snapshot unverified so a later Studio entry can retry instead of mislabelling it.
  return snapshot.probeFailure === "webgpu-api-unavailable"
    || snapshot.probeFailure === "adapter-unavailable"
    ? false
    : null;
}

/**
 * Builds the only product compatibility context accepted by community-marketplace projection.
 * Engines are admitted from actual context/adapter probes. `three` is admitted with WebGL2 because
 * the shipped Three runtime has a verified WebGL2 path; merely finding a global symbol or parsing a
 * browser name is intentionally insufficient.
 */
export async function probeStudioMarketplaceRuntimeCompatibility(
  options: StudioMarketplaceRuntimeCompatibilityProbeOptions = {},
): Promise<StudioMarketplaceRuntimeCompatibilityContext> {
  const probeCanvasContext = options.probeCanvasContext
    ?? probeCanvasContextFromGlobals;
  const probeWebGpuAdapter = options.probeWebGpuAdapter
    ?? probeWebGpuAdapterFromGlobals;

  const measuredSupport = new Set<CreatorMarketplaceResourceEngine>();
  let measuredEveryEngine = true;

  for (const contextId of ["2d", "webgl2"] as const) {
    let supported: boolean | null;
    try {
      supported = probeCanvasContext(contextId);
    } catch {
      supported = false;
    }
    if (supported === null) measuredEveryEngine = false;
    if (!supported) continue;
    if (contextId === "2d") {
      measuredSupport.add("canvas2d");
    } else {
      measuredSupport.add("webgl2");
      measuredSupport.add("three");
    }
  }

  try {
    const webGpuSupported = await probeWebGpuAdapter();
    if (webGpuSupported === null) measuredEveryEngine = false;
    if (webGpuSupported) measuredSupport.add("webgpu");
  } catch {
    // An injected or future probe may throw even though today's shared probe never does. Treat the
    // adapter state as unverified; a driver error is not proof that the engine is absent.
    measuredEveryEngine = false;
  }

  const supportedEngines = measuredEveryEngine
    ? Object.freeze(
      CREATOR_MARKETPLACE_RESOURCE_ENGINES.filter((engine) => measuredSupport.has(engine)),
    )
    : null;

  return Object.freeze({
    currentStudioVersion: STUDIO_MARKETPLACE_COMPATIBILITY_VERSION,
    supportedEngines,
  });
}

let productCompatibilityPromise:
  | Promise<StudioMarketplaceRuntimeCompatibilityContext>
  | null = null;

/** One adapter probe is shared by the panel and one-shot deep-link installer for this page load. */
export function getProductStudioMarketplaceRuntimeCompatibility(): Promise<
  StudioMarketplaceRuntimeCompatibilityContext
> {
  if (productCompatibilityPromise === null) {
    const probe = probeStudioMarketplaceRuntimeCompatibility();
    productCompatibilityPromise = probe;
    void probe.then((context) => {
      if (
        context.supportedEngines === null
        && productCompatibilityPromise === probe
      ) {
        productCompatibilityPromise = null;
      }
    });
  }
  return productCompatibilityPromise;
}
