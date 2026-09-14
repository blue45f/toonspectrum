import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { describe, expect, it } from "vitest";

import { applyStudioBg3dViewToThreeCamera } from "./studio-bg3d-camera-application";
import { composeStudioBg3dLens } from "./studio-bg3d-lens-composition";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

const base: StudioBg3dCameraSettings = { position: [0, 1, 8], target: [0, 1, 0], fovDegrees: 50, zoom: 1.4, lensShift: [0.1, -0.2], up: [0, 1, 0], nearClip: 0.01 };

describe("production lens composition", () => {
  it.each([0.1, 0.01])("rejects size compensation inside the near %s orbit limit without changing the view", (nearClip) => {
    const view: StudioBg3dCameraSettings = {
      position: [0, 0, nearClip * 1.2], target: [0, 0, 0], fovDegrees: 50, nearClip,
    };
    const camera = new PerspectiveCamera(50, 1, nearClip, 200);
    camera.position.set(0, 0, 2);
    const controls = new OrbitControls(camera);
    controls.enableDamping = true;
    expect(applyStudioBg3dViewToThreeCamera(camera, controls, view)).toBe(true);
    const position = camera.position.clone();
    const target = controls.target.clone();
    const marker = new Vector3(nearClip * 0.1, 0, 0);
    const before = marker.clone().project(camera);
    const next = composeStudioBg3dLens(view, 90, true);
    expect(next).toBeNull();
    // The production caller keeps the live view when compensation is rejected.
    expect(applyStudioBg3dViewToThreeCamera(camera, controls, next ?? view)).toBe(true);
    for (let frame = 0; frame < 20; frame += 1) controls.update();
    camera.updateMatrixWorld(true);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-10);
    expect(controls.target.distanceTo(target)).toBeLessThan(1e-10);
    expect(camera.fov).toBe(50);
    expect(camera.near).toBe(nearClip);
    expect(marker.clone().project(camera).distanceTo(before)).toBeLessThan(1e-10);
  });

  it("preserves close-up subject size when the camera's smaller near plane permits the exact distance", () => {
    const view: StudioBg3dCameraSettings = {
      position: [0, 0, 0.12], target: [0, 0, 0], fovDegrees: 50, nearClip: 0.01,
    };
    const camera = new PerspectiveCamera(50, 1, 0.01, 200);
    camera.position.set(0, 0, 2);
    const controls = new OrbitControls(camera);
    expect(applyStudioBg3dViewToThreeCamera(camera, controls, view)).toBe(true);
    const marker = new Vector3(0.01, 0, 0);
    const beforeWidth = marker.clone().project(camera).x;
    const next = composeStudioBg3dLens(view, 90, true)!;
    expect(next).not.toBeNull();
    expect(applyStudioBg3dViewToThreeCamera(camera, controls, next)).toBe(true);
    for (let frame = 0; frame < 20; frame += 1) controls.update();
    camera.updateMatrixWorld(true);
    expect(camera.position.distanceTo(new Vector3(...next.position))).toBeLessThan(1e-10);
    expect(marker.clone().project(camera).x).toBeCloseTo(beforeWidth, 10);
    expect(camera.near).toBe(0.01);
  });

  it.each([20, 35, 65, 90])("preserves target-plane projected size at %s degrees", (fov) => {
    const changed = composeStudioBg3dLens(base, fov, true)!;
    function projectedWidth(view: StudioBg3dCameraSettings) {
      const camera = new PerspectiveCamera(view.fovDegrees, 9 / 16, 0.01, 1000);
      camera.zoom = view.zoom!;
      camera.position.fromArray(view.position);
      camera.lookAt(new Vector3(...view.target));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return new Vector3(0.5, 1, 0).project(camera).x - new Vector3(-0.5, 1, 0).project(camera).x;
    }
    expect(projectedWidth(changed)).toBeCloseTo(projectedWidth(base), 10);
    expect(changed.target).toEqual(base.target);
    expect(changed.lensShift).toEqual(base.lensShift);
    expect(changed.up).toEqual(base.up);
    expect(changed.zoom).toEqual(base.zoom);
  });
  it("changes perspective without moving when distance compensation is disabled", () => {
    expect(composeStudioBg3dLens(base, 35, false)).toEqual({ ...base, fovDegrees: 35 });
    expect(composeStudioBg3dLens(base, 50, true)).toBe(base);
  });
  it("rejects invalid inputs and unsupported parallel projection without mutation", () => {
    expect(composeStudioBg3dLens({ ...base, projection: "orthographic" }, 35, false)).toBeNull();
    expect(composeStudioBg3dLens(base, NaN, true)).toBeNull();
    expect(composeStudioBg3dLens(base, 0, true)).toBeNull();
    expect(composeStudioBg3dLens({ ...base, position: base.target }, 35, true)).toBeNull();
    expect(composeStudioBg3dLens({ ...base, position: [Infinity, 0, 0] }, 35, true)).toBeNull();
    expect(base.position).toEqual([0, 1, 8]);
  });
});
