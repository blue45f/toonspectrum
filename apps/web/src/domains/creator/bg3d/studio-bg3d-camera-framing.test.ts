import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { applyStudioBg3dViewToThreeCamera } from "./studio-bg3d-camera-application";
import { resolveStudioBg3dCaptureFrame } from "./studio-bg3d-capture-frame-geometry";
import { applyStudioBg3dCaptureFrameViewOffset } from "./studio-bg3d-capture-frame-view-offset";
import {
  fitStudioBg3dCameraToBounds,
  resolveStudioBg3dOrthographicZoom,
} from "./studio-bg3d-camera-framing";
import type { StudioBg3dCameraFramingBounds } from "./studio-bg3d-camera-framing";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

const CAMERA = Object.freeze({
  position: [4, 3, 6] as const,
  target: [0, 0, 0] as const,
  fovDegrees: 50,
  projection: "perspective" as const,
  zoom: 1,
});

const UNIT_BOUNDS = Object.freeze({
  min: [-1, -1, -1] as const,
  max: [1, 1, 1] as const,
});

function projectedCorners(
  view: StudioBg3dCameraSettings,
  bounds: StudioBg3dCameraFramingBounds,
  aspect: number,
  frustum = { width: 20, height: 10 },
  exportAspectRatio?: number,
) {
  const camera = view.projection === "orthographic"
    ? new THREE.OrthographicCamera(-frustum.width / 2, frustum.width / 2, frustum.height / 2, -frustum.height / 2, 0.1, 20_000)
    : new THREE.PerspectiveCamera(view.fovDegrees, aspect, 0.1, 20_000);
  expect(applyStudioBg3dViewToThreeCamera(camera, null, view)).toBe(true);
  if (camera instanceof THREE.PerspectiveCamera) expect(camera.aspect).toBeCloseTo(aspect);
  if (exportAspectRatio !== undefined) {
    const viewport = { width: aspect * 1_000, height: 1_000 };
    const frame = resolveStudioBg3dCaptureFrame({
      viewportWidth: viewport.width, viewportHeight: viewport.height, aspectRatio: exportAspectRatio,
    });
    expect(frame).not.toBeNull();
    expect(applyStudioBg3dCaptureFrameViewOffset(camera, frame!, viewport)).not.toBeNull();
  }
  const points: THREE.Vector3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(point.x)).toBeLessThanOrEqual(1 + 1e-10);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(1 + 1e-10);
        expect(Math.abs(point.z)).toBeLessThanOrEqual(1 + 1e-10);
        points.push(point);
      }
    }
  }
  return points;
}

describe("Studio BG3D camera framing", () => {
  it("fits projected bounds while preserving the camera direction and composition fields", () => {
    const result = fitStudioBg3dCameraToBounds({
      camera: {
        ...CAMERA,
        lensShift: [0.1, -0.05],
        nearClip: 0.025,
        up: [0, 0.8, 0.6],
      },
      bounds: { min: [9, 19, 29], max: [11, 21, 31] },
      viewportAspect: 16 / 9,
      padding: 1,
    });

    expect(result).not.toBeNull();
    expect(result?.target).toEqual([10, 20, 30]);
    expect(result).toMatchObject({
      fovDegrees: 50,
      projection: "perspective",
      zoom: 1,
      lensShift: [0.1, -0.05],
      nearClip: 0.025,
      up: [0, 0.8, 0.6],
    });
    const originalDirection = CAMERA.position.map((value, index) => value - CAMERA.target[index]);
    const nextDirection = result!.position.map((value, index) => value - result!.target[index]);
    const cross = [
      originalDirection[1] * nextDirection[2] - originalDirection[2] * nextDirection[1],
      originalDirection[2] * nextDirection[0] - originalDirection[0] * nextDirection[2],
      originalDirection[0] * nextDirection[1] - originalDirection[1] * nextDirection[0],
    ];
    expect(Math.hypot(...cross)).toBeCloseTo(0, 10);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.position)).toBe(true);
    expect(Object.isFrozen(result?.target)).toBe(true);
    expect(Object.isFrozen(result?.up)).toBe(true);
  });

  it("moves farther back for a narrow viewport and an off-centre lens shift", () => {
    const distance = (position: readonly number[], target: readonly number[]) => Math.hypot(
      position[0] - target[0],
      position[1] - target[1],
      position[2] - target[2],
    );
    const wide = fitStudioBg3dCameraToBounds({
      camera: CAMERA,
      bounds: UNIT_BOUNDS,
      viewportAspect: 16 / 9,
      padding: 1,
    });
    const narrow = fitStudioBg3dCameraToBounds({
      camera: CAMERA,
      bounds: UNIT_BOUNDS,
      viewportAspect: 9 / 16,
      padding: 1,
    });
    const shifted = fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, lensShift: [0, 0.2] },
      bounds: UNIT_BOUNDS,
      viewportAspect: 16 / 9,
      padding: 1,
    });

    expect(distance(narrow!.position, narrow!.target)).toBeGreaterThan(
      distance(wide!.position, wide!.target),
    );
    expect(distance(shifted!.position, shifted!.target)).toBeGreaterThan(
      distance(wide!.position, wide!.target),
    );
  });

  it("uses a minimum subject radius for point-like bounds and a minimum camera distance", () => {
    const result = fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, position: [0, 0, 5] },
      bounds: { min: [2, 3, 4], max: [2, 3, 4] },
      viewportAspect: 1,
      padding: 1,
      minimumRadius: 0.01,
      minDistance: 3,
    });
    expect(result?.target).toEqual([2, 3, 4]);
    expect(Math.hypot(
      result!.position[0] - result!.target[0],
      result!.position[1] - result!.target[1],
      result!.position[2] - result!.target[2],
    )).toBeCloseTo(3);
  });

  it("fits orthographic bounds from the live zoom-one frustum and preserves camera distance", () => {
    const result = fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, position: [0, 0, 6], projection: "orthographic", zoom: 7 },
      bounds: UNIT_BOUNDS,
      viewportAspect: 2,
      orthographicFrustumAtZoomOne: { width: 20, height: 10 },
      padding: 1,
    });
    expect(result?.zoom).toBeCloseTo(5);
    expect(result?.projection).toBe("orthographic");
    expect(Math.hypot(
      result!.position[0] - result!.target[0],
      result!.position[1] - result!.target[1],
      result!.position[2] - result!.target[2],
    )).toBeCloseTo(6);
    projectedCorners(result!, UNIT_BOUNDS, 2);
  });

  it("moves a perspective fit beyond the persisted near plane", () => {
    const nearClip = 50;
    const result = fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, nearClip },
      bounds: UNIT_BOUNDS,
      viewportAspect: 16 / 9,
      padding: 1,
    });

    expect(result).not.toBeNull();
    const distance = Math.hypot(
      result!.position[0] - result!.target[0],
      result!.position[1] - result!.target[1],
      result!.position[2] - result!.target[2],
    );
    expect(distance).toBeGreaterThan(nearClip);
    const corners = projectedCorners(result!, UNIT_BOUNDS, 16 / 9);
    expect(Math.min(...corners.map((corner) => corner.z))).toBeCloseTo(-1);
  });

  it("moves an orthographic fit beyond the near plane without changing its fitted zoom", () => {
    const nearClip = 50;
    const result = fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, position: [0, 0, 6], projection: "orthographic", nearClip, zoom: 7 },
      bounds: UNIT_BOUNDS,
      viewportAspect: 2,
      orthographicFrustumAtZoomOne: { width: 20, height: 10 },
      padding: 1,
    });

    expect(result).not.toBeNull();
    const distance = Math.hypot(
      result!.position[0] - result!.target[0],
      result!.position[1] - result!.target[1],
      result!.position[2] - result!.target[2],
    );
    expect(result?.zoom).toBeCloseTo(5);
    expect(distance).toBeCloseTo(nearClip + 1);
    projectedCorners(result!, UNIT_BOUNDS, 2);
  });

  it("clamps orthographic button zoom with the perspective distance-factor convention", () => {
    expect(resolveStudioBg3dOrthographicZoom({
      currentZoom: 1,
      distanceFactor: 0.82,
    })).toBeCloseTo(1 / 0.82);
    expect(resolveStudioBg3dOrthographicZoom({
      currentZoom: 1,
      distanceFactor: 1.22,
    })).toBeCloseTo(1 / 1.22);
    expect(resolveStudioBg3dOrthographicZoom({
      currentZoom: 99,
      distanceFactor: 0.05,
    })).toBe(100);
    expect(resolveStudioBg3dOrthographicZoom({
      currentZoom: 0.1,
      distanceFactor: 20,
    })).toBe(0.1);
  });

  it.each([
    ["portrait subject", 9 / 16, [-0.4, -3, -0.2], [0.4, 3, 0.2], "y"],
    ["wide room", 16 / 9, [-6, -1, -0.2], [6, 1, 0.2], "x"],
  ] as const)("uses the available frame around a %s", (_label, aspect, min, max, axis) => {
    const bounds = { min, max };
    const result = fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, position: [0, 0, 10] }, bounds, viewportAspect: aspect,
    });
    expect(result).not.toBeNull();
    const corners = projectedCorners(result!, bounds, aspect);
    const occupied = Math.max(...corners.map((point) => point[axis]))
      - Math.min(...corners.map((point) => point[axis]));
    // At least 82.5% of the limiting frame dimension, with the full requested margin retained.
    // The previous sphere fit shrank the portrait subject to roughly half the frame height.
    expect(occupied).toBeGreaterThan(1.65);
    expect(occupied).toBeLessThan(1.8);
  });

  for (const projection of ["perspective", "orthographic"] as const) {
    it.each([
      [16 / 9, 9 / 16], [9 / 16, 16 / 9], [1, 0.25], [1, 4],
    ])(`${projection} keeps the selection inside the actual export crop from %s to %s`, (aspect, exportAspectRatio) => {
      const bounds = { min: [-3, -1, -2], max: [4, 5, 1] } as const;
      const frustum = { width: 10 * aspect, height: 10 };
      const result = fitStudioBg3dCameraToBounds({
        camera: { ...CAMERA, projection, zoom: 1.75, lensShift: [0.03, -0.02], up: [0.6, 0.8, 0] },
        bounds, viewportAspect: aspect, exportAspectRatio, orthographicFrustumAtZoomOne: frustum,
      });
      expect(result).not.toBeNull();
      projectedCorners(result!, bounds, aspect, frustum, exportAspectRatio);
    });

    it.each([9 / 16, 1, 16 / 9])(`${projection} contains every corner at aspect %s with roll, shift and zoom`, (aspect) => {
      const bounds = { min: [-3, -1, -7], max: [1, 5, 2] } as const;
      for (const up of [[0, 1, 0], [0.6, 0.8, 0], [-0.8, 0.6, 0]] as const) {
        const result = fitStudioBg3dCameraToBounds({
          camera: { ...CAMERA, projection, up, zoom: 2.5, lensShift: [0.18, -0.12] },
          bounds,
          viewportAspect: aspect,
          orthographicFrustumAtZoomOne: { width: 10 * aspect, height: 10 },
        });
        expect(result).not.toBeNull();
        projectedCorners(result!, bounds, aspect, { width: 10 * aspect, height: 10 });
      }
    });
  }

  it("frames a vertical legacy camera with the same stable up fallback as the live camera", () => {
    const result = fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, position: [0, 10, 0] },
      bounds: UNIT_BOUNDS,
      viewportAspect: 9 / 16,
    });
    expect(result).not.toBeNull();
    projectedCorners(result!, UNIT_BOUNDS, 9 / 16);
  });

  it("fails closed when a bounded perspective fit is impossible", () => {
    expect(fitStudioBg3dCameraToBounds({
      camera: CAMERA,
      bounds: { min: [-100, -100, -100], max: [100, 100, 100] },
      viewportAspect: 1,
      maxDistance: 10,
    })).toBeNull();
    expect(fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, position: [9_999, 0, 0], target: [9_998, 0, 0] },
      bounds: { min: [9_998, -1, -1], max: [10_000, 1, 1] },
      viewportAspect: 1,
    })).toBeNull();
    expect(fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, nearClip: 50 },
      bounds: UNIT_BOUNDS,
      viewportAspect: 1,
      maxDistance: 40,
    })).toBeNull();
    expect(fitStudioBg3dCameraToBounds({
      camera: { ...CAMERA, projection: "orthographic", nearClip: 50 },
      bounds: UNIT_BOUNDS,
      viewportAspect: 1,
      orthographicFrustumAtZoomOne: { width: 20, height: 10 },
      maxDistance: 40,
    })).toBeNull();
  });

  it.each([
    ["inverted bounds", { camera: CAMERA, bounds: { min: [1, 0, 0], max: [0, 1, 1] }, viewportAspect: 1 }],
    ["non-finite bounds", { camera: CAMERA, bounds: { min: [0, 0, 0], max: [1, Number.NaN, 1] }, viewportAspect: 1 }],
    ["degenerate direction", { camera: { ...CAMERA, position: [0, 0, 0] }, bounds: UNIT_BOUNDS, viewportAspect: 1 }],
    ["invalid FOV", { camera: { ...CAMERA, fovDegrees: 180 }, bounds: UNIT_BOUNDS, viewportAspect: 1 }],
    ["invalid near plane", { camera: { ...CAMERA, nearClip: 0 }, bounds: UNIT_BOUNDS, viewportAspect: 1 }],
    ["invalid up vector", { camera: { ...CAMERA, up: [0, 0, 0] }, bounds: UNIT_BOUNDS, viewportAspect: 1 }],
    ["invalid aspect", { camera: CAMERA, bounds: UNIT_BOUNDS, viewportAspect: 0 }],
    ["unframeable lens shift", { camera: { ...CAMERA, lensShift: [0.5, 0] }, bounds: UNIT_BOUNDS, viewportAspect: 1 }],
    ["lens target outside export crop", { camera: { ...CAMERA, lensShift: [0.2, 0] }, bounds: UNIT_BOUNDS, viewportAspect: 16 / 9, exportAspectRatio: 9 / 16 }],
    ["missing ortho frustum", { camera: { ...CAMERA, projection: "orthographic" }, bounds: UNIT_BOUNDS, viewportAspect: 1 }],
    ["invalid ortho frustum", { camera: { ...CAMERA, projection: "orthographic" }, bounds: UNIT_BOUNDS, viewportAspect: 1, orthographicFrustumAtZoomOne: { width: 0, height: 10 } }],
  ] as const)("rejects %s", (_label, input) => {
    expect(fitStudioBg3dCameraToBounds(input as never)).toBeNull();
  });

  it("rejects malformed orthographic zoom requests", () => {
    expect(resolveStudioBg3dOrthographicZoom({ currentZoom: Number.NaN, distanceFactor: 1 })).toBeNull();
    expect(resolveStudioBg3dOrthographicZoom({ currentZoom: 1, distanceFactor: 0 })).toBeNull();
    expect(resolveStudioBg3dOrthographicZoom({ currentZoom: 1, distanceFactor: 1, minZoom: 2, maxZoom: 1 })).toBeNull();
  });
});
