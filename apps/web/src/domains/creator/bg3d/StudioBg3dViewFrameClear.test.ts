// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { cleanup, render } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioBg3dViewFrame,
  STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY,
  syncStudioBg3dCanvasOrigin,
  type StudioBg3dViewFrameClearRenderer,
} from "./studio-bg3d-view-frame-clear";
import { StudioBg3dViewFrameClear } from "./StudioBg3dViewFrameClear";

const { useFrameMock, state } = vi.hoisted(() => ({
  useFrameMock: vi.fn(),
  state: { gl: {} as unknown, invalidate: vi.fn() },
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: useFrameMock,
  useThree: (select: (value: typeof state) => unknown) => select(state),
}));

const require = createRequire(import.meta.url);
const viewportSource = readFileSync(require.resolve("./StudioBg3dEditorViewport.tsx"), "utf8");
beforeEach(() => { state.gl = {}; useFrameMock.mockReset(); });
afterEach(() => cleanup());

describe("Studio BG3D View framebuffer clear", () => {
  it("registers the actual frame callback at the pre-View priority and clears its current renderer", () => {
    const mounted = render(createElement(StudioBg3dViewFrameClear));
    expect(mounted.container.childNodes).toHaveLength(0);
    expect(useFrameMock).toHaveBeenCalledOnce();
    expect(useFrameMock).toHaveBeenCalledWith(
      expect.any(Function),
      STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY,
    );
    const callback = useFrameMock.mock.calls[0]?.[0] as
      | ((value: {
        gl: StudioBg3dViewFrameClearRenderer & { domElement: HTMLCanvasElement };
        size: { width: number; height: number; top: number; left: number };
        setSize: (width: number, height: number, top: number, left: number) => void;
      }) => void)
      | undefined;
    const setScissorTest = vi.fn();
    const clear = vi.fn();
    const setSize = vi.fn();
    callback?.({
      gl: { clear, setScissorTest, domElement: document.createElement("canvas") },
      size: { width: 876, height: 766, top: 18, left: 0 },
      setSize,
    });
    expect(setSize).toHaveBeenCalledWith(876, 766, 0, 0);
    expect(setSize.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0]!);
    expect(setScissorTest).toHaveBeenCalledWith(false);
    expect(clear).toHaveBeenCalledWith(true, true, true);
  });

  it("tracks fractional origin changes throughout a 420ms dialog translation and stops after settling", () => {
    const size = { width: 876, height: 766, top: 141.796875, left: 102 };
    const canvas = document.createElement("canvas");
    const readBounds = vi.spyOn(canvas, "getBoundingClientRect");
    const setSize = vi.fn((width: number, height: number, top: number, left: number) => {
      Object.assign(size, { width, height, top, left });
    });
    // The real dialog animates translateY(18px -> 0) over 420ms without changing its box size.
    const topSamples = [141.796875, 131.724121, 126.381592, 124.243988, 123.796875];
    for (const top of topSamples) {
      readBounds.mockReturnValue(new DOMRect(102, top, 876, 766));
      syncStudioBg3dCanvasOrigin(canvas, size, setSize);
      expect(size).toEqual({ width: 876, height: 766, top, left: 102 });
    }
    expect(setSize).toHaveBeenCalledTimes(topSamples.length - 1);
    syncStudioBg3dCanvasOrigin(canvas, size, setSize);
    syncStudioBg3dCanvasOrigin(canvas, size, setSize);
    expect(setSize).toHaveBeenCalledTimes(topSamples.length - 1);
  });

  it.each([
    { width: 878, height: 768, left: 101, top: 122.796875 },
    { width: 439, height: 384, left: 540, top: 506.796875 },
  ])("keeps the same settled single/quad View coordinates after either initial measurement: %j", (track) => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(102, 123.796875, 876, 766));
    const positions = [124.24398803710938, 126.381591796875].map((initialTop) => {
      const size = { width: 876, height: 766, top: initialTop, left: 102 };
      syncStudioBg3dCanvasOrigin(canvas, size, (width, height, top, left) => {
        Object.assign(size, { width, height, top, left });
      });
      return {
        left: track.left - size.left,
        bottom: size.top + size.height - (track.top + track.height),
      };
    });
    expect(positions[0]).toEqual(positions[1]);
    expect(positions[0]).toEqual({ left: track.left - 102, bottom: -1 });
  });

  it("updates horizontal movement while preserving measured resolution during a DOM resize", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(85.5, 123, 1000, 900));
    const setSize = vi.fn();
    syncStudioBg3dCanvasOrigin(canvas, { width: 876, height: 766, top: 123, left: 102 }, setSize);
    expect(setSize).toHaveBeenCalledExactlyOnceWith(876, 766, 123, 85.5);
  });

  it.each([false, true])("owns and releases the real WebGPU queue wrappers (StrictMode: %s)", (strict) => {
    const clear = vi.fn();
    const draw = vi.fn();
    const gl = {
      isWebGPURenderer: true,
      backend: { isWebGPUBackend: true, device: {
        queue: { onSubmittedWorkDone: () => Promise.resolve() },
      } },
      getRenderTarget: () => null,
      clear,
      render: draw,
    };
    state.gl = gl;
    const child = createElement(StudioBg3dViewFrameClear);
    const mounted = render(strict ? createElement(StrictMode, null, child) : child);
    expect(gl.render).not.toBe(draw);
    expect(gl.clear).not.toBe(clear);
    mounted.unmount();
    expect(gl.render).toBe(draw);
    expect(gl.clear).toBe(clear);
  });

  it("clears color, depth, and stencil on every requested frame", () => {
    const setScissorTest = vi.fn();
    const clear = vi.fn();
    const renderer: StudioBg3dViewFrameClearRenderer = { clear, setScissorTest };
    clearStudioBg3dViewFrame(renderer);
    clearStudioBg3dViewFrame(renderer);
    expect(setScissorTest.mock.calls).toEqual([[false], [false]]);
    expect(clear.mock.calls).toEqual([
      [true, true, true],
      [true, true, true],
    ]);
  });

  it("runs before Drei View takes over the shared render loop", () => {
    expect(STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY).toBeLessThanOrEqual(0);
    const clearOwner = viewportSource.indexOf("<StudioBg3dViewFrameClear />");
    const firstView = viewportSource.indexOf("<View track={viewTopRef");
    const mainView = viewportSource.indexOf(
      '<View\n                    key="studio-bg3d-main-view"',
    );
    expect(clearOwner).toBeGreaterThan(viewportSource.indexOf("<Canvas"));
    expect(clearOwner).toBeLessThan(firstView);
    expect(clearOwner).toBeLessThan(mainView);
  });
});
