import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createStudioGpuFilterPresentationSurface } from "./studio-gpu-filter-presentation";

import type {
  StudioGpuFilterPresentationCanvas,
} from "./studio-gpu-filter-presentation";

function harness(options?: { context?: boolean; validationError?: string }) {
  const configure = vi.fn();
  const unconfigure = vi.fn();
  const getCurrentTexture = vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) }));
  const context = options?.context === false ? null : {
    configure,
    getCurrentTexture,
    unconfigure,
  } as unknown as GPUCanvasContext;
  const canvas = {
    height: 1,
    width: 1,
    getContext: vi.fn(() => context),
  } as unknown as StudioGpuFilterPresentationCanvas;
  const destroyUniform = vi.fn();
  const draw = vi.fn();
  const passEnd = vi.fn();
  const beginRenderPass = vi.fn(() => ({
    draw,
    end: passEnd,
    setBindGroup: vi.fn(),
    setPipeline: vi.fn(),
  }));
  const copyTextureToBuffer = vi.fn();
  const finish = vi.fn(() => ({ commands: true }));
  const createCommandEncoder = vi.fn(() => ({
    beginRenderPass,
    copyTextureToBuffer,
    finish,
  }));
  const createRenderPipeline = vi.fn(() => ({
    getBindGroupLayout: vi.fn(() => ({ layout: true })),
  }));
  const createBuffer = vi.fn(() => ({
    destroy: destroyUniform,
    getMappedRange: vi.fn(),
    mapAsync: vi.fn(),
  }));
  const popResults = options?.validationError
    ? [{ message: options.validationError }, null]
    : [null, null];
  const queue = {
    submit: vi.fn(),
    writeBuffer: vi.fn(),
  };
  const device = {
    createBindGroup: vi.fn(() => ({ bindGroup: true })),
    createBuffer,
    createCommandEncoder,
    createRenderPipeline,
    createShaderModule: vi.fn(() => ({ shader: true })),
    limits: { maxTextureDimension2D: 8_192 },
    popErrorScope: vi.fn(async () => popResults.shift() ?? null),
    pushErrorScope: vi.fn(),
    queue,
  } as unknown as GPUDevice;
  return {
    beginRenderPass,
    canvas,
    configure,
    context,
    copyTextureToBuffer,
    createBuffer,
    createRenderPipeline,
    destroyUniform,
    device,
    draw,
    getCurrentTexture,
    queue,
    unconfigure,
  };
}

describe("retained GPU filter presentation", () => {
  it("presents successive filter frames on one retained canvas without a readback command", async () => {
    const h = harness();
    const surface = createStudioGpuFilterPresentationSurface({
      createCanvas: () => h.canvas,
      preferredCanvasFormat: () => "bgra8unorm",
    });
    const pixels = { destroy: vi.fn() } as unknown as GPUBuffer;

    await expect(surface.present({ device: h.device, pixels, width: 64, height: 32 }))
      .resolves.toEqual({ status: "presented", revision: 1 });
    await expect(surface.present({ device: h.device, pixels, width: 64, height: 32 }))
      .resolves.toEqual({ status: "presented", revision: 2 });

    expect(surface.canvas).toBe(h.canvas);
    expect(h.configure).toHaveBeenCalledTimes(1);
    expect(h.createRenderPipeline).toHaveBeenCalledTimes(1);
    expect(h.getCurrentTexture).toHaveBeenCalledTimes(2);
    expect(h.draw).toHaveBeenCalledTimes(2);
    expect(h.queue.submit).toHaveBeenCalledTimes(2);
    expect(h.copyTextureToBuffer).not.toHaveBeenCalled();
    for (const [buffer] of h.createBuffer.mock.results.map((result) => [result.value])) {
      expect(buffer.mapAsync).not.toHaveBeenCalled();
      expect(buffer.getMappedRange).not.toHaveBeenCalled();
    }
  });

  it("reconfigures the same surface on a dimension change and disposes it idempotently", async () => {
    const h = harness();
    const surface = createStudioGpuFilterPresentationSurface({
      createCanvas: () => h.canvas,
      preferredCanvasFormat: () => "bgra8unorm",
    });
    const pixels = {} as GPUBuffer;

    expect((await surface.present({ device: h.device, pixels, width: 20, height: 10 })).status)
      .toBe("presented");
    expect((await surface.present({ device: h.device, pixels, width: 40, height: 30 })).status)
      .toBe("presented");
    expect(h.configure).toHaveBeenCalledTimes(2);
    expect(h.canvas.width).toBe(40);
    expect(h.canvas.height).toBe(30);

    surface.dispose();
    surface.dispose();
    expect(h.unconfigure).toHaveBeenCalledTimes(3);
    await expect(surface.present({ device: h.device, pixels, width: 40, height: 30 }))
      .resolves.toEqual({
        status: "unavailable",
        reason: "The retained GPU filter surface is disposed.",
      });
  });

  it("fails visibly when WebGPU canvas presentation is unavailable or validation fails", async () => {
    const missing = harness({ context: false });
    const missingSurface = createStudioGpuFilterPresentationSurface({
      createCanvas: () => missing.canvas,
      preferredCanvasFormat: () => "bgra8unorm",
    });
    await expect(missingSurface.present({
      device: missing.device,
      pixels: {} as GPUBuffer,
      width: 10,
      height: 10,
    })).resolves.toEqual({ status: "unavailable", reason: "GPUCanvasContext is unavailable." });

    const invalid = harness({ validationError: "shader rejected" });
    const invalidSurface = createStudioGpuFilterPresentationSurface({
      createCanvas: () => invalid.canvas,
      preferredCanvasFormat: () => "bgra8unorm",
    });
    await expect(invalidSurface.present({
      device: invalid.device,
      pixels: {} as GPUBuffer,
      width: 10,
      height: 10,
    })).resolves.toEqual({ status: "unavailable", reason: "shader rejected" });
  });

  it("keeps forbidden GPU/CPU transfer APIs out of the interactive presentation implementation", () => {
    const source = readFileSync(
      new URL("./studio-gpu-filter-presentation.ts", import.meta.url),
      "utf8",
    );
    const executable = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");
    expect(executable).not.toMatch(/\b(?:MAP_READ|getImageData|readPixels|mapAsync)\b/u);
    expect(executable).not.toContain("copyTextureToBuffer");
    expect(executable).not.toContain("copyBufferToBuffer");
  });
});
