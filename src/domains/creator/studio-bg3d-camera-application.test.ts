import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  applyStudioBg3dViewportAfterTransition,
  applyStudioBg3dViewToThreeCamera,
  type BgViewportApi,
} from "./studio-bg3d-camera-application";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

describe("Studio BG3D complete camera application", () => {
  it("waits for a replacement viewport identity and paints on both sides of view application", async () => {
    const events: string[] = [];
    const view = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera;
    const makeApi = (name: string): BgViewportApi => ({
      zoomBy: () => undefined,
      applyPreset: () => undefined,
      applyView: () => {
        events.push(`apply:${name}`);
        return true;
      },
      readView: () => view,
      focusOn: () => undefined,
    });
    const previous = makeApi("stale");
    const replacement = makeApi("replacement");
    let current: BgViewportApi | null = previous;
    let paints = 0;

    const result = await applyStudioBg3dViewportAfterTransition({
      view,
      previousApi: previous,
      requireReplacement: true,
      readApi: () => current,
      isActive: () => true,
      waitForPaintFrame: async () => {
        paints += 1;
        events.push(`paint:${paints}`);
        if (paints === 1) current = replacement;
      },
      timeoutMs: 1_000,
    });

    expect(result).toBe(replacement);
    expect(events).toEqual(["paint:1", "apply:replacement", "paint:2"]);
  });

  it("preserves perspective fov, zoom, lens shift, position, and a non-default target", () => {
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 200);
    const target = new THREE.Vector3(0, 0, 0);
    const update = vi.fn();
    const view = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      position: [8, 5, 11] as const,
      target: [1.5, 2.25, -3] as const,
      fovDegrees: 37,
      projection: "perspective" as const,
      zoom: 1.75,
      lensShift: [0.125, -0.2] as const,
    };

    expect(applyStudioBg3dViewToThreeCamera(camera, { target, update }, view)).toBe(true);
    expect(camera.fov).toBe(37);
    expect(camera.zoom).toBe(1.75);
    expect(camera.position.toArray()).toEqual([8, 5, 11]);
    expect(target.toArray()).toEqual([1.5, 2.25, -3]);
    expect(camera.view?.enabled).toBe(true);
    expect((camera.view?.offsetX ?? 0) / (camera.view?.fullWidth ?? 1)).toBeCloseTo(0.125);
    expect((camera.view?.offsetY ?? 0) / (camera.view?.fullHeight ?? 1)).toBeCloseTo(-0.2);
    expect(update).toHaveBeenCalledOnce();
  });

  it("fails closed on a stale projection camera and applies orthographic zoom after replacement", () => {
    const stalePerspective = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const target = new THREE.Vector3(9, 9, 9);
    const view = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      position: [4, 7, 10] as const,
      target: [-2, 1, 3] as const,
      projection: "orthographic" as const,
      zoom: 3.5,
      lensShift: [-0.1, 0.15] as const,
    };

    expect(applyStudioBg3dViewToThreeCamera(stalePerspective, { target }, view)).toBe(false);
    expect(stalePerspective.position.toArray()).toEqual([0, 0, 0]);
    expect(target.toArray()).toEqual([9, 9, 9]);

    const replacement = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 200);
    expect(applyStudioBg3dViewToThreeCamera(replacement, { target }, view)).toBe(true);
    expect(replacement.zoom).toBe(3.5);
    expect(replacement.position.toArray()).toEqual([4, 7, 10]);
    expect(target.toArray()).toEqual([-2, 1, 3]);
    expect((replacement.view?.offsetX ?? 0) / (replacement.view?.fullWidth ?? 1)).toBeCloseTo(-0.1);
    expect((replacement.view?.offsetY ?? 0) / (replacement.view?.fullHeight ?? 1)).toBeCloseTo(0.15);
  });

  it("clears a previous lens shift when the restored view has none", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.setViewOffset(1_000, 1_000, 120, -80, 1_000, 1_000);
    const view = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      lensShift: undefined,
    };

    expect(applyStudioBg3dViewToThreeCamera(camera, null, view)).toBe(true);
    expect(camera.view?.enabled).toBe(false);
  });
});
