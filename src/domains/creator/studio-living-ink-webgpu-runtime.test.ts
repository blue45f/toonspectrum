import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS } from "./studio-living-ink-gpu-protocol";
import { tryCreateStudioLivingInkWebGpuRuntime } from "./studio-living-ink-webgpu-runtime";

import type { StudioLivingInkExecutionConfig } from "./studio-living-ink-execution-protocol";

const config: StudioLivingInkExecutionConfig = {
  displayWidth: 64,
  displayHeight: 48,
  fieldWidth: 64,
  fieldHeight: 48,
  coarseBase: 128,
  seed: 1,
  material: DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS,
  displayMode: "composite",
};

describe("Living Ink WebGPU runtime", () => {
  it("fails closed when navigator.gpu is unavailable (CI/Node)", async () => {
    const previous = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    try {
      await expect(tryCreateStudioLivingInkWebGpuRuntime(config)).resolves.toBeNull();
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: previous,
      });
    }
  });

  it("never hands out a WGSL runtime that resolves blank frames", async () => {
    /*
     * The Worker prefers this backend whenever an adapter exists, so a WGSL path that computes
     * nothing used to reach the user as a blank canvas with no way back to the working backend.
     * Admission is by demonstration: a runtime whose display buffer stays empty is disposed, and
     * the caller is sent down the WebGL2 branch (which, in Node, has no context and yields null).
     */
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const stub = (name: string, value: unknown) => {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    };
    const emptyReadback = new Float32Array(config.fieldWidth * config.fieldHeight * 4);
    const buffer = () => ({
      destroy: () => {},
      mapAsync: async () => {},
      getMappedRange: () => emptyReadback.buffer.slice(0),
      unmap: () => {},
    });
    stub("GPUBufferUsage", {
      STORAGE: 0x80, COPY_SRC: 0x04, COPY_DST: 0x08, MAP_READ: 0x01, UNIFORM: 0x40,
    });
    stub("GPUMapMode", { READ: 0x01 });
    stub("ImageData", class { constructor(readonly data: unknown) {} });
    stub("OffscreenCanvas", class {
      constructor(readonly width: number, readonly height: number) {}
      getContext(id: string) { return id === "2d" ? { putImageData: () => {} } : null; }
      transferToImageBitmap() { throw new Error("nothing was painted"); }
    });
    stub("navigator", {
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => ({
            createBuffer: buffer,
            createShaderModule: () => ({}),
            createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
            createBindGroup: () => ({}),
            createCommandEncoder: () => ({
              beginComputePass: () => ({
                setPipeline: () => {},
                setBindGroup: () => {},
                dispatchWorkgroups: () => {},
                end: () => {},
              }),
              copyBufferToBuffer: () => {},
              finish: () => ({}),
            }),
            queue: { writeBuffer: () => {}, submit: () => {} },
            destroy: () => {},
          }),
        }),
      },
    });
    try {
      await expect(tryCreateStudioLivingInkWebGpuRuntime(config)).resolves.toBeNull();
    } finally {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it("exports a preferred-runtime helper used by the Worker", async () => {
    // Without a real adapter the helper returns null; presence of the export is the product seam.
    const runtime = await tryCreateStudioLivingInkWebGpuRuntime(config);
    if (runtime) {
      expect(runtime.capabilities.backend).toBe("webgpu-offscreen-half-float");
      expect(runtime.capabilities.webgpu).toBe(true);
      runtime.dispose();
    } else {
      expect(runtime).toBeNull();
    }
  });
});
