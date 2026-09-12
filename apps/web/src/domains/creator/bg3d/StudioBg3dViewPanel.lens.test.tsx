// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import {
  STUDIO_BG3D_SHOT_BATCH_PASSES,
  STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
} from "./studio-bg3d-shot-batch-pass-catalog";
import { StudioBg3dViewPanel } from "./StudioBg3dViewPanel";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";
import type { StudioBg3dViewPanelProps } from "./StudioBg3dViewPanelContent";

// Keep the real runtime bridge and lens UI. The unrelated environment/physics presentation is omitted.
vi.mock("./StudioBg3dViewPanelContent", async () => {
  const { StudioBg3dCompositionLensPanel } = await import("./StudioBg3dCompositionLensPanel");
  return {
    StudioBg3dViewPanel: StudioBg3dCompositionLensPanel,
    StudioBg3dAiReferenceAction: () => null,
    StudioBg3dBabylonDiagnostic: () => null,
  };
});
vi.mock("./StudioBg3dSpatialStoryboardLauncher", () => ({
  StudioBg3dSpatialStoryboardLauncher: () => null,
}));

afterEach(cleanup);

function bridgeProps(
  savedCamera: StudioBg3dCameraSettings,
  updateCameraLens: StudioBg3dViewPanelProps["context"]["updateCameraLens"],
): StudioBg3dViewPanelProps {
  const context = {
    sceneBaseDocument: { ...createDefaultStudioBg3dSceneDocument(), camera: savedCamera },
    selectedIds: new Set<string>(),
    lineArtPreview: false,
    transparentInsert: false,
    selectedShotBatchPasses: [],
    STUDIO_BG3D_SHOT_BATCH_PASSES,
    STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
    LT_EXPORT_HEIGHTS: [640, 1080, 1440, 2160, 4096],
    shotBatchBlockedReason: null,
    shotBatchSelectedIds: [],
    savedShots: [],
    viewEditorSection: "prosuite",
    recoveryScope: null,
    isCapturing: false,
    isBatchRenderingShots: false,
    isRestoringScene: false,
    physicsInteractionLocked: false,
    updateCameraLens,
  } satisfies Partial<StudioBg3dViewPanelProps["context"]>;
  // This focused fixture deliberately omits only props consumed by the mocked presentation.
  return { context } as unknown as StudioBg3dViewPanelProps;
}

describe("lens composition through the real view-panel runtime bridge", () => {
  it("uses the live orbit pose at click time even when the saved distance would reject the lens", () => {
    const saved: StudioBg3dCameraSettings = {
      position: [0, 1, 8000], target: [0, 1, 0], fovDegrees: 50,
    };
    let live = saved;
    const update = vi.fn<StudioBg3dViewPanelProps["context"]["updateCameraLens"]>((patch) => {
      live = { ...live, ...patch(live) };
    });
    render(<StudioBg3dViewPanel {...bridgeProps(saved, update)} />);
    // Orbit/pan does not rerender the saved document; the canonical command supplies this later pose.
    live = {
      position: [5, 4, 2], target: [3, 1, -4], fovDegrees: 50,
      up: [0.2, 1, 0.1], lensShift: [0.1, -0.06], zoom: 1.6, nearClip: 0.02,
    };
    const before = live;
    fireEvent.click(screen.getByRole("button", { name: /인물 중심 35°/ }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(live.fovDegrees).toBe(35);
    const ratio = Math.tan(50 * Math.PI / 360) / Math.tan(35 * Math.PI / 360);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(live.position[axis]).toBeCloseTo(
        before.target[axis] + (before.position[axis] - before.target[axis]) * ratio,
        10,
      );
    }
    expect(live.target).toEqual(before.target);
    expect(live.up).toEqual(before.up);
    expect(live.lensShift).toEqual(before.lensShift);
    expect(live.zoom).toBe(before.zoom);
    expect(live.nearClip).toBe(before.nearClip);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rejects a live out-of-bounds move without changing the pose and supports a FOV-only retry", () => {
    const saved: StudioBg3dCameraSettings = {
      position: [0, 1, 8], target: [0, 1, 0], fovDegrees: 50,
    };
    let live: StudioBg3dCameraSettings = { ...saved, position: [9999, 1, 0] };
    const before = live;
    const update = vi.fn<StudioBg3dViewPanelProps["context"]["updateCameraLens"]>((patch) => {
      live = { ...live, ...patch(live) };
    });
    render(<StudioBg3dViewPanel {...bridgeProps(saved, update)} />);
    fireEvent.click(screen.getByRole("button", { name: /인물 중심 35°/ }));
    expect(live).toEqual(before);
    expect(screen.getByRole("alert").textContent).toContain("현재 거리");

    fireEvent.click(screen.getByRole("checkbox", { name: "피사체 크기를 유지하며 거리 조절" }));
    fireEvent.click(screen.getByRole("button", { name: /인물 중심 35°/ }));
    expect(live).toEqual({ ...before, fovDegrees: 35 });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
