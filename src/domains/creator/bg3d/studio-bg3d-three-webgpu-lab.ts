export interface StudioBg3dGpuAdapterLike {
  readonly features?: Iterable<string>;
  /** GPUSupportedLimits exposes WebIDL getters that are not guaranteed to be enumerable. */
  readonly limits?: {
    readonly maxBufferSize?: number;
    readonly maxStorageBufferBindingSize?: number;
    readonly maxComputeWorkgroupSizeX?: number;
  };
}

export interface StudioBg3dGpuLike {
  requestAdapter(options?: { readonly powerPreference?: "low-power" | "high-performance" }):
    Promise<StudioBg3dGpuAdapterLike | null>;
}

export interface StudioBg3dWebGpuProbeSignals {
  readonly secureContext: boolean;
  readonly gpu?: StudioBg3dGpuLike;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export type StudioBg3dWebGpuProbeReason =
  | "available"
  | "insecure-context"
  | "api-unavailable"
  | "adapter-unavailable"
  | "insufficient-limits"
  | "timeout"
  | "aborted";

export interface StudioBg3dWebGpuProbeResult {
  readonly supported: boolean;
  readonly reason: StudioBg3dWebGpuProbeReason;
  readonly computeSupported: boolean;
  readonly timestampQuerySupported: boolean;
  readonly limits: Readonly<Record<string, number>>;
}

const MINIMUM_MAX_BUFFER_SIZE = 128 * 1024 * 1024;
const MINIMUM_STORAGE_BINDING_SIZE = 32 * 1024 * 1024;
const PROBED_LIMIT_NAMES = [
  "maxBufferSize",
  "maxStorageBufferBindingSize",
  "maxComputeWorkgroupSizeX",
] as const;

function readKnownGpuLimits(
  source: StudioBg3dGpuAdapterLike["limits"],
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const name of PROBED_LIMIT_NAMES) {
    const value = source?.[name];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) result[name] = value;
  }
  return result;
}

function probeResult(
  supported: boolean,
  reason: StudioBg3dWebGpuProbeReason,
  features: ReadonlySet<string> = new Set(),
  limits: Readonly<Record<string, number>> = {},
): StudioBg3dWebGpuProbeResult {
  return Object.freeze({
    supported,
    reason,
    computeSupported: supported && (limits.maxComputeWorkgroupSizeX ?? 0) > 0,
    timestampQuerySupported: supported && features.has("timestamp-query"),
    limits: Object.freeze({ ...limits }),
  });
}

/** Probes policy-level WebGPU suitability without allocating a GPUDevice or renderer. */
export async function probeStudioBg3dThreeWebGpu(
  signals: StudioBg3dWebGpuProbeSignals,
): Promise<StudioBg3dWebGpuProbeResult> {
  if (signals.signal?.aborted) return probeResult(false, "aborted");
  if (!signals.secureContext) return probeResult(false, "insecure-context");
  if (!signals.gpu) return probeResult(false, "api-unavailable");
  const timeoutMs = Number.isFinite(signals.timeoutMs)
    ? Math.min(10_000, Math.max(250, Math.floor(signals.timeoutMs ?? 3_000)))
    : 3_000;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const timeoutResult = new Promise<"timeout">((resolve) => {
    timeout = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const abortResult = new Promise<"aborted">((resolve) => {
    if (!signals.signal) return;
    abortListener = () => resolve("aborted");
    signals.signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    const outcome = await Promise.race([
      signals.gpu.requestAdapter({ powerPreference: "high-performance" }),
      timeoutResult,
      abortResult,
    ]);
    if (outcome === "timeout" || outcome === "aborted") return probeResult(false, outcome);
    if (!outcome) return probeResult(false, "adapter-unavailable");
    const features = new Set(outcome.features ?? []);
    const limits = readKnownGpuLimits(outcome.limits);
    if (
      (limits.maxBufferSize ?? 0) < MINIMUM_MAX_BUFFER_SIZE ||
      (limits.maxStorageBufferBindingSize ?? 0) < MINIMUM_STORAGE_BINDING_SIZE
    ) {
      return probeResult(false, "insufficient-limits", features, limits);
    }
    return probeResult(true, "available", features, limits);
  } catch {
    return signals.signal?.aborted
      ? probeResult(false, "aborted")
      : probeResult(false, "adapter-unavailable");
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortListener) signals.signal?.removeEventListener("abort", abortListener);
  }
}

export interface StudioBg3dThreeWebGpuLabRuntime {
  readonly renderer: import("three/webgpu").WebGPURenderer;
  dispose(): Promise<void>;
}

interface ThreeWebGpuBackendLifecycle {
  readonly isWebGPUBackend?: unknown;
  readonly parameters?: { readonly device?: unknown };
  readonly device?: { destroy?: () => void } | null;
  dispose?: () => void;
}

interface ThreeWebGpuRendererLifecycle {
  /** Three r184's WebGPURenderer installs a WebGL fallback internally. This lab forbids it. */
  _getFallback: null | ((error: unknown) => unknown);
  readonly backend: ThreeWebGpuBackendLifecycle;
}

function disposeRejectedThreeWebGpuInitialization(backend: ThreeWebGpuBackendLifecycle): void {
  try {
    backend.dispose?.();
  } catch {
    // Three's public Renderer.dispose() calls async setAnimationLoop(), which retries a rejected
    // init promise when initialization never completed. Tear the owned backend down directly.
    if (backend.parameters?.device === undefined) {
      try {
        backend.device?.destroy?.();
      } catch {
        // Best-effort cleanup must not replace the original initialization error.
      }
    }
  }
}

/**
 * Fully lazy lab factory. The `three/webgpu` graph stays out of the production WebGL editor chunk.
 * Callers must probe first and mount this renderer on a separate canvas; it never shares R3F state.
 */
export async function createStudioBg3dThreeWebGpuLabRuntime(
  canvas: HTMLCanvasElement,
  options: { readonly antialias?: boolean; readonly alpha?: boolean } = {},
): Promise<StudioBg3dThreeWebGpuLabRuntime> {
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("invalid-webgpu-lab-canvas");
  const { WebGPURenderer } = await import("three/webgpu");
  const renderer = new WebGPURenderer({
    canvas,
    antialias: options.antialias ?? true,
    alpha: options.alpha ?? true,
    powerPreference: "high-performance",
    requiredLimits: {
      maxBufferSize: MINIMUM_MAX_BUFFER_SIZE,
      maxStorageBufferBindingSize: MINIMUM_STORAGE_BINDING_SIZE,
    },
  });
  const lifecycle = renderer as unknown as ThreeWebGpuRendererLifecycle;
  const initializationBackend = lifecycle.backend;
  if (typeof lifecycle._getFallback !== "function") {
    disposeRejectedThreeWebGpuInitialization(initializationBackend);
    throw new Error("webgpu-lab-version-contract-unsupported");
  }
  // WebGPURenderer silently installs a WebGL2 fallback. A runtime advertised as WebGPU must fail
  // closed instead, so the coordinator can keep the production Three/WebGL renderer in charge.
  lifecycle._getFallback = null;
  try {
    await renderer.init();
  } catch (error) {
    disposeRejectedThreeWebGpuInitialization(initializationBackend);
    throw new Error("webgpu-lab-initialization-failed", { cause: error });
  }
  if (lifecycle.backend.isWebGPUBackend !== true) {
    renderer.dispose();
    throw new Error("webgpu-lab-backend-unavailable");
  }
  let disposed = false;
  return Object.freeze({
    renderer,
    async dispose() {
      if (disposed) return;
      disposed = true;
      await renderer.dispose();
    },
  });
}
