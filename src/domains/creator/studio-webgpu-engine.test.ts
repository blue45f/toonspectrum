import { describe, expect, it, vi } from "vitest";

import {
  fingerprintStudioGpuFrame,
  isValidStudioGpuStroke,
  planStudioGpuDabUpdate,
  planStudioGpuDabs,
  planStudioGpuStrokeExtensionInRect,
  STUDIO_GPU_MAX_DABS,
  StudioWebGpuEngine,
  type StudioGpuFrameReceipt,
  type StudioGpuStroke,
} from "./studio-webgpu-engine";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}

interface FakeCanvas2d {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  arcs: Array<{ x: number; y: number; radius: number }>;
  composites: GlobalCompositeOperation[];
  clearRect: ReturnType<typeof vi.fn>;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function fakeCanvas2d(): FakeCanvas2d {
  const arcs: FakeCanvas2d["arcs"] = [];
  const composites: GlobalCompositeOperation[] = [];
  let composite: GlobalCompositeOperation = "source-over";
  let fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  const clearRect = vi.fn();
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect,
    beginPath: vi.fn(),
    arc: vi.fn((x: number, y: number, radius: number) => arcs.push({ x, y, radius })),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperties(context, {
    globalCompositeOperation: {
      get: () => composite,
      set: (value: GlobalCompositeOperation) => {
        composite = value;
        composites.push(value);
      },
    },
    fillStyle: {
      get: () => fillStyle,
      set: (value: string | CanvasGradient | CanvasPattern) => {
        fillStyle = value;
      },
    },
  });
  const canvas = {
    width: 300,
    height: 150,
    style: {},
    getContext: vi.fn((kind: string) => kind === "2d" ? context : null),
  } as unknown as HTMLCanvasElement;
  return { canvas, context, arcs, composites, clearRect };
}

function fakeGpuCanvas(context: GPUCanvasContext | null) {
  return {
    width: 300,
    height: 150,
    style: {},
    getContext: vi.fn((kind: string) => kind === "webgpu" ? context : null),
  } as unknown as HTMLCanvasElement;
}

function stroke(overrides: Partial<StudioGpuStroke> = {}): StudioGpuStroke {
  return {
    id: "stroke-1",
    points: [5, 10, 35, 10],
    pressures: [0.5, 1],
    color: "#ff3366",
    size: 8,
    opacity: 0.75,
    ...overrides,
  };
}

function fakeGpuDevice(
  lost: Promise<GPUDeviceLostInfo>,
  onSubmittedWorkDone: () => Promise<void> = async () => undefined
) {
  const draw = vi.fn();
  const setPipeline = vi.fn();
  const setVertexBuffer = vi.fn();
  const pass = {
    setPipeline,
    setVertexBuffer,
    setBindGroup: vi.fn(),
    draw,
    end: vi.fn(),
  };
  const buffer = { destroy: vi.fn() };
  const texture = { createView: vi.fn(() => ({ retainedView: true })), destroy: vi.fn() };
  const encoder = {
    beginRenderPass: vi.fn(() => pass),
    copyTextureToTexture: vi.fn(),
    finish: vi.fn(() => ({ command: true })),
  };
  const device = {
    lost,
    limits: { maxTextureDimension2D: 4_096 },
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      onSubmittedWorkDone: vi.fn(onSubmittedWorkDone),
    },
    createShaderModule: vi.fn(() => ({ shader: true })),
    createRenderPipeline: vi.fn((descriptor: GPURenderPipelineDescriptor) => ({
      descriptor,
      getBindGroupLayout: vi.fn(() => ({ layout: true })),
    })),
    createSampler: vi.fn(() => ({ sampler: true })),
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => ({ descriptor })),
    createBuffer: vi.fn(() => buffer),
    createTexture: vi.fn(() => texture),
    createCommandEncoder: vi.fn(() => encoder),
    destroy: vi.fn(),
  } as unknown as GPUDevice;
  return { device, draw, setPipeline, setVertexBuffer, buffer, texture, encoder };
}

function renderPassDescriptors(
  fake: ReturnType<typeof fakeGpuDevice>
): readonly GPURenderPassDescriptor[] {
  return (
    fake.encoder.beginRenderPass.mock.calls as unknown as [GPURenderPassDescriptor][]
  ).map(([descriptor]) => descriptor);
}

describe("StudioWebGpuEngine", () => {
  it("invalidates first and acknowledges only a completely covered Canvas2D frame request", () => {
    const gpuSurface = fakeGpuCanvas(null);
    const fallback = fakeCanvas2d();
    const events: string[] = [];
    const onFrameReady = vi.fn((receipt: StudioGpuFrameReceipt) => (
      events.push(`ready:${receipt.requestId}`)
    ));
    const engine = new StudioWebGpuEngine({
      canvas: gpuSurface,
      fallbackCanvas: fallback.canvas,
      gpu: null,
      onFrameInvalid: () => events.push("invalid"),
      onFrameReady,
    });
    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    events.length = 0;
    onFrameReady.mockClear();

    engine.render([stroke()], "draft:7");

    expect(events).toEqual(["invalid", "ready:draft:7"]);
    expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "draft:7",
      backend: "canvas2d",
      complete: true,
      strokeCount: 1,
      physicalWidth: 100,
      physicalHeight: 80,
    }));
    expect(onFrameReady.mock.calls[0]?.[0].fingerprint).toBe(
      fingerprintStudioGpuFrame(
        [stroke()],
        { logicalWidth: 100, logicalHeight: 80 },
        100,
        80
      )
    );
  });

  it("refuses frame authority for an overflowing brush contract", () => {
    const onFrameReady = vi.fn();
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(null),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu: null,
      onFrameReady,
    });
    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    onFrameReady.mockClear();

    engine.render([stroke({ size: Number.MAX_VALUE })], "invalid:overflow");

    expect(onFrameReady).not.toHaveBeenCalled();
  });

  it("renders normal and erase strokes through the silent Canvas2D fallback", async () => {
    const gpuSurface = fakeGpuCanvas(null);
    const fallback = fakeCanvas2d();
    const engine = new StudioWebGpuEngine({
      canvas: gpuSurface,
      fallbackCanvas: fallback.canvas,
      gpu: null,
    });

    engine.resize({
      logicalWidth: 100,
      logicalHeight: 80,
      cssWidth: 100,
      cssHeight: 80,
      dpr: 2,
    });
    engine.render([
      stroke(),
      stroke({ id: "eraser", composite: "erase", points: [10, 10, 20, 10] }),
    ]);

    await expect(engine.initialize()).resolves.toBe("canvas2d");
    expect(fallback.canvas.width).toBe(200);
    expect(fallback.canvas.height).toBe(160);
    expect(fallback.arcs.length).toBeGreaterThan(4);
    expect(fallback.composites).toContain("source-over");
    expect(fallback.composites).toContain("destination-out");
    expect(gpuSurface.style.visibility).toBe("hidden");
    expect(fallback.canvas.style.visibility).toBe("visible");

    engine.clear();
    expect(fallback.clearRect).toHaveBeenLastCalledWith(0, 0, 200, 160);
  });

  it("uses CSS size times DPR while preserving aspect ratio under the device texture limit", () => {
    const gpuSurface = fakeGpuCanvas(null);
    const fallback = fakeCanvas2d();
    const engine = new StudioWebGpuEngine({
      canvas: gpuSurface,
      fallbackCanvas: fallback.canvas,
      gpu: null,
    });

    engine.resize({
      logicalWidth: 800,
      logicalHeight: 1_200,
      cssWidth: 240,
      cssHeight: 360,
      dpr: 2.5,
    });

    expect(gpuSurface.width).toBe(600);
    expect(gpuSurface.height).toBe(900);
    expect(fallback.canvas.width).toBe(600);
    expect(fallback.canvas.height).toBe(900);
  });

  it("appends only new Canvas2D segment dabs and rebuilds after divergence or resize", () => {
    const gpuSurface = fakeGpuCanvas(null);
    const fallback = fakeCanvas2d();
    const engine = new StudioWebGpuEngine({
      canvas: gpuSurface,
      fallbackCanvas: fallback.canvas,
      gpu: null,
    });
    const initial = stroke({ points: [0, 0, 20, 0], pressures: [0.5, 0.6] });
    const extension = stroke({ points: [0, 0, 20, 0, 24, 0], pressures: [0.5, 0.6, 0.7] });

    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    engine.render([initial]);
    const clearsAfterInitial = fallback.clearRect.mock.calls.length;
    const arcsAfterInitial = fallback.arcs.length;
    engine.render([extension]);

    const suffix = planStudioGpuDabUpdate([initial], [extension]);
    expect(suffix.mode).toBe("append");
    expect(fallback.clearRect).toHaveBeenCalledTimes(clearsAfterInitial);
    expect(fallback.arcs).toHaveLength(arcsAfterInitial + suffix.dabs.length);

    const diverged = stroke({
      points: [0, 0, 19, 1, 24, 0, 28, 0],
      pressures: [0.5, 0.6, 0.7, 0.8],
    });
    engine.render([diverged]);
    expect(fallback.clearRect).toHaveBeenCalledTimes(clearsAfterInitial + 1);

    engine.resize({ logicalWidth: 100, logicalHeight: 80, scaleX: 1.1 });
    expect(fallback.clearRect).toHaveBeenCalledTimes(clearsAfterInitial + 2);
    engine.resize({ logicalWidth: 100, logicalHeight: 80, scaleX: 1.1 });
    expect(fallback.clearRect).toHaveBeenCalledTimes(clearsAfterInitial + 2);
  });

  it("snapshots retained operations so an in-place pointer tail cannot receive a stale receipt", () => {
    const gpuSurface = fakeGpuCanvas(null);
    const fallback = fakeCanvas2d();
    const onFrameReady = vi.fn();
    const engine = new StudioWebGpuEngine({
      canvas: gpuSurface,
      fallbackCanvas: fallback.canvas,
      gpu: null,
      onFrameReady,
    });
    const mutable = stroke({
      points: [0, 0, 20, 0],
      pressures: [0.5, 0.6],
    });
    const renderedSnapshot = {
      ...mutable,
      points: [...mutable.points],
      pressures: [...(mutable.pressures ?? [])],
    };
    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    engine.render([mutable], "mutable:before");
    const arcsBeforeTail = fallback.arcs.length;
    onFrameReady.mockClear();

    (mutable.points as number[]).push(30, 2);
    (mutable.pressures as number[]).push(0.9);
    engine.render([mutable], "mutable:after");

    const expected = planStudioGpuDabUpdate([renderedSnapshot], [mutable]);
    expect(expected.mode).toBe("append");
    expect(expected.dabs.length).toBeGreaterThan(0);
    expect(fallback.arcs).toHaveLength(arcsBeforeTail + expected.dabs.length);
    expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "mutable:after",
      complete: true,
    }));
  });

  it("incrementally destination-outs a newly appended eraser on the Canvas2D fallback", () => {
    const gpuSurface = fakeGpuCanvas(null);
    const fallback = fakeCanvas2d();
    const engine = new StudioWebGpuEngine({
      canvas: gpuSurface,
      fallbackCanvas: fallback.canvas,
      gpu: null,
    });
    const ink = stroke({ id: "ink", orderKey: "a" });
    const eraser = stroke({
      id: "eraser",
      orderKey: "b",
      points: [12, 10, 24, 10],
      pressures: [0.4, 0.8],
      opacity: 0.6,
      composite: "erase",
    });

    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    engine.render([ink]);
    const clearsAfterInk = fallback.clearRect.mock.calls.length;
    const arcsAfterInk = fallback.arcs.length;
    const compositesAfterInk = fallback.composites.length;
    engine.render([ink, eraser]);

    expect(fallback.clearRect).toHaveBeenCalledTimes(clearsAfterInk);
    expect(fallback.arcs).toHaveLength(arcsAfterInk + planStudioGpuDabs([eraser]).dabs.length);
    expect(fallback.composites.slice(compositesAfterInk)).not.toHaveLength(0);
    expect(fallback.composites.slice(compositesAfterInk)).toEqual(
      expect.arrayContaining(["destination-out"])
    );
  });

  it("creates premultiplied normal/erase pipelines, renders dabs, and falls back on device loss", async () => {
    const lost = deferred<GPUDeviceLostInfo>();
    const fake = fakeGpuDevice(lost.promise);
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const gpuSurface = fakeGpuCanvas(context);
    const fallback = fakeCanvas2d();
    const onBackendChange = vi.fn();
    const onDeviceLost = vi.fn();
    const engine = new StudioWebGpuEngine({
      canvas: gpuSurface,
      fallbackCanvas: fallback.canvas,
      gpu,
      autoRecover: false,
      onBackendChange,
      onDeviceLost,
    });
    engine.resize({ logicalWidth: 100, logicalHeight: 80, cssWidth: 100, cssHeight: 80, dpr: 2 });
    engine.render([
      stroke(),
      stroke({ id: "erase", composite: "erase", orderKey: "z" }),
    ]);

    await expect(engine.initialize()).resolves.toBe("webgpu");
    const pipelineCalls = vi.mocked(fake.device.createRenderPipeline).mock.calls;
    expect(pipelineCalls).toHaveLength(3);
    expect(pipelineCalls[0]?.[0].fragment?.targets?.[0]?.blend?.color).toMatchObject({
      srcFactor: "one",
      dstFactor: "one-minus-src-alpha",
    });
    expect(pipelineCalls[1]?.[0].fragment?.targets?.[0]?.blend?.color).toMatchObject({
      srcFactor: "zero",
      dstFactor: "one-minus-src-alpha",
    });
    expect(pipelineCalls[2]?.[0]).toMatchObject({
      label: "Studio retained tile presentation pipeline",
      fragment: { targets: [{ format: "bgra8unorm" }] },
    });
    expect(context.configure).toHaveBeenCalledWith(expect.objectContaining({
      device: fake.device,
      format: "bgra8unorm",
      alphaMode: "premultiplied",
    }));
    expect(fake.device.queue.writeBuffer).toHaveBeenCalled();
    expect(fake.device.queue.submit).toHaveBeenCalled();
    await vi.waitFor(() => expect(fake.draw).toHaveBeenCalled());
    expect(fake.draw.mock.calls.some(([, instanceCount]) => Number(instanceCount) > 0)).toBe(true);
    expect(gpuSurface.style.visibility).toBe("visible");

    const lossInfo = { reason: "unknown", message: "test loss" } as GPUDeviceLostInfo;
    lost.resolve(lossInfo);
    await vi.waitFor(() => expect(onDeviceLost).toHaveBeenCalledWith(lossInfo));
    expect(engine.getBackend()).toBe("canvas2d");
    expect(onBackendChange).toHaveBeenLastCalledWith("canvas2d");
    expect(fallback.arcs.length).toBeGreaterThan(0);
    expect(context.unconfigure).toHaveBeenCalled();

    engine.dispose();
    expect(fake.buffer.destroy).toHaveBeenCalled();
  });

  it("drops stale WebGPU queue receipts and authorizes only the latest request", async () => {
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const submitted = Array.from({ length: 4 }, () => deferred<void>());
    let submissionIndex = 0;
    const fake = fakeGpuDevice(neverLost, () => submitted[submissionIndex++]!.promise);
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const onFrameReady = vi.fn();
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(context),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu,
      onFrameReady,
    });
    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    await engine.initialize();
    submitted[0]!.resolve(undefined);
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      backend: "webgpu",
      requestId: "initial",
    })));
    onFrameReady.mockClear();
    vi.mocked(fake.device.queue.writeBuffer).mockClear();
    vi.mocked(fake.encoder.beginRenderPass).mockClear();
    const older = stroke({
      points: [5, 10, 20, 10],
      pressures: [0.5, 0.6],
    });
    const middle = stroke({
      points: [5, 10, 20, 10, 30, 10],
      pressures: [0.5, 0.6, 0.7],
    });
    const latest = stroke({
      points: [5, 10, 20, 10, 30, 10, 45, 10],
      pressures: [0.5, 0.6, 0.7, 0.9],
    });
    engine.render([older], "request:older");
    engine.render([middle], "request:middle");
    engine.render([latest], "request:latest");

    // The older submitted frame remains in flight while only the latest request is retained.
    await vi.waitFor(() => expect(fake.device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(2));
    submitted[1]!.resolve(undefined);
    await vi.waitFor(() => expect(fake.device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(3));
    expect(onFrameReady).not.toHaveBeenCalled();
    submitted[2]!.resolve(undefined);
    await vi.waitFor(() => expect(fake.device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(4));
    expect(onFrameReady).not.toHaveBeenCalled();
    submitted[3]!.resolve(undefined);
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledTimes(1));
    expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request:latest",
      backend: "webgpu",
      complete: true,
    }));
    const suffix = planStudioGpuDabUpdate([older], [latest]);
    expect(renderPassDescriptors(fake).some((descriptor) => (
      descriptor.colorAttachments.some((attachment) => attachment?.loadOp === "load")
    ))).toBe(true);
    expect(vi.mocked(fake.device.queue.writeBuffer).mock.calls.some((call) => (
      call[4] === suffix.dabs.length * 8 * Float32Array.BYTES_PER_ELEMENT
    ))).toBe(true);
    expect(fake.texture.destroy).not.toHaveBeenCalled();
  });

  it("loads a retained tile and writes only the exact suffix of one live stroke", async () => {
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const fake = fakeGpuDevice(neverLost);
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const onFrameReady = vi.fn();
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(context),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu,
      onFrameReady,
    });
    const initial = stroke({
      points: [0, 10, 20, 10],
      pressures: [0.5, 0.6],
    });
    const extended = stroke({
      points: [0, 10, 20, 10, 40, 10],
      pressures: [0.5, 0.6, 0.8],
    });
    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    engine.render([initial], "suffix:initial");
    await engine.initialize();
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      backend: "webgpu",
      requestId: "suffix:initial",
    })));

    vi.mocked(fake.device.queue.writeBuffer).mockClear();
    vi.mocked(fake.encoder.beginRenderPass).mockClear();
    engine.render([extended], "suffix:extended");
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "suffix:extended",
    })));

    const suffix = planStudioGpuDabUpdate([initial], [extended]);
    expect(renderPassDescriptors(fake).some((descriptor) => (
      descriptor.colorAttachments.some((attachment) => attachment?.loadOp === "load")
    ))).toBe(true);
    expect(vi.mocked(fake.device.queue.writeBuffer).mock.calls[0]?.[4]).toBe(
      suffix.dabs.length * 8 * Float32Array.BYTES_PER_ELEMENT
    );
    expect(fake.device.createTexture).toHaveBeenCalledTimes(1);
    expect(fake.texture.destroy).not.toHaveBeenCalled();
  });

  it("retains exact tiles, appends immutable operations, and rebuilds changed history", async () => {
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const fake = fakeGpuDevice(neverLost);
    const onFrameReady = vi.fn();
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(context),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu,
      onFrameReady,
    });
    const initial = stroke({
      orderKey: "a",
      points: [0, 0, 20, 0],
      pressures: [0.5, 0.6],
    });
    const appended = stroke({
      id: "second",
      orderKey: "z",
      points: [4, 4, 24, 4],
      pressures: [0.5, 0.7],
    });
    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    engine.render([initial]);
    await engine.initialize();
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      backend: "webgpu",
    })));

    vi.mocked(fake.device.queue.writeBuffer).mockClear();
    vi.mocked(fake.encoder.beginRenderPass).mockClear();
    vi.mocked(fake.encoder.copyTextureToTexture).mockClear();
    expect(fake.device.createTexture).toHaveBeenCalledTimes(1);
    engine.render([initial, appended], "tiles:append");
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "tiles:append",
    })));
    expect(renderPassDescriptors(fake).some((descriptor) => (
      descriptor.colorAttachments.some((attachment) => attachment?.loadOp === "load")
    ))).toBe(true);
    expect(vi.mocked(fake.device.queue.writeBuffer).mock.calls[0]?.[4]).toBe(
      planStudioGpuDabs([appended]).dabs.length * 8 * Float32Array.BYTES_PER_ELEMENT
    );
    expect(fake.device.createTexture).toHaveBeenCalledTimes(1);
    expect(fake.encoder.copyTextureToTexture).not.toHaveBeenCalled();

    const changedHistory = stroke({
      orderKey: "a",
      points: [0, 0, 19, 1, 24, 0],
      pressures: [0.5, 0.6, 0.7],
    });
    vi.mocked(fake.encoder.beginRenderPass).mockClear();
    engine.render([changedHistory, appended], "tiles:rebuild");
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "tiles:rebuild",
    })));
    expect(renderPassDescriptors(fake).some((descriptor) => (
      descriptor.label === "Studio retained tile 0:0"
      && descriptor.colorAttachments.some((attachment) => attachment?.loadOp === "clear")
    ))).toBe(true);

    const textureCount = vi.mocked(fake.device.createTexture).mock.calls.length;
    vi.mocked(fake.encoder.beginRenderPass).mockClear();
    engine.resize({ logicalWidth: 100, logicalHeight: 80, offsetX: 4 });
    await vi.waitFor(() => expect(fake.encoder.beginRenderPass).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Studio retained tile presentation" })
    ));
    expect(renderPassDescriptors(fake).some((descriptor) => (
      descriptor.label === "Studio retained tile 0:0"
    ))).toBe(false);
    expect(fake.device.createTexture).toHaveBeenCalledTimes(textureCount);
  });

  it("keeps viewport-bounded WebGPU authority when only offscreen ink exceeds the dab cap", async () => {
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const fake = fakeGpuDevice(neverLost);
    const onFrameReady = vi.fn((_receipt: StudioGpuFrameReceipt) => undefined);
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(context),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu,
      onFrameReady,
    });
    engine.resize({
      logicalWidth: 100,
      logicalHeight: 100_000,
      cssWidth: 100,
      cssHeight: 80,
      scaleY: 1_000,
    });
    await engine.initialize();
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      backend: "webgpu",
    })));
    onFrameReady.mockClear();

    const offscreenInk = [
      stroke({
        id: "offscreen-a",
        points: [10, 10_000, 10, 35_001],
        pressures: [1, 1],
        size: 1,
      }),
      stroke({
        id: "offscreen-b",
        points: [20, 10_000, 20, 35_001],
        pressures: [1, 1],
        size: 1,
      }),
    ];
    expect(planStudioGpuDabs(offscreenInk).complete).toBe(false);

    engine.render(offscreenInk, "tiles:offscreen-cap");

    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "tiles:offscreen-cap",
      backend: "webgpu",
      complete: true,
      dabCount: 0,
    })));
    expect(engine.getBackend()).toBe("webgpu");

    onFrameReady.mockClear();
    const crossing = stroke({
      id: "visible-crossing",
      points: [-100_000, 40, 100_000, 40],
      pressures: [1, 1],
      size: 1,
    });
    expect(planStudioGpuDabs([crossing]).complete).toBe(false);

    engine.render([crossing], "tiles:visible-crossing-cap");

    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "tiles:visible-crossing-cap",
      backend: "webgpu",
      complete: true,
    })));
    const crossingReceipt = onFrameReady.mock.calls[0]![0];
    expect(crossingReceipt.dabCount).toBeGreaterThan(0);
    expect(crossingReceipt.dabCount).toBeLessThan(1_000);
    expect(engine.getBackend()).toBe("webgpu");
  });

  it("destroys a device that resolves after initialization was cancelled", async () => {
    const requestDevice = deferred<GPUDevice>();
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const fake = fakeGpuDevice(neverLost);
    const adapter = { requestDevice: vi.fn(() => requestDevice.promise) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const fallback = fakeCanvas2d();
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(null),
      fallbackCanvas: fallback.canvas,
      gpu,
    });

    const initialization = engine.initialize();
    await vi.waitFor(() => expect(adapter.requestDevice).toHaveBeenCalled());
    engine.dispose();
    requestDevice.resolve(fake.device);

    await expect(initialization).resolves.toBe("canvas2d");
    expect(fake.device.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not authorize a WebGPU frame below the requested physical preview quality", async () => {
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const fake = fakeGpuDevice(neverLost);
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const onFrameReady = vi.fn();
    const onFrameInvalid = vi.fn();
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(context),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu,
      onFrameReady,
      onFrameInvalid,
    });
    engine.resize({
      logicalWidth: 100,
      logicalHeight: 80,
      cssWidth: 100,
      cssHeight: 80,
      dpr: 2,
      scaleX: 3,
      scaleY: 3,
    });
    onFrameReady.mockClear();
    await engine.initialize();
    await Promise.resolve();
    onFrameReady.mockClear();
    vi.mocked(fake.device.queue.submit).mockClear();

    engine.render([stroke()], "quality:over-cap");
    await Promise.resolve();

    expect(engine.getBackend()).toBe("webgpu");
    expect(onFrameInvalid).toHaveBeenCalled();
    expect(onFrameReady).not.toHaveBeenCalled();
    expect(fake.device.queue.submit).not.toHaveBeenCalled();
  });

  it("fails closed for empty or wholly non-finite strokes instead of approving a blank tile frame", async () => {
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const fake = fakeGpuDevice(neverLost);
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const onFrameReady = vi.fn();
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(context),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu,
      onFrameReady,
    });
    engine.resize({ logicalWidth: 100, logicalHeight: 80 });
    await engine.initialize();
    await vi.waitFor(() => expect(onFrameReady).toHaveBeenCalled());
    onFrameReady.mockClear();

    expect(isValidStudioGpuStroke(stroke({ points: [] }))).toBe(false);
    expect(isValidStudioGpuStroke(stroke({
      points: [Number.NaN, Number.NaN, Number.POSITIVE_INFINITY, 0],
    }))).toBe(false);
    engine.render([stroke({ points: [] })], "invalid:empty");
    await vi.waitFor(() => expect(engine.getBackend()).toBe("canvas2d"));

    expect(onFrameReady).not.toHaveBeenCalled();
  });

  it("keeps initialize idempotent once a live WebGPU device is installed", async () => {
    const neverLost = new Promise<GPUDeviceLostInfo>(() => undefined);
    const fake = fakeGpuDevice(neverLost);
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ view: true })) })),
    } as unknown as GPUCanvasContext;
    const adapter = { requestDevice: vi.fn(async () => fake.device) } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const engine = new StudioWebGpuEngine({
      canvas: fakeGpuCanvas(context),
      fallbackCanvas: fakeCanvas2d().canvas,
      gpu,
    });

    await expect(engine.initialize()).resolves.toBe("webgpu");
    await expect(engine.initialize()).resolves.toBe("webgpu");

    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(adapter.requestDevice).toHaveBeenCalledTimes(1);
    expect(fake.device.destroy).not.toHaveBeenCalled();
  });
});

describe("planStudioGpuDabs", () => {
  it("plans only the bridge and new samples for a retained point suffix", () => {
    const initial = stroke({
      points: [0, 0, 20, 0],
      pressures: [0.5, 0.6],
    });
    const extended = stroke({
      points: [0, 0, 20, 0, 40, 0],
      pressures: [0.5, 0.6, 0.8],
    });
    const expected = planStudioGpuDabUpdate([initial], [extended]);
    const planned = planStudioGpuStrokeExtensionInRect(
      extended,
      2,
      { x: -100, y: -100, width: 300, height: 300 }
    );

    expect(planned).toEqual({
      complete: true,
      dabs: expected.dabs,
      batches: expected.batches,
    });
    expect(planned.dabs[0]?.x).toBeGreaterThan(20);
    expect(planned.dabs.at(-1)?.x).toBe(40);
  });

  it("fails closed instead of looping on finite endpoints whose segment math overflows", () => {
    const overflowingSegment = planStudioGpuDabs([
      stroke({
        points: [-Number.MAX_VALUE, 0, Number.MAX_VALUE, 0],
        pressures: [0.5, 0.5],
      }),
    ]);
    const overflowingRadius = planStudioGpuDabs([
      stroke({ size: Number.MAX_VALUE }),
    ]);

    expect(overflowingSegment.complete).toBe(false);
    expect(overflowingSegment.dabs).toHaveLength(0);
    expect(overflowingRadius).toMatchObject({ complete: false, dabs: [] });
  });

  it("reports incomplete coverage instead of authorizing a silently truncated frame", () => {
    const planned = planStudioGpuDabs([
      stroke({
        size: 1,
        points: [0, 0, 50_001, 0],
        pressures: [1, 1],
      }),
    ]);

    expect(planned.complete).toBe(false);
    expect(planned.dabs).toHaveLength(STUDIO_GPU_MAX_DABS);
  });

  it("uses locale-independent operation order and color-independent erase coverage", () => {
    const planned = planStudioGpuDabs([
      stroke({ id: "umlaut", orderKey: "ä", points: [20, 0], color: "#ff0000" }),
      stroke({ id: "ascii", orderKey: "z", points: [10, 0], color: "#00ff00" }),
      stroke({
        id: "transparent-eraser",
        orderKey: "🙂",
        points: [30, 0],
        color: "transparent",
        opacity: 0.6,
        composite: "erase",
      }),
    ]);

    expect(planned.dabs.map(({ x }) => x)).toEqual([10, 20, 30]);
    expect(planned.dabs.at(-1)).toMatchObject({
      composite: "erase",
      alpha: 0.6,
    });
  });

  it("covers a segment with pressure-aware round dabs and deterministic batches", () => {
    const planned = planStudioGpuDabs([
      stroke({ id: "later", orderKey: "b", points: [0, 0, 12, 0] }),
      stroke({ id: "first", orderKey: "a", points: [0, 10, 12, 10], composite: "erase" }),
    ]);

    expect(planned.dabs.length).toBeGreaterThan(8);
    expect(planned.dabs[0]).toMatchObject({ x: 0, y: 10, composite: "erase" });
    expect(planned.dabs.at(-1)).toMatchObject({ x: 12, y: 0, composite: "normal" });
    expect(planned.batches.map((batch) => batch.composite)).toEqual(["erase", "normal"]);
    expect(planned.dabs[0]!.radius).toBeLessThan(planned.dabs.find((dab) => dab.x === 12 && dab.y === 10)!.radius);
  });

  it("plans only a strict compatible suffix and rebuilds replaced prediction tails", () => {
    const initial = stroke({
      points: [0, 0, 10, 0, 20, 0],
      pressures: [0.4, 0.5, 0.6],
    });
    const extended = stroke({
      points: [0, 0, 10, 0, 20, 0, 24, 2],
      pressures: [0.4, 0.5, 0.6, 0.8],
    });
    const initialPlan = planStudioGpuDabs([initial]);
    const fullExtendedPlan = planStudioGpuDabs([extended]);
    const append = planStudioGpuDabUpdate([initial], [extended]);

    expect(append.mode).toBe("append");
    expect(append.dabs.length).toBeLessThan(initialPlan.dabs.length);
    expect(initialPlan.dabs.concat(append.dabs)).toEqual(fullExtendedPlan.dabs);

    const predictionReplaced = stroke({
      points: [0, 0, 10, 0, 19, 1, 24, 2],
      pressures: [0.4, 0.5, 0.6, 0.8],
    });
    const rebuild = planStudioGpuDabUpdate([extended], [predictionReplaced]);
    expect(rebuild.mode).toBe("rebuild");
    expect(rebuild.dabs).toEqual(planStudioGpuDabs([predictionReplaced]).dabs);
  });

  it("appends deterministic normal/erase operation-log suffixes and rebuilds reordered history", () => {
    const ink = stroke({ id: "ink", orderKey: "a" });
    const eraser = stroke({
      id: "eraser",
      orderKey: "b",
      points: [8, 10, 18, 10],
      composite: "erase",
    });
    const appendEraser = planStudioGpuDabUpdate([ink], [ink, eraser]);

    expect(appendEraser.mode).toBe("append");
    expect(appendEraser.dabs).toEqual(planStudioGpuDabs([eraser]).dabs);
    expect(appendEraser.batches.map((batch) => batch.composite)).toEqual(["erase"]);
    expect(planStudioGpuDabs([ink]).dabs.concat(appendEraser.dabs)).toEqual(
      planStudioGpuDabs([ink, eraser]).dabs
    );

    const insertedBefore = stroke({ id: "inserted", orderKey: "0", points: [0, 20, 5, 20] });
    const reordered = planStudioGpuDabUpdate([ink], [ink, insertedBefore]);
    expect(reordered.mode).toBe("rebuild");
    expect(reordered.dabs).toEqual(planStudioGpuDabs([insertedBefore, ink]).dabs);
  });

  it("extends only the terminal live stroke after immutable completed operations", () => {
    const completed = stroke({ id: "completed", orderKey: "a", points: [0, 10, 10, 10] });
    const live = stroke({
      id: "live",
      orderKey: "b",
      points: [0, 20, 10, 20],
      pressures: [0.4, 0.5],
    });
    const extended = stroke({
      id: "live",
      orderKey: "b",
      points: [0, 20, 10, 20, 16, 22],
      pressures: [0.4, 0.5, 0.8],
    });
    const append = planStudioGpuDabUpdate([completed, live], [completed, extended]);

    expect(append.mode).toBe("append");
    expect(planStudioGpuDabs([completed, live]).dabs.concat(append.dabs)).toEqual(
      planStudioGpuDabs([completed, extended]).dabs
    );
  });
});
