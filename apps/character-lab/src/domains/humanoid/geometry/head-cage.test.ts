import { describe, expect, it } from "vitest";

import { v3Normalize } from "../../../shared/math";
import { HEAD_LANDMARKS, worldToHeadLocal } from "../proportions";

import { EAR_LATITUDES, EAR_LONGITUDES, HEAD_LATITUDES, HEAD_LONGITUDES, MOUTH_POCKET_RINGS, buildHeadCage, headSurfacePoint, isScalpLocal } from "./head-cage";
import { mirrorMapX, quadMeshEdgeStats } from "./quad-mesh";
import { catmullClark, subdividedToTriMesh } from "./subdivision";
import { triMeshIsWatertight } from "./tri-mesh";

describe("buildHeadCage", () => {
  const head = buildHeadCage({});

  it("세 개의 닫힌 다양체(머리·귀 2)이며 간선이 전부 2면이다", () => {
    const stats = quadMeshEdgeStats(head.mesh);
    expect(stats.nonManifoldEdges).toBe(0);
    expect(stats.inconsistentEdges).toBe(0);
    expect(stats.isolatedVertices).toBe(0);
    const v = head.mesh.positions.length / 3;
    const f = head.mesh.faces.length / 4;
    // 오일러: 구 3개 → 6 (입 구멍 + 주머니는 구 위상을 바꾸지 않는다)
    expect(v - stats.edgeCount + f).toBe(6);
    expect(head.skullVertexCount).toBe(HEAD_LONGITUDES * (HEAD_LATITUDES - 1) + 2);
    expect(head.mouthVertexCount).toBe(MOUTH_POCKET_RINGS * 10 + 1);
    expect(v).toBe(head.skullVertexCount + head.mouthVertexCount + 2 * (EAR_LONGITUDES * (EAR_LATITUDES - 1) + 2));
  });

  it("좌우 대칭이고 머리 섬 UV는 u ≤ 0.5다", () => {
    const mirror = mirrorMapX(head.mesh.positions, 1e-6);
    for (let i = 0; i < mirror.length; i += 1) expect(mirror[i]).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < head.mesh.uvs.length; i += 2) {
      expect(head.mesh.uvs[i]).toBeLessThanOrEqual(0.5);
      expect(head.mesh.uvs[i + 1]).toBeGreaterThanOrEqual(0);
      expect(head.mesh.uvs[i + 1]).toBeLessThanOrEqual(1);
    }
  });

  it("표면 함수는 코가 솟고 눈 소켓이 들어가며 뒤통수 아래가 수축된다", () => {
    const nose = headSurfacePoint(v3Normalize(HEAD_LANDMARKS.noseTip));
    const beside = headSurfacePoint(v3Normalize([0.3, -0.12, 0.98]));
    expect(nose[2]).toBeGreaterThan(beside[2]);
    const eyeDir = v3Normalize(HEAD_LANDMARKS.eye);
    const eye = headSurfacePoint(eyeDir);
    const plainRadius = 1 / Math.sqrt((eyeDir[0] / 0.84) ** 2 + eyeDir[1] ** 2 + (eyeDir[2] / 0.92) ** 2);
    expect(Math.hypot(eye[0], eye[1], eye[2])).toBeLessThan(plainRadius);
    const back = headSurfacePoint(v3Normalize([0, -0.7, -0.7]));
    expect(Math.hypot(back[0], back[1], back[2])).toBeLessThan(0.85);
  });

  it("안구 중심이 눈 소켓 바닥 뒤에 있고 안구 앞면은 소켓 바닥보다 약간 앞이다", () => {
    const socket = headSurfacePoint(v3Normalize(HEAD_LANDMARKS.eye));
    const eye = HEAD_LANDMARKS.eye;
    expect(Math.hypot(eye[0], eye[1], eye[2])).toBeLessThan(Math.hypot(socket[0], socket[1], socket[2]));
    const front = eye[2] + HEAD_LANDMARKS.eyeballRadius;
    expect(front).toBeGreaterThan(socket[2] * 0.95);
    expect(front).toBeLessThan(socket[2] + 0.12);
  });

  it("세분 후 수밀이고 두피 판정이 정수리는 참·턱은 거짓이다", () => {
    const tri = subdividedToTriMesh(catmullClark(head.mesh, 1));
    expect(triMeshIsWatertight(tri.positions, tri.indices)).toBe(true);
    expect(isScalpLocal([0, 0.9, 0])).toBe(true);
    expect(isScalpLocal([0, -0.8, 0.4])).toBe(false);
    expect(isScalpLocal([0.95, 0.5, 0])).toBe(false);
    const topIndex = HEAD_LONGITUDES * (HEAD_LATITUDES - 1);
    const top: [number, number, number] = [head.mesh.positions[topIndex * 3], head.mesh.positions[topIndex * 3 + 1], head.mesh.positions[topIndex * 3 + 2]];
    expect(isScalpLocal(worldToHeadLocal(head.frame, top))).toBe(true);
  });

  it("headSize 파라미터는 머리 프레임 배율만 바꾸고 토폴로지는 같다", () => {
    const big = buildHeadCage({ headSize: 1 });
    expect(big.frame.scale).toBeGreaterThan(head.frame.scale);
    expect(big.mesh.faces).toEqual(head.mesh.faces);
    expect(big.mesh.positions.length).toBe(head.mesh.positions.length);
  });
});
