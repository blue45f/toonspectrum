/**
 * Skia Graphite adoption probe (ADR 0017).
 *
 * "Graphite를 적극적으로 사용한다"를 활성화 한 단계짜리 스위치로 만든다: this probe answers, per
 * device and per build, whether the WebGPU-native Graphite provider can be selected by an
 * explicit evidence plan right now, and names the exact missing precondition when it cannot. Today the
 * blocking precondition is upstream: `canvaskit-wasm` ships the Ganesh (WebGL) backend only and
 * Skia does not publish a Graphite web artifact, so there is nothing to load — inventing a loader
 * here would be a placeholder claim, the thing the descriptor module explicitly forbids.
 *
 * The moment a Graphite-enabled CanvasKit build exists, `registerSkiaGraphiteArtifact` flips the
 * probe to `adoptable`. This only makes an exact Graphite selection possible; it does not grant a
 * runtime demotion path. A selected Graphite provider that later fails is unavailable until the
 * caller explicitly selects another provider for a new operation.
 */

export const SKIA_GRAPHITE_PROVIDER_ID = "skia-graphite-webgpu" as const;

export interface SkiaGraphiteArtifact {
  /** Loader for a Graphite-enabled CanvasKit build — NOT the Ganesh `canvaskit-wasm` npm. */
  readonly loadCanvasKit: () => Promise<unknown>;
  /** Exact upstream pin, required later by activation evidence (manifest governance). */
  readonly sourcePin: { readonly version: string; readonly commit: string };
}

let registeredArtifact: SkiaGraphiteArtifact | null = null;

/** Registers the Graphite build the app ships. Idempotent by replacement; test-clearable. */
export function registerSkiaGraphiteArtifact(artifact: SkiaGraphiteArtifact): void {
  registeredArtifact = artifact;
}

export function clearSkiaGraphiteArtifact(): void {
  registeredArtifact = null;
}

export type SkiaGraphiteAdoptionProbe =
  | { readonly status: "adoptable"; readonly artifact: SkiaGraphiteArtifact }
  | { readonly status: "missing-artifact"; readonly reason: string }
  | { readonly status: "no-adapter"; readonly reason: string }
  | { readonly status: "adapter-timeout"; readonly reason: string }
  | { readonly status: "no-webgpu"; readonly reason: string };

export interface SkiaGraphiteProbeEnvironment {
  readonly gpu?: unknown;
  /** Bound on the adapter request. Matches the product capability probe's default. */
  readonly timeoutMs?: number;
  readonly signal?: {
    aborted: boolean;
    addEventListener: (type: "abort", listener: () => void, options?: { once?: boolean }) => void;
    removeEventListener?: (type: "abort", listener: () => void) => void;
  };
}

type AdapterRequester = { requestAdapter?: () => Promise<unknown> };

export const SKIA_GRAPHITE_ADAPTER_TIMEOUT_MS = 3_000;

/** Sentinels so a resolved-but-falsy adapter is never confused with a timeout or an abort. */
const ADAPTER_TIMEOUT = Symbol("skia-graphite-adapter-timeout");
const ADAPTER_ABORTED = Symbol("skia-graphite-adapter-aborted");

function defaultEnvironment(): SkiaGraphiteProbeEnvironment {
  const navigatorLike = (globalThis as { navigator?: { gpu?: unknown } }).navigator;
  return { gpu: navigatorLike?.gpu };
}

/**
 * Same honesty contract as `createSkiaGpuIslandBackend`: callers must treat anything but
 * `adoptable` as a denied Graphite selection. The probe never chooses another provider.
 */
export async function probeSkiaGraphiteAdoption(
  environment: SkiaGraphiteProbeEnvironment = defaultEnvironment()
): Promise<SkiaGraphiteAdoptionProbe> {
  const gpu = environment.gpu;
  if (gpu === undefined || gpu === null) {
    return {
      status: "no-webgpu",
      reason: "WebGPU is unavailable on this device; Graphite requires navigator.gpu",
    };
  }
  // Snapshotted before any await: `clearSkiaGraphiteArtifact()` can land while requestAdapter is
  // pending, and returning the live module variable would then hand back `adoptable` with a null
  // artifact — a shape the discriminated union promises callers can never see.
  const artifact = registeredArtifact;
  if (!artifact) {
    return {
      status: "missing-artifact",
      reason:
        "no Graphite-enabled CanvasKit build is registered — upstream canvaskit-wasm ships "
        + "Ganesh only and Skia has not published a production Graphite web artifact yet",
    };
  }
  // A truthy `navigator.gpu` is not a usable device: requestAdapter still returns null (or
  // rejects) on blocklisted drivers and software-only configurations. Admitting the challenger
  // there would defer the failure to initialization instead of routing around the device, which
  // is exactly what the other WebGPU probes in this repo refuse to do.
  const requestAdapter = (gpu as AdapterRequester).requestAdapter;
  if (typeof requestAdapter !== "function") {
    return {
      status: "no-adapter",
      reason: "navigator.gpu exposes no requestAdapter on this device",
    };
  }

  // Bounded, like the product capability probe: a driver whose requestAdapter promise never
  // settles must not park the caller that is deciding whether to admit the challenger.
  const timeoutMs = environment.timeoutMs ?? SKIA_GRAPHITE_ADAPTER_TIMEOUT_MS;
  const signal = environment.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  // Checked BEFORE requesting, not only inside the race. `Promise.race` settles on the FIRST
  // fulfilled entry in list order, so when the caller has already aborted and `requestAdapter`
  // returns an already-settled promise (a cached or polyfilled adapter), the adapter entry wins
  // the tie and the probe reports `adoptable` for a lifecycle that was cancelled. The existing
  // pre-abort test missed this because its adapter request never settles. The product capability
  // probe checks the signal first for the same reason.
  if (signal?.aborted === true) {
    return {
      status: "no-adapter",
      reason:
        "the caller aborted before the adapter was requested; Graphite is not adopted here",
    };
  }
  let outcome: unknown;
  try {
    outcome = await Promise.race([
      Promise.resolve(requestAdapter.call(gpu)),
      new Promise<typeof ADAPTER_TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(ADAPTER_TIMEOUT), timeoutMs);
      }),
      new Promise<typeof ADAPTER_ABORTED>((resolve) => {
        if (!signal) return;
        if (signal.aborted) {
          resolve(ADAPTER_ABORTED);
          return;
        }
        abortListener = () => resolve(ADAPTER_ABORTED);
        signal.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } catch {
    outcome = null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // `{ once: true }` only detaches after an abort actually fires, so a long-lived lifecycle
    // signal reused across probes would retain one resolver closure per completed probe.
    if (abortListener) signal?.removeEventListener?.("abort", abortListener);
  }

  if (outcome === ADAPTER_TIMEOUT) {
    return {
      status: "adapter-timeout",
      reason: `navigator.gpu.requestAdapter did not settle within ${timeoutMs}ms; Graphite is not adopted here`,
    };
  }
  if (!outcome || outcome === ADAPTER_ABORTED) {
    return {
      status: "no-adapter",
      reason:
        "navigator.gpu exposes no usable adapter on this device; Graphite cannot be adopted here",
    };
  }
  return { status: "adoptable", artifact };
}
