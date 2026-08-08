/**
 * WebGPU Living Ink runtime factory, admitted on picture quality rather than on capability.
 *
 * 1) Pure WGSL field runtime (storage-buffer compute passes) when a device can be created *and it
 *    proves it draws watercolour* — see `proveWatercolourResolve`.
 * 2) Else WebGL2 certified sim with WebGPU capability stamp when navigator.gpu exists.
 * 3) Else null → worker falls back to pure WebGL2.
 *
 * Step 1's proof is not ceremony, and it is deliberately about the *picture*, not about liveness.
 * An earlier version only asked whether the frame was non-blank, which a WGSL resolve consisting of
 * a bare `exp(-density)` answered happily: it rendered, it just rendered pure white paper with ink
 * roughly thirty times too faint. Because this backend is faster, preferring it on liveness alone
 * traded the product's first-order value — handfeel and texture — for frame time, which is exactly
 * the trade the material policy forbids. So admission now measures the two signals a degraded
 * resolve loses first (paper texture standard deviation and ink darkness over paper) and hands the
 * user WebGL2 whenever the WGSL runtime cannot meet them.
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
  /*
   * Prefer the pure WGSL field replacement — but only once it has drawn watercolour. The proof
   * doubles as this runtime's warm-up: pipeline compilation, the first dispatches and the first
   * readback all happen here, before the runtime is handed to the Worker, so the user's first
   * stroke is never waiting on a cold WebGPU path — and never watching a washed-out one.
   */
  const pure = await StudioLivingInkWebGpuPureRuntime.tryCreate(config);
  if (pure) {
    if ((await pure.proveWatercolourResolve()).admitted) return pure;
    pure.dispose();
  }

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
