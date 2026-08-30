import { describe, expect, it } from "vitest";

import {
  hashStudioEditableMesh,
  studioEditableMeshStats,
  studioEditableMeshToTriangleSoup,
} from "../studio-editable-half-edge-mesh";

import { buildStudioLift3dDepthField } from "./studio-lift3d-depth";
import {
  extractStudioLift3dMask,
  resampleStudioLift3dImage,
  type StudioLift3dMask,
} from "./studio-lift3d-mask";
import {
  buildStudioLift3dGeometry,
  normalizeStudioLift3dPositions,
} from "./studio-lift3d-mesh";
import { discImage, signedVolume } from "./studio-lift3d.test-fixture";

function maskFromCells(width: number, height: number, cells: Uint8Array): StudioLift3dMask {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (cells[y * width + x] === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  let filled = 0;
  for (let index = 0; index < cells.length; index += 1) filled += cells[index]!;
  return {
    width,
    height,
    cells,
    bounds: maxX < 0 ? null : { minX, minY, maxX, maxY },
    coverage: filled / (width * height),
    mode: "alpha",
    warnings: [],
  };
}

function discGeometry(size: number, targetHeight = 1.7) {
  const grid = resampleStudioLift3dImage(discImage(size), size);
  const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
  const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 1 });
  return buildStudioLift3dGeometry(mask, depth, {
    mode: "inflate",
    depthScale: 0.3,
    targetHeight,
  });
}

describe("Studio Lift 3D 메시 빌더", () => {
  it("inflate 는 열린 변이 없는 닫힌 solid 를 만든다", () => {
    const built = discGeometry(64);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const stats = studioEditableMeshStats(built.value.mesh);
    expect(stats.boundaryEdgeCount).toBe(0);
    expect(stats.faceCount).toBeGreaterThan(100);
  });

  it("면이 모두 바깥을 향한다(부호 있는 부피가 양수)", () => {
    const built = discGeometry(64);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const soup = studioEditableMeshToTriangleSoup(built.value.mesh);
    expect(signedVolume(soup.positions, soup.indices)).toBeGreaterThan(0);
  });

  it("UV 가 정점과 1:1 로 대응하고 0..1 안에 있다", () => {
    const built = discGeometry(48);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.value.uvs).toHaveLength(built.value.mesh.vertices.length);
    for (const uv of built.value.uvs) {
      expect(uv.u).toBeGreaterThanOrEqual(0);
      expect(uv.u).toBeLessThanOrEqual(1);
      expect(uv.v).toBeGreaterThanOrEqual(0);
      expect(uv.v).toBeLessThanOrEqual(1);
    }
  });

  it("요청한 키에 맞춰 스케일하고 바닥(y=0)에 접지시킨다", () => {
    const built = discGeometry(48, 1.7);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.value.bounds.min.y).toBeCloseTo(0, 6);
    expect(built.value.bounds.max.y).toBeCloseTo(1.7, 6);
    // 원반이라 가로 폭도 키와 비슷하고, 두께는 그 30% 근처다.
    expect(built.value.bounds.max.z - built.value.bounds.min.z).toBeGreaterThan(0.2);
    expect(built.value.bounds.max.z - built.value.bounds.min.z).toBeLessThan(0.7);
  });

  it("두께 비율을 키우면 실제로 더 두꺼워진다", () => {
    const thin = discGeometry(48);
    const grid = resampleStudioLift3dImage(discImage(48), 48);
    const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 1 });
    const thick = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.6,
      targetHeight: 1.7,
    });

    expect(thin.ok && thick.ok).toBe(true);
    if (!thin.ok || !thick.ok) return;
    const thinDepth = thin.value.bounds.max.z - thin.value.bounds.min.z;
    const thickDepth = thick.value.bounds.max.z - thick.value.bounds.min.z;
    expect(thickDepth).toBeGreaterThan(thinDepth * 1.8);
  });

  it("대각으로만 이어진 꼬집힘을 잘라 위상을 지킨다", () => {
    // 두 덩어리가 격자 정점 하나에서만 만난다 — 그 정점 주변 면이 두 팬으로 갈라져
    // 비다양체가 되는 고전적 배치다.
    const width = 9;
    const height = 9;
    const cells = new Uint8Array(width * height);
    for (let y = 1; y <= 4; y += 1) {
      for (let x = 1; x <= 4; x += 1) cells[y * width + x] = 1;
    }
    for (let y = 4; y <= 7; y += 1) {
      for (let x = 4; x <= 7; x += 1) cells[y * width + x] = 1;
    }
    const mask = maskFromCells(width, height, cells);
    const grid = resampleStudioLift3dImage(discImage(width), width);
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "slab", smoothing: 0 });

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.3,
      targetHeight: 1,
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.warnings.map((warning) => warning.code)).toContain("pinch-faces-dropped");
    expect(studioEditableMeshStats(built.value.mesh).boundaryEdgeCount).toBe(0);
  });

  it("부피를 만들 수 없을 만큼 얇으면 사유를 붙여 거절한다", () => {
    const width = 12;
    const height = 12;
    const cells = new Uint8Array(width * height);
    for (let x = 2; x < 10; x += 1) {
      cells[5 * width + x] = 1;
      cells[6 * width + x] = 1;
    }
    const mask = maskFromCells(width, height, cells);
    const grid = resampleStudioLift3dImage(discImage(width), width);
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 0 });

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.3,
      targetHeight: 1,
    });

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe("degenerate-geometry");
  });

  it("relief 는 변위된 앞면·평평한 뒷판·옆벽으로 닫힌 슬래브를 만든다", () => {
    const grid = resampleStudioLift3dImage(discImage(48), 48);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "relief",
      depthScale: 0.1,
      baseScale: 0.02,
      targetHeight: 6,
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const stats = studioEditableMeshStats(built.value.mesh);
    expect(stats.boundaryEdgeCount).toBe(0);
    const soup = studioEditableMeshToTriangleSoup(built.value.mesh);
    expect(signedVolume(soup.positions, soup.indices)).toBeGreaterThan(0);
    expect(built.value.bounds.max.z).toBeGreaterThan(built.value.bounds.min.z);
  });

  it("같은 입력이면 같은 메시 해시가 나온다", () => {
    const first = discGeometry(48);
    const second = discGeometry(48);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(hashStudioEditableMesh(first.value.mesh))
      .toBe(hashStudioEditableMesh(second.value.mesh));
  });

  it("정규화는 XZ 중심을 원점에 두고 균일 스케일만 쓴다", () => {
    const normalized = normalizeStudioLift3dPositions(
      [
        { x: 10, y: 4, z: 0 },
        { x: 14, y: 8, z: 2 },
      ],
      2,
    );

    // y 폭 4 → 2 이므로 균일 스케일 0.5. x 는 12, z 는 1 을 중심으로 접힌다.
    expect(normalized.bounds.min).toEqual({ x: -1, y: 0, z: -0.5 });
    expect(normalized.bounds.max).toEqual({ x: 1, y: 2, z: 0.5 });
    expect(normalized.positions[0]).toEqual({ x: -1, y: 0, z: -0.5 });
  });
});
