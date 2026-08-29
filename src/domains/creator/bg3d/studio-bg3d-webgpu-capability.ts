/**
 * Production WebGPU capability probe for the Studio 3D editor.
 *
 * The probe answers one question — "can this host give us a usable WebGPU device?" — without
 * allocating a `GPUDevice`, importing `three/webgpu`, or touching the renderer. Keeping it in its
 * own module means the engine-selection policy and the editor's status surface can ask about
 * WebGPU on every session while the WebGPU renderer graph stays behind its dynamic boundary.
 *
 * Every failure path is explicit: an unsupported host is reported with the reason it failed, never
 * as a bare `false`, because the editor surfaces that reason to the artist.
 */

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

/** Minimum adapter allocation the editor needs before a WebGPU device is worth creating. */
export const STUDIO_BG3D_WEBGPU_MIN_BUFFER_SIZE = 128 * 1024 * 1024;
export const STUDIO_BG3D_WEBGPU_MIN_STORAGE_BINDING_SIZE = 32 * 1024 * 1024;
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
export async function probeStudioBg3dWebGpuCapability(
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
      (limits.maxBufferSize ?? 0) < STUDIO_BG3D_WEBGPU_MIN_BUFFER_SIZE ||
      (limits.maxStorageBufferBindingSize ?? 0) < STUDIO_BG3D_WEBGPU_MIN_STORAGE_BINDING_SIZE
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

