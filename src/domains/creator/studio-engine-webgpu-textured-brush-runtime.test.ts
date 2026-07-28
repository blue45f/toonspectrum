import { describe, expect, it, vi } from "vitest";

import {
  createStudioEngineWebGpuTexturedBrushRuntime,
  packStudioEngineWebGpuTexturedBrushDabs,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS,
} from "./studio-engine-webgpu-textured-brush-runtime";
import { sha256HexPortable } from "./studio-sha256";

import type {
  StudioEngineWebGpuTexturedBrushPlan,
} from "./studio-engine-webgpu-textured-brush-plan";

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}

interface FakeTexture {
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
  readonly lost: Deferred<GPUDeviceLostInfo>;
  readonly textures: FakeTexture[];
  readonly buffers: Array<{
    readonly descriptor: GPUBufferDescriptor;
    readonly destroy: ReturnType<typeof vi.fn>;
  }>;
  readonly passes: FakePass[];
  readonly shaderDescriptors: GPUShaderModuleDescriptor[];
  readonly pipelineDescriptors: GPURenderPipelineDescriptor[];
  readonly bindGroupDescriptors: GPUBindGroupDescriptor[];
  readonly writeBuffer: ReturnType<typeof vi.fn>;
  readonly writeTexture: ReturnType<typeof vi.fn>;
  readonly uploadedBuffers: Uint8Array[];
  readonly submitted: ReturnType<typeof vi.fn>;
  readonly onSubmittedWorkDone: ReturnType<typeof vi.fn>;
  readonly destroyDevice: ReturnType<typeof vi.fn>;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function fakeGpuHarness(
  fence: () => Promise<void> = async () => undefined,
): FakeGpuHarness {
  const lost = deferred<GPUDeviceLostInfo>();
  const textures: FakeTexture[] = [];
  const buffers: FakeGpuHarness["buffers"] = [];
  const passes: FakePass[] = [];
  const shaderDescriptors: GPUShaderModuleDescriptor[] = [];
  const pipelineDescriptors: GPURenderPipelineDescriptor[] = [];
  const bindGroupDescriptors: GPUBindGroupDescriptor[] = [];
  const uploadedBuffers: Uint8Array[] = [];
  const writeBuffer = vi.fn((
    _buffer: GPUBuffer,
    _offset: number,
    data: AllowSharedBufferSource,
  ) => {
    const source = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    uploadedBuffers.push(new Uint8Array(source));
  });
  const writeTexture = vi.fn();
  const submitted = vi.fn();
  const onSubmittedWorkDone = vi.fn(fence);
  const destroyDevice = vi.fn();
  const device = {
    lost: lost.promise,
    queue: {
      writeBuffer,
      writeTexture,
      submit: submitted,
      onSubmittedWorkDone,
    },
    createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
      const destroy = vi.fn();
      textures.push({ descriptor, destroy });
      return {
        createView: vi.fn(() => ({ textureLabel: descriptor.label })),
        destroy,
      } as unknown as GPUTexture;
    }),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const destroy = vi.fn();
      buffers.push({ descriptor, destroy });
      return { descriptor, destroy } as unknown as GPUBuffer;
    }),
    createSampler: vi.fn((descriptor: GPUSamplerDescriptor) => ({ descriptor })),
    createShaderModule: vi.fn((descriptor: GPUShaderModuleDescriptor) => {
      shaderDescriptors.push(descriptor);
      return { descriptor };
    }),
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
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => {
      bindGroupDescriptors.push(descriptor);
      return { descriptor };
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
    lost,
    textures,
    buffers,
    passes,
    shaderDescriptors,
    pipelineDescriptors,
    bindGroupDescriptors,
    writeBuffer,
    writeTexture,
    uploadedBuffers,
    submitted,
    onSubmittedWorkDone,
    destroyDevice,
  };
}

function texturedPlan(
  overrides: Partial<StudioEngineWebGpuTexturedBrushPlan> = {},
): StudioEngineWebGpuTexturedBrushPlan {
  const assetBytes = new Uint8Array([0, 64, 128, 255]);
  const porterDuff = overrides.dabs?.[0]?.composite.porterDuff ?? "source-over";
  const assets: StudioEngineWebGpuTexturedBrushPlan["assets"] = [{
    assetIndex: 0,
    role: "tip",
    assetId: "tip",
    contentHash: `sha256:${sha256HexPortable(assetBytes)}`,
    width: 2,
    height: 2,
    channel: "alpha",
    format: "r8-unorm",
    byteLength: 4,
    bytes: assetBytes,
  }];
  const dabs: StudioEngineWebGpuTexturedBrushPlan["dabs"] = [{
    index: 0,
    stationX: 8,
    stationY: 4,
    x: 8,
    y: 4,
    pressure: 0.7,
    diameter: 4,
    opacity: 0.8,
    flow: 0.5,
    grainDepth: 0.6,
    color: {
      space: "linear-srgb",
      alphaMode: "straight",
      components: [0.5, 0.25, 1, 0.4],
    },
    composite: { porterDuff, blendMode: "normal" },
    tip: {
      hardness: 0.65,
      roundness: 0.5,
      angleRadians: 0.25,
      localToDocument: [2, 0.5, -0.75, 1],
    },
  }];
  const batches: StudioEngineWebGpuTexturedBrushPlan["batches"] = [{
    key: `tip|none|${porterDuff}`,
    tipAssetIndex: 0,
    grainAssetIndex: null,
    porterDuff,
    firstInstance: 0,
    instanceCount: 1,
  }];
  return {
    kind: "studio-engine-webgpu-textured-brush-plan",
    version: 1,
    loweringVersion: 1,
    mode: "rebuild",
    strokeId: "textured-stroke",
    commandSequence: 1,
    dualTip: "extension-required",
    textureFormat: "rgba16float",
    colorModel: "scene-linear-premultiplied",
    tip: {
      assetIndex: 0,
      channel: "alpha",
      filtering: "bilinear",
      edgeMode: "transparent-zero-border",
      hardnessTransfer: "zero-to-one-smoothstep",
    },
    grain: {
      kind: "procedural-integer-noise",
      assetIndex: null,
      space: "stroke",
      scale: 8,
      depth: 0.75,
      contrast: 0.4,
      invert: false,
      seed: 0xabcd_1234,
      originX: 8,
      originY: 4,
      filtering: "integer-cell",
      edgeMode: "infinite",
    },
    assets,
    dabs,
    batches,
    ...overrides,
  };
}

function runtime(harness: FakeGpuHarness, overrides = {}) {
  const result = createStudioEngineWebGpuTexturedBrushRuntime({
    device: harness.device,
    width: 64,
    height: 32,
    ...overrides,
  });
  if (result.status !== "ready") throw new Error(result.reason);
  return result.runtime;
}

describe("textured RGBA16F WebGPU specialist runtime", () => {
  it("packs premultiplied colour, grain flags, seeds and texture dimensions", () => {
    const packed = packStudioEngineWebGpuTexturedBrushDabs(texturedPlan());

    expect(packed).toHaveLength(STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS);
    expect([...packed.slice(0, 6)]).toEqual([8, 4, 2, 0.5, -0.75, 1]);
    expect([...packed.slice(6, 10)]).toEqual([
      Math.fround(0.5 * 0.4),
      Math.fround(0.25 * 0.4),
      Math.fround(1 * 0.4),
      Math.fround(0.4),
    ]);
    expect([...packed.slice(10, 16)]).toEqual([
      Math.fround(0.65),
      Math.fround(0.6),
      8,
      Math.fround(0.4),
      8,
      4,
    ]);
    expect([...packed.slice(20, 28)]).toEqual([
      1,
      1,
      0x1234,
      0xabcd,
      2,
      2,
      1,
      1,
    ]);

    const base = texturedPlan();
    const maximumSeed = packStudioEngineWebGpuTexturedBrushDabs(texturedPlan({
      grain: {
        ...base.grain!,
        seed: 0xffff_ffff,
      },
    }));
    const low = maximumSeed[22]!;
    const high = maximumSeed[23]!;
    expect(Number.isInteger(low)).toBe(true);
    expect(Number.isInteger(high)).toBe(true);
    expect(((high << 16) | low) >>> 0).toBe(0xffff_ffff);
  });

  it("creates explicit source-over/destination-out pipelines and submits stable bound batches", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);
    const result = await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.receipt).toMatchObject({
      backend: "webgpu",
      textureFormat: "rgba16float",
      colorModel: "scene-linear-premultiplied",
      requestSequence: 1,
      deviceEpoch: 1,
      mode: "rebuild",
      dabCount: 1,
      batchCount: 1,
      assetCount: 1,
      assetBytes: 4,
      queueState: "completed",
      complete: true,
    });
    expect(harness.pipelineDescriptors).toHaveLength(2);
    expect(harness.pipelineDescriptors.map((descriptor) => descriptor.label)).toEqual([
      "Studio textured brush source-over pipeline",
      "Studio textured brush destination-out pipeline",
    ]);
    const shader = harness.shaderDescriptors[0]!.code;
    expect(shader).toContain("@vertex");
    expect(shader).toContain("@fragment");
    for (let binding = 0; binding <= 4; binding += 1) {
      expect(shader).toContain(`@binding(${binding})`);
    }
    expect(shader).toContain("integer_noise");
    expect(shader).toContain("let asset_grain = textureSample");
    expect(shader).not.toContain("if (grain_kind");
    expect(shader).toContain("let padded_size = tip_size + vec2f(2.0)");
    expect(shader).toContain(
      "let padded_uv = (uv * tip_size + vec2f(1.0)) / padded_size",
    );
    expect(shader).toContain("grain_invert");
    expect(shader).toContain(
      "u32(input.flags.z + 0.5) | (u32(input.flags.w + 0.5) << 16u)",
    );
    const sourceTarget = harness.pipelineDescriptors[0]!.fragment!.targets[0]!;
    const eraseTarget = harness.pipelineDescriptors[1]!.fragment!.targets[0]!;
    expect(sourceTarget).toMatchObject({
      format: "rgba16float",
      blend: {
        color: {
          operation: "add",
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
        },
        alpha: {
          operation: "add",
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
        },
      },
    });
    expect(eraseTarget).toMatchObject({
      format: "rgba16float",
      blend: {
        color: {
          operation: "add",
          srcFactor: "zero",
          dstFactor: "one-minus-src-alpha",
        },
        alpha: {
          operation: "add",
          srcFactor: "zero",
          dstFactor: "one-minus-src-alpha",
        },
      },
    });
    expect(harness.writeTexture).toHaveBeenCalledTimes(2);
    expect(harness.textures[1]!.descriptor.size).toEqual({
      width: 4,
      height: 4,
      depthOrArrayLayers: 1,
    });
    expect(harness.bindGroupDescriptors[0]!.entries).toHaveLength(5);
    expect(harness.passes[0]!.draw).toHaveBeenCalledWith(6, 1, 0, 0);
    expect(harness.passes[0]!.descriptor.colorAttachments[0]).toMatchObject({
      loadOp: "clear",
      storeOp: "store",
    });
    expect(harness.submitted).toHaveBeenCalledTimes(1);
  });

  it("reuses resident textures and stable bind groups across request sequences", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);
    expect((await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).status).toBe("completed");
    const textureWrites = harness.writeTexture.mock.calls.length;
    const bindGroups = harness.bindGroupDescriptors.length;
    expect((await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: texturedPlan({ mode: "append" }),
    })).status).toBe("completed");

    expect(harness.writeTexture).toHaveBeenCalledTimes(textureWrites);
    expect(harness.bindGroupDescriptors).toHaveLength(bindGroups);
    expect(harness.passes[1]!.descriptor.colorAttachments[0]).toMatchObject({
      loadOp: "load",
    });
  });

  it("separates cache entries for hash aliases with different dimensions or channels", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);
    const base = texturedPlan();
    expect((await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: base,
    })).status).toBe("completed");
    const afterBase = harness.writeTexture.mock.calls.length;
    const reshaped = texturedPlan({
      assets: [{
        ...base.assets[0]!,
        width: 1,
        height: 4,
      }],
    });
    expect((await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: reshaped,
    })).status).toBe("completed");
    expect(harness.writeTexture).toHaveBeenCalledTimes(afterBase + 1);
    expect(harness.textures.map((texture) => texture.descriptor.size)).toContainEqual({
      width: 3,
      height: 6,
      depthOrArrayLayers: 1,
    });

    const luminance = texturedPlan({
      tip: { ...base.tip, channel: "luminance" },
      assets: [{
        ...base.assets[0]!,
        channel: "luminance",
      }],
    });
    expect((await target.execute({
      requestSequence: 3,
      deviceEpoch: 1,
      plan: luminance,
    })).status).toBe("completed");
    expect(harness.writeTexture).toHaveBeenCalledTimes(afterBase + 2);
    expect(harness.bindGroupDescriptors).toHaveLength(3);

    const writesBeforeReplay = harness.writeTexture.mock.calls.length;
    expect((await target.execute({
      requestSequence: 4,
      deviceEpoch: 1,
      plan: luminance,
    })).status).toBe("completed");
    expect(harness.writeTexture).toHaveBeenCalledTimes(writesBeforeReplay);
  });

  it("rejects mutable asset bytes whose content no longer matches the plan hash", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);
    const base = texturedPlan();
    const mutated = texturedPlan({
      assets: [{
        ...base.assets[0]!,
        bytes: new Uint8Array([1, 64, 128, 255]),
      }],
    });

    expect(await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: mutated,
    })).toEqual({ status: "rejected", reason: "invalid-frame" });
    expect(harness.submitted).not.toHaveBeenCalled();
  });

  it("selects destination-out without changing the linear-premultiplied packing path", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);
    const base = texturedPlan();
    const destinationOut = texturedPlan({
      mode: "append",
      dabs: [{
        ...base.dabs[0]!,
        composite: { porterDuff: "destination-out", blendMode: "normal" },
      }],
      batches: [{
        ...base.batches[0]!,
        key: "tip|none|destination-out",
        porterDuff: "destination-out",
      }],
    });
    expect((await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: destinationOut,
    })).status).toBe("completed");

    const pipeline = harness.passes[0]!.setPipeline.mock.calls[0]![0] as {
      descriptor: GPURenderPipelineDescriptor;
    };
    expect(pipeline.descriptor.label).toBe(
      "Studio textured brush destination-out pipeline",
    );
  });

  it("enforces in-flight backpressure without consuming the rejected sequence", async () => {
    const gate = deferred<void>();
    const harness = fakeGpuHarness(() => gate.promise);
    const target = runtime(harness, { maximumInFlightSubmissions: 1 });
    const first = target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    });
    expect(await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: texturedPlan({ mode: "append" }),
    })).toEqual({ status: "busy", inFlight: 1, maximum: 1 });
    gate.resolve();
    expect((await first).status).toBe("completed");

    expect((await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: texturedPlan({ mode: "append" }),
    })).status).toBe("completed");
  });

  it("rejects cancellation, stale request/device epochs and resident asset overflow", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);
    const controller = new AbortController();
    controller.abort();
    expect(await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    }, controller.signal)).toEqual({ status: "cancelled" });
    expect(await target.execute({
      requestSequence: 1,
      deviceEpoch: 2,
      plan: texturedPlan(),
    })).toEqual({ status: "rejected", reason: "device-epoch" });
    expect((await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).status).toBe("completed");
    expect(await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).toEqual({ status: "rejected", reason: "request-sequence" });

    const limitedHarness = fakeGpuHarness();
    const limited = runtime(limitedHarness, { maximumResidentAssetBytes: 2 });
    expect(await limited.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).toEqual({ status: "rejected", reason: "resident-asset-budget" });
  });

  it("fails closed on device loss and disposes every owned resource exactly once", async () => {
    const harness = fakeGpuHarness();
    const onDeviceLost = vi.fn();
    const target = runtime(harness, { ownsDevice: true, onDeviceLost });
    const completed = await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    });
    expect(completed.status).toBe("completed");
    if (completed.status !== "completed") return;
    expect(completed.receipt.deviceEpoch).toBe(1);
    const info = { reason: "unknown", message: "test loss" } as GPUDeviceLostInfo;
    harness.lost.resolve(info);
    await Promise.resolve();
    expect(onDeviceLost).toHaveBeenCalledWith(info);
    expect(target.deviceEpoch).toBe(2);
    expect(await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).toEqual({ status: "device-lost", deviceEpoch: 2 });

    target.dispose();
    target.dispose();
    expect(harness.destroyDevice).toHaveBeenCalledTimes(1);
    expect(harness.textures.every((texture) => texture.destroy.mock.calls.length === 1)).toBe(true);
    expect(harness.buffers.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    expect(await target.execute({
      requestSequence: 3,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).toEqual({ status: "disposed" });
  });
});
