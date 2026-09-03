import { describe, expect, it, vi } from "vitest";

import { sha256HexPortable } from "../studio-sha256";

import {
  fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics,
  type StudioEngineWebGpuTexturedBrushPlan,
} from "./studio-engine-webgpu-textured-brush-plan";
import {
  packStudioEngineWebGpuTexturedBrushDabs,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS,
} from "./studio-engine-webgpu-textured-brush-runtime";
import {
  createStudioEngineWebGpuTexturedBrushRuntime,
  packStudioEngineWebGpuTexturedBrushDabsV2,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V1_VERTICES_PER_DAB,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
  studioEngineWebGpuTexturedBrushV2SupportsPlan,
} from "./studio-engine-webgpu-textured-brush-runtime-v2";

function deepFreeze<T>(value: T): T {
  if (
    typeof value !== "object"
    || value === null
    || Object.isFrozen(value)
    || ArrayBuffer.isView(value)
  ) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function texturedPlan(
  dabCount = 3,
  overrides: Partial<StudioEngineWebGpuTexturedBrushPlan> = {},
): StudioEngineWebGpuTexturedBrushPlan {
  const assetBytes = new Uint8Array([
    0, 32, 96, 160,
    16, 96, 192, 240,
    0, 64, 160, 255,
  ]);
  const dabs: StudioEngineWebGpuTexturedBrushPlan["dabs"] = Array.from(
    { length: dabCount },
    (_, index) => {
      const pressure = 0.25 + index / Math.max(1, dabCount - 1) * 0.7;
      const radius = 2 + pressure * 3;
      const angle = index * 0.11;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const opacity = 0.8;
      const flow = 0.5;
      return deepFreeze({
        index,
        stationX: 12 + index * 3,
        stationY: 9 + Math.sin(index * 0.5),
        x: 12 + index * 3,
        y: 9 + Math.sin(index * 0.5),
        pressure,
        diameter: radius * 2,
        opacity,
        flow,
        grainDepth: 0.6,
        color: {
          space: "linear-srgb" as const,
          alphaMode: "straight" as const,
          components: [0.5, 0.25, 1, opacity * flow] as const,
        },
        composite: { porterDuff: "source-over" as const, blendMode: "normal" as const },
        tip: {
          hardness: 0.65,
          roundness: 0.5,
          angleRadians: angle,
          localToDocument: [
            cosine * radius,
            sine * radius,
            -sine * radius * 0.5,
            cosine * radius * 0.5,
          ] as const,
        },
      });
    },
  );
  const base: StudioEngineWebGpuTexturedBrushPlan = {
    kind: "studio-engine-webgpu-textured-brush-plan",
    version: 1,
    loweringVersion: 1,
    mode: "rebuild",
    strokeId: "compact-v2-test",
    commandSequence: 1,
    dualTip: "extension-required",
    textureFormat: "rgba16float",
    colorModel: "scene-linear-premultiplied",
    tip: deepFreeze({
      assetIndex: 0,
      channel: "alpha",
      filtering: "bilinear",
      edgeMode: "transparent-zero-border",
      hardnessTransfer: "zero-to-one-smoothstep",
    }),
    grain: deepFreeze({
      kind: "procedural-integer-noise",
      assetIndex: null,
      space: "stroke",
      scale: 8,
      depth: 0.75,
      contrast: 0.4,
      invert: false,
      seed: 0xabcd_1234,
      originX: 12,
      originY: 9,
      filtering: "integer-cell",
      edgeMode: "infinite",
    }),
    assets: deepFreeze([deepFreeze({
      assetIndex: 0,
      role: "tip",
      assetId: "compact-v2-tip",
      contentHash: `sha256:${sha256HexPortable(assetBytes)}`,
      width: 4,
      height: 3,
      channel: "alpha",
      format: "r8-unorm",
      byteLength: assetBytes.byteLength,
      bytes: assetBytes,
    })]),
    dabs: deepFreeze(dabs),
    batches: deepFreeze([deepFreeze({
      key: "tip|none|source-over",
      tipAssetIndex: 0,
      grainAssetIndex: null,
      porterDuff: "source-over",
      firstInstance: 0,
      instanceCount: dabs.length,
    })]),
    grainSamplingSemantics: "specialist-texture-v1",
    ...overrides,
  };
  const semanticFingerprint = fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics({
    ...base,
    semanticFingerprint: undefined,
  });
  if (!semanticFingerprint) throw new Error("semantic fingerprint failed");
  return deepFreeze({ ...base, semanticFingerprint });
}

function fakeCreationDevice() {
  const pipelines: GPURenderPipelineDescriptor[] = [];
  const buffers: Array<GPUBufferDescriptor> = [];
  const destroy = vi.fn();
  const lost = new Promise<GPUDeviceLostInfo>(() => undefined);
  const device = {
    lost,
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(async () => null),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      buffers.push(descriptor);
      return { destroy: vi.fn() } as unknown as GPUBuffer;
    }),
    createSampler: vi.fn(() => ({} as GPUSampler)),
    createShaderModule: vi.fn(() => ({} as GPUShaderModule)),
    createBindGroupLayout: vi.fn(() => ({} as GPUBindGroupLayout)),
    createPipelineLayout: vi.fn(() => ({} as GPUPipelineLayout)),
    createRenderPipeline: vi.fn((descriptor: GPURenderPipelineDescriptor) => {
      pipelines.push(descriptor);
      return {} as GPURenderPipeline;
    }),
    destroy,
  } as unknown as GPUDevice;
  return { device, pipelines, buffers, destroy };
}

describe("compact textured WebGPU brush v2", () => {
  it("preserves every pixel-authoritative per-dab field while cutting transport by 57%", () => {
    const plan = texturedPlan(7);
    const v1 = packStudioEngineWebGpuTexturedBrushDabs(plan);
    const v2 = packStudioEngineWebGpuTexturedBrushDabsV2(plan);

    expect(studioEngineWebGpuTexturedBrushV2SupportsPlan(plan)).toBe(true);
    expect(v1).toHaveLength(7 * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS);
    expect(v2).toHaveLength(7 * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS);
    for (let index = 0; index < plan.dabs.length; index += 1) {
      const v1Offset = index * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS;
      const v2Offset = index * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS;
      expect([...v2.slice(v2Offset, v2Offset + 12)]).toEqual([
        ...v1.slice(v1Offset, v1Offset + 12),
      ]);
    }
    expect(STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES).toBe(48);
    expect(STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES).toBe(112);
    expect(
      1 - STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES
        / STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
    ).toBeCloseTo(4 / 7, 10);
    expect(STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB).toBe(4);
    expect(STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V1_VERTICES_PER_DAB).toBe(6);
  });

  it("fails closed outside the measured product lane", () => {
    const valid = texturedPlan();
    expect(studioEngineWebGpuTexturedBrushV2SupportsPlan(valid)).toBe(true);
    expect(studioEngineWebGpuTexturedBrushV2SupportsPlan(deepFreeze({
      ...valid,
      mode: "append",
    }))).toBe(false);
    expect(studioEngineWebGpuTexturedBrushV2SupportsPlan(deepFreeze({
      ...valid,
      durableR8GrainSource: {} as never,
    }))).toBe(false);
    expect(studioEngineWebGpuTexturedBrushV2SupportsPlan(deepFreeze({
      ...valid,
      grainSamplingSemantics: "durable-r8-cpu-parity-v1",
    }))).toBe(false);
    expect(studioEngineWebGpuTexturedBrushV2SupportsPlan(deepFreeze({
      ...valid,
      batches: deepFreeze([{ ...valid.batches[0]!, porterDuff: "destination-out" }]),
    }))).toBe(false);
  });

  it("creates one source-over triangle-strip pipeline and no private surface", () => {
    const harness = fakeCreationDevice();
    const created = createStudioEngineWebGpuTexturedBrushRuntime({
      device: harness.device,
      presentationOnly: true,
      ownsDevice: false,
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;

    expect(harness.pipelines).toHaveLength(1);
    expect(harness.pipelines[0]?.primitive?.topology).toBe("triangle-strip");
    expect(harness.pipelines[0]?.vertex.buffers?.[0]?.arrayStride).toBe(48);
    expect(harness.buffers).toHaveLength(1);
    expect(harness.buffers[0]?.size).toBe(64);
    expect(created.runtime.stats()).toMatchObject({
      instanceBytesPerDab: 48,
      verticesPerDab: 4,
      instanceBufferAllocations: 0,
      stagingAllocations: 0,
      instanceUploads: 0,
    });
    created.runtime.dispose();
    expect(harness.destroy).not.toHaveBeenCalled();
  });

  it("rejects private, durable-cache and oversized configurations before allocation", () => {
    const harness = fakeCreationDevice();
    expect(createStudioEngineWebGpuTexturedBrushRuntime({
      device: harness.device,
      width: 64,
      height: 64,
    }).status).toBe("rejected");
    expect(createStudioEngineWebGpuTexturedBrushRuntime({
      device: harness.device,
      presentationOnly: true,
      nativeR8GrainTextureCache: {} as never,
    }).status).toBe("rejected");
    expect(createStudioEngineWebGpuTexturedBrushRuntime({
      device: harness.device,
      presentationOnly: true,
      maximumDabs: 65_537,
    }).status).toBe("rejected");
    expect(harness.pipelines).toHaveLength(0);
    expect(harness.buffers).toHaveLength(0);
  });
});
