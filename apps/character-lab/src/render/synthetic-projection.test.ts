import { describe, expect, it } from "vitest";

import { projectAabb, unionAabb } from "./synthetic-projection";

/** 우수 좌표 LookAt(원점 → +Z에서 바라봄): 카메라 (0,0,d)에서 −Z 방향. view = translate(0,0,−d) */
function viewLookingDownNegZ(distance: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  m[14] = -distance;
  return m;
}

/** 원근 투영(GL 규약, fov 90°, aspect 1): clip = (x, y, (f+n)/(n−f)·z + 2fn/(n−f), −z) */
function perspective(near: number, far: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

describe("projectAabb", () => {
  it("카메라 앞 상자는 화면 중앙 사각형과 선형 깊이로 투영된다", () => {
    const view = viewLookingDownNegZ(4);
    const proj = perspective(0.1, 10);
    const box = projectAabb([-1, -1, -0.5], [1, 1, 0.5], view, proj, 100, 100, 0.1, 10);
    expect(box).not.toBeNull();
    if (!box) return;
    // z=0.5 면(거리 3.5)의 x=±1은 ndc ±1/3.5 → 픽셀 50 ± 14.3, z=−0.5 면(거리 4.5)은 50 ± 11.1
    expect(box.x0).toBeCloseTo(50 - 100 / 7, 3);
    expect(box.x1).toBeCloseTo(50 + 100 / 7, 3);
    expect(box.y0).toBeCloseTo(50 - 100 / 7, 3);
    expect(box.y1).toBeCloseTo(50 + 100 / 7, 3);
    expect(box.depth01).toBeCloseTo((4 - 0.1) / 9.9, 5);
  });

  it("위쪽(+Y)은 작은 y 픽셀(top-down)이고 카메라 뒤 상자는 null", () => {
    const view = viewLookingDownNegZ(4);
    const proj = perspective(0.1, 10);
    const high = projectAabb([-0.1, 1, -0.1], [0.1, 1.2, 0.1], view, proj, 100, 100, 0.1, 10);
    const low = projectAabb([-0.1, -1.2, -0.1], [0.1, -1, 0.1], view, proj, 100, 100, 0.1, 10);
    expect(high).not.toBeNull();
    expect(low).not.toBeNull();
    if (high && low) expect(high.y1).toBeLessThan(low.y0);
    expect(projectAabb([-1, -1, 5], [1, 1, 6], view, proj, 100, 100, 0.1, 10)).toBeNull();
    expect(projectAabb([-1, -1, -1], [1, 1, 1], view, proj, 0, 100, 0.1, 10)).toBeNull();
  });

  it("unionAabb는 합집합을 돌려주고 빈 입력은 null", () => {
    expect(unionAabb([])).toBeNull();
    expect(
      unionAabb([
        { min: [0, 0, 0], max: [1, 1, 1] },
        { min: [-1, 2, 0], max: [0.5, 3, 0.5] },
      ]),
    ).toEqual({ min: [-1, 0, 0], max: [1, 3, 1] });
  });
});
