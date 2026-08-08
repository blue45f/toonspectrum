/**
 * WebGPU-preferred Living Ink runtime factory.
 *
 * 1) Pure WGSL field runtime (storage-buffer compute passes) when a device can be created *and it
 *    proves it can present a real frame*.
 * 2) Else WebGL2 certified sim with WebGPU capability stamp when navigator.gpu exists.
 * 3) Else null → worker falls back to pure WebGL2.
 *
 * Step 1's proof is not ceremony. Because the Worker prefers this backend whenever an adapter
 * exists, any defect in the WGSL path — a rejected buffer, a driver that drops a compute pass —
 * used to reach the user as a blank canvas with no path back to the working backend. Admission is
 * therefore by demonstration: render one frame and look at the pixels.
 */

import { StudioLivingInkWebGl2Runtime } from "./studio-living-ink-webgl2-runtime";
import {
  StudioLivingInkWebGpuPureRuntime,
  studioLivingInkPresentedPixelsAreBlank,
} from "./studio-living-ink-webgpu-pure-runtime";

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

/**
 * Renders one frame and reports whether it carried a visible surface. This is also the WGSL
 * runtime's warm-up: pipeline compilation, the first dispatch and the first readback all happen
 * here, before the runtime is handed to the Worker, so the user's first stroke is never waiting on
 * a cold WebGPU path — and never watching an empty one.
 */
async function presentsRealPixels(runtime: StudioLivingInkWebGpuPureRuntime): Promise<boolean> {
  let frame;
  try {
    frame = await runtime.renderFrame(0, "composite");
  } catch {
    return false;
  }
  try {
    const probe = new OffscreenCanvas(frame.image.width, frame.image.height);
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(frame.image, 0, 0);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    return !studioLivingInkPresentedPixelsAreBlank(data);
  } catch {
    return false;
  } finally {
    frame.image.close();
  }
}

export async function tryCreateStudioLivingInkWebGpuRuntime(
  config: StudioLivingInkExecutionConfig,
): Promise<StudioLivingInkWebGpuRuntime | null> {
  // Prefer pure WGSL field replacement — but only once it has shown a real frame.
  const pure = await StudioLivingInkWebGpuPureRuntime.tryCreate(config);
  if (pure) {
    if (await presentsRealPixels(pure)) return pure;
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
