import { describe, expect, it, vi } from "vitest";

import {
  createStudioBrushPackDualTipExactProvider,
  parseStudioBrushPackDualTipExactReplay,
  serializeStudioBrushPackDualTipExactReplay,
} from "./studio-brush-pack-dual-tip-exact-provider";
import {
  materializeStudioBrushPackSelectionWithDualTip,
} from "./studio-brush-pack-runtime";

import type {
  StudioBrushPackDualTipExactProviderOptions,
} from "./studio-brush-pack-dual-tip-exact-provider";
import type {
  StudioBrushPackDualTipRenderInput,
  StudioBrushPackSelection,
} from "./studio-brush-pack-runtime";
import type {
  StudioDynamicDualTipExactPlanV2,
  StudioDynamicDualTipExactWebGpuExecutionResultV2,
  StudioDynamicDualTipExactWebGpuRuntimeV2,
} from "../studio-dynamic-dual-tip-webgpu-runtime-v2";

const exactModulePromise = import("../studio-dynamic-dual-tip-webgpu-runtime-v2");

function selection(): StudioBrushPackSelection {
  const result = materializeStudioBrushPackSelectionWithDualTip("g-pen-flex", {
    secondaryTip: { shape: "star", softness: 0.2 },
    combineMode: "max",
    primaryTransform: { scaleX: 1.1, scaleY: 0.9 },
    secondaryTransform: {
      rotationDegrees: -20,
      scaleX: 0.75,
      scaleY: 1.2,
      offsetX: 0.1,
      offsetY: -0.1,
    },
    dynamics: {
      pressureSizeGain: 0.6,
      pressureOpacityGain: 0.7,
    },
    jitter: {
      position: 0.05,
      rotationDegrees: 10,
      opacity: 0.1,
    },
  });
  if (!result) throw new Error("dual-tip selection fixture failed");
  return result;
}

function input(
  overrides: Partial<StudioBrushPackDualTipRenderInput> = {},
): StudioBrushPackDualTipRenderInput {
  return {
    samples: [
      { x: 4.5, y: 16.5, pressure: 0.25 },
      { x: 28.5, y: 16.5, pressure: 0.9 },
    ],
    diameter: 10,
    spacingRatio: 0.3,
    seed: 0x1234_abcd,
    opacity: 0.7,
    linearColor: [0.8, 0.3, 0.1],
    output: { width: 33, height: 33 },
    ...overrides,
  };
}

function execution(
  overrides: Partial<{
    mode: "append" | "rebuild";
    requestSequence: number;
    deviceEpoch: number;
    strokeId: string;
    commandSequence: number;
    porterDuff: "source-over" | "destination-out";
  }> = {},
) {
  return {
    mode: "rebuild" as const,
    requestSequence: 1,
    deviceEpoch: 1,
    strokeId: "brush-pack-exact",
    commandSequence: 1,
    porterDuff: "source-over" as const,
    ...overrides,
  };
}

function completed(
  frame: Readonly<{
    requestSequence: number;
    deviceEpoch: number;
    plan: StudioDynamicDualTipExactPlanV2;
  }>,
): StudioDynamicDualTipExactWebGpuExecutionResultV2 {
  return {
    status: "completed",
    receipt: {
      kind: "studio-dynamic-dual-tip-exact-webgpu-receipt",
      revision: 2,
      backend: "webgpu",
      providerCapability: "dynamic-dual-tip-deposition-r8-v2",
      executionRoute: "webgpu-exact-packed-deposition-v2",
      textureFormat: "rgba16float",
      colorModel: "scene-linear-premultiplied",
      compositionOrder: "combine-same-deposition-then-premultiplied-authority",
      numericalAuthority: "ordered-rgba16float-webgpu",
      exactness: "algorithmically-exact-deposition-order",
      requestSequence: frame.requestSequence,
      deviceEpoch: frame.deviceEpoch,
      mode: frame.plan.mode,
      strokeId: frame.plan.strokeId,
      commandSequence: frame.plan.commandSequence,
      depositionCount: frame.plan.depositions.length,
      blendFamilies: [...new Set(
        frame.plan.depositions.map((item) => item.blendFamily),
      )],
      porterDuffOperations: [...new Set(
        frame.plan.depositions.map((item) => item.porterDuff),
      )],
      assetBytes: frame.plan.primaryAsset.byteLength
        + frame.plan.secondaryAsset.byteLength,
      planFingerprint: frame.plan.fingerprint,
      queueState: "completed",
      complete: true,
    },
  };
}

async function providerWithRuntime(
  execute: (
    frame: Readonly<{
      requestSequence: number;
      deviceEpoch: number;
      plan: StudioDynamicDualTipExactPlanV2;
    }>,
    signal?: AbortSignal,
  ) => Promise<StudioDynamicDualTipExactWebGpuExecutionResultV2>,
) {
  const module = await exactModulePromise;
  const runtime = {
    deviceEpoch: 1,
    inFlight: 0,
    execute: vi.fn(execute),
    dispose: vi.fn(),
  } as unknown as StudioDynamicDualTipExactWebGpuRuntimeV2;
  const moduleLoader = vi.fn(async () => ({
    ...module,
    createStudioDynamicDualTipExactWebGpuRuntimeV2: () => ({
      status: "ready" as const,
      runtime,
    }),
  }));
  const result = await createStudioBrushPackDualTipExactProvider({
    device: {} as GPUDevice,
    width: 33,
    height: 33,
    moduleLoader: moduleLoader as StudioBrushPackDualTipExactProviderOptions["moduleLoader"],
  });
  if (result.status !== "ready") throw new Error(result.reason);
  return { ...result, runtime, moduleLoader };
}

describe("brush-pack exact dual-tip provider call-site", () => {
  it("lazily selects v2 from the CPU packed stream and never constructs a v1 preview", async () => {
    const fixture = await providerWithRuntime(async (frame) => completed(frame));
    const result = await fixture.provider.execute(
      selection(),
      input(),
      execution(),
    );

    expect(fixture.moduleLoader).toHaveBeenCalledOnce();
    expect(result.status).toBe("webgpu-exact");
    if (result.status !== "webgpu-exact") return;
    expect(result.plan).toMatchObject({
      kind: "studio-dynamic-dual-tip-exact-plan",
      version: 2,
      providerCapability: "dynamic-dual-tip-deposition-r8-v2",
      executionRoute: "webgpu-exact-packed-deposition-v2",
    });
    expect(result.plan.depositions).toHaveLength(result.artifact.commands.count);
    expect(result.plan.depositions.every(
      (item) => item.blendFamily === "lighten",
    )).toBe(true);
    expect(fixture.runtime.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        requestSequence: 1,
        deviceEpoch: 1,
        plan: expect.objectContaining({ version: 2 }),
      }),
      undefined,
    );
    expect(result.receipt).toMatchObject({
      executionRoute: "webgpu-exact-packed-deposition-v2",
      gpu: {
        exactness: "algorithmically-exact-deposition-order",
        complete: true,
      },
      cpuFallback: {
        executionRoute: "cpu-f32-oracle",
        authority: "cpu-f32-oracle",
        packedCommandContract: "gpu-wasm-ready-f32-v1",
        complete: true,
      },
      complete: true,
    });
  });

  it("preserves a canonical JSON replay and can submit it through a fresh exact provider", async () => {
    const firstProvider = await providerWithRuntime(async (frame) => completed(frame));
    const first = await firstProvider.provider.execute(
      selection(),
      input({ porterDuff: "destination-out" }),
      execution({ porterDuff: "destination-out" }),
    );
    expect(first.status).toBe("webgpu-exact");
    if (first.status !== "webgpu-exact") return;
    const serialized = serializeStudioBrushPackDualTipExactReplay(first.replay);
    expect(serialized).not.toBeNull();
    const parsed = parseStudioBrushPackDualTipExactReplay(serialized);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      executionRoute: "webgpu-exact-packed-deposition-v2",
      porterDuff: "destination-out",
      exactPlanFingerprint: first.plan.fingerprint,
      cpuArtifact: {
        receipt: { authority: "cpu-f32-oracle" },
      },
    });
    const wrongPackedContract = JSON.parse(serialized!) as {
      commands: { stride: number };
    };
    wrongPackedContract.commands.stride += 1;
    expect(parseStudioBrushPackDualTipExactReplay(wrongPackedContract)).toBeNull();

    const replayProvider = await providerWithRuntime(async (frame) => completed(frame));
    const replayed = await replayProvider.provider.replay(parsed, {
      requestSequence: 1,
      deviceEpoch: 1,
    });
    expect(replayed.status).toBe("webgpu-exact");
    if (replayed.status !== "webgpu-exact") return;
    expect(replayed.plan.fingerprint).toBe(first.plan.fingerprint);
    expect(replayed.artifact.premultipliedLinearRgba)
      .toEqual(first.artifact.premultipliedLinearRgba);
  });

  it("returns a complete CPU authority receipt when WebGPU is unavailable", async () => {
    const moduleLoader = vi.fn(() => exactModulePromise);
    const created = await createStudioBrushPackDualTipExactProvider({
      device: null,
      width: 33,
      height: 33,
      moduleLoader,
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    expect(created.webGpu).toBe("unavailable");
    const result = await created.provider.execute(
      selection(),
      input(),
      execution(),
    );
    expect(result.status).toBe("cpu-fallback");
    if (result.status !== "cpu-fallback") return;
    expect(result.receipt).toMatchObject({
      reason: "webgpu-unavailable",
      executionRoute: "cpu-f32-oracle",
      authority: "cpu-f32-oracle",
      alphaContract: "premultiplied-linear-rgba-f32",
      complete: true,
    });
    expect(result.replay.exactPlanFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.replay.exactPlanFingerprint).not.toBe(`sha256:${"0".repeat(64)}`);
  });

  it("falls back to CPU after device loss and remains CPU-only for later requests", async () => {
    let calls = 0;
    const fixture = await providerWithRuntime(async (frame) => {
      calls += 1;
      return calls === 1
        ? { status: "device-lost", deviceEpoch: 2 }
        : completed(frame);
    });
    const lost = await fixture.provider.execute(
      selection(),
      input(),
      execution(),
    );
    expect(lost.status).toBe("cpu-fallback");
    if (lost.status !== "cpu-fallback") return;
    expect(lost.receipt.reason).toBe("device-lost");

    const later = await fixture.provider.execute(
      selection(),
      input(),
      execution({
        mode: "append",
        requestSequence: 2,
        deviceEpoch: 2,
        commandSequence: 2,
      }),
    );
    expect(later.status).toBe("cpu-fallback");
    if (later.status !== "cpu-fallback") return;
    expect(later.receipt.reason).toBe("device-lost");
    expect(fixture.runtime.execute).toHaveBeenCalledOnce();
  });

  it("keeps cancellation terminal instead of turning it into a visible CPU stroke", async () => {
    const fixture = await providerWithRuntime(async () => ({ status: "cancelled" }));
    const controller = new AbortController();
    controller.abort();
    expect((await fixture.provider.execute(
      selection(),
      input(),
      execution(),
      controller.signal,
    ))).toEqual({ status: "cancelled" });
    expect(fixture.runtime.execute).not.toHaveBeenCalled();
  });

  it("does not activate exact or preview paths for a brush without a dual-tip descriptor", async () => {
    const fixture = await providerWithRuntime(async (frame) => completed(frame));
    const legacy = materializeStudioBrushPackSelectionWithDualTip(
      "g-pen-flex",
      null,
    );
    expect(legacy).toBeNull();
    const plain = { ...selection(), dualTip: undefined };
    expect((await fixture.provider.execute(
      plain,
      input(),
      execution(),
    ))).toEqual({ status: "not-configured" });
    expect(fixture.runtime.execute).not.toHaveBeenCalled();
  });
});
