import { describe, expect, it, vi } from "vitest";

import { StudioTiledDocumentStore, type StudioTileDocTileWriter } from "./studio-tiledoc-store";
import {
  StudioTileDocWebGpuBridge,
  type StudioTileDocWebGpuFrame,
  type StudioTileDocWebGpuSourceSnapshot,
} from "./studio-tiledoc-webgpu-bridge";
import {
  packStudioTileDocWebGpuUpload,
  planStudioTileDocWebGpuCompositeFrame,
  StudioTileDocWebGpuCompositeConsumer,
  STUDIO_TILEDOC_WEBGPU_COMPOSITE_TEXTURE_FORMAT,
  STUDIO_TILEDOC_WEBGPU_SUPPORTED_BLEND_MODES,
} from "./studio-tiledoc-webgpu-composite-consumer";

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}

interface FakeTexture {
  readonly texture: GPUTexture;
  readonly label: string;
  readonly descriptor: GPUTextureDescriptor;
  readonly destroyMock: ReturnType<typeof vi.fn>;
}

interface FakeGpuHarness {
  readonly gpu: GPU;
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly adapterRequest: ReturnType<typeof vi.fn>;
  readonly textureDescriptors: GPUTextureDescriptor[];
  readonly textures: FakeTexture[];
  readonly renderPassLabels: string[];
  readonly uploadFirstBytes: number[];
  readonly queueEvents: string[];
  readonly writeTexture: ReturnType<typeof vi.fn>;
  readonly submit: ReturnType<typeof vi.fn>;
  readonly onSubmittedWorkDone: ReturnType<typeof vi.fn>;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function fakeGpuHarness(lost = new Promise<GPUDeviceLostInfo>(() => undefined)): FakeGpuHarness {
  const textureDescriptors: GPUTextureDescriptor[] = [];
  const textures: FakeTexture[] = [];
  const renderPassLabels: string[] = [];
  const uploadFirstBytes: number[] = [];
  const queueEvents: string[] = [];
  const writeTexture = vi.fn((
    _destination: GPUTexelCopyTextureInfo,
    data: AllowSharedBufferSource
  ) => {
    queueEvents.push("writeTexture");
    const view = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    uploadFirstBytes.push(view[0] ?? -1);
  });
  const submit = vi.fn(() => queueEvents.push("submit"));
  const onSubmittedWorkDone = vi.fn(async () => {
    queueEvents.push("fence");
  });
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({ canvasView: true })),
    })),
  } as unknown as GPUCanvasContext;
  const canvas = {
    width: 512,
    height: 512,
    style: {},
    getContext: vi.fn((kind: string) => kind === "webgpu" ? context : null),
  } as unknown as HTMLCanvasElement;
  const device = {
    lost,
    limits: {
      maxTextureDimension2D: 8_192,
      minUniformBufferOffsetAlignment: 256,
    },
    queue: {
      writeTexture,
      submit,
      onSubmittedWorkDone,
    },
    createBindGroupLayout: vi.fn((descriptor: GPUBindGroupLayoutDescriptor) => ({
      descriptor,
    })),
    createPipelineLayout: vi.fn((descriptor: GPUPipelineLayoutDescriptor) => ({
      descriptor,
    })),
    createShaderModule: vi.fn((descriptor: GPUShaderModuleDescriptor) => ({ descriptor })),
    createRenderPipeline: vi.fn((descriptor: GPURenderPipelineDescriptor) => ({
      descriptor,
    })),
    createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
      textureDescriptors.push(descriptor);
      const destroyMock = vi.fn();
      const texture = {
        label: String(descriptor.label ?? ""),
        descriptor,
        createView: vi.fn(() => ({ textureLabel: descriptor.label })),
        destroy: destroyMock,
      } as unknown as GPUTexture;
      textures.push({
        texture,
        label: String(descriptor.label ?? ""),
        descriptor,
        destroyMock,
      });
      return texture;
    }),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const storage = new ArrayBuffer(Number(descriptor.size));
      return {
        getMappedRange: vi.fn(() => storage),
        unmap: vi.fn(),
        destroy: vi.fn(),
      };
    }),
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => ({ descriptor })),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn((descriptor: GPURenderPassDescriptor) => {
        renderPassLabels.push(String(descriptor.label ?? ""));
        return {
          setPipeline: vi.fn(),
          setVertexBuffer: vi.fn(),
          setBindGroup: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        };
      }),
      finish: vi.fn(() => ({ encoded: true })),
    })),
    destroy: vi.fn(),
  } as unknown as GPUDevice;
  const adapterRequest = vi.fn(async () => ({
    requestDevice: vi.fn(async () => device),
  }));
  const gpu = {
    requestAdapter: adapterRequest,
    getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
  } as unknown as GPU;
  return {
    gpu,
    canvas,
    context,
    device,
    adapterRequest,
    textureDescriptors,
    textures,
    renderPassLabels,
    uploadFirstBytes,
    queueEvents,
    writeTexture,
    submit,
    onSubmittedWorkDone,
  };
}

function source(
  red: number,
  overrides: Partial<StudioTileDocWebGpuSourceSnapshot> = {}
): StudioTileDocWebGpuSourceSnapshot {
  const rgba = new Uint8ClampedArray(64 * 64 * 4);
  rgba[0] = red;
  rgba[3] = 255;
  return {
    layerId: "ink",
    bufferId: 1,
    contentRevision: 1,
    opacity: 1,
    blendMode: "normal",
    pixelWidth: 64,
    pixelHeight: 64,
    byteLength: rgba.byteLength,
    rgba,
    ...overrides,
  };
}

function frame(
  overrides: Partial<StudioTileDocWebGpuFrame> = {}
): StudioTileDocWebGpuFrame {
  const firstSource = source(10);
  return {
    kind: "studio-tiledoc-webgpu-frame",
    requestSequence: 1,
    expectedPresentationRevision: 1,
    expectedContentRevision: 1,
    plannerFrameSequence: 1,
    plannerVisualRevision: 1,
    scopeId: "tiledoc-viewport:0:0:0:0",
    documentWidth: 64,
    documentHeight: 64,
    tileSize: 64,
    viewport: { x: 0, y: 0, width: 64, height: 64 },
    visibleTiles: [{
      id: "0:0",
      column: 0,
      row: 0,
      rect: { x: 0, y: 0, width: 64, height: 64 },
      stackDepth: 1,
    }],
    visibleTileIds: ["0:0"],
    dirtyTiles: [{
      id: "0:0",
      column: 0,
      row: 0,
      rect: { x: 0, y: 0, width: 64, height: 64 },
      action: "composite",
      stack: [firstSource],
    }],
    dirtyTileIds: ["0:0"],
    snapshotBytes: firstSource.byteLength,
    ...overrides,
  };
}

function paint(red: number): StudioTileDocTileWriter {
  return (pixels) => {
    pixels[0] = red;
    pixels[3] = 255;
  };
}

describe("studio tiledoc WebGPU composite planning", () => {
  it("builds a full visible presentation plan while accounting unique dirty uploads once", () => {
    const shared = source(10);
    const planned = planStudioTileDocWebGpuCompositeFrame(frame({
      visibleTiles: [
        {
          id: "0:0",
          column: 0,
          row: 0,
          rect: { x: 0, y: 0, width: 64, height: 64 },
          stackDepth: 2,
        },
        {
          id: "1:0",
          column: 1,
          row: 0,
          rect: { x: 64, y: 0, width: 32, height: 64 },
          stackDepth: 1,
        },
      ],
      visibleTileIds: ["0:0", "1:0"],
      dirtyTiles: [{
        id: "0:0",
        column: 0,
        row: 0,
        rect: { x: 0, y: 0, width: 64, height: 64 },
        action: "composite",
        stack: [
          shared,
          { ...shared, layerId: "tone", opacity: 0.5, blendMode: "multiply" },
        ],
      }],
      dirtyTileIds: ["0:0"],
      snapshotBytes: shared.byteLength,
      viewport: { x: 0, y: 0, width: 96, height: 64 },
      documentWidth: 96,
    }));

    expect(planned).toMatchObject({
      status: "ready",
      uploadBytes: 64 * 64 * 4,
      stackEntryCount: 2,
      presentationDraws: [
        { tileId: "0:0", firstVertex: 0, vertexCount: 6 },
        { tileId: "1:0", firstVertex: 6, vertexCount: 6 },
      ],
    });
    if (planned.status !== "ready") return;
    expect(planned.presentationVertices).toHaveLength(2 * 6 * 4);
    expect(planned.presentationVertices.at(-2)).toBeCloseTo(0.5);
    expect(planned.presentationVertices.at(-1)).toBeCloseTo(1);
  });

  it("fails closed for mismatched dirty identities, upload accounting and blend capability", () => {
    expect(planStudioTileDocWebGpuCompositeFrame(frame({
      dirtyTileIds: [],
    }))).toEqual({ status: "rejected", reason: "dirty-contract" });
    expect(planStudioTileDocWebGpuCompositeFrame(frame({
      snapshotBytes: 1,
    }))).toEqual({ status: "rejected", reason: "dirty-contract" });
    const unsupported = source(10, { blendMode: "future-blend" });
    expect(planStudioTileDocWebGpuCompositeFrame(frame({
      dirtyTiles: [{
        id: "0:0",
        column: 0,
        row: 0,
        rect: { x: 0, y: 0, width: 64, height: 64 },
        action: "composite",
        stack: [unsupported],
      }],
      snapshotBytes: unsupported.byteLength,
    }))).toMatchObject({
      status: "rejected",
      reason: "unsupported-blend-mode",
      layerId: "ink",
    });
  });

  it("packs unaligned RGBA rows into one reusable 256-byte-aligned staging view", () => {
    const rgba = new Uint8ClampedArray(3 * 2 * 4);
    rgba.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    rgba.set([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], 12);
    const narrow = {
      ...source(0),
      pixelWidth: 3,
      pixelHeight: 2,
      byteLength: rgba.byteLength,
      rgba,
    };
    const scratch = new Uint8Array(512);
    const packed = packStudioTileDocWebGpuUpload(narrow, scratch);

    expect(packed.bytes.buffer).toBe(scratch.buffer);
    expect(packed.bytesPerRow).toBe(256);
    expect(packed.rowsPerImage).toBe(2);
    expect([...packed.bytes.subarray(0, 12)]).toEqual([...rgba.subarray(0, 12)]);
    expect([...packed.bytes.subarray(256, 268)]).toEqual([...rgba.subarray(12, 24)]);
  });
});

describe("StudioTileDocWebGpuCompositeConsumer", () => {
  it("uploads and composites only dirty tiles, but submits presentation for clean camera frames", async () => {
    const harness = fakeGpuHarness();
    const store = new StudioTiledDocumentStore({
      documentWidth: 128,
      documentHeight: 64,
      tileSize: 64,
    });
    store.writeTile("ink", 0, 0, paint(10));
    store.writeTile("ink", 1, 0, paint(20));
    const consumer = new StudioTileDocWebGpuCompositeConsumer({
      canvas: harness.canvas,
      gpu: harness.gpu,
    });
    const bridge = new StudioTileDocWebGpuBridge({ store, consumer });
    const viewport = { x: 0, y: 0, width: 128, height: 64 };

    const first = await bridge.present({ viewport, layers: [{ id: "ink" }] });
    expect(first).toMatchObject({
      status: "ready",
      dirtyTileIds: ["0:0", "1:0"],
      deviceGeneration: 1,
    });
    expect(harness.adapterRequest).toHaveBeenCalledWith({
      powerPreference: "high-performance",
    });
    expect(harness.writeTexture).toHaveBeenCalledTimes(2);
    expect(harness.uploadFirstBytes).toEqual([10, 20]);
    expect(harness.textureDescriptors.filter(
      ({ format }) => format === STUDIO_TILEDOC_WEBGPU_COMPOSITE_TEXTURE_FORMAT
    )).toHaveLength(4);
    expect(harness.renderPassLabels.filter((label) => label.includes(" blend "))).toHaveLength(2);
    expect(harness.renderPassLabels.at(-1)).toContain("presentation");
    expect(harness.queueEvents).toEqual([
      "writeTexture",
      "writeTexture",
      "submit",
      "fence",
    ]);

    const cleanCamera = await bridge.present({
      viewport: { x: 1, y: 0, width: 127, height: 64 },
      layers: [{ id: "ink" }],
    });
    expect(cleanCamera).toMatchObject({
      status: "ready",
      dirtyTileIds: [],
      contentRevision: 1,
      presentationRevision: 2,
    });
    expect(harness.writeTexture).toHaveBeenCalledTimes(2);
    expect(harness.renderPassLabels.at(-1)).toContain("presentation");
    expect(harness.submit).toHaveBeenCalledTimes(2);
    expect(harness.onSubmittedWorkDone).toHaveBeenCalledTimes(2);

    store.writeTile("ink", 1, 0, paint(30));
    const edited = await bridge.present({ viewport, layers: [{ id: "ink" }] });
    expect(edited).toMatchObject({ status: "ready", dirtyTileIds: ["1:0"] });
    expect(harness.writeTexture).toHaveBeenCalledTimes(3);
    expect(harness.uploadFirstBytes.at(-1)).toBe(30);
  });

  it("performs a full dirty rebuild after paired consumer and bridge invalidation", async () => {
    const harness = fakeGpuHarness();
    const store = new StudioTiledDocumentStore({
      documentWidth: 128,
      documentHeight: 64,
      tileSize: 64,
    });
    store.writeTile("ink", 0, 0, paint(10));
    store.writeTile("ink", 1, 0, paint(20));
    const consumer = new StudioTileDocWebGpuCompositeConsumer({
      canvas: harness.canvas,
      gpu: harness.gpu,
    });
    const bridge = new StudioTileDocWebGpuBridge({ store, consumer });
    const request = {
      viewport: { x: 0, y: 0, width: 128, height: 64 },
      layers: [{ id: "ink" }],
    } as const;
    await bridge.present(request);
    expect(harness.writeTexture).toHaveBeenCalledTimes(2);

    consumer.invalidate();
    bridge.invalidate();
    const rebuilt = await bridge.present(request);
    expect(rebuilt).toMatchObject({
      status: "ready",
      presentationRevision: 2,
      contentRevision: 2,
      dirtyTileIds: ["0:0", "1:0"],
    });
    expect(harness.writeTexture).toHaveBeenCalledTimes(4);
    expect(consumer.stats()).toMatchObject({
      deviceGeneration: 1,
      retainedEntries: 2,
    });
  });

  it("removes retained texture pairs for clear tasks and bounds reusable source textures", async () => {
    const harness = fakeGpuHarness();
    const store = new StudioTiledDocumentStore({
      documentWidth: 64,
      documentHeight: 64,
      tileSize: 64,
    });
    store.writeTile("ink", 0, 0, paint(10));
    const consumer = new StudioTileDocWebGpuCompositeConsumer({
      canvas: harness.canvas,
      gpu: harness.gpu,
      maxUploadPoolEntries: 1,
      maxUploadPoolBytes: 64 * 64 * 4,
    });
    const bridge = new StudioTileDocWebGpuBridge({ store, consumer });
    const request = {
      viewport: { x: 0, y: 0, width: 64, height: 64 },
      layers: [{ id: "ink" }],
    } as const;
    await bridge.present(request);
    expect(consumer.stats()).toMatchObject({
      retainedEntries: 1,
      uploadPoolEntries: 1,
    });

    store.deleteTile("ink", 0, 0);
    const cleared = await bridge.present(request);
    expect(cleared).toMatchObject({
      status: "ready",
      dirtyTileIds: ["0:0"],
      visibleTileCount: 0,
    });
    expect(consumer.stats().retainedEntries).toBe(0);
    expect(harness.textures.filter(
      ({ label }) => label.includes("retained")
    ).every(({ destroyMock }) => destroyMock.mock.calls.length === 1)).toBe(true);
  });

  it("fails closed instead of exceeding the retained rgba16float texture budget", async () => {
    const harness = fakeGpuHarness();
    const store = new StudioTiledDocumentStore({
      documentWidth: 128,
      documentHeight: 64,
      tileSize: 64,
    });
    store.writeTile("ink", 0, 0, paint(10));
    store.writeTile("ink", 1, 0, paint(20));
    const consumer = new StudioTileDocWebGpuCompositeConsumer({
      canvas: harness.canvas,
      gpu: harness.gpu,
      maxRetainedEntries: 1,
      maxRetainedBytes: 64 * 64 * 8 * 2,
    });
    const bridge = new StudioTileDocWebGpuBridge({ store, consumer });

    expect(await bridge.present({
      viewport: { x: 0, y: 0, width: 128, height: 64 },
      layers: [{ id: "ink" }],
    })).toMatchObject({
      status: "rejected",
      reason: "consumer-rejected",
      consumerReason: "retained-texture-budget",
    });
    expect(consumer.stats()).toMatchObject({
      retainedEntries: 1,
      retainedBytes: 64 * 64 * 8 * 2,
    });
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("drops retained and pooled GPU resources on device loss and disposal", async () => {
    const loss = deferred<GPUDeviceLostInfo>();
    const harness = fakeGpuHarness(loss.promise);
    const recovered = fakeGpuHarness();
    const devices = [harness.device, recovered.device];
    let deviceIndex = 0;
    const recoveringGpu = {
      requestAdapter: vi.fn(async () => ({
        requestDevice: vi.fn(async () => devices[deviceIndex++]!),
      })),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
    } as unknown as GPU;
    const onDeviceLost = vi.fn();
    const consumer = new StudioTileDocWebGpuCompositeConsumer({
      canvas: harness.canvas,
      gpu: recoveringGpu,
      onDeviceLost,
    });
    const result = await consumer.present(frame(), new AbortController().signal);
    expect(result).toMatchObject({ status: "presented", deviceGeneration: 1 });
    expect(consumer.stats()).toMatchObject({
      retainedEntries: 1,
      uploadPoolEntries: 1,
    });

    const info = { reason: "unknown", message: "test loss" } as GPUDeviceLostInfo;
    loss.resolve(info);
    await Promise.resolve();
    await Promise.resolve();
    expect(onDeviceLost).toHaveBeenCalledWith(info);
    expect(consumer.stats()).toMatchObject({
      retainedEntries: 0,
      uploadPoolEntries: 0,
    });

    const recoveredResult = await consumer.present(frame({
      requestSequence: 2,
      expectedPresentationRevision: 2,
      expectedContentRevision: 2,
      plannerFrameSequence: 2,
      plannerVisualRevision: 2,
    }), new AbortController().signal);
    expect(recoveredResult).toMatchObject({
      status: "presented",
      requestSequence: 2,
      deviceGeneration: 2,
    });
    expect(recovered.writeTexture).toHaveBeenCalledTimes(1);

    consumer.dispose();
    expect(consumer.stats()).toMatchObject({ disposed: true, retainedEntries: 0 });
    expect(await consumer.present(frame(), new AbortController().signal)).toEqual({
      status: "rejected",
      reason: "disposed",
    });
  });

  it("advertises only blend modes implemented by the linear-light shader", () => {
    const harness = fakeGpuHarness();
    const consumer = new StudioTileDocWebGpuCompositeConsumer({
      canvas: harness.canvas,
      gpu: harness.gpu,
    });
    expect(consumer.supportedBlendModes).toEqual(STUDIO_TILEDOC_WEBGPU_SUPPORTED_BLEND_MODES);
    expect(consumer.supportedBlendModes).toContain("normal");
    expect(consumer.supportedBlendModes).toContain("multiply");
    expect(consumer.supportedBlendModes).toContain("hard-light");
    expect(consumer.supportedBlendModes).not.toContain("future-blend");
  });
});
