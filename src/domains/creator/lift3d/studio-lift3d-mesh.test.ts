import { describe, expect, it } from "vitest";

import {
  STUDIO_EDITABLE_MESH_LIMITS,
  diagnoseStudioEditableMesh,
  hashStudioEditableMesh,
  studioEditableMeshStats,
  studioEditableMeshToTriangleSoup,
} from "../studio-editable-half-edge-mesh";

import { STUDIO_LIFT3D_LIMITS } from "./studio-lift3d-contract";
import {
  STUDIO_LIFT3D_MAX_DEPTH_BANDS,
  buildStudioLift3dDepthField,
} from "./studio-lift3d-depth";
import {
  extractStudioLift3dMask,
  resampleStudioLift3dImage,
  type StudioLift3dMask,
} from "./studio-lift3d-mask";
import {
  buildStudioLift3dGeometry,
  countStudioLift3dPlannedQuads,
  maxStudioLift3dResolutionForLayers,
  normalizeStudioLift3dPositions,
} from "./studio-lift3d-mesh";
import {
  discImage,
  signedVolume,
  verticalGradientImage,
} from "./studio-lift3d.test-fixture";

/** 사각형 하나가 쓰는 코너 수와 편집 메시의 코너 예산. 예산 계산을 테스트에서도 같은 말로 쓴다. */
const QUAD_CORNERS = 4;
const CORNER_BUDGET = STUDIO_EDITABLE_MESH_LIMITS.maxEdges;

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

  it("두께가 0 이면 부피 없는 메시를 만들지 않고 거절한다", () => {
    // depthScale 0 은 앞뒤 껍질을 같은 평면에 겹치고 옆벽 넓이도 0 으로 만든다.
    // 그런데도 경계 변이 없어 "닫힌 solid" 로 보고되므로, 만들기 전에 막아야 한다.
    const grid = resampleStudioLift3dImage(discImage(48), 32);
    const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 0 });

    for (const mode of ["inflate", "parallax"] as const) {
      const built = buildStudioLift3dGeometry(mask, depth, {
        mode,
        depthScale: 0,
        targetHeight: 1,
        layerBands: 4,
      });

      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.code).toBe("invalid-option");
    }
  });

  it("부조는 뒷판이 두께를 주므로 depthScale 0 도 받는다", () => {
    const grid = resampleStudioLift3dImage(discImage(48), 32);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "relief",
      depthScale: 0,
      baseScale: 0.05,
      targetHeight: 1,
    });

    expect(built.ok).toBe(true);
  });

  it("레이어 상한은 밴드가 늘수록 낮아지고, 한 장짜리는 기존 상한 그대로다", () => {
    const single = maxStudioLift3dResolutionForLayers(1);
    expect(single).toBeGreaterThanOrEqual(STUDIO_LIFT3D_LIMITS.maxResolution);

    let previous = single;
    for (let bands = 2; bands <= STUDIO_LIFT3D_MAX_DEPTH_BANDS; bands += 1) {
      const cap = maxStudioLift3dResolutionForLayers(bands);
      expect(cap).toBeLessThanOrEqual(previous);
      expect(cap).toBeGreaterThan(STUDIO_LIFT3D_LIMITS.minResolution);
      previous = cap;
    }
    expect(previous).toBeLessThan(STUDIO_LIFT3D_LIMITS.maxResolution);
  });

  it("상한 해상도에서 최대 레이어를 쌓아도 면 예산 안에 들어온다", () => {
    // 화면 전체가 피사체인 배경이 사각형을 가장 많이 만든다. 여기서 통과하지 못하면
    // 슬라이더 두 개를 각각 최대로 올린 조합이 사용자에게는 늘 실패로만 보인다.
    const bands = STUDIO_LIFT3D_MAX_DEPTH_BANDS;
    const side = Math.min(
      maxStudioLift3dResolutionForLayers(bands),
      STUDIO_LIFT3D_LIMITS.maxResolution,
    );
    const grid = resampleStudioLift3dImage(verticalGradientImage(256), side);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "parallax",
      depthScale: 0.25,
      targetHeight: 6,
      layerBands: bands,
    });

    expect(built.ok).toBe(true);
  });

  it("밴드가 잘게 번갈아 나오면 정점을 쌓기 전에 예산 초과로 돌려보낸다", () => {
    // 해상도 상한은 밴드 경계 길이가 O(uB) 라고 보고 세운 값이다. 밴드가 화면 전체에서 잘게
    // 번갈아 나오면 옆벽이 면적에 비례해(O(u²B)) 그 가정이 깨진다. 그때도 수십만 개를 만든
    // 뒤가 아니라 격자 단계에서 정확히 세어 돌려보내야 한다.
    const bands = 12;
    const side = maxStudioLift3dResolutionForLayers(bands);
    const cells = new Uint8Array(side * side).fill(1);
    const mask = maskFromCells(side, side, cells);
    const heights = new Float64Array(side * side);
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        heights[y * side + x] = (((x + 3 * y) % bands) + 0.5) / bands;
      }
    }

    const built = buildStudioLift3dGeometry(
      mask,
      { width: side, height: side, heights, maxDistance: side / 2 },
      { mode: "parallax", depthScale: 0.25, targetHeight: 6, layerBands: bands },
    );

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe("budget-exceeded");
    // 해상도만 지목하면 레이어를 줄이는 쪽이 더 나은 경우에 손잡이를 못 찾는다.
    expect(built.detail).toContain("해상도");
    expect(built.detail).toContain("레이어");
  });

  it("방출 전에 센 사각형 수가 실제로 나온 면 수와 정확히 같다", () => {
    // 예산은 방출 **전에** 센 값으로 판정한다. 그 카운터가 실제 방출량과 갈라지면, 적게 세면
    // 예산을 통과한 메시가 createStudioEditableMeshFromPolygons 에서 예외로 끝나고, 많이 세면
    // 만들 수 있는 조합을 괜히 거절한다.
    const grid = resampleStudioLift3dImage(verticalGradientImage(64), 48);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });

    for (const mode of ["relief", "inflate", "parallax"] as const) {
      const layerBands = mode === "parallax" ? 6 : 1;
      const planned = countStudioLift3dPlannedQuads(mask, depth, { mode, layerBands });
      const built = buildStudioLift3dGeometry(mask, depth, {
        mode,
        depthScale: 0.2,
        targetHeight: 4,
        layerBands,
      });

      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(planned).toBe(built.value.mesh.faces.length);
      expect(built.value.quadCount).toBe(planned);
    }
  });

  it("잘게 번갈아 나오는 밴드는 해상도 상한만으로 예측되지 않는다", () => {
    // 상한 공식은 밴드 경계 길이가 O(uB) 라는 가정 위에 있다. 이 입력은 그 가정을 깨뜨리므로
    // 상한 안쪽 해상도인데도 예산을 넘는다 — 정확한 사전 집계가 필요한 이유다.
    const bands = 12;
    const side = maxStudioLift3dResolutionForLayers(bands);
    const cells = new Uint8Array(side * side).fill(1);
    const mask = maskFromCells(side, side, cells);
    const heights = new Float64Array(side * side);
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        heights[y * side + x] = (((x + 3 * y) % bands) + 0.5) / bands;
      }
    }
    const depth = { width: side, height: side, heights, maxDistance: side / 2 };

    const smooth = countStudioLift3dPlannedQuads(
      mask,
      { ...depth, heights: new Float64Array(side * side).fill(0.5) },
      { mode: "parallax", layerBands: bands },
    );
    const noisy = countStudioLift3dPlannedQuads(mask, depth, { mode: "parallax", layerBands: bands });

    expect(smooth * QUAD_CORNERS).toBeLessThanOrEqual(CORNER_BUDGET);
    expect(noisy * QUAD_CORNERS).toBeGreaterThan(CORNER_BUDGET);
  });

  it("이 함수만 직접 불러도 비유한 레이어 수를 거절한다", () => {
    // 파이프라인을 거치지 않는 호출자가 있다(이 테스트 파일부터가 그렇다).
    // clampStudioLift3dBandCount 는 비유한 값을 조용히 1 로 떨어뜨리므로 여기서 막지 않으면
    // "카드 한 장짜리 시차 레이어" 가 parallax 로 성공해 버린다.
    const grid = resampleStudioLift3dImage(discImage(48), 32);
    const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 0 });

    for (const layerBands of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0,
      // 위쪽 한도도 같다. 조용히 조이면 요청한 층 수와 다른 결과가 성공으로 나간다.
      STUDIO_LIFT3D_MAX_DEPTH_BANDS + 1,
    ]) {
      const built = buildStudioLift3dGeometry(mask, depth, {
        mode: "parallax",
        depthScale: 0.3,
        targetHeight: 1,
        layerBands,
      });

      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.code).toBe("invalid-option");
    }
  });

  it("나눌 부피가 없으면 앞쪽 두께 비율이 먹히지 않는다고 알린다", () => {
    // 두 칸 폭 실루엣은 모든 정점이 테두리라 앞뒤 두께가 어디서나 같다. frontRatio 는 두 껍질을
    // 통째로 z 로 옮길 뿐이고, 정규화의 z 중심 맞추기가 그 이동을 곧바로 되돌린다. 슬라이더를
    // 끝까지 밀어도 화면이 그대로인데 아무 말이 없으면 사용자는 고장으로 읽는다.
    const side = 16;
    const cells = new Uint8Array(side * side);
    for (let y = 1; y < side - 1; y += 1) {
      cells[y * side + 7] = 1;
      cells[y * side + 8] = 1;
    }
    const mask = maskFromCells(side, side, cells);
    const depth = {
      width: side,
      height: side,
      heights: new Float64Array(side * side).fill(1),
      maxDistance: 1,
    };

    const shifted = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.4,
      targetHeight: 2,
      frontRatio: 0.8,
    });
    const even = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.4,
      targetHeight: 2,
      frontRatio: 0.5,
    });

    expect(shifted.ok && even.ok).toBe(true);
    if (!shifted.ok || !even.ok) return;
    expect(shifted.warnings.map((warning) => warning.code)).toContain("front-ratio-inert");
    // 앞뒤를 반씩 나눠 달라고 한 쪽은 옮길 것이 없으니 경고할 것도 없다.
    expect(even.warnings.map((warning) => warning.code)).not.toContain("front-ratio-inert");
    // 경고가 참말인지도 확인한다 — 두 결과의 z 가 실제로 같아야 한다.
    const zOf = (built: typeof shifted): number[] => (built.ok
      ? built.value.mesh.vertices.map((vertex) => vertex.position.z)
      : []);
    const left = zOf(shifted);
    const right = zOf(even);
    expect(left).toHaveLength(right.length);
    for (let index = 0; index < left.length; index += 1) {
      expect(left[index]!).toBeCloseTo(right[index]!, 12);
    }
  });

  it("안쪽 정점이 있으면 앞쪽 두께 비율이 형태를 실제로 바꾼다", () => {
    // 위 경고가 과잉이 아닌지 확인한다. 세 칸만 되어도 가운데 정점이 안쪽이 되어 부피가 생긴다.
    const side = 16;
    const cells = new Uint8Array(side * side);
    for (let y = 1; y < side - 1; y += 1) {
      for (let x = 6; x <= 9; x += 1) cells[y * side + x] = 1;
    }
    const mask = maskFromCells(side, side, cells);
    const depth = {
      width: side,
      height: side,
      heights: new Float64Array(side * side).fill(1),
      maxDistance: 2,
    };

    const built = buildStudioLift3dGeometry(mask, depth, {
      mode: "inflate",
      depthScale: 0.4,
      targetHeight: 2,
      frontRatio: 0.8,
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.warnings.map((warning) => warning.code)).not.toContain("front-ratio-inert");
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
