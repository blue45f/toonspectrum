import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { composeStudioBg3dLens } from "./studio-bg3d-lens-composition";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

const base: StudioBg3dCameraSettings = { position: [0, 1, 8], target: [0, 1, 0], fovDegrees: 50, zoom: 1.4, lensShift: [0.1, -0.2], up: [0, 1, 0], nearClip: 0.01 };

describe("production lens composition", () => {
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
