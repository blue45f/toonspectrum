import { describe, expect, it, vi } from "vitest";

import {
  convertLegacyStudioGpuDabPlanToLinear,
  createStudioEngineWebGpuBrushRuntime,
  fingerprintStudioEngineWebGpuBrushPlan,
  packStudioEngineWebGpuBrushDabs,
  STUDIO_ENGINE_WEBGPU_BRUSH_COLOR_MODEL,
  STUDIO_ENGINE_WEBGPU_BRUSH_INPUT_COLOR_ENCODING,
  STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_BYTES,
  STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT,
  validateStudioEngineWebGpuBrushPlan,
  type StudioEngineWebGpuBrushFrame,
  type StudioEngineWebGpuBrushRuntime,
} from "./studio-engine-webgpu-brush-runtime";
import { studioHighBitSrgbToLinear } from "./studio-highbit-transfer";

import type { StudioGpuDab, StudioGpuDabRenderUpdate } from "./studio-webgpu-dab-plan-contract";

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason?: unknown) => void;
}

interface FakeBuffer {
  readonly buffer: GPUBuffer;
  readonly descriptor: GPUBufferDescriptor;
  readonly destroy: ReturnType<typeof vi.fn>;
}

interface FakeTexture {
  readonly texture: GPUTexture;
  readonly descriptor: GPUTextureDescriptor;
  readonly destroy: ReturnType<typeof vi.fn>;
}

interface FakePass {
  readonly descriptor: GPURenderPassDescriptor;
  readonly setPipeline: ReturnType<typeof vi.fn>;
  readonly setVertexBuffer: ReturnType<typeof vi.fn>;
  readonly setBindGroup: ReturnType<typeof vi.fn>;
  readonly draw: ReturnType<typeof vi.fn>;
  readonly end: ReturnType<typeof vi.fn>;
}

interface FakeGpuHarness {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly surface: {
    width: number;
    height: number;
    getContext: ReturnType<
      typeof vi.fn<(contextId: "webgpu") => GPUCanvasContext | null>
    >;
  };
  readonly lost: Deferred<GPUDeviceLostInfo>;
  readonly buffers: FakeBuffer[];
  readonly textures: FakeTexture[];
  readonly passes: FakePass[];
  readonly pipelineDescriptors: GPURenderPipelineDescriptor[];
  readonly writeBuffer: ReturnType<typeof vi.fn>;
  readonly uploaded: Float32Array[];
  readonly submit: ReturnType<typeof vi.fn>;
  readonly onSubmittedWorkDone: ReturnType<typeof vi.fn>;
  readonly configure: ReturnType<typeof vi.fn>;
  readonly unconfigure: ReturnType<typeof vi.fn>;
  readonly destroyDevice: ReturnType<typeof vi.fn>;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fakeGpuHarness(
  options: {
    readonly width?: number;
    readonly height?: number;
    readonly fence?: () => Promise<void>;
  } = {},
): FakeGpuHarness {
  const lost = deferred<GPUDeviceLostInfo>();
  const buffers: FakeBuffer[] = [];
  const textures: FakeTexture[] = [];
  const passes: FakePass[] = [];
  const pipelineDescriptors: GPURenderPipelineDescriptor[] = [];
  const uploaded: Float32Array[] = [];
  const configure = vi.fn();
  const unconfigure = vi.fn();
  const context = {
    configure,
    unconfigure,
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({ canvas: true })),
    })),
  } as unknown as GPUCanvasContext;
  const surface = {
    width: options.width ?? 64,
    height: options.height ?? 32,
    getContext: vi.fn(
      (kind: "webgpu"): GPUCanvasContext | null => kind === "webgpu" ? context : null,
    ),
  };
  const writeBuffer = vi.fn((
    _buffer: GPUBuffer,
    _bufferOffset: number,
    data: AllowSharedBufferSource,
    dataOffset = 0,
    size?: number,
  ) => {
    const byteLength = size ?? (
      ArrayBuffer.isView(data)
        ? data.byteLength - dataOffset
        : data.byteLength - dataOffset
    );
    const source = ArrayBuffer.isView(data)
      ? data.buffer
      : data;
    uploaded.push(
      new Float32Array(source.slice(dataOffset, dataOffset + byteLength)),
    );
  });
  const submit = vi.fn();
  const onSubmittedWorkDone = vi.fn(options.fence ?? (async () => undefined));
  const destroyDevice = vi.fn();
  const device = {
    lost: lost.promise,
    limits: { maxTextureDimension2D: 8_192 },
    queue: {
      writeBuffer,
      submit,
      onSubmittedWorkDone,
    },
    createShaderModule: vi.fn((descriptor: GPUShaderModuleDescriptor) => ({ descriptor })),
    createBindGroupLayout: vi.fn((descriptor: GPUBindGroupLayoutDescriptor) => ({
      descriptor,
    })),
    createPipelineLayout: vi.fn((descriptor: GPUPipelineLayoutDescriptor) => ({
      descriptor,
    })),
    createRenderPipeline: vi.fn((descriptor: GPURenderPipelineDescriptor) => {
      pipelineDescriptors.push(descriptor);
      return { descriptor };
    }),
    createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
      const destroy = vi.fn();
      const texture = {
        descriptor,
        createView: vi.fn(() => ({ texture: descriptor.label })),
        destroy,
      } as unknown as GPUTexture;
      textures.push({ texture, descriptor, destroy });
      return texture;
    }),
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => ({ descriptor })),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const destroy = vi.fn();
      const buffer = { descriptor, destroy } as unknown as GPUBuffer;
      buffers.push({ buffer, descriptor, destroy });
      return buffer;
    }),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn((descriptor: GPURenderPassDescriptor) => {
        const pass: FakePass = {
          descriptor,
          setPipeline: vi.fn(),
          setVertexBuffer: vi.fn(),
          setBindGroup: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        };
        passes.push(pass);
        return pass;
      }),
      finish: vi.fn(() => ({ encoded: true })),
    })),
    destroy: destroyDevice,
  } as unknown as GPUDevice;
  return {
    device,
    context,
    surface,
    lost,
    buffers,
    textures,
    passes,
    pipelineDescriptors,
    writeBuffer,
    uploaded,
    submit,
    onSubmittedWorkDone,
    configure,
    unconfigure,
    destroyDevice,
  };
}

function dab(overrides: Partial<StudioGpuDab> = {}): StudioGpuDab {
  return {
    x: 8,
    y: 4,
    radius: 2,
    red: 0.5,
    green: 0.25,
    blue: 1,
    alpha: 0.4,
    composite: "normal",
    ...overrides,
  };
}

function update(
  mode: "append" | "rebuild",
  dabs: readonly StudioGpuDab[],
): StudioGpuDabRenderUpdate {
  const batches: StudioGpuDabRenderUpdate["batches"] = [];
  for (let index = 0; index < dabs.length;) {
    const composite = dabs[index]!.composite;
    let end = index + 1;
    while (end < dabs.length && dabs[end]!.composite === composite) end += 1;
    batches.push({
      composite,
      firstInstance: index,
      instanceCount: end - index,
    });
    index = end;
  }
  return {
    mode,
    dabs: [...dabs],
    batches,
    complete: true,
  };
}

function frame(
  requestSequence: number,
  renderUpdate: StudioGpuDabRenderUpdate,
  overrides: Partial<StudioEngineWebGpuBrushFrame> = {},
): StudioEngineWebGpuBrushFrame {
  return {
    requestSequence,
    resizeEpoch: 1,
    rasterRect: { x: 0, y: 0, width: 64, height: 32 },
    update: renderUpdate,
    ...overrides,
  };
}

async function readyRuntime(
  harness: FakeGpuHarness,
  options: {
    readonly maxDabs?: number;
    readonly maxSurfacePixels?: number;
    readonly ownsDevice?: boolean;
    readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
  } = {},
): Promise<StudioEngineWebGpuBrushRuntime> {
  const result = await createStudioEngineWebGpuBrushRuntime({
    surface: harness.surface,
    boundary: {
      device: harness.device,
      context: harness.context,
      canvasFormat: "bgra8unorm",
      ownsDevice: options.ownsDevice,
    },
    maxDabs: options.maxDabs,
    maxSurfacePixels: options.maxSurfacePixels,
    onDeviceLost: options.onDeviceLost,
  });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("fake WebGPU runtime did not initialize");
  return result.runtime;
}

function attachment(pass: FakePass): GPURenderPassColorAttachment {
  return pass.descriptor.colorAttachments[0] as GPURenderPassColorAttachment;
}

describe("Studio Engine Worker WebGPU brush runtime", () => {
  it("fails closed with an explicit unsupported result when WebGPU is absent", async () => {
    const harness = fakeGpuHarness();
    const result = await createStudioEngineWebGpuBrushRuntime({
      surface: harness.surface,
      gpu: null,
    });

    expect(result).toEqual({
      status: "unsupported",
      reason: "webgpu-unavailable",
    });
    expect(harness.surface.getContext).not.toHaveBeenCalled();
  });

  it("creates only WebGPU RGBA16F linear-premultiplied brush resources", async () => {
    const harness = fakeGpuHarness();
    const runtime = await readyRuntime(harness);

    expect(harness.textures).toHaveLength(1);
    expect(harness.textures[0]!.descriptor).toMatchObject({
      format: STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT,
      size: { width: 64, height: 32, depthOrArrayLayers: 1 },
    });
    expect(harness.configure).toHaveBeenCalledWith(expect.objectContaining({
      device: harness.device,
      format: "bgra8unorm",
      alphaMode: "premultiplied",
      colorSpace: "srgb",
    }));

    const normal = harness.pipelineDescriptors.find(
      (descriptor) => descriptor.label === "Studio Engine Worker normal analytic dab pipeline",
    );
    const erase = harness.pipelineDescriptors.find(
      (descriptor) => descriptor.label === "Studio Engine Worker erase analytic dab pipeline",
    );
    expect(normal?.fragment?.targets?.[0]).toMatchObject({
      format: "rgba16float",
      blend: {
        color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      },
    });
    expect(erase?.fragment?.targets?.[0]).toMatchObject({
      format: "rgba16float",
      blend: {
        color: { srcFactor: "zero", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "zero", dstFactor: "one-minus-src-alpha" },
      },
    });
    expect(runtime.stats()).toMatchObject({
      status: "ready",
      surfaceBytes: 64 * 32 * 8,
      surfaceTextureAllocations: 1,
    });
  });

  it("premultiplies canonical scene-linear input without a second transfer decode", () => {
    const packed = packStudioEngineWebGpuBrushDabs(
      [dab()],
      { x: 0, y: 0, width: 64, height: 32 },
      64,
      32,
    );

    expect(packed).toHaveLength(9);
    expect(packed[0]).toBeCloseTo(-0.75);
    expect(packed[1]).toBeCloseTo(0.75);
    expect(packed[2]).toBeCloseTo(6 / 64);
    expect(packed[3]).toBeCloseTo(6 / 32);
    expect(packed[4]).toBeCloseTo(0.5 * 0.4);
    expect(packed[5]).toBeCloseTo(0.25 * 0.4);
    expect(packed[6]).toBeCloseTo(0.4);
    expect(packed[7]).toBeCloseTo(0.4);
    expect(packed[8]).toBeCloseTo(2 / 3);
  });

  it("keeps legacy encoded-sRGB conversion behind an explicit one-way adapter", () => {
    const legacy = update("rebuild", [dab()]);
    const canonical = convertLegacyStudioGpuDabPlanToLinear(legacy);

    expect(canonical.dabs[0]).toMatchObject({
      red: studioHighBitSrgbToLinear(0.5),
      green: studioHighBitSrgbToLinear(0.25),
      blue: 1,
      alpha: 0.4,
    });
    const packed = packStudioEngineWebGpuBrushDabs(
      canonical.dabs,
      { x: 0, y: 0, width: 64, height: 32 },
      64,
      32,
    );
    expect(packed[4]).toBeCloseTo(studioHighBitSrgbToLinear(0.5) * 0.4);
  });

  it("submits normal and erase batches in exact analytic plan order and returns a pure receipt", async () => {
    const harness = fakeGpuHarness();
    const runtime = await readyRuntime(harness);
    const renderFrame = frame(1, update("rebuild", [
      dab({ x: 2 }),
      dab({ x: 3 }),
      dab({ x: 4, composite: "erase", alpha: 0.25 }),
      dab({ x: 5, composite: "normal", alpha: 0.75 }),
    ]));

    const result = await runtime.execute(renderFrame);

    expect(result.status).toBe("presented");
    if (result.status !== "presented") return;
    expect(harness.writeBuffer).toHaveBeenCalledTimes(1);
    expect(harness.uploaded[0]).toHaveLength(4 * 9);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.passes).toHaveLength(2);
    expect(attachment(harness.passes[0]!).loadOp).toBe("clear");
    expect(harness.passes[0]!.draw.mock.calls).toEqual([
      [6, 2, 0, 0],
      [6, 1, 0, 2],
      [6, 1, 0, 3],
    ]);
    expect(
      harness.passes[0]!.setPipeline.mock.calls.map(([pipeline]) =>
        (pipeline as { descriptor: GPURenderPipelineDescriptor }).descriptor.label),
    ).toEqual([
      "Studio Engine Worker normal analytic dab pipeline",
      "Studio Engine Worker erase analytic dab pipeline",
      "Studio Engine Worker normal analytic dab pipeline",
    ]);
    expect(harness.passes[1]!.draw).toHaveBeenCalledWith(3, 1, 0, 0);
    expect(result.receipt).toEqual({
      kind: "studio-engine-webgpu-brush-receipt",
      revision: 1,
      backend: "webgpu",
      requestSequence: 1,
      resizeEpoch: 1,
      deviceEpoch: 1,
      width: 64,
      height: 32,
      textureFormat: STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT,
      colorModel: STUDIO_ENGINE_WEBGPU_BRUSH_COLOR_MODEL,
      inputColorEncoding: STUDIO_ENGINE_WEBGPU_BRUSH_INPUT_COLOR_ENCODING,
      mode: "rebuild",
      dabCount: 4,
      batchCount: 3,
      batchOrder: ["normal", "erase", "normal"],
      planFingerprint: fingerprintStudioEngineWebGpuBrushPlan(renderFrame),
      complete: true,
    });
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.isFrozen(result.receipt.batchOrder)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.receipt))).toEqual(result.receipt);
    expect(Object.keys(result.receipt)).not.toContain("device");
    expect(Object.keys(result.receipt)).not.toContain("context");
    expect(Object.values(result.receipt)).not.toContain(harness.device);
    expect(Object.values(result.receipt)).not.toContain(harness.context);
  });

  it("uses one numeric fingerprint workspace regardless of dab count", () => {
    const NativeDataView = DataView;
    let dataViewConstructions = 0;
    const CountingDataView = new Proxy(NativeDataView, {
      construct(target, argumentsList) {
        dataViewConstructions += 1;
        return Reflect.construct(target, argumentsList);
      },
    });
    vi.stubGlobal("DataView", CountingDataView);
    try {
      const renderFrame = frame(1, update("rebuild", Array.from(
        { length: 2_048 },
        (_, index) => dab({ x: index % 64, y: Math.floor(index / 64) }),
      )));
      expect(fingerprintStudioEngineWebGpuBrushPlan(renderFrame)).toMatch(/^2048:1:/);
      expect(dataViewConstructions).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retains the RGBA16F surface for append and preserves bounded grow-only allocations", async () => {
    const harness = fakeGpuHarness();
    const runtime = await readyRuntime(harness, { maxDabs: 4 });

    await expect(runtime.execute(frame(1, update("append", [dab()])))).resolves.toEqual({
      status: "rejected",
      reason: "append-without-base",
    });
    await expect(runtime.execute(frame(1, update("rebuild", [dab()])))).resolves.toMatchObject({
      status: "presented",
    });
    await expect(runtime.execute(frame(2, update("append", [
      dab({ x: 9 }),
      dab({ x: 10 }),
      dab({ x: 11 }),
    ])))).resolves.toMatchObject({
      status: "presented",
      receipt: { mode: "append", requestSequence: 2 },
    });

    expect(attachment(harness.passes[2]!).loadOp).toBe("load");
    expect(harness.buffers).toHaveLength(1);
    expect(harness.buffers[0]!.descriptor.size).toBe(4 * STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_BYTES);
    expect(runtime.stats()).toMatchObject({
      instanceCapacity: 4,
      instanceBufferAllocations: 1,
      surfaceTextureAllocations: 1,
      submissions: 2,
    });

    await expect(runtime.execute(frame(3, update("append", Array.from(
      { length: 5 },
      (_, index) => dab({ x: index }),
    ))))).resolves.toEqual({
      status: "rejected",
      reason: "request-limit",
    });
    expect(harness.submit).toHaveBeenCalledTimes(2);
    expect(harness.buffers).toHaveLength(1);
  });

  it("rejects non-contiguous, composite-mismatched, and incomplete plans before GPU mutation", async () => {
    const harness = fakeGpuHarness();
    const runtime = await readyRuntime(harness);
    const mismatched: StudioGpuDabRenderUpdate = {
      mode: "rebuild",
      dabs: [dab({ composite: "erase" })],
      batches: [{ composite: "normal", firstInstance: 0, instanceCount: 1 }],
      complete: true,
    };
    const gapped: StudioGpuDabRenderUpdate = {
      mode: "rebuild",
      dabs: [dab(), dab()],
      batches: [{ composite: "normal", firstInstance: 1, instanceCount: 1 }],
      complete: true,
    };

    expect(validateStudioEngineWebGpuBrushPlan(mismatched, 8)).toBeNull();
    expect(validateStudioEngineWebGpuBrushPlan(gapped, 8)).toBeNull();
    await expect(runtime.execute(frame(1, mismatched))).resolves.toEqual({
      status: "rejected",
      reason: "invalid-plan",
    });
    await expect(runtime.execute(frame(1, { ...update("rebuild", [dab()]), complete: false })))
      .resolves.toEqual({
        status: "rejected",
        reason: "incomplete-plan",
      });
    expect(harness.writeBuffer).not.toHaveBeenCalled();
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("contains hostile proxy and getter failures at the public validation boundary", async () => {
    const harness = fakeGpuHarness();
    const runtime = await readyRuntime(harness);
    const hostileFrame = new Proxy(frame(1, update("rebuild", [dab()])), {
      get(target, property, receiver) {
        if (property === "update") throw new Error("hostile update getter");
        return Reflect.get(target, property, receiver);
      },
    });
    const hostileDab = new Proxy(dab(), {
      get(target, property, receiver) {
        if (property === "red") throw new Error("hostile color getter");
        return Reflect.get(target, property, receiver);
      },
    });
    const hostilePlan = update("rebuild", [hostileDab]);

    expect(() => validateStudioEngineWebGpuBrushPlan(hostilePlan, 8)).not.toThrow();
    expect(validateStudioEngineWebGpuBrushPlan(hostilePlan, 8)).toBeNull();
    await expect(runtime.execute(hostileFrame)).resolves.toEqual({
      status: "rejected",
      reason: "invalid-plan",
    });
    await expect(runtime.execute(frame(1, hostilePlan))).resolves.toEqual({
      status: "rejected",
      reason: "invalid-plan",
    });
    expect(harness.writeBuffer).not.toHaveBeenCalled();
    expect(harness.submit).not.toHaveBeenCalled();
    expect(runtime.stats().status).toBe("ready");
  });

  it("makes resize epochs monotonic, destroys the prior surface, and requires a rebuild", async () => {
    const harness = fakeGpuHarness();
    const runtime = await readyRuntime(harness);
    await runtime.execute(frame(1, update("rebuild", [dab()])));
    const originalTexture = harness.textures[0]!;

    expect(runtime.resize({ width: 128, height: 64, resizeEpoch: 1 })).toEqual({
      status: "rejected",
      reason: "stale-resize-epoch",
    });
    expect(runtime.resize({ width: 128, height: 64, resizeEpoch: 2 })).toEqual({
      status: "ready",
      resizeEpoch: 2,
      width: 128,
      height: 64,
    });
    expect(originalTexture.destroy).toHaveBeenCalledTimes(1);
    expect(harness.textures.at(-1)!.descriptor).toMatchObject({
      format: "rgba16float",
      size: { width: 128, height: 64 },
    });
    await expect(runtime.execute(frame(2, update("append", [dab()]), {
      resizeEpoch: 2,
      rasterRect: { x: 0, y: 0, width: 128, height: 64 },
    }))).resolves.toEqual({
      status: "rejected",
      reason: "append-without-base",
    });
    await expect(runtime.execute(frame(2, update("rebuild", [dab()]), {
      resizeEpoch: 2,
      rasterRect: { x: 0, y: 0, width: 128, height: 64 },
    }))).resolves.toMatchObject({
      status: "presented",
      receipt: { resizeEpoch: 2, width: 128, height: 64 },
    });
  });

  it("rejects surface allocation beyond explicit pixel and device limits without replacing state", async () => {
    const harness = fakeGpuHarness({ width: 16, height: 16 });
    const runtime = await readyRuntime(harness, { maxSurfacePixels: 512 });

    expect(runtime.resize({ width: 32, height: 32, resizeEpoch: 2 })).toEqual({
      status: "rejected",
      reason: "invalid-resize",
    });
    expect(harness.textures).toHaveLength(1);
    expect(runtime.stats()).toMatchObject({
      status: "ready",
      width: 16,
      height: 16,
      surfaceBytes: 16 * 16 * 8,
      resizeEpoch: 1,
    });
  });

  it("rejects concurrent work instead of allowing receipt or staging-buffer reordering", async () => {
    const fence = deferred<void>();
    const harness = fakeGpuHarness({ fence: () => fence.promise });
    const runtime = await readyRuntime(harness);
    const first = runtime.execute(frame(1, update("rebuild", [dab()])));

    await expect(runtime.execute(frame(2, update("rebuild", [dab()])))).resolves.toEqual({
      status: "rejected",
      reason: "busy",
    });
    fence.resolve();
    await expect(first).resolves.toMatchObject({
      status: "presented",
      receipt: { requestSequence: 1 },
    });
    expect(harness.submit).toHaveBeenCalledTimes(1);
  });

  it("device loss invalidates all resources and leaves no fallback-authorized receipt", async () => {
    const harness = fakeGpuHarness();
    const onDeviceLost = vi.fn();
    const runtime = await readyRuntime(harness, { onDeviceLost });
    await runtime.execute(frame(1, update("rebuild", [dab()])));
    const texture = harness.textures[0]!;
    const buffer = harness.buffers[0]!;
    const info = { reason: "unknown", message: "test loss" } as GPUDeviceLostInfo;

    harness.lost.resolve(info);
    await harness.lost.promise;
    await Promise.resolve();

    expect(runtime.stats()).toMatchObject({
      status: "device-lost",
      deviceEpoch: 2,
      instanceCapacity: 0,
    });
    expect(texture.destroy).toHaveBeenCalledTimes(1);
    expect(buffer.destroy).toHaveBeenCalledTimes(1);
    expect(harness.unconfigure).toHaveBeenCalledTimes(1);
    expect(onDeviceLost).toHaveBeenCalledWith(info);
    await expect(runtime.execute(frame(2, update("rebuild", [dab()])))).resolves.toEqual({
      status: "rejected",
      reason: "device-lost",
    });
    expect(harness.destroyDevice).not.toHaveBeenCalled();
  });

  it("dispose during a fence rejects the pending receipt and respects device ownership", async () => {
    const fence = deferred<void>();
    const shared = fakeGpuHarness({ fence: () => fence.promise });
    const runtime = await readyRuntime(shared);
    const pending = runtime.execute(frame(1, update("rebuild", [dab()])));

    runtime.dispose();
    fence.resolve();

    await expect(pending).resolves.toEqual({
      status: "rejected",
      reason: "disposed",
    });
    expect(shared.destroyDevice).not.toHaveBeenCalled();
    expect(runtime.stats().status).toBe("disposed");

    const dedicated = fakeGpuHarness();
    const ownedRuntime = await readyRuntime(dedicated, { ownsDevice: true });
    ownedRuntime.dispose();
    ownedRuntime.dispose();
    expect(dedicated.destroyDevice).toHaveBeenCalledTimes(1);
  });

  it("turns a rejected queue fence into a fail-closed runtime", async () => {
    const harness = fakeGpuHarness({
      fence: async () => {
        throw new Error("validation failure");
      },
    });
    const runtime = await readyRuntime(harness);

    await expect(runtime.execute(frame(1, update("rebuild", [dab()])))).resolves.toEqual({
      status: "rejected",
      reason: "submission-failed",
    });
    expect(runtime.stats().status).toBe("failed");
    expect(harness.textures[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(harness.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    await expect(runtime.execute(frame(2, update("rebuild", [dab()])))).resolves.toEqual({
      status: "rejected",
      reason: "runtime-failed",
    });
  });
});
