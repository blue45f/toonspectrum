import { acquireStudioGpuDevice } from "./studio-gpu-fabric";

export type StudioGpuCanvasFormat = "bgra8unorm" | "rgba8unorm";
export type StudioGpuPresentationDeviceStrategy =
  | "auto"
  | "shared"
  | "dedicated";

export interface StudioGpuPresentationDeviceOptions {
  /** Test/embed override. Omit to resolve the browser WebGPU entry point. */
  readonly gpu?: GPU | null;
  /**
   * `auto` uses the shared Studio GPU fabric in product builds and a dedicated device in Vitest.
   * Tests that exercise the production ownership path should request `shared` explicitly.
   */
  readonly strategy?: StudioGpuPresentationDeviceStrategy;
}

export interface StudioGpuPresentationDevice {
  /** Native WebIDL object; never wrap it before passing it to GPUCanvasContext. */
  readonly device: GPUDevice;
  readonly deviceEpoch: number;
  readonly canvasFormat: StudioGpuCanvasFormat;
  readonly ownership: "fabric-lease" | "dedicated";
  /** Idempotently releases this ownership; never destroy a borrowed physical device directly. */
  readonly release: () => void;
}

function browserGpu(): GPU | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { readonly gpu?: GPU }).gpu ?? null;
}

function preferredCanvasFormat(gpu: GPU): StudioGpuCanvasFormat | null {
  try {
    if (typeof gpu.getPreferredCanvasFormat !== "function") return null;
    const format = gpu.getPreferredCanvasFormat();
    return format === "bgra8unorm" || format === "rgba8unorm" ? format : null;
  } catch {
    return null;
  }
}

function resolvedStrategy(
  strategy: StudioGpuPresentationDeviceStrategy | undefined,
): Exclude<StudioGpuPresentationDeviceStrategy, "auto"> {
  if (strategy === "shared" || strategy === "dedicated") return strategy;
  return import.meta.env.MODE === "test" ? "dedicated" : "shared";
}

function once(release: () => void): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}

async function acquireDedicatedDevice(
  gpu: GPU,
  canvasFormat: StudioGpuCanvasFormat,
): Promise<StudioGpuPresentationDevice | null> {
  try {
    const adapter = await gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    return Object.freeze({
      device,
      deviceEpoch: 1,
      canvasFormat,
      ownership: "dedicated" as const,
      release: once(() => device.destroy()),
    });
  } catch {
    return null;
  }
}

async function acquireSharedDevice(
  gpu: GPU,
  canvasFormat: StudioGpuCanvasFormat,
): Promise<StudioGpuPresentationDevice | null> {
  const lease = await acquireStudioGpuDevice({ gpu }).catch(() => null);
  if (!lease) return null;
  if (lease.lost) {
    lease.release();
    return null;
  }
  return Object.freeze({
    device: lease.device,
    deviceEpoch: lease.epoch,
    canvasFormat,
    ownership: "fabric-lease" as const,
    release: once(() => lease.release()),
  });
}

/**
 * Acquires a presentation-capable GPUDevice without leaking ownership into React components.
 *
 * Product callers borrow the single StudioGpuFabric device and explicitly release their lease.
 * The device must remain the actual WebIDL object: a Proxy facade can call bound methods but
 * fails the native GPUCanvasContext.configure device brand check. The dedicated strategy uses
 * the same release contract and remains available for isolated harnesses.
 */
export async function acquireStudioGpuPresentationDevice(
  options?: StudioGpuPresentationDeviceOptions,
): Promise<StudioGpuPresentationDevice | null> {
  const gpu = options && "gpu" in options ? options.gpu ?? null : browserGpu();
  if (!gpu) return null;
  const canvasFormat = preferredCanvasFormat(gpu);
  if (!canvasFormat) return null;

  return resolvedStrategy(options?.strategy) === "dedicated"
    ? acquireDedicatedDevice(gpu, canvasFormat)
    : acquireSharedDevice(gpu, canvasFormat);
}
