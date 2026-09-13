import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { PerspectiveCamera, Vector3 as ThreeVector3 } from "three";
import { describe, expect, it } from "vitest";

import { createStudioBg3dBabylonCaptureCamera } from "./studio-bg3d-babylon-camera-projection";
import { applyStudioBg3dViewToThreeCamera } from "./studio-bg3d-camera-application";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

const cases = [
  { label: "portrait offset", width: 63, height: 112, shift: [0.24, -0.18], zoom: 1.7 },
  { label: "wide offset", width: 192, height: 65, shift: [-0.31, 0.27], zoom: 0.75 },
  { label: "maximum shift", width: 65, height: 64, shift: [-2, 2], zoom: 1 },
  { label: "centered legacy", width: 64, height: 64, shift: [0, 0], zoom: 1 },
] as const;

function withScene(halfZ: boolean, run: (scene: Scene) => void): void {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64, textureSize: 64, deterministicLockstep: false, lockstepMaxSteps: 4 });
  // NullEngine has no GPU. Exercise both actual backend projection conventions explicitly.
  Object.defineProperty(engine, "isNDCHalfZRange", { value: halfZ });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try { run(scene); } finally { scene.dispose(); engine.dispose(); }
}

describe.each([false, true])("Babylon perspective capture projection (half-Z=%s)", (halfZ) => {
  it.each(cases)("matches the real Three camera at $label including roll and frustum boundaries", (fixture) => {
    withScene(halfZ, (scene) => {
      const settings: StudioBg3dCameraSettings = {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
        projection: "perspective", position: [30, 12, 80], target: [5, 3, -10],
        up: [0.6, 0.8, 0], nearClip: 0.1, fovDegrees: 63,
        lensShift: fixture.shift, zoom: fixture.zoom,
      };
      const three = new PerspectiveCamera(45, fixture.width / fixture.height);
      expect(applyStudioBg3dViewToThreeCamera(three, null, settings)).toBe(true);
      const camera = createStudioBg3dBabylonCaptureCamera(settings, fixture.width, fixture.height, scene);
      const projection = camera.getProjectionMatrix(true);
      const viewProjection = camera.getViewMatrix(true).multiply(projection);
      // Compare the projection independently of Float32 world translation near the camera.
      for (const index of [0, 5, 8, 9, 11]) {
        expect(projection.m[index]).toBe(Math.fround(three.projectionMatrix.elements[index]!));
      }
      expect(camera.maxZ).toBe(three.far);
      expect(camera.minZ).toBe(three.near);
      expect(camera.viewport).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
      for (const z of [-0.8, 0, 0.8]) {
        for (const [x, y] of [[-1.001, -0.999], [-0.999, -1.001], [1.001, 0.999], [0.999, 1.001], [0, 0]]) {
          // Build world points from Three's near/frustum boundary, then independently project
          // with Babylon. Wrong axis signs, aspect or lost roll move these across the boundary.
          const world = new ThreeVector3(x!, y!, z).unproject(three);
          const actual = Vector3.TransformCoordinates(new Vector3(world.x, world.y, world.z), viewProjection);
          expect(actual.x).toBeCloseTo(x!, 3);
          expect(actual.y).toBeCloseTo(y!, 3);
          expect(actual.z).toBeCloseTo(halfZ ? (z + 1) / 2 : z, 3);
        }
      }
      // A temporary normal/ID target or forced cache refresh cannot reset the authored shift.
      const before = Array.from(projection.m);
      scene.setTransformMatrix(camera.getViewMatrix(), Matrix.Identity());
      expect(Array.from(camera.getProjectionMatrix(true).m)).toEqual(before);
    });
  });

  it.each([300, 2_000, 10_000])("keeps a target at %s units visible with bounded linear float depth", (distance) => {
    withScene(halfZ, (scene) => {
      const settings: StudioBg3dCameraSettings = {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
        projection: "perspective", position: [0, 0, distance], target: [0, 0, 0],
        nearClip: 0.01, lensShift: [0.1, -0.1],
      };
      const camera = createStudioBg3dBabylonCaptureCamera(settings, 63, 112, scene);
      expect(camera.maxZ).toBe(Math.min(20_000, distance * 8));
      const targetNdc = Vector3.TransformCoordinates(Vector3.Zero(), camera.getViewMatrix(true).multiply(camera.getProjectionMatrix()));
      expect(targetNdc.z).toBeLessThan(1);
      expect(targetNdc.z).toBeGreaterThan(0);
      const m = camera.getProjectionMatrix().m;
      const f = Math.fround;
      let previous = -1;
      for (const viewDistance of [camera.minZ, distance, camera.maxZ * 0.999, camera.maxZ]) {
        // Reproduce the public Babylon depth shader's Float32 clip-Z/depthValues arithmetic.
        // This is linear view depth, so adaptive far does not amplify a nonlinear Z readback.
        const clipZ = f(f(m[10]! * f(-viewDistance)) + m[14]!);
        const minZ = halfZ ? 0 : camera.minZ;
        const normalized = f(f(clipZ + f(minZ)) / f(minZ + camera.maxZ));
        const expected = (viewDistance - camera.minZ) / (camera.maxZ - camera.minZ);
        expect(Math.abs(normalized - expected)).toBeLessThan(2e-7);
        expect(normalized).toBeGreaterThan(previous);
        previous = normalized;
      }
    });
  });
});

it("retains fail-closed orthographic support without leaking a camera", () => {
  withScene(false, (scene) => {
    expect(() => createStudioBg3dBabylonCaptureCamera({
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, projection: "orthographic",
    }, 64, 64, scene)).toThrow("Unsupported Studio Babylon capture projection");
    expect(scene.cameras).toHaveLength(0);
  });
});
