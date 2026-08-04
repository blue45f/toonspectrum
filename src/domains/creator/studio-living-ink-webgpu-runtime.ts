/**
 * WebGPU-preferred Living Ink runtime factory.
 *
 * 1) Pure WGSL field runtime (storage-buffer compute passes) when a device can be created.
 * 2) Else WebGL2 certified sim with WebGPU capability stamp when navigator.gpu exists.
 * 3) Else null → worker falls back to pure WebGL2.
 */

import { StudioLivingInkWebGl2Runtime } from "./studio-living-ink-webgl2-runtime";
import { StudioLivingInkWebGpuPureRuntime } from "./studio-living-ink-webgpu-pure-runtime";

import type { StudioLivingInkExecutionConfig } from "./studio-living-ink-execution-protocol";

export type StudioLivingInkWebGpuRuntime =
  | StudioLivingInkWebGpuPureRuntime
  | (StudioLivingInkWebGl2Runtime & {
      readonly webGpuDevice: GPUDevice | null;
      readonly preferredBackend: "webgpu";
    });

function navigatorGpu(): GPU | null {
  try {
    return (globalThis.navigator as Navigator | undefined)?.gpu ?? null;
  } catch {
    return null;
  }
}

export async function tryCreateStudioLivingInkWebGpuRuntime(
  config: StudioLivingInkExecutionConfig,
): Promise<StudioLivingInkWebGpuRuntime | null> {
  // Prefer pure WGSL field replacement.
  const pure = await StudioLivingInkWebGpuPureRuntime.tryCreate(config);
  if (pure) return pure;

  const gpu = navigatorGpu();
  if (!gpu) return null;

  let device: GPUDevice | null = null;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  try {
    const webgl = new StudioLivingInkWebGl2Runtime(config);
    const capabilities = Object.freeze({
      ...webgl.capabilities,
      backend: "webgpu-offscreen-half-float" as const,
      webgpu: true,
      webgl2: true,
    });
    Object.defineProperty(webgl, "capabilities", {
      value: capabilities,
      writable: false,
      configurable: true,
    });
    const wrapped = webgl as StudioLivingInkWebGl2Runtime & {
      webGpuDevice: GPUDevice | null;
      preferredBackend: "webgpu";
    };
    Object.defineProperty(wrapped, "webGpuDevice", { value: device, writable: false });
    Object.defineProperty(wrapped, "preferredBackend", { value: "webgpu", writable: false });
    const originalDispose = webgl.dispose.bind(webgl);
    wrapped.dispose = () => {
      try {
        device?.destroy();
      } catch {
        /* ignore */
      }
      originalDispose();
    };
    return wrapped;
  } catch {
    try {
      device.destroy();
    } catch {
      /* ignore */
    }
    return null;
  }
}
