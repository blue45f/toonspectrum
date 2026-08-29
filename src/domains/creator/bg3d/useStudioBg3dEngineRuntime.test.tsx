// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_DEVICE_LOSS_NOTICE_MS,
  useStudioBg3dEngineRuntime,
} from "./useStudioBg3dEngineRuntime";

import type { StudioBg3dEnginePreference } from "./studio-bg3d-engine-selection";
import type { StudioBg3dWebGpuProbeResult } from "./studio-bg3d-webgpu-capability";
import type { UseStudioBg3dEngineRuntimeOptions } from "./useStudioBg3dEngineRuntime";

const SUPPORTED_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: true,
  reason: "available",
  computeSupported: true,
  timestampQuerySupported: false,
  limits: Object.freeze({}),
});
const UNSUPPORTED_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: false,
  reason: "adapter-unavailable",
  computeSupported: false,
  timestampQuerySupported: false,
  limits: Object.freeze({}),
});

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

function options(
  overrides: Partial<UseStudioBg3dEngineRuntimeOptions> = {},
): UseStudioBg3dEngineRuntimeOptions {
  return {
    enabled: true,
    deviceProfile: "desktop",
    antialias: true,
    probe: async () => SUPPORTED_PROBE,
    loadPreference: async () => "auto",
    savePreference: async () => undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { userAgent: DESKTOP_USER_AGENT, hardwareConcurrency: 8 });
  window.isSecureContext = true;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useStudioBg3dEngineRuntime", () => {
  it("starts in the probing phase and settles on the selected engine", async () => {
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options()));

    expect(result.current.phase).toBe("probing");
    expect(result.current.plan.backend).toBe("webgl2");

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.plan).toMatchObject({
      backend: "webgpu",
      reason: "auto-webgpu-promoted",
    });
    expect(result.current.glFactory).toBeTypeOf("function");
  });

  it("never touches the GPU while the editor is closed", async () => {
    const probe = vi.fn(async () => SUPPORTED_PROBE);
    const { result } = renderHook(() =>
      useStudioBg3dEngineRuntime(options({ enabled: false, probe })));

    await Promise.resolve();
    expect(probe).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("probing");
    expect(result.current.glFactory).toBeNull();
  });

  it("restores the persisted preference and writes back an artist choice", async () => {
    const savePreference = vi.fn(async () => undefined);
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options({
      loadPreference: async () => "webgl2" as StudioBg3dEnginePreference,
      savePreference,
    })));

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.preference).toBe("webgl2");
    expect(result.current.plan.backend).toBe("webgl2");
    expect(result.current.glFactory).toBeNull();

    act(() => result.current.setPreference("webgpu"));
    await waitFor(() => expect(result.current.plan.backend).toBe("webgpu"));
    expect(savePreference).toHaveBeenCalledWith("webgpu");
  });

  it("changes the canvas key on a backend switch and holds it steady otherwise", async () => {
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options()));
    expect(result.current.canvasKey).toBe("webgl2#0");

    await waitFor(() => expect(result.current.plan.backend).toBe("webgpu"));
    expect(result.current.canvasKey).toBe("webgpu#0");

    act(() => result.current.setPreference("webgl2"));
    await waitFor(() => expect(result.current.canvasKey).toBe("webgl2#0"));

    // Re-choosing the same engine must not throw away a live renderer.
    act(() => result.current.setPreference("webgl2"));
    expect(result.current.canvasKey).toBe("webgl2#0");
  });

  it("rebuilds the canvas after a device loss even when the backend is unchanged", async () => {
    const createWebGpuRenderer = vi.fn(async () => {
      throw new Error("device-lost-during-init");
    });
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options({
      createWebGpuRenderer: createWebGpuRenderer as never,
    })));
    await waitFor(() => expect(result.current.canvasKey).toBe("webgpu#0"));

    await act(async () => {
      await result.current.glFactory!({ canvas: document.createElement("canvas") })
        .catch(() => undefined);
    });

    // Still WebGPU — the policy allows one retry — but on a fresh canvas.
    await waitFor(() => expect(result.current.canvasKey).toBe("webgpu#1"));
  });

  it("falls back to WebGL2 and reports the loss when the renderer cannot start", async () => {
    const createWebGpuRenderer = vi.fn(async () => {
      throw new Error("device-lost-during-init");
    });
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options({
      createWebGpuRenderer: createWebGpuRenderer as never,
    })));
    await waitFor(() => expect(result.current.plan.backend).toBe("webgpu"));

    const factory = result.current.glFactory!;
    await act(async () => {
      await factory({ canvas: document.createElement("canvas") }).catch(() => undefined);
      // A single failure keeps `auto` on WebGPU; the second one retires it for the session.
      await factory({ canvas: document.createElement("canvas") }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.plan.backend).toBe("webgl2"));
    expect(result.current.plan.reason).toBe("repeated-webgpu-failure");
    expect(result.current.deviceLostMessage).toContain("WebGL2로 전환");
  });

  it("reports a device loss raised after the renderer was already running", async () => {
    const createWebGpuRenderer = vi.fn(async (
      _canvas: HTMLCanvasElement,
      rendererOptions?: { onDeviceLost?: (loss: { reason: string; message: string }) => void },
    ) => {
      queueMicrotask(() => rendererOptions?.onDeviceLost?.({
        reason: "destroyed",
        message: "GPU 프로세스가 종료되었습니다.",
      }));
      return { renderer: { render: () => undefined }, dispose: async () => undefined };
    });
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options({
      createWebGpuRenderer: createWebGpuRenderer as never,
    })));
    await waitFor(() => expect(result.current.plan.backend).toBe("webgpu"));

    await act(async () => {
      await result.current.glFactory!({ canvas: document.createElement("canvas") });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.deviceLostMessage).toBe("GPU 프로세스가 종료되었습니다."));
  });

  it("keeps WebGL2 when the probe refuses the host", async () => {
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options({
      probe: async () => UNSUPPORTED_PROBE,
    })));

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.plan).toMatchObject({
      backend: "webgl2",
      reason: "webgpu-probe-unsupported",
      webgpuSelectable: false,
    });
    expect(result.current.canvasKey).toBe("webgl2#0");
  });

  it("classifies the embedding in-app browser from the live user agent", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 15; wv) Mobile Safari/537.36 KAKAOTALK 10.6.5",
    });
    const { result } = renderHook(() => useStudioBg3dEngineRuntime(options()));

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.inApp).toMatchObject({ id: "kakaotalk", isInApp: true });
    expect(result.current.plan).toMatchObject({
      backend: "webgl2",
      reason: "inapp-browser-opt-in-required",
      webgpuSelectable: true,
    });
  });

  it("stops announcing a device loss once the notice window passes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const createWebGpuRenderer = vi.fn(async () => {
        throw new Error("device-lost-during-init");
      });
      const { result } = renderHook(() => useStudioBg3dEngineRuntime(options({
        createWebGpuRenderer: createWebGpuRenderer as never,
      })));
      await waitFor(() => expect(result.current.plan.backend).toBe("webgpu"));

      await act(async () => {
        await result.current.glFactory!({ canvas: document.createElement("canvas") })
          .catch(() => undefined);
      });
      await waitFor(() => expect(result.current.deviceLostMessage).not.toBeNull());

      await act(async () => {
        vi.advanceTimersByTime(STUDIO_BG3D_DEVICE_LOSS_NOTICE_MS + 1);
      });
      expect(result.current.deviceLostMessage).toBeNull();
      // The fallback itself is not undone by the banner expiring.
      expect(result.current.canvasKey).toBe("webgpu#1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pins WebGL2 while a WebGL-only feature is present and keeps it after it is gone", async () => {
    const { result, rerender } = renderHook(
      (props: { xr: boolean }) => useStudioBg3dEngineRuntime(options({
        observedWebglOnlyFeatures: { webxr: props.xr },
      })),
      { initialProps: { xr: false } },
    );
    await waitFor(() => expect(result.current.plan.backend).toBe("webgpu"));

    rerender({ xr: true });
    await waitFor(() => expect(result.current.plan.backend).toBe("webgl2"));
    expect(result.current.plan.reason).toBe("webgl-only-webxr");
    expect(result.current.plan.webgpuSelectable).toBe(false);

    // Leaving the session must not swap the renderer back and remount the canvas a second time.
    rerender({ xr: false });
    await waitFor(() => expect(result.current.canvasKey).toBe("webgl2#0"));
    expect(result.current.plan.backend).toBe("webgl2");
    expect(result.current.plan.reason).toBe("webgl-only-webxr");
  });
});
