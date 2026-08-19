import { describe, expect, it, vi } from "vitest";

import {
  createStudioVelloClassicBrowserBackend,
  lowerStudioSceneOverlaysToVelloIsland,
  resolveStudioVelloHubProductCapability,
  StudioVelloHub,
  STUDIO_VELLO_CLASSIC_BACKEND_ID,
  STUDIO_VELLO_CPU_BACKEND_ID,
  STUDIO_VELLO_HUB_PRODUCT_CAPABILITY,
  STUDIO_VELLO_HYBRID_SPARSE_CANDIDATE,
  type StudioVelloBackendFrame,
  type StudioVelloHubBackend,
  type StudioVelloHubPresentationTarget,
} from "./studio-vello-hub";

import type { SceneIR } from "@toonspectrum/studio-project-model";

function scene(id = "shape"): SceneIR {
  return {
    version: 11,
    width: 16,
    height: 16,
    background: { r: 0, g: 0, b: 0, a: 0 },
    nodes: [
      {
        id,
        kind: "fill-path",
        path: {
          verbs: [
            { v: "M", x: 2, y: 2 },
            { v: "L", x: 14, y: 2 },
            { v: "L", x: 14, y: 14 },
            { v: "L", x: 2, y: 14 },
            { v: "Z" },
          ],
        },
        paint: { kind: "solid", color: { r: 0, g: 0.4, b: 1, a: 1 } },
        fillRule: "nonzero",
        opacity: 1,
        blend: "src-over",
      },
    ],
  };
}

interface FakeBackendControl {
  failRender: boolean;
  available: boolean;
  comparePixels: Uint8Array;
  compareError: string | null;
}

function fakeBackend(
  id: typeof STUDIO_VELLO_CPU_BACKEND_ID | typeof STUDIO_VELLO_CLASSIC_BACKEND_ID,
  milliseconds: number,
  advance: (milliseconds: number) => void,
  control: FakeBackendControl,
): StudioVelloHubBackend & { renderCount: number; disposeCount: number } {
  const backend = {
    id,
    renderCount: 0,
    disposeCount: 0,
    async availability() {
      return control.available
        ? { available: true, reason: null }
        : { available: false, reason: "fake-unavailable" };
    },
    async render(input: SceneIR): Promise<StudioVelloBackendFrame> {
      backend.renderCount += 1;
      advance(milliseconds);
      if (control.failRender) throw new Error(`${id}-render-failed`);
      if (id === STUDIO_VELLO_CPU_BACKEND_ID) {
        return {
          backendId: id,
          kind: "pixels",
          width: input.width,
          height: input.height,
          pixels: new Uint8Array(input.width * input.height * 4),
        };
      }
      return {
        backendId: id,
        kind: "texture",
        width: input.width,
        height: input.height,
        device: {} as GPUDevice,
        texture: { destroy: vi.fn() } as unknown as GPUTexture,
        release: vi.fn(),
      };
    },
    async compareToReference(input: SceneIR) {
      if (control.compareError) throw new Error(control.compareError);
      const cpuPixels = new Uint8Array(input.width * input.height * 4);
      return {
        width: input.width,
        height: input.height,
        gpuPixels: control.comparePixels.length === cpuPixels.length
          ? control.comparePixels
          : cpuPixels,
        cpuPixels,
        fuzzyMismatchPct: 0,
      };
    },
    dispose() {
      backend.disposeCount += 1;
    },
  } satisfies StudioVelloHubBackend & {
    renderCount: number;
    disposeCount: number;
  };
  return backend;
}

function fakeTarget() {
  const events: Array<
    | { kind: "present"; backendId: string }
    | { kind: "hold"; reason: string; activeBackendId: string | null }
  > = [];
  let activeBackendId: string | null = null;
  const target: StudioVelloHubPresentationTarget = {
    async present(frame) {
      activeBackendId = frame.backendId;
      events.push({ kind: "present", backendId: frame.backendId });
      if (frame.kind === "texture") frame.release();
    },
    holdLastGood(reason) {
      events.push({ kind: "hold", reason, activeBackendId });
    },
  };
  return {
    target,
    events,
    get activeBackendId() {
      return activeBackendId;
    },
  };
}

function harness(options?: { mismatch?: boolean; isPenDown?: () => boolean }) {
  let now = 0;
  const advance = (milliseconds: number) => {
    now += milliseconds;
  };
  const cpuControl: FakeBackendControl = {
    failRender: false,
    available: true,
    comparePixels: new Uint8Array(),
    compareError: null,
  };
  const classicControl: FakeBackendControl = {
    failRender: false,
    available: true,
    comparePixels: options?.mismatch
      ? new Uint8Array(16 * 16 * 4).fill(255)
      : new Uint8Array(16 * 16 * 4),
    compareError: null,
  };
  const cpu = fakeBackend(STUDIO_VELLO_CPU_BACKEND_ID, 20, advance, cpuControl);
  const classic = fakeBackend(
    STUDIO_VELLO_CLASSIC_BACKEND_ID,
    5,
    advance,
    classicControl,
  );
  const presentation = fakeTarget();
  let lossListener: ((event: { epoch: number; reason: string }) => void) | null = null;
  const unrecoverableFallbacks: Array<{
    source: "device-loss-fallback" | "shadow-fallback";
    reason: string;
  }> = [];
  const hub = new StudioVelloHub({
    target: presentation.target,
    cpuBackend: cpu,
    classicBackend: classic,
    now: () => now,
    deviceHash: "test-device",
    isPenDown: options?.isPenDown,
    onUnrecoverableFallback(failure) {
      unrecoverableFallbacks.push({
        source: failure.source,
        reason: failure.reason,
      });
    },
    subscribeDeviceLoss(listener) {
      lossListener = listener;
      return () => {
        lossListener = null;
      };
    },
  });
  return {
    hub,
    cpu,
    classic,
    cpuControl,
    classicControl,
    presentation,
    unrecoverableFallbacks,
    emitLoss(reason = "destroyed") {
      lossListener?.({ epoch: 7, reason });
    },
  };
}

async function promoteClassic(runtime: ReturnType<typeof harness>) {
  await runtime.hub.render(scene());
  await runtime.hub.flushShadowWork();
  await runtime.hub.render(scene());
  await runtime.hub.flushShadowWork();
  return runtime.hub.render(scene());
}

describe("VelloHub product capability and SceneIR island", () => {
  it("enables only the bounded product island by default and supports an emergency kill", () => {
    expect(resolveStudioVelloHubProductCapability({ globalObject: {} })).toEqual({
      enabled: true,
      capabilityId: "studio-vello-hub-selection-overlay-v1",
      scope: "accelerated-selection-overlay",
      reason: "product-default",
    });
    expect(resolveStudioVelloHubProductCapability({
      globalObject: { __TOONSPECTRUM_STUDIO_VELLO_HUB_DISABLED__: true },
    })).toMatchObject({ enabled: false, reason: "emergency-disabled" });
    expect(STUDIO_VELLO_HUB_PRODUCT_CAPABILITY).toMatchObject({
      documentAuthority: false,
      inputAuthority: false,
      brushPixelAuthority: false,
      primarySurfaceOwnership: "exclusive-within-island",
      admissionMode: "scene-local-shadow-candidate",
      persistentWinnerStorage: false,
      productWidePromotionRequiresSoak: true,
    });
  });

  it("keeps Hybrid/Sparse GPU explicitly unavailable instead of aliasing CPU sparse strips", () => {
    expect(STUDIO_VELLO_HYBRID_SPARSE_CANDIDATE).toMatchObject({
      eligible: false,
      status: "unavailable-upstream-api",
    });
    expect(STUDIO_VELLO_HYBRID_SPARSE_CANDIDATE.reason).toContain(
      "Classic browser WebGPU",
    );
  });

  it("lowers the neutral selection-provider seam into a transparent bounded SceneIR", () => {
    const result = lowerStudioSceneOverlaysToVelloIsland(
      [
        {
          documentId: "selected-image",
          zIndex: 0,
          opacity: 1,
          fill: { color: 0x2563eb, alpha: 0.07 },
          stroke: { color: 0x2563eb, alpha: 0.95, width: 1.5 },
          shape: {
            kind: "rect",
            bounds: { x: 10, y: 20, width: 100, height: 50 },
          },
        },
      ],
      {
        width: 500,
        height: 400,
        dpr: 2,
        documentTransform: {
          scaleX: 1.5,
          scaleY: 1.5,
          offsetX: 4,
          offsetY: 6,
          rotation: 0,
        },
      },
    );
    expect(result.admitted).toBe(true);
    if (!result.admitted) return;
    expect(result.island.scene.background.a).toBe(0);
    expect(result.island.scene.nodes.map(({ id }) => id)).toEqual([
      "selected-image:selection-fill",
      "selected-image:selection-stroke",
    ]);
    expect(result.island.scene.width).toBeLessThan(500 * 2);
    expect(result.island.scene.height).toBeLessThan(400 * 2);
    expect(result.island.placement).toMatchObject({ dpr: 2 });
    expect(result.island.documentIds).toEqual(["selected-image"]);
  });

  it("rejects an oversized island with an explicit admission reason", () => {
    const result = lowerStudioSceneOverlaysToVelloIsland(
      [
        {
          documentId: "huge",
          zIndex: 0,
          fill: { color: 0, alpha: 1 },
          shape: {
            kind: "rect",
            bounds: { x: 0, y: 0, width: 900, height: 900 },
          },
        },
      ],
      { width: 1_000, height: 1_000, dpr: 1 },
      { maxCssDimension: 512 },
    );
    expect(result).toEqual({ admitted: false, reason: "css-dimension-limit" });
  });
});

describe("VelloHub runtime tournament", () => {
  it("starts on CPU, visual-gates Classic, holds pen-down, then switches above 12%", async () => {
    const runtime = harness();
    const first = await runtime.hub.render(scene());
    expect(first).toMatchObject({
      backendId: STUDIO_VELLO_CPU_BACKEND_ID,
      decision: "initial-reference",
      primarySurfaceOwner: "vello-hub",
      admissionMode: "scene-local-shadow-candidate",
      productWidePromoted: false,
    });
    await runtime.hub.flushShadowWork();

    const warmReference = await runtime.hub.render(scene());
    expect(warmReference.backendId).toBe(STUDIO_VELLO_CPU_BACKEND_ID);
    await runtime.hub.flushShadowWork();

    const penDown = await runtime.hub.render(scene(), { penDown: true });
    expect(penDown).toMatchObject({
      backendId: STUDIO_VELLO_CPU_BACKEND_ID,
      decision: "hysteresis-hold",
    });
    expect(penDown.expectedGainPct).toBe(75);

    const switched = await runtime.hub.render(scene(), { penDown: false });
    expect(switched).toMatchObject({
      backendId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
      decision: "switched",
      visualGate: { pass: true, mismatchPct: 0 },
    });
    expect(runtime.presentation.activeBackendId).toBe(
      STUDIO_VELLO_CLASSIC_BACKEND_ID,
    );
    expect(runtime.hub.snapshot()).toMatchObject({
      admissionMode: "scene-local-shadow-candidate",
      persistentWinnerStorage: false,
      productWidePromoted: false,
    });
    runtime.hub.dispose();
  });

  it("reads live pen state instead of trusting a stale render-time false snapshot", async () => {
    let livePenDown = true;
    const runtime = harness({ isPenDown: () => livePenDown });
    await runtime.hub.render(scene());
    await runtime.hub.flushShadowWork();
    await runtime.hub.render(scene());
    await runtime.hub.flushShadowWork();

    const held = await runtime.hub.render(scene(), { penDown: false });
    expect(held).toMatchObject({
      backendId: STUDIO_VELLO_CPU_BACKEND_ID,
      decision: "hysteresis-hold",
    });

    livePenDown = false;
    const switched = await runtime.hub.render(scene(), { penDown: false });
    expect(switched).toMatchObject({
      backendId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
      decision: "switched",
    });
    runtime.hub.dispose();
  });

  it("never promotes a Classic shadow that fails the visual equivalence gate", async () => {
    const runtime = harness({ mismatch: true });
    await runtime.hub.render(scene());
    await runtime.hub.flushShadowWork();
    await runtime.hub.render(scene());
    const snapshot = runtime.hub.snapshot();
    expect(snapshot.killedBackends).toEqual([
      expect.objectContaining({
        providerId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
        reason: expect.stringContaining("visual-gate-failed"),
      }),
    ]);
    expect(snapshot.lastGoodFrame?.backendId).toBe(STUDIO_VELLO_CPU_BACKEND_ID);
    runtime.hub.dispose();
  });

  it("records an unavailable Classic candidate explicitly and remains on CPU", async () => {
    const runtime = harness();
    runtime.classicControl.available = false;
    const first = await runtime.hub.render(scene());
    await runtime.hub.flushShadowWork();

    expect(first.backendId).toBe(STUDIO_VELLO_CPU_BACKEND_ID);
    expect(runtime.hub.snapshot().killedBackends).toEqual([
      {
        providerId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
        reason: "backend-unavailable:fake-unavailable",
      },
    ]);
    expect(runtime.presentation.activeBackendId).toBe(STUDIO_VELLO_CPU_BACKEND_ID);
    runtime.hub.dispose();
  });

  it("preserves the last good GPU frame until CPU fallback completes", async () => {
    const runtime = harness();
    const promoted = await promoteClassic(runtime);
    expect(promoted.backendId).toBe(STUDIO_VELLO_CLASSIC_BACKEND_ID);
    runtime.classicControl.failRender = true;

    const fallback = await runtime.hub.render(scene());
    expect(fallback).toMatchObject({
      backendId: STUDIO_VELLO_CPU_BACKEND_ID,
      decision: "fallback",
      preservedLastGoodFrame: true,
      fallback: {
        from: STUDIO_VELLO_CLASSIC_BACKEND_ID,
        to: STUDIO_VELLO_CPU_BACKEND_ID,
        reason: `${STUDIO_VELLO_CLASSIC_BACKEND_ID}-render-failed`,
      },
    });
    const tail = runtime.presentation.events.slice(-2);
    expect(tail).toEqual([
      {
        kind: "hold",
        reason: `${STUDIO_VELLO_CLASSIC_BACKEND_ID}-render-failed`,
        activeBackendId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
      },
      { kind: "present", backendId: STUDIO_VELLO_CPU_BACKEND_ID },
    ]);
    runtime.hub.dispose();
  });

  it("reacts to fabric device loss with an explicit last-good-to-CPU transaction", async () => {
    const runtime = harness();
    await promoteClassic(runtime);
    runtime.emitLoss("reset");
    await vi.waitFor(() => {
      expect(runtime.hub.snapshot().lastGoodFrame).toMatchObject({
        backendId: STUDIO_VELLO_CPU_BACKEND_ID,
        fallback: { reason: "device-lost:7:reset" },
      });
    });
    const hold = runtime.presentation.events.findLast(
      (event) => event.kind === "hold",
    );
    expect(hold).toMatchObject({
      activeBackendId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
      reason: "device-lost:7:reset",
    });
    runtime.hub.dispose();
  });

  it("does not borrow visual approval for a new scene in the same fingerprint bucket", async () => {
    const runtime = harness();
    await promoteClassic(runtime);
    runtime.classicControl.compareError = "shadow-readback-failed";
    const unvalidatedScene = await runtime.hub.render(scene("new-shape"));
    expect(unvalidatedScene.backendId).toBe(STUDIO_VELLO_CPU_BACKEND_ID);
    await runtime.hub.flushShadowWork();
    expect(runtime.hub.snapshot().lastGoodFrame).toMatchObject({
      backendId: STUDIO_VELLO_CPU_BACKEND_ID,
      fallback: null,
    });
    expect(runtime.hub.snapshot().killedBackends).toEqual([
      expect.objectContaining({ reason: "shadow-readback-failed" }),
    ]);
    runtime.hub.dispose();
  });

  it("surfaces an unrecoverable device-loss fallback instead of hiding CPU failure", async () => {
    const runtime = harness();
    await promoteClassic(runtime);
    runtime.cpuControl.failRender = true;
    runtime.emitLoss("reset-without-cpu");

    await vi.waitFor(() => {
      expect(runtime.unrecoverableFallbacks).toEqual([
        {
          source: "device-loss-fallback",
          reason: `${STUDIO_VELLO_CPU_BACKEND_ID}-render-failed`,
        },
      ]);
    });
    expect(runtime.presentation.events.at(-1)).toMatchObject({
      kind: "hold",
      reason: expect.stringContaining("unrecoverable-device-loss-fallback"),
      activeBackendId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
    });
    runtime.hub.dispose();
  });

  it("disposes both backends and unregisters the device-loss listener", () => {
    const runtime = harness();
    runtime.hub.dispose();
    runtime.hub.dispose();
    expect(runtime.cpu.disposeCount).toBe(1);
    expect(runtime.classic.disposeCount).toBe(1);
    runtime.emitLoss();
    expect(runtime.presentation.events).toEqual([]);
  });
});

describe("Vello Classic product backend", () => {
  it("adopts the fabric device by identity and returns a zero-readback texture frame", async () => {
    const device = {} as GPUDevice;
    const texture = { destroy: vi.fn() } as unknown as GPUTexture;
    const release = vi.fn();
    let adopted: GPUDevice | null = null;
    const engine = {
      loadVelloGpuBrowser: vi.fn(async () => undefined),
      adoptGpuDevice: vi.fn(async (next: GPUDevice) => {
        adopted = next;
      }),
      gpuDeviceHandle: vi.fn(async () => adopted),
      renderSceneToTextureGpu: vi.fn(async () => texture),
      compareGpuVsCpu: vi.fn(async (input: SceneIR) => ({
        width: input.width,
        height: input.height,
        gpuPixels: new Uint8Array(input.width * input.height * 4),
        cpuPixels: new Uint8Array(input.width * input.height * 4),
        fuzzyMismatchPct: 0,
      })),
    };
    const backend = createStudioVelloClassicBrowserBackend({
      loadEngine: async () => engine as never,
      acquireDevice: async () => ({
        device,
        epoch: 3,
        lost: false,
        released: false,
        release,
      }),
    });

    await expect(backend.availability()).resolves.toEqual({
      available: true,
      reason: null,
    });
    const frame = await backend.render(scene());
    expect(engine.adoptGpuDevice).toHaveBeenCalledWith(device);
    expect(engine.renderSceneToTextureGpu).toHaveBeenCalledOnce();
    expect(frame).toMatchObject({
      backendId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
      kind: "texture",
      device,
      texture,
    });
    if (frame.kind === "texture") frame.release();
    expect(texture.destroy).toHaveBeenCalledOnce();
    backend.dispose();
    expect(release).toHaveBeenCalledOnce();
  });
});
