import { assertStudioBg3dTiledSceneAdmission } from "./studio-bg3d-tiled-scene-admission";
import { registerStudioBg3dCaptureExcludedObject } from "./studio-bg3d-capture-exclusion";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createStudioBg3dTileCamera,
  snapshotStudioBg3dCaptureCamera,
} from "./studio-bg3d-tile-camera";
import { createStudioBg3dTilePlan } from "./studio-bg3d-tile-plan";
import { createStudioBg3dTiledCameraSession } from "./studio-bg3d-tiled-session";

describe("exact full-frame tiled camera", () => {
  it.each(["perspective", "orthographic"])(
    "preserves %s parent, lens shift, zoom and existing crop",
    (kind) => {
      const camera =
        kind === "perspective"
          ? new THREE.PerspectiveCamera(43, 1.7, 0.1, 100)
          : new THREE.OrthographicCamera(-3, 4, 2, -2, 0.1, 100);
      camera.zoom = 1.3;
      if (camera instanceof THREE.PerspectiveCamera) camera.filmOffset = 3;
      camera.setViewOffset(1600, 1000, 67, 53, 1450, 860);
      camera.updateProjectionMatrix();
      const parent = new THREE.Group();
      parent.position.set(2, 3, 4);
      parent.rotation.y = 0.2;
      parent.add(camera);
      camera.position.set(0, 0, 7);
      parent.updateMatrixWorld(true);
      const original = camera.toJSON();
      const world = camera.matrixWorld.toArray();
      const frozen = snapshotStudioBg3dCaptureCamera(camera);
      for (const tile of createStudioBg3dTilePlan({
        width: 157,
        height: 113,
        tileWidth: 51,
        bandHeight: 31,
      }).tiles) {
        const tiled = createStudioBg3dTileCamera(frozen, tile.capture);
        const point = new THREE.Vector3(0.2, -0.1, -4).applyMatrix4(
          camera.matrixWorld,
        );
        const full = point.clone().project(camera);
        const local = point.clone().project(tiled);
        const u = ((full.x + 1) / 2) * 157,
          v = ((1 - full.y) / 2) * 113;
        expect(local.x).toBeCloseTo(
          (2 * (u - tile.capture.x)) / tile.capture.width - 1,
          10,
        );
        expect(local.y).toBeCloseTo(
          1 - (2 * (v - tile.capture.y)) / tile.capture.height,
          10,
        );
        expect(local.z).toBeCloseTo(full.z, 10);
        expect(tiled.matrixWorld.toArray()).toEqual(world);
      }
      expect(camera.toJSON()).toEqual(original);
      expect(camera.matrixWorld.toArray()).toEqual(world);
    },
  );
  it("covers every output pixel exactly once and bounds all guarded tiles", () => {
    const plan = createStudioBg3dTilePlan({ width: 4096, height: 4096 });
    expect(plan.tiles).toHaveLength(32);
    expect(
      plan.tiles.reduce(
        (sum, tile) => sum + tile.core.width * tile.core.height,
        0,
      ),
    ).toBe(4096 ** 2);
    expect(
      plan.tiles.every(
        (tile) => tile.capture.width <= 1048 && tile.capture.height <= 536,
      ),
    ).toBe(true);
    for (const bad of [
      { width: 4097, height: 4096 },
      { width: 0, height: 1 },
      { width: NaN, height: 1 },
      { width: 4096, height: 4096, tileWidth: 16, bandHeight: 16 },
    ])
      expect(() => createStudioBg3dTilePlan(bad)).toThrow();
  });
  it("freezes projection per session and refuses concurrent or disposed use", async () => {
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    const matrices: number[][] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = createStudioBg3dTiledCameraSession(
      camera,
      async (request, selected) => {
        matrices.push(selected.projectionMatrix.toArray());
        await pending;
        return {
          width: request.width,
          height: request.height,
          rgba: new Uint8Array(16),
        };
      },
    );
    camera.fov = 12;
    camera.updateProjectionMatrix();
    const request = {
      width: 2,
      height: 2,
      background: { color: "#000000", alpha: 0 },
      includeDepth: false,
    };
    const window = {
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      fullWidth: 4,
      fullHeight: 4,
    };
    const first = session.capture(request, window);
    await expect(session.capture(request, window)).rejects.toThrow(
      "already capturing",
    );
    expect(matrices[0]).not.toEqual(
      createStudioBg3dTileCamera(camera, window).projectionMatrix.toArray(),
    );
    session.dispose();
    release();
    await expect(first).rejects.toThrow("closed");
    await expect(session.capture(request, window)).rejects.toThrow("closed");
  });
});

it("refuses view-dependent materials, but ignores hidden and explicitly excluded editor objects", () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  expect(() => assertStudioBg3dTiledSceneAdmission(scene)).not.toThrow();
  material.alphaHash = true;
  expect(() => assertStudioBg3dTiledSceneAdmission(scene)).toThrow(
    "viewport-dependent",
  );
  mesh.visible = false;
  expect(() => assertStudioBg3dTiledSceneAdmission(scene)).not.toThrow();
  mesh.visible = true;
  registerStudioBg3dCaptureExcludedObject(mesh);
  expect(() => assertStudioBg3dTiledSceneAdmission(scene)).not.toThrow();
  expect(mesh.visible).toBe(true);
  geometry.dispose();
  material.dispose();
});
it("converts clip depth for a fresh WebGPU camera without changing XY or the live camera", () => {
  const camera = new THREE.PerspectiveCamera(50, 1.4, 0.1, 100);
  camera.position.z = 3;
  camera.updateMatrixWorld(true);
  const point = new THREE.Vector3(0.2, 0.1, 0),
    old = point.clone().project(camera);
  const gpu = snapshotStudioBg3dCaptureCamera(
    camera,
    THREE.WebGPUCoordinateSystem,
  );
  const mapped = point.clone().project(gpu);
  expect(mapped.x).toBeCloseTo(old.x, 12);
  expect(mapped.y).toBeCloseTo(old.y, 12);
  expect(mapped.z).toBeCloseTo(0.5 * old.z + 0.5, 12);
  expect(camera.coordinateSystem).toBe(THREE.WebGLCoordinateSystem);
});


it("reuses one session camera identity while applying each tile from the original projection", async () => {
  const source = new THREE.PerspectiveCamera(41, 1.5, 0.1, 100); source.position.z = 5; source.updateMatrixWorld(true);
  const children = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); source.add(children);
  const cameras: THREE.Camera[] = []; const projections: number[][] = [];
  const session = createStudioBg3dTiledCameraSession(source, async (request, camera) => {
    cameras.push(camera); projections.push(camera.projectionMatrix.toArray());
    return { width: request.width, height: request.height, rgba: new Uint8Array(request.width * request.height * 4) };
  });
  const tiles = createStudioBg3dTilePlan({ width: 63, height: 47, tileWidth: 31, bandHeight: 31 }).tiles;
  for (const tile of tiles) await session.capture({ width: tile.capture.width, height: tile.capture.height,
    background: { color: "#000000", alpha: 0 }, includeDepth: false }, tile.capture);
  expect(new Set(cameras).size).toBe(1); expect(cameras[0]!.children).toHaveLength(0);
  for (const tile of tiles) expect(projections[tile.index]).toEqual(createStudioBg3dTileCamera(source, tile.capture).projectionMatrix.toArray());
  session.dispose(); children.geometry.dispose(); (children.material as THREE.Material).dispose();
});
