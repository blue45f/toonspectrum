import { describe, expect, it } from "vitest";

import {
  diagnoseStudioEditableMesh,
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
import {
  discImage,
  signedVolume,
  verticalGradientImage,
} from "./studio-lift3d.test-fixture";

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

  it("정점이 전부 테두리인 얇은 형상도 닫힌 solid 로 만든다", () => {
    // 폭이 두 칸뿐이라 내부 정점이 하나도 없다. 테두리에도 최소 두께를 주고 옆벽으로 막으므로
    // 거절 대상이 아니라 얇은 solid 가 나와야 한다.
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

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(studioEditableMeshStats(built.value.mesh).boundaryEdgeCount).toBe(0);
    const soup = studioEditableMeshToTriangleSoup(built.value.mesh);
    expect(signedVolume(soup.positions, soup.indices)).toBeGreaterThan(0);
  });

  it("가는 돌기가 붙어 있어도 비다양체 변을 만들지 않는다", () => {
    // 이전 방식은 테두리 정점을 앞뒤가 공유했다. 폭 두 칸짜리 팔·꼬리·머리카락에서는 모든
    // 정점이 테두리라, 이웃한 두 사각형이 공유하는 변이 half-edge 를 네 번 쓰며 깨졌다.
    const width = 16;
    const height = 16;
    const cells = new Uint8Array(width * height);
    for (let y = 2; y < 8; y += 1) {
      for (let x = 2; x < 8; x += 1) cells[y * width + x] = 1;
    }
    for (let y = 4; y < 6; y += 1) {
      for (let x = 8; x < 14; x += 1) cells[y * width + x] = 1;
    }
    const mask = maskFromCells(width, height, cells);
    const grid = resampleStudioLift3dImage(discImage(width), width);
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 0 });

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.3,
      targetHeight: 1,
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const errors = diagnoseStudioEditableMesh(built.value.mesh)
      .filter((diagnostic) => diagnostic.severity === "error");
    expect(errors).toEqual([]);
    expect(studioEditableMeshStats(built.value.mesh).boundaryEdgeCount).toBe(0);
  });

  it("유한하지 않은 두께 값을 예외 대신 사유 코드로 거절한다", () => {
    const grid = resampleStudioLift3dImage(discImage(32), 32);
    const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 0 });

    for (const depthScale of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const built = buildStudioLift3dGeometry(mask, depth, {
        mode: "inflate",
        depthScale,
        targetHeight: 1,
      });
      expect(built.ok).toBe(false);
      if (built.ok) continue;
      expect(built.code).toBe("invalid-option");
    }
  });

  it("코너 예산을 넘으면 예외 대신 사유 코드로 거절한다", () => {
    // 편집 메시 preflight 는 면 개수가 아니라 코너 합을 maxEdges 와 비교한다. 면 개수만 보면
    // 여기서 통과시킨 뒤 그 preflight 가 예외를 던진다.
    const side = 260;
    const cells = new Uint8Array(side * side).fill(1);
    const mask = maskFromCells(side, side, cells);
    const grid = resampleStudioLift3dImage(discImage(64), 64);
    const depth = {
      width: side,
      height: side,
      heights: new Float64Array(side * side).fill(1),
      maxDistance: side / 2,
    };
    void grid;

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.3,
      targetHeight: 1,
    });

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe("budget-exceeded");
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

  it("앞/뒤 비율을 옮겨도 총 두께는 그대로다", () => {
    const grid = resampleStudioLift3dImage(discImage(48), 48);
    const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 1 });
    const build = (frontRatio: number) => buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.4,
      targetHeight: 1.7,
      frontRatio,
    });

    const even = build(0.5);
    const forward = build(0.8);
    expect(even.ok && forward.ok).toBe(true);
    if (!even.ok || !forward.ok) return;

    const depthOf = (bounds: { min: { z: number }; max: { z: number } }) =>
      bounds.max.z - bounds.min.z;
    // 총 두께는 같고, 무게중심만 앞으로 옮겨간다(정규화가 XZ 를 원점에 맞추므로 두께로 비교).
    expect(depthOf(forward.value.bounds)).toBeCloseTo(depthOf(even.value.bounds), 5);
    expect(hashStudioEditableMesh(forward.value.mesh))
      .not.toBe(hashStudioEditableMesh(even.value.mesh));
  });

  it("parallax 는 밴드마다 떨어진 카드를 세우고 각각 닫아 둔다", () => {
    const grid = resampleStudioLift3dImage(verticalGradientImage(64), 48);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "parallax",
      depthScale: 0.4,
      targetHeight: 6,
      layerBands: 5,
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.mode).toBe("parallax");
    expect(built.value.layerCount).toBe(5);
    // 조각끼리 정점을 나누지 않으므로 전부 닫혀 있어야 한다.
    expect(studioEditableMeshStats(built.value.mesh).boundaryEdgeCount).toBe(0);
    expect(
      diagnoseStudioEditableMesh(built.value.mesh)
        .filter((diagnostic) => diagnostic.severity === "error"),
    ).toEqual([]);
    const soup = studioEditableMeshToTriangleSoup(built.value.mesh);
    expect(signedVolume(soup.positions, soup.indices)).toBeGreaterThan(0);
  });

  it("밴드를 늘리면 층이 늘고 깊이 범위는 유지된다", () => {
    const grid = resampleStudioLift3dImage(verticalGradientImage(64), 48);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });
    const build = (layerBands: number) => buildStudioLift3dGeometry(mask, depth, {
      mode: "parallax",
      depthScale: 0.4,
      targetHeight: 6,
      layerBands,
    });

    const few = build(3);
    const many = build(9);
    expect(few.ok && many.ok).toBe(true);
    if (!few.ok || !many.ok) return;
    expect(many.value.layerCount).toBeGreaterThan(few.value.layerCount);
    // 카드는 밴드 중앙에 놓이므로 층이 늘어도 전체 깊이 범위는 비슷하다.
    const range = (bounds: { min: { z: number }; max: { z: number } }) =>
      bounds.max.z - bounds.min.z;
    expect(range(many.value.bounds)).toBeGreaterThan(range(few.value.bounds) * 0.8);
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
