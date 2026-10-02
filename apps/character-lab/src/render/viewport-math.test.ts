import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_FRAMING } from "../contracts";
import { v3Dot, v3Length, v3Sub } from "../shared/math";

import { createNullEngineHarness } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";
import { clientToRenderPixel, intersectRayPlane, pixelRay, projectToPixel, unprojectToViewPlane } from "./viewport-math";

import type { Vec3 } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";
import type { ViewportCameraInfo } from "./viewport-camera";

/** +Z에서 원점을 바라보는 640×480 카메라, fov 0.8 */
const FRONT: ViewportCameraInfo = {
  position: [0, 0, 3],
  forward: [0, 0, -1],
  right: [1, 0, 0],
  up: [0, 1, 0],
  fovY: 0.8,
  width: 640,
  height: 480,
};

describe("pixelRay·projectToPixel·unprojectToViewPlane", () => {
  it("화면 중앙 픽셀의 광선은 시선과 같고 원점은 카메라 위치다", () => {
    const ray = pixelRay(FRONT, 320, 240);
    expect(ray.origin).toEqual(FRONT.position);
    expect(ray.direction[0]).toBeCloseTo(0, 9);
    expect(ray.direction[1]).toBeCloseTo(0, 9);
    expect(ray.direction[2]).toBeCloseTo(-1, 9);
  });

  it("오른쪽·위쪽 픽셀은 right·up 방향으로 기울고 가장자리 각도가 fov와 맞는다", () => {
    const top = pixelRay(FRONT, 320, 0);
    expect(top.direction[1]).toBeGreaterThan(0);
    // 위 가장자리 광선과 시선의 각 = fovY / 2
    expect(Math.acos(v3Dot(top.direction, FRONT.forward))).toBeCloseTo(0.4, 6);
    const right = pixelRay(FRONT, 640, 240);
    expect(right.direction[0]).toBeGreaterThan(0);
    // 수평 가장자리는 aspect만큼 더 넓다: tan(h/2) = tan(0.4) × (640/480)
    expect(Math.tan(Math.acos(v3Dot(right.direction, FRONT.forward)))).toBeCloseTo(Math.tan(0.4) * (640 / 480), 6);
  });

  it("project → unproject 왕복: 평면 위 점이 같은 월드 점으로 돌아온다", () => {
    const point: Vec3 = [0.4, -0.3, 0.5];
    const pixel = projectToPixel(FRONT, point);
    expect(pixel).not.toBeNull();
    if (!pixel) return;
    const back = unprojectToViewPlane(FRONT, pixel[0], pixel[1], point);
    expect(back).not.toBeNull();
    for (let axis = 0; axis < 3; axis += 1) expect(back?.[axis] ?? Number.NaN).toBeCloseTo(point[axis] ?? 0, 6);
  });

  it("카메라 뒤쪽 점은 투영하지 않고, 평행하거나 뒤쪽인 평면은 교차하지 않는다", () => {
    expect(projectToPixel(FRONT, [0, 0, 5])).toBeNull();
    expect(intersectRayPlane({ origin: [0, 0, 3], direction: [1, 0, 0] }, [0, 0, 0], [0, 0, -1])).toBeNull();
    expect(intersectRayPlane({ origin: [0, 0, 3], direction: [0, 0, 1] }, [0, 0, 0], [0, 0, 1])).toBeNull();
  });

  it("clientToRenderPixel: CSS 박스 비율을 렌더 해상도로 환산하고 크기 0이면 null", () => {
    const box = { left: 10, top: 20, width: 320, height: 240 };
    expect(clientToRenderPixel(170, 140, box, FRONT)).toEqual([320, 240]);
    expect(clientToRenderPixel(10, 20, box, FRONT)).toEqual([0, 0]);
    expect(clientToRenderPixel(0, 0, { ...box, width: 0 }, FRONT)).toBeNull();
  });
});

describe("엔진의 실제 투영과 일치(NullEngine, Babylon Vector3.Project)", () => {
  let harness: NullEngineHarness;

  afterEach(() => {
    harness.dispose();
  });

  it("관절 핸들의 화면 좌표가 보고된 카메라 기저·fov로 계산한 투영과 같다(정면·측면·위에서 본 시점)", async () => {
    harness = await createNullEngineHarness({ size: 96 });
    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    for (const framing of [DEFAULT_FRAMING, { ...DEFAULT_FRAMING, yawDeg: 40, pitchDeg: 20 }, { ...DEFAULT_FRAMING, mode: "bust" as const, yawDeg: -65, pitchDeg: -10 }]) {
      harness.engine.setCamera(framing);
      const camera = harness.engine.viewportCamera();
      for (const handle of harness.engine.jointHandles()) {
        const projected = projectToPixel(camera, handle.world);
        expect(projected, `${handle.bone}`).not.toBeNull();
        expect(projected?.[0] ?? Number.NaN, `${handle.bone}.x`).toBeCloseTo(handle.screen[0], 3);
        expect(projected?.[1] ?? Number.NaN, `${handle.bone}.y`).toBeCloseTo(handle.screen[1], 3);
        // 핸들 픽셀을 그 깊이의 시선 수직 평면으로 되돌리면 같은 월드 점이다
        const back = unprojectToViewPlane(camera, handle.screen[0], handle.screen[1], handle.world);
        expect(v3Length(v3Sub(back ?? [Number.NaN, 0, 0], handle.world)), `${handle.bone} 역투영`).toBeLessThan(1e-4);
      }
    }
  });
});
