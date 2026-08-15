/**
 * mesh→PathIR 변환의 정확성 계약.
 *
 * ADR 0005 의 승격 게이트가 요구하는 건 비용만이 아니다. 변환된 경로가 엔진이 실제로 그린 모양과
 * 다르면 "편집 가능한 프록시"가 아니라 다른 그림이므로, 면적 보존이 비용만큼 중요한 조건이다.
 */
import { describe, expect, it } from "vitest";

import { inkStrokeMeshToPathIR, InkMeshPathError } from "../ink-mesh-path";

import type { InkStrokeMesh } from "../ink-mesh";

function mesh(
  vertices: readonly number[],
  triangles: readonly number[],
): InkStrokeMesh {
  return {
    vertices: new Float32Array(vertices),
    triangles: new Uint32Array(triangles),
    texCoords: new Float32Array(vertices.length),
    vertexCount: vertices.length / 2,
    triangleCount: triangles.length / 3,
  };
}

describe("inkStrokeMeshToPathIR", () => {
  it("두 삼각형이 이루는 사각형을 네 변짜리 하나의 윤곽으로 만든다", () => {
    // 대각선은 두 삼각형이 공유하므로 실루엣에서 상쇄돼야 한다 — 남으면 윤곽에 가짜 변이 생긴다.
    const square = mesh([0, 0, 10, 0, 10, 10, 0, 10], [0, 1, 2, 0, 2, 3]);
    const result = inkStrokeMeshToPathIR(square);

    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]!.vertexCount).toBe(4);
    expect(result.boundaryEdgeCount).toBe(4);
    // 닫힌 4각형은 M + L*3 + Z = 5개다. Z 가 시작점으로 돌아가므로 마지막 변에 L 을
    // 또 쓰면 정점이 중복된다.
    expect(result.path.verbs).toHaveLength(5);
    expect(result.path.verbs[0]!.v).toBe("M");
    expect(result.path.verbs.at(-1)!.v).toBe("Z");
    expect(result.meshArea).toBeCloseTo(100, 6);
    expect(result.pathArea).toBeCloseTo(100, 6);
    expect(result.areaError).toBeLessThan(1e-6);
  });

  it("구멍이 있는 메시에서 바깥 윤곽과 구멍의 감김 방향이 반대로 나온다", () => {
    // 사각 고리(바깥 10x10, 안쪽 4x4). nonzero 채우기가 구멍을 뚫으려면 두 고리의 부호가 달라야
    // 한다 — 같으면 구멍이 한 번 더 칠해져 메워진다.
    const outer = [0, 0, 10, 0, 10, 10, 0, 10];
    const inner = [3, 3, 7, 3, 7, 7, 3, 7];
    const ring = mesh([...outer, ...inner], [
      0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7,
    ]);
    const result = inkStrokeMeshToPathIR(ring);

    expect(result.loops).toHaveLength(2);
    const areas = result.loops.map(({ signedArea }) => signedArea);
    expect(Math.sign(areas[0]!)).toBe(-Math.sign(areas[1]!));
    // 고리 면적 = 100 - 16 = 84. 두 고리의 절대 면적 합은 100 + 16 = 116 이므로 여기서는
    // 면적 오차가 아니라 각 고리의 크기로 확인한다.
    expect(Math.abs(areas[0]!) + Math.abs(areas[1]!)).toBeCloseTo(116, 4);
    expect(result.meshArea).toBeCloseTo(84, 4);
  });

  it("빈 메시는 빈 경로를 낸다", () => {
    const result = inkStrokeMeshToPathIR(mesh([], []));
    expect(result.path.verbs).toEqual([]);
    expect(result.loops).toEqual([]);
    expect(result.areaError).toBe(0);
  });

  it("인덱스가 모자란 메시는 조용히 잘라내지 않고 던진다", () => {
    const broken: InkStrokeMesh = {
      vertices: new Float32Array([0, 0, 1, 0, 1, 1]),
      triangles: new Uint32Array([0, 1]),
      texCoords: new Float32Array(6),
      vertexCount: 3,
      triangleCount: 1,
    };
    expect(() => inkStrokeMeshToPathIR(broken)).toThrow(InkMeshPathError);
  });

  it("같은 메시는 항상 같은 verb 열을 낸다", () => {
    const square = mesh([0, 0, 10, 0, 10, 10, 0, 10], [0, 1, 2, 0, 2, 3]);
    const first = inkStrokeMeshToPathIR(square);
    const second = inkStrokeMeshToPathIR(square);
    expect(JSON.stringify(second.path)).toBe(JSON.stringify(first.path));
  });
});
