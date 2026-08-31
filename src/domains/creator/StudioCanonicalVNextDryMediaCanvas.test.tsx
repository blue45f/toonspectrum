// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioCanonicalVNextDryMediaCanvas,
  type StudioCanonicalVNextDryMediaCanvasAuthority,
} from "./StudioCanonicalVNextDryMediaCanvas";

import type { DrawEl } from "./studio-element-model";

const harness = vi.hoisted(() => {
  let releasePresentation: (() => void) | null = null;
  return {
    compileCalls: [] as Array<{ element: unknown; signal?: AbortSignal }>,
    configureCalls: [] as unknown[],
    createSurfaceCalls: 0,
    createRuntimeCalls: 0,
    destroyedDevices: 0,
    disposedSurfaces: 0,
    disposedRuntimes: 0,
    onDeviceLost: null as ((info: GPUDeviceLostInfo) => void) | null,
    deferPresentation: false,
    deferDeviceCreation: false,
    failSurfaceCreates: 0,
    failPresentations: 0,
    snapshotDraws: 0,
    pendingDeviceResolvers: [] as Array<() => void>,
    createDevice() {
      return {
        destroy() {
          harness.destroyedDevices += 1;
        },
      } as GPUDevice;
    },
    requestDevice() {
      if (!this.deferDeviceCreation) {
        return Promise.resolve(this.createDevice());
      }
      return new Promise<GPUDevice>((resolve) => {
        this.pendingDeviceResolvers.push(() => resolve(this.createDevice()));
      });
    },
    releaseDevices() {
      for (const release of this.pendingDeviceResolvers.splice(0)) release();
    },
    releasePresentation() {
      releasePresentation?.();
      releasePresentation = null;
    },
    async waitForPresentation(signal?: AbortSignal) {
      if (!this.deferPresentation) return;
      await new Promise<void>((resolve) => {
        releasePresentation = resolve;
      });
      if (signal?.aborted) return;
    },
    reset() {
      this.compileCalls.length = 0;
      this.configureCalls.length = 0;
      this.createSurfaceCalls = 0;
      this.createRuntimeCalls = 0;
      this.destroyedDevices = 0;
      this.disposedSurfaces = 0;
      this.disposedRuntimes = 0;
      this.onDeviceLost = null;
      this.deferPresentation = false;
      this.deferDeviceCreation = false;
      this.failSurfaceCreates = 0;
      this.failPresentations = 0;
      this.snapshotDraws = 0;
      this.pendingDeviceResolvers.length = 0;
      releasePresentation = null;
    },
  };
});

vi.mock("./studio-canonical-vnext-dry-media-product-adapter", () => ({
  async compileStudioCanonicalVNextDryMediaProductFrame(request: {
    element: DrawEl;
    signal?: AbortSignal;
  }) {
    harness.compileCalls.push(request);
    return {
      status: "ready" as const,
      dynamicPlanDigest: "sha256:dynamic-plan",
      sourceDabCount: 32,
      texturedDabCount: 160,
      laneCount: 5 as const,
      frame: {
        canonicalPlanHash: "canonical-plan-hash",
      },
    };
  },
}));

vi.mock("./studio-canonical-vnext-dry-media-presentation-controller", () => ({
  StudioCanonicalVNextDryMediaPresentationController: class {
    async presentFinalLiveAndCommit(frame: unknown, signal?: AbortSignal) {
      await harness.waitForPresentation(signal);
      if (signal?.aborted) {
        return { status: "unavailable" as const, reason: "cancelled" };
      }
      if (harness.failPresentations > 0) {
        harness.failPresentations -= 1;
        return { status: "unavailable" as const, reason: "runtime-rejected" };
      }
      return {
        status: "completed" as const,
        receipt: {
          kind: "studio-canonical-vnext-dry-media-final-parity-receipt",
          frame,
          sameCanonicalPlan: true,
          sameCanonicalPlanHash: true,
          samePersistedSeed: true,
          sameTexturedPlan: true,
          live: { texturedPlanFingerprint: "sha256:identical" },
          commit: { texturedPlanFingerprint: "sha256:identical" },
        },
      };
    }
  },
}));

vi.mock("./render/studio-engine-webgpu-presentation-surface", () => ({
  createStudioEngineWebGpuPresentationSurface(options: {
    onDeviceLost: (info: GPUDeviceLostInfo) => void;
  }) {
    harness.createSurfaceCalls += 1;
    if (harness.failSurfaceCreates > 0) {
      harness.failSurfaceCreates -= 1;
      return {
        status: "rejected" as const,
        reason: "invalid-canvas" as const,
      };
    }
    harness.onDeviceLost = options.onDeviceLost;
    return {
      status: "ready" as const,
      surface: {
        configure(layout: unknown) {
          harness.configureCalls.push(layout);
          return { status: "ready" as const };
        },
        dispose() {
          harness.disposedSurfaces += 1;
        },
      },
    };
  },
}));

vi.mock("./render/studio-engine-webgpu-textured-brush-runtime", () => ({
  createStudioEngineWebGpuTexturedBrushRuntime() {
    harness.createRuntimeCalls += 1;
    return {
      status: "ready" as const,
      runtime: {
        dispose() {
          harness.disposedRuntimes += 1;
        },
      },
    };
  },
}));

const element = {
  id: "selected-pastel",
  type: "draw",
  kind: "freehand",
  mode: "pen",
  points: [10, 10, 30, 30],
  pressures: [0.25, 0.8],
  stroke: "#334155",
  strokeWidth: 18,
  brush: "dry-media",
  brushCatalogId: "pastel-paper-soft",
} as DrawEl;

const baseProps = {
  element,
  layoutKey: "page:layout:1",
  visible: false,
  surfaceBounds: { left: 20, top: 30, width: 640, height: 480 },
  documentWidth: 800,
  documentHeight: 1_200,
  documentScale: 1.25,
  flipX: false,
};

beforeEach(() => {
  harness.reset();
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      getPreferredCanvasFormat: () => "bgra8unorm",
      requestAdapter: async () => ({
        requestDevice: () => harness.requestDevice(),
      }),
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    ((contextId: string) => contextId === "webgpu"
      ? ({} as GPUCanvasContext)
      : contextId === "2d"
        ? ({
            clearRect: () => undefined,
            drawImage: () => {
              harness.snapshotDraws += 1;
            },
          } as unknown as CanvasRenderingContext2D)
        : null) as
      typeof HTMLCanvasElement.prototype.getContext,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "gpu");
});

describe("StudioCanonicalVNextDryMediaCanvas authority handoff", () => {
  it("keeps the canvas hidden until exact parity authorizes the same DrawEl", async () => {
    const authorities: Array<StudioCanonicalVNextDryMediaCanvasAuthority | null> = [];
    const onAuthorityChange = (
      authority: StudioCanonicalVNextDryMediaCanvasAuthority | null,
    ) => authorities.push(authority);
    const view = render(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        onAuthorityChange={onAuthorityChange}
      />,
    );
    const canvas = view.container.querySelector<HTMLCanvasElement>(
      "canvas[data-studio-canonical-vnext-dry-media='true']",
    );

    expect(canvas?.style.visibility).toBe("hidden");
    await waitFor(() => expect(authorities.at(-1)).not.toBeNull());
    const authority = authorities.at(-1);
    expect(authority).toMatchObject({
      element,
      layoutKey: baseProps.layoutKey,
      status: "authorized",
      canonicalPlanHash: "canonical-plan-hash",
      dynamicPlanDigest: "sha256:dynamic-plan",
      sourceDabCount: 32,
      texturedDabCount: 160,
      laneCount: 5,
    });
    expect(authority?.status).toBe("authorized");
    if (authority?.status !== "authorized") throw new Error("authority missing");
    expect(authority.parityReceipt.live.texturedPlanFingerprint).toBe(
      authority.parityReceipt.commit.texturedPlanFingerprint,
    );
    expect(harness.createSurfaceCalls).toBe(1);
    expect(harness.createRuntimeCalls).toBe(1);
    expect(harness.configureCalls).toHaveLength(1);
    expect(harness.snapshotDraws).toBe(1);

    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        visible
        onAuthorityChange={onAuthorityChange}
      />,
    );
    expect(canvas?.style.visibility).toBe("visible");
  });

  it("never promotes a stale in-flight frame after the candidate is released", async () => {
    const authorities: Array<StudioCanonicalVNextDryMediaCanvasAuthority | null> = [];
    const onAuthorityChange = (
      authority: StudioCanonicalVNextDryMediaCanvasAuthority | null,
    ) => authorities.push(authority);
    const view = render(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        onAuthorityChange={onAuthorityChange}
      />,
    );
    await waitFor(() => expect(authorities.at(-1)).not.toBeNull());
    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        visible
        onAuthorityChange={onAuthorityChange}
      />,
    );
    const canvas = view.container.querySelector<HTMLCanvasElement>(
      "canvas[data-studio-canonical-vnext-dry-media='true']",
    );
    expect(canvas?.style.visibility).toBe("visible");

    harness.deferPresentation = true;
    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        layoutKey="page:layout:2"
        visible={false}
        surfaceBounds={{ ...baseProps.surfaceBounds, width: 520 }}
        onAuthorityChange={onAuthorityChange}
      />,
    );
    expect(authorities.at(-1)).toMatchObject({
      status: "authorized",
      layoutKey: baseProps.layoutKey,
    });
    expect(canvas?.style.visibility).toBe("hidden");

    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        element={null}
        layoutKey="no-candidate"
        visible={false}
        surfaceBounds={{ ...baseProps.surfaceBounds, width: 520 }}
        onAuthorityChange={onAuthorityChange}
      />,
    );
    harness.releasePresentation();
    await Promise.resolve();
    expect(authorities.at(-1)).toBeNull();
    expect(
      authorities.some((authority) => authority?.layoutKey === "page:layout:2"),
    ).toBe(false);
    await waitFor(() => {
      expect(harness.disposedSurfaces).toBe(1);
      expect(harness.disposedRuntimes).toBe(1);
      expect(harness.destroyedDevices).toBe(1);
    });
  });

  it("keeps the last receipted WebGPU frame and never retries automatically after device loss", async () => {
    const authorities: Array<StudioCanonicalVNextDryMediaCanvasAuthority | null> = [];
    const onAuthorityChange = (
      authority: StudioCanonicalVNextDryMediaCanvasAuthority | null,
    ) => authorities.push(authority);
    const view = render(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        onAuthorityChange={onAuthorityChange}
      />,
    );
    await waitFor(() => expect(authorities.at(-1)).not.toBeNull());
    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        visible
        onAuthorityChange={onAuthorityChange}
      />,
    );
    const canvas = view.container.querySelector<HTMLCanvasElement>(
      "canvas[data-studio-canonical-vnext-dry-media='true']",
    );
    const snapshot = view.container.querySelector<HTMLCanvasElement>(
      "canvas[data-studio-canonical-vnext-dry-media-last-good='true']",
    );
    expect(canvas?.style.visibility).toBe("visible");
    const authorizationCount = authorities.filter(
      (authority) => authority?.status === "authorized",
    ).length;

    harness.onDeviceLost?.({
      reason: "unknown",
      message: "simulated loss",
    } as GPUDeviceLostInfo);
    await waitFor(() => expect(authorities.at(-1)).toMatchObject({
      status: "unavailable",
      reason: "device-lost",
      retainsLastGoodFrame: true,
      retryPolicy: "explicit-next-selection-only",
    }));
    expect(canvas?.style.visibility).toBe("hidden");
    expect(snapshot?.style.visibility).toBe("visible");
    expect(view.getByRole("alert").textContent).toContain(
      "다른 렌더러로 자동 전환하지 않았습니다",
    );
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(harness.createSurfaceCalls).toBe(1);
    expect(authorities.filter(
      (authority) => authority?.status === "authorized",
    )).toHaveLength(authorizationCount);
    expect(harness.disposedSurfaces).toBe(1);
    expect(harness.disposedRuntimes).toBe(1);
    expect(harness.destroyedDevices).toBe(1);
  });

  it("ends a failed presentation epoch as unavailable without revealing another renderer", async () => {
    const authorities: Array<StudioCanonicalVNextDryMediaCanvasAuthority | null> = [];
    const view = render(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        visible
        onAuthorityChange={(authority) => authorities.push(authority)}
      />,
    );
    await waitFor(() => expect(authorities.at(-1)).toMatchObject({
      status: "authorized",
    }));
    harness.failPresentations = 1;

    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        layoutKey="page:layout:2"
        onAuthorityChange={(authority) => authorities.push(authority)}
        visible
      />,
    );

    await waitFor(() => expect(authorities.at(-1)).toMatchObject({
      status: "unavailable",
      reason: "presentation:runtime-rejected",
      retainsLastGoodFrame: true,
    }));
    expect(view.container.querySelector<HTMLCanvasElement>(
      "canvas[data-studio-canonical-vnext-dry-media='true']",
    )?.style.visibility).toBe("hidden");
    expect(view.container.querySelector<HTMLCanvasElement>(
      "canvas[data-studio-canonical-vnext-dry-media-last-good='true']",
    )?.style.visibility).toBe("visible");
    expect(harness.createSurfaceCalls).toBe(1);
  });

  it("fails closed on initial create and retries only after an explicit reselection", async () => {
    harness.failSurfaceCreates = 1;
    const authorities: Array<StudioCanonicalVNextDryMediaCanvasAuthority | null> = [];
    const view = render(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        onAuthorityChange={(authority) => authorities.push(authority)}
      />,
    );

    await waitFor(() => expect(authorities.at(-1)).toMatchObject({
      status: "unavailable",
      reason: "webgpu-unavailable",
      retainsLastGoodFrame: false,
      retryPolicy: "explicit-next-selection-only",
    }));
    expect(harness.createSurfaceCalls).toBe(1);
    expect(harness.createRuntimeCalls).toBe(0);
    expect(harness.destroyedDevices).toBe(1);
    expect(
      view.container.querySelector("canvas")?.dataset
        .studioCanonicalVnextDryMediaState,
    ).not.toBe("authorized");

    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        element={null}
        layoutKey="no-candidate"
        onAuthorityChange={(authority) => authorities.push(authority)}
      />,
    );
    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        onAuthorityChange={(authority) => authorities.push(authority)}
      />,
    );
    await waitFor(() => expect(authorities.at(-1)).toMatchObject({
      status: "authorized",
    }));
    expect(harness.createSurfaceCalls).toBe(2);
    expect(harness.createRuntimeCalls).toBe(1);
  });

  it("does not leak a stale pending create across the StrictMode remount cycle", async () => {
    harness.deferDeviceCreation = true;
    const authorities: Array<StudioCanonicalVNextDryMediaCanvasAuthority | null> = [];
    const view = render(
      <StrictMode>
        <StudioCanonicalVNextDryMediaCanvas
          {...baseProps}
          onAuthorityChange={(authority) => authorities.push(authority)}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(harness.pendingDeviceResolvers).toHaveLength(2);
    });
    harness.releaseDevices();
    await waitFor(() => {
      expect(authorities.at(-1)).not.toBeNull();
      expect(harness.createSurfaceCalls).toBe(2);
      expect(harness.disposedSurfaces).toBe(1);
      expect(harness.disposedRuntimes).toBe(1);
      expect(harness.destroyedDevices).toBe(1);
    });
    expect(
      view.container.querySelectorAll(
        "canvas[data-studio-canonical-vnext-dry-media='true']",
      ),
    ).toHaveLength(1);
  });

  it("releases the large RGBA16F work surface when no candidate remains", async () => {
    const authorities: Array<StudioCanonicalVNextDryMediaCanvasAuthority | null> = [];
    const view = render(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        onAuthorityChange={(authority) => authorities.push(authority)}
      />,
    );
    await waitFor(() => expect(authorities.at(-1)).not.toBeNull());

    view.rerender(
      <StudioCanonicalVNextDryMediaCanvas
        {...baseProps}
        element={null}
        layoutKey="no-candidate"
        visible={false}
        onAuthorityChange={(authority) => authorities.push(authority)}
      />,
    );
    expect(authorities.at(-1)).toBeNull();
    await waitFor(() => {
      expect(harness.disposedSurfaces).toBe(1);
      expect(harness.disposedRuntimes).toBe(1);
      expect(harness.destroyedDevices).toBe(1);
    });
  });
});
