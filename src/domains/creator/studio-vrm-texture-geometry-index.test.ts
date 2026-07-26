import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  getStudioVrmTextureGeometryIndex,
  inspectStudioVrmTextureGeometryAdmission,
  invalidateStudioVrmTextureGeometryIndex,
} from "./studio-vrm-texture-geometry-index";

const TEXTURE_SIZE = { width: 1024, height: 1024 } as const;

function indexedGeometry(
  positions: readonly number[],
  uvs: readonly number[],
  indices: readonly number[],
  uvAttribute = "uv",
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(uvAttribute, new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(Array.from(indices));
  return geometry;
}

function unitQuad(): THREE.BufferGeometry {
  return indexedGeometry(
    [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    [0, 0, 1, 0, 1, 1, 0, 1],
    [0, 1, 2, 0, 2, 3],
  );
}

describe("studio-vrm-texture-geometry-index islands", () => {
  it("classifies edge-connected indexed triangles as one stable island", () => {
    const index = getStudioVrmTextureGeometryIndex(unitQuad());
    expect(index?.triangleCount).toBe(2);
    expect(index?.islandCount).toBe(1);
    expect(index?.getIsland(0)).toEqual({ id: 0, key: "uv:0", anchorFaceIndex: 0 });
    expect(index?.getIsland(1)).toEqual({ id: 0, key: "uv:0", anchorFaceIndex: 0 });
  });

  it("keeps a UV seam separate even when the two sides share the same 3D edge", () => {
    const geometry = indexedGeometry(
      [
        // 왼쪽 삼각형.
        0, 0, 0, 1, 0, 0, 1, 1, 0,
        // 오른쪽 삼각형은 x=1 모서리 위치를 복제하지만 UV는 다른 아틀라스 영역이다.
        1, 0, 0, 2, 0, 0, 1, 1, 0,
      ],
      [0, 0, 0.4, 0, 0.4, 1, 0.6, 0, 1, 0, 0.6, 1],
      [0, 1, 2, 3, 4, 5],
    );
    const index = getStudioVrmTextureGeometryIndex(geometry);
    expect(index?.islandCount).toBe(2);
    expect(index?.getIsland(0)?.key).toBe("uv:0");
    expect(index?.getIsland(1)?.key).toBe("uv:1");
  });

  it("reconnects hard-edge duplicate vertices when both position and UV agree", () => {
    const geometry = indexedGeometry(
      [
        0, 0, 0, 1, 0, 0, 1, 1, 0,
        // 별도 index이지만 첫 삼각형의 대각선 끝점과 position/UV가 같다.
        0, 0, 0, 1, 1, 0, 0, 1, 0,
      ],
      [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1],
      [0, 1, 2, 3, 4, 5],
    );
    const index = getStudioVrmTextureGeometryIndex(geometry);
    expect(index?.islandCount).toBe(1);
    expect(index?.getIsland(1)?.key).toBe("uv:0");
  });

  it("does not join triangles that only touch at one vertex", () => {
    const geometry = indexedGeometry(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, -1, 0],
      [0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0, 0.5, 0.5, 0],
      [0, 1, 2, 3, 4, 5],
    );
    expect(getStudioVrmTextureGeometryIndex(geometry)?.islandCount).toBe(2);
  });

  it("supports non-indexed geometry and alternate glTF UV channels", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
        3,
      ),
    );
    geometry.setAttribute(
      "uv1",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2),
    );
    const index = getStudioVrmTextureGeometryIndex(geometry, { uvAttribute: "uv1" });
    expect(index?.uvAttribute).toBe("uv1");
    expect(index?.triangleCount).toBe(2);
    expect(index?.getIsland(1)?.key).toBe("uv1:0");
  });
});

describe("studio-vrm-texture-geometry-index density", () => {
  it("reports texels per world unit without traversing geometry after construction", () => {
    const geometry = unitQuad();
    const index = getStudioVrmTextureGeometryIndex(geometry);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    position.getX = () => {
      throw new Error("lookup must not reread positions");
    };
    uv.getX = () => {
      throw new Error("lookup must not reread UVs");
    };

    expect(index?.getTexelsPerWorldUnit(0, TEXTURE_SIZE)).toBeCloseTo(1024, 8);
    expect(index?.resolvePaintClassification(1, TEXTURE_SIZE)).toEqual({
      faceIndex: 1,
      island: { id: 0, key: "uv:0", anchorFaceIndex: 0 },
      texelsPerWorldUnit: 1024,
    });
  });

  it("accounts exactly for non-uniform world scaling", () => {
    const index = getStudioVrmTextureGeometryIndex(unitQuad());
    const matrixWorld = new THREE.Matrix4().makeScale(2, 8, 3);
    // 면은 XY 평면이므로 월드 면적은 16배, 선형 텍셀 밀도는 1/4.
    expect(index?.getTexelsPerWorldUnit(0, TEXTURE_SIZE, { matrixWorld })).toBeCloseTo(
      256,
      8,
    );
  });

  it("accepts a texture UV area scale without rebuilding topology", () => {
    const index = getStudioVrmTextureGeometryIndex(unitQuad());
    const base = index?.getTexelsPerWorldUnit(0, TEXTURE_SIZE);
    const repeated = index?.getTexelsPerWorldUnit(0, TEXTURE_SIZE, { uvAreaScale: 4 });
    expect(base).toBe(1024);
    expect(repeated).toBe(2048);
  });

  it("returns null for invalid faces, sizes, transforms and degenerate triangles", () => {
    const degenerate = indexedGeometry(
      [0, 0, 0, 1, 0, 0, 2, 0, 0],
      [0, 0, 0.5, 0, 1, 0],
      [0, 1, 2],
    );
    const index = getStudioVrmTextureGeometryIndex(degenerate);
    expect(index?.getIsland(0)).not.toBeNull();
    expect(index?.getTexelsPerWorldUnit(0, TEXTURE_SIZE)).toBeNull();
    expect(index?.getTexelsPerWorldUnit(-1, TEXTURE_SIZE)).toBeNull();
    expect(index?.getTexelsPerWorldUnit(0, { width: 0, height: 0 })).toBeNull();
    expect(
      index?.getTexelsPerWorldUnit(0, TEXTURE_SIZE, {
        matrixWorld: { elements: [Number.NaN] },
      }),
    ).toBeNull();
    expect(index?.getTexelsPerWorldUnit(0, TEXTURE_SIZE, { uvAreaScale: 0 })).toBeNull();
  });
});

describe("studio-vrm-texture-geometry-index cache and guards", () => {
  it("reuses an unchanged geometry and rebuilds after an attribute version change", () => {
    const geometry = unitQuad();
    const first = getStudioVrmTextureGeometryIndex(geometry);
    const second = getStudioVrmTextureGeometryIndex(geometry);
    expect(second).toBe(first);

    const uv = geometry.getAttribute("uv");
    uv.setXY(2, 0.75, 1);
    uv.needsUpdate = true;
    const afterVersionChange = getStudioVrmTextureGeometryIndex(geometry);
    expect(afterVersionChange).not.toBe(first);
    expect(afterVersionChange).toBe(getStudioVrmTextureGeometryIndex(geometry));

    invalidateStudioVrmTextureGeometryIndex(geometry);
    expect(getStudioVrmTextureGeometryIndex(geometry)).not.toBe(afterVersionChange);
  });

  it("fails closed for malformed geometry and a caller triangle budget", () => {
    const missingUv = new THREE.BufferGeometry();
    missingUv.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    expect(getStudioVrmTextureGeometryIndex(missingUv)).toBeNull();
    // 실패 결과도 signature가 같으면 캐시되고, 호출은 예외 없이 계속 null이다.
    expect(getStudioVrmTextureGeometryIndex(missingUv)).toBeNull();
    expect(getStudioVrmTextureGeometryIndex(unitQuad(), { maxTriangles: 1 })).toBeNull();
    expect(getStudioVrmTextureGeometryIndex(unitQuad(), { uvAttribute: "" })).toBeNull();
  });

  it("admits the exact triangle-budget boundary and rejects one triangle over it", () => {
    const geometry = unitQuad();
    expect(inspectStudioVrmTextureGeometryAdmission(geometry, { maxTriangles: 2 })).toEqual({
      triangleCount: 2,
      maxTriangles: 2,
      admitted: true,
    });
    expect(getStudioVrmTextureGeometryIndex(geometry, { maxTriangles: 2 })).not.toBeNull();

    expect(inspectStudioVrmTextureGeometryAdmission(geometry, { maxTriangles: 1 })).toEqual({
      triangleCount: 2,
      maxTriangles: 1,
      admitted: false,
    });
    expect(getStudioVrmTextureGeometryIndex(geometry, { maxTriangles: 1 })).toBeNull();
  });
});
