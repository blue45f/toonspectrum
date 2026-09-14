import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { describe, expect, it, vi } from "vitest";

import {
  applyStudioBg3dProjectionAwareZoom,
  applyStudioBg3dViewportAfterTransition,
  applyStudioBg3dViewToThreeCamera,
  isStudioBg3dViewportControlTarget,
  readStudioBg3dObjectWorldBounds,
  readStudioBg3dWorldSurfaceHit,
  resolveStudioBg3dMinimumOrbitDistance,
  type BgViewportApi,
} from "./studio-bg3d-camera-application";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

describe("Studio BG3D complete camera application", () => {
  it("distinguishes floating viewport controls from genuine scene misses", () => {
    const controlTarget = {
      closest: (selector: string) => selector === '[data-bg3d-viewport-control="true"]'
        ? { dataset: { bg3dViewportControl: "true" } }
        : null,
    } as unknown as EventTarget;
    const sceneTarget = { closest: () => null } as unknown as EventTarget;

    expect(isStudioBg3dViewportControlTarget(controlTarget)).toBe(true);
    expect(isStudioBg3dViewportControlTarget(sceneTarget)).toBe(false);
    expect(isStudioBg3dViewportControlTarget(null)).toBe(false);
  });

  it("waits for a replacement viewport identity and paints on both sides of view application", async () => {
    const events: string[] = [];
    const view = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera;
    const makeApi = (name: string): BgViewportApi => ({
      zoomBy: () => true,
      applyPreset: () => true,
      applyView: () => {
        events.push(`apply:${name}`);
        return true;
      },
      readView: () => view,
      readFramingState: () => ({ view, viewportAspect: 1 }),
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

  it("preserves perspective fov, zoom, near plane, Dutch roll, position, and target", () => {
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
      nearClip: 0.025,
      up: [0, 0.8, 0.6] as const,
    };

    expect(applyStudioBg3dViewToThreeCamera(camera, { target, update }, view)).toBe(true);
    expect(camera.fov).toBe(37);
    expect(camera.aspect).toBeCloseTo(16 / 9);
    expect(camera.zoom).toBe(1.75);
    expect(camera.near).toBe(0.025);
    expect(camera.up.toArray()).toEqual([0, 0.8, 0.6]);
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
      nearClip: 0.5,
      up: [1, 0, 0] as const,
    };

    expect(applyStudioBg3dViewToThreeCamera(stalePerspective, { target }, view)).toBe(false);
    expect(stalePerspective.position.toArray()).toEqual([0, 0, 0]);
    expect(target.toArray()).toEqual([9, 9, 9]);

    const replacement = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 200);
    expect(applyStudioBg3dViewToThreeCamera(replacement, { target }, view)).toBe(true);
    expect(replacement.zoom).toBe(3.5);
    expect(replacement.near).toBe(0.5);
    expect(replacement.up.toArray()).toEqual([1, 0, 0]);
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

  it("fails malformed clipping and up vectors closed before mutating the live camera", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(1, 2, 3);
    const target = new THREE.Vector3(4, 5, 6);
    const baseline = {
      position: camera.position.clone(),
      target: target.clone(),
      near: camera.near,
      up: camera.up.clone(),
    };

    expect(applyStudioBg3dViewToThreeCamera(camera, { target }, {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      nearClip: 0,
    })).toBe(false);
    expect(applyStudioBg3dViewToThreeCamera(camera, { target }, {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      up: [0, 0, 0],
    })).toBe(false);
    expect(camera.position).toEqual(baseline.position);
    expect(target).toEqual(baseline.target);
    expect(camera.near).toBe(baseline.near);
    expect(camera.up).toEqual(baseline.up);
  });

  it("uses camera.zoom for orthographic buttons and preserves the current target", () => {
    const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 200);
    camera.position.set(7, 5, 9);
    camera.zoom = 2;
    const target = new THREE.Vector3(1, 2, 3);
    const update = vi.fn();

    expect(applyStudioBg3dProjectionAwareZoom(
      camera,
      { target, update },
      0.82,
      [0, 0, 0],
    )).toBe(true);
    expect(camera.zoom).toBeCloseTo(2 / 0.82);
    expect(camera.position.toArray()).toEqual([7, 5, 9]);
    expect(target.toArray()).toEqual([1, 2, 3]);
    expect(update).toHaveBeenCalledOnce();
  });

  it("keeps perspective zoom on the view ray instead of changing projection zoom", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, 0, 10);
    camera.zoom = 1.5;
    const target = new THREE.Vector3(0, 0, 2);

    expect(applyStudioBg3dProjectionAwareZoom(camera, { target }, 0.5, [0, 0, 0])).toBe(true);
    expect(camera.position.toArray()).toEqual([0, 0, 6]);
    expect(camera.zoom).toBe(1.5);
  });

  it.each([0.1, 0.01])("keeps the orbit target visible after repeated zoom at near clip %s", (nearClip) => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 0, 2);
    const controls = new OrbitControls(camera);
    controls.enableDamping = true;
    // Start with the same minimum used by the viewport's mounted OrbitControls.
    controls.minDistance = resolveStudioBg3dMinimumOrbitDistance(camera.near);
    const view = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      position: [0, 0, nearClip * 1.2] as const,
      target: [0, 0, 0] as const,
      nearClip,
    };
    expect(applyStudioBg3dViewToThreeCamera(camera, controls, view)).toBe(true);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(nearClip * 1.2);
    expect(controls.minDistance).toBe(resolveStudioBg3dMinimumOrbitDistance(nearClip));
    for (let zoom = 0; zoom < 3; zoom += 1) {
      expect(applyStudioBg3dProjectionAwareZoom(camera, controls, 0.5, [0, 0, 0])).toBe(true);
      const committedPosition = camera.position.clone();
      for (let frame = 0; frame < 20; frame += 1) {
        controls.update();
        camera.updateMatrixWorld();
        const projectedTarget = controls.target.clone().project(camera);
        expect(projectedTarget.z).toBeGreaterThanOrEqual(-1);
        expect(projectedTarget.z).toBeLessThanOrEqual(1);
        expect(camera.position.distanceTo(committedPosition)).toBeLessThan(1e-10);
      }
      expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(nearClip);
      expect(camera.near).toBe(nearClip);
    }
  });

  it("rejects perspective zoom with an invalid near plane without mutating the view", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 0, 2);
    camera.near = Number.NaN;
    const controls = new OrbitControls(camera);
    const position = camera.position.clone();
    expect(applyStudioBg3dProjectionAwareZoom(camera, controls, 0.5, [0, 0, 0])).toBe(false);
    expect(camera.position).toEqual(position);
    expect(camera.far).toBe(200);
  });

  it.each([0.4, 400])("preserves an authored distance of %s through real OrbitControls and button zoom", (distance) => {
    const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 200);
    camera.position.set(4, 3, 6);
    const controls = new OrbitControls(camera);
    controls.minDistance = 2;
    controls.maxDistance = 60;
    const view = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      position: [0, 0, distance] as const,
      target: [0, 0, 0] as const,
      lensShift: [0.1, -0.2] as const,
    };
    expect(applyStudioBg3dViewToThreeCamera(camera, controls, view)).toBe(true);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance);
    expect(camera.aspect).toBeCloseTo(9 / 16);
    expect(camera.far).toBeGreaterThan(distance);
    expect(applyStudioBg3dProjectionAwareZoom(camera, controls, 1.22, [0, 0, 0])).toBe(true);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance * 1.22);
    // No DOM was attached, so the real controls own no event listeners to disconnect.
  });

  it("keeps lens shift projection proportions after resize and an undo-style view restore", () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
    const view = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      position: [0, 0, 10] as const,
      target: [0, 0, 0] as const,
      lensShift: [0.12, -0.08] as const,
    };
    for (const aspect of [16 / 9, 9 / 16, 4 / 3]) {
      camera.aspect = aspect;
      expect(applyStudioBg3dViewToThreeCamera(camera, null, view)).toBe(true);
      const projection = camera.projectionMatrix.elements;
      expect(camera.aspect).toBeCloseTo(aspect);
      expect(projection[5] / projection[0]).toBeCloseTo(aspect);
      expect(new THREE.Vector3(0, 0, 0).project(camera).x).toBeCloseTo(-0.24);
      expect(new THREE.Vector3(0, 0, 0).project(camera).y).toBeCloseTo(-0.16);
    }
  });

  it("stops a previous orbit's inertia before applying a saved camera view", () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
    camera.position.set(0, 0, 10);
    const controls = new OrbitControls(camera);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateLeft(0.5);
    const view = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      position: [0, 0, 10] as const,
      target: [0, 0, 0] as const,
    };
    expect(applyStudioBg3dViewToThreeCamera(camera, controls, view)).toBe(true);
    expect(camera.position.distanceTo(new THREE.Vector3(...view.position))).toBeLessThan(1e-10);
    for (let frame = 0; frame < 100; frame += 1) controls.update();
    expect(camera.position.distanceTo(new THREE.Vector3(...view.position))).toBeLessThan(1e-10);
    expect(controls.target.toArray()).toEqual(view.target);
    expect(controls.enableDamping).toBe(true);
    expect(controls.autoRotate).toBe(false);
  });

  it.each(["perspective", "orthographic"] as const)("keeps %s button zoom stable after an orbit gesture", (projection) => {
    const camera = projection === "perspective"
      ? new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200)
      : new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 200);
    camera.position.set(0, 0, 10);
    const controls = new OrbitControls(camera);
    controls.enableDamping = true;
    controls.rotateLeft(0.5);
    const direction = camera.position.clone().sub(controls.target).normalize();
    expect(applyStudioBg3dProjectionAwareZoom(camera, controls, 0.82, [0, 0, 0])).toBe(true);
    const committedPosition = camera.position.clone();
    for (let frame = 0; frame < 100; frame += 1) controls.update();
    expect(camera.position.distanceTo(committedPosition)).toBeLessThan(1e-10);
    expect(camera.position.clone().sub(controls.target).normalize().distanceTo(direction)).toBeLessThan(1e-10);
    expect(controls.enableDamping).toBe(true);
  });

  it("reads precise registered world bounds and rejects empty objects", () => {
    const parent = new THREE.Group();
    parent.position.set(4, 3, -2);
    parent.rotation.y = Math.PI / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
    mesh.position.set(1, 0, 0);
    parent.add(mesh);

    const bounds = readStudioBg3dObjectWorldBounds(parent);
    expect(bounds).not.toBeNull();
    expect(bounds?.min[0]).toBeCloseTo(1);
    expect(bounds?.max[0]).toBeCloseTo(7);
    expect(bounds?.min[1]).toBeCloseTo(1);
    expect(bounds?.max[1]).toBeCloseTo(5);
    expect(readStudioBg3dObjectWorldBounds(new THREE.Group())).toBeNull();
    mesh.geometry.dispose();
  });

  it("frames visible geometry without hidden descendants inflating the composition", () => {
    const root = new THREE.Group();
    root.position.set(4, 0, 0);
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial();
    const visibleMesh = new THREE.Mesh(geometry, material);
    const hiddenGroup = new THREE.Group();
    hiddenGroup.visible = false;
    const distantMesh = new THREE.Mesh(geometry, material);
    distantMesh.position.set(500, 0, 0);
    hiddenGroup.add(distantMesh);
    root.add(visibleMesh, hiddenGroup);
    expect(readStudioBg3dObjectWorldBounds(root)?.max[0]).toBe(505);
    expect(readStudioBg3dObjectWorldBounds(root, { visibleOnly: true })).toEqual({
      min: [3, -1, -1], max: [5, 1, 1],
    });
    expect(hiddenGroup.visible).toBe(false);
    expect(hiddenGroup.children).toEqual([distantMesh]);
    visibleMesh.visible = false;
    expect(readStudioBg3dObjectWorldBounds(root, { visibleOnly: true })).toBeNull();
    geometry.dispose();
    material.dispose();
  });

  it("includes visible instanced geometry in selection bounds", () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, 2);
    mesh.position.x = 10;
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-5, 0, 0));
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 0, 0));
    expect(readStudioBg3dObjectWorldBounds(mesh, { visibleOnly: true })).toEqual({
      min: [4, -1, -1], max: [16, 1, 1],
    });
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  });

  it("converts regular and instanced local normals through the complete world transform", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.rotation.z = Math.PI / 2;
    mesh.updateMatrixWorld(true);
    const regular = readStudioBg3dWorldSurfaceHit({
      object: mesh,
      point: new THREE.Vector3(1, 2, 3),
      normal: new THREE.Vector3(1, 0, 0),
    });
    expect(regular?.normal[0]).toBeCloseTo(0);
    expect(regular?.normal[1]).toBeCloseTo(1);

    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      1,
    );
    instanced.setMatrixAt(0, new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
    instanced.updateMatrixWorld(true);
    const hit = readStudioBg3dWorldSurfaceHit({
      object: instanced,
      instanceId: 0,
      point: new THREE.Vector3(0, 0, 0),
      normal: new THREE.Vector3(1, 0, 0),
    });
    expect(hit?.normal[0]).toBeCloseTo(0);
    expect(hit?.normal[1]).toBeCloseTo(-1);
    expect(readStudioBg3dWorldSurfaceHit({
      object: instanced,
      instanceId: 2,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(1, 0, 0),
    })).toBeNull();
    mesh.geometry.dispose();
    instanced.geometry.dispose();
    (instanced.material as THREE.Material).dispose();
  });
});
