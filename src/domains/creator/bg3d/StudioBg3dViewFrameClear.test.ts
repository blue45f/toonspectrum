import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  clearStudioBg3dViewFrame,
  STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY,
  type StudioBg3dViewFrameClearRenderer,
} from "./studio-bg3d-view-frame-clear";
import { StudioBg3dViewFrameClear } from "./StudioBg3dViewFrameClear";

const { useFrameMock } = vi.hoisted(() => ({ useFrameMock: vi.fn() }));

vi.mock("@react-three/fiber", () => ({ useFrame: useFrameMock }));

const viewportSource = readFileSync(
  new URL("./StudioBg3dEditorViewport.tsx", import.meta.url),
  "utf8",
);

describe("Studio BG3D View framebuffer clear", () => {
  it("registers the actual frame callback at the pre-View priority and clears its current renderer", () => {
    useFrameMock.mockReset();
    expect(StudioBg3dViewFrameClear()).toBeNull();

    expect(useFrameMock).toHaveBeenCalledOnce();
    expect(useFrameMock).toHaveBeenCalledWith(
      expect.any(Function),
      STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY,
    );

    const callback = useFrameMock.mock.calls[0]?.[0] as
      | ((state: { gl: StudioBg3dViewFrameClearRenderer }) => void)
      | undefined;
    const setScissorTest = vi.fn();
    const clear = vi.fn();
    callback?.({ gl: { clear, setScissorTest } });

    expect(setScissorTest).toHaveBeenCalledWith(false);
    expect(clear).toHaveBeenCalledWith(true, true, true);
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
