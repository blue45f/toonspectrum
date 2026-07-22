import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyStudioBg3dViewToThreeCamera,
  type BgViewportApi,
} from "./studio-bg3d-camera-application";
import { applyOrDeferStudioBg3dHistoryCamera } from "./studio-bg3d-camera-history-transition";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

function viewportFor(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
): BgViewportApi {
  return {
    applyView: (view) => applyStudioBg3dViewToThreeCamera(camera, { target }, view),
    readView: () => DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
    readFramingState: () => ({
      view: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      viewportAspect: 1,
    }),
    zoomBy: () => true,
    applyPreset: () => true,
    focusOn: () => undefined,
  };
}

function expectLensShift(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  expected: readonly [number, number],
): void {
  expect((camera.view?.offsetX ?? 0) / (camera.view?.fullWidth ?? 1)).toBeCloseTo(expected[0]);
  expect((camera.view?.offsetY ?? 0) / (camera.view?.fullHeight ?? 1)).toBeCloseTo(expected[1]);
}

describe("Studio BG3D cross-projection history camera handoff", () => {
  it("restores the exact Perspective ↔ Orthographic composition after controller remounts", () => {
    const perspectiveView: StudioBg3dCameraSettings = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      projection: "perspective",
      position: [8, 4, 11],
      target: [1.5, -0.25, 2],
      fovDegrees: 37,
      zoom: 1.75,
      lensShift: [0.13, -0.21],
    };
    const orthographicView: StudioBg3dCameraSettings = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      projection: "orthographic",
      position: [-7, 9, 5],
      target: [-2, 1.25, 3.5],
      fovDegrees: 61,
      zoom: 3.25,
      lensShift: [-0.18, 0.16],
    };
    const pending = { current: null as StudioBg3dCameraSettings | null };

    const oldPerspective = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const oldPerspectiveTarget = new THREE.Vector3();
    expect(applyOrDeferStudioBg3dHistoryCamera(
      viewportFor(oldPerspective, oldPerspectiveTarget),
      pending,
      orthographicView,
    )).toBe("deferred");
    expect(pending.current).toBe(orthographicView);
    expect(oldPerspective.position.toArray()).toEqual([0, 0, 0]);

    const replacementOrthographic = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 200);
    const replacementOrthographicTarget = new THREE.Vector3();
    expect(applyOrDeferStudioBg3dHistoryCamera(
      viewportFor(replacementOrthographic, replacementOrthographicTarget),
      pending,
      pending.current!,
    )).toBe("applied");
    expect(pending.current).toBeNull();
    expect(replacementOrthographic.position.toArray()).toEqual(orthographicView.position);
    expect(replacementOrthographicTarget.toArray()).toEqual(orthographicView.target);
    expect(replacementOrthographic.zoom).toBe(orthographicView.zoom);
    expectLensShift(replacementOrthographic, orthographicView.lensShift!);

    expect(applyOrDeferStudioBg3dHistoryCamera(
      viewportFor(replacementOrthographic, replacementOrthographicTarget),
      pending,
      perspectiveView,
    )).toBe("deferred");
    expect(pending.current).toBe(perspectiveView);

    const replacementPerspective = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const replacementPerspectiveTarget = new THREE.Vector3();
    expect(applyOrDeferStudioBg3dHistoryCamera(
      viewportFor(replacementPerspective, replacementPerspectiveTarget),
      pending,
      pending.current!,
    )).toBe("applied");
    expect(pending.current).toBeNull();
    expect(replacementPerspective.position.toArray()).toEqual(perspectiveView.position);
    expect(replacementPerspectiveTarget.toArray()).toEqual(perspectiveView.target);
    expect(replacementPerspective.fov).toBe(perspectiveView.fovDegrees);
    expect(replacementPerspective.zoom).toBe(perspectiveView.zoom);
    expectLensShift(replacementPerspective, perspectiveView.lensShift!);
  });
});
