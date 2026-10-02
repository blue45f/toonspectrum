import { describe, expect, it } from "vitest";

import { SLOT_PRESET_IDS } from "../../../contracts";
import { resolveProportions } from "../proportions";

import { buildBrows, buildLash } from "./brow-lash-builder";
import { EYE_SIDES, EYE_STYLE_SPECS, buildEyeHighlight, buildEyeball, buildIris, buildPupil, eyeCenter, eyeballRadius } from "./eye-builder";
import { headSurfacePoint } from "./head-cage";
import { boundsContain, buildTeeth, buildTongue, mouthBounds } from "./mouth-builder";
import { triMeshBounds, triMeshIsWatertight, type TriMesh } from "./tri-mesh";

const frame = resolveProportions({}).head;

function expectValidTriMesh(mesh: TriMesh): void {
  expect(mesh.positions.length % 3).toBe(0);
  expect(mesh.normals.length).toBe(mesh.positions.length);
  expect(mesh.uvs.length).toBe((mesh.positions.length / 3) * 2);
  expect(mesh.indices.length % 3).toBe(0);
  for (let i = 0; i < mesh.indices.length; i += 1) expect(mesh.indices[i]).toBeLessThan(mesh.positions.length / 3);
  for (let i = 0; i < mesh.normals.length; i += 3) {
    expect(Math.abs(Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]) - 1)).toBeLessThan(1e-4);
  }
  for (let i = 0; i < mesh.uvs.length; i += 1) {
    expect(mesh.uvs[i]).toBeGreaterThanOrEqual(-1e-6);
    expect(mesh.uvs[i]).toBeLessThanOrEqual(1 + 1e-6);
  }
}

describe("눈 파츠", () => {
  it("안구 중심이 눈 소켓을 따르고 안구는 수밀 구다", () => {
    for (const side of EYE_SIDES) {
      const center = eyeCenter(frame, side);
      const sign = side === "left" ? 1 : -1;
      expect(Math.sign(center[0])).toBe(sign);
      const socket = headSurfacePoint([sign * 0.33, 0.1, 0.6].map((v, i, a) => v / Math.hypot(a[0], a[1], a[2])) as unknown as [number, number, number]);
      // 소켓 바닥(모델 공간 z)보다 안구 중심이 뒤에 있다
      expect(center[2]).toBeLessThan(frame.center[2] + socket[2] * frame.scale);
      const eyeball = buildEyeball(frame, side, "almond");
      expectValidTriMesh(eyeball);
      expect(triMeshIsWatertight(eyeball.positions, eyeball.indices)).toBe(true);
      const b = triMeshBounds(eyeball.positions);
      expect((b.max[0] - b.min[0]) / 2).toBeCloseTo(eyeballRadius(frame), 5);
    }
  });

  it("모든 눈·홍채 스타일이 유효한 메시를 만들고 홍채가 안구 앞에 있다", () => {
    for (const eyes of SLOT_PRESET_IDS.eyes) {
      for (const iris of SLOT_PRESET_IDS.irises) {
        const i = buildIris(frame, "left", eyes, iris);
        const p = buildPupil(frame, "left", eyes, iris);
        const h = buildEyeHighlight(frame, "left", eyes, iris);
        expectValidTriMesh(i);
        expectValidTriMesh(p);
        expectValidTriMesh(h);
        const center = eyeCenter(frame, "left");
        expect(triMeshBounds(i.positions).min[2]).toBeGreaterThan(center[2]);
        const meanDistance = (mesh: TriMesh): number => {
          let sum = 0;
          for (let k = 0; k < mesh.positions.length; k += 3) {
            sum += Math.hypot(mesh.positions[k] - center[0], mesh.positions[k + 1] - center[1], mesh.positions[k + 2] - center[2]);
          }
          return sum / (mesh.positions.length / 3);
        };
        const r = eyeballRadius(frame) * EYE_STYLE_SPECS[eyes].eyeballScale[2];
        expect(meanDistance(i)).toBeGreaterThan(r * 0.99);
        expect(meanDistance(p)).toBeGreaterThan(meanDistance(i));
        expect(meanDistance(h)).toBeGreaterThan(meanDistance(p));
      }
    }
  });

  it("오른눈 파츠는 왼눈의 정점별 x 거울이고 법선도 뒤집힌다", () => {
    const pairs: Array<[TriMesh, TriMesh]> = [
      [buildEyeball(frame, "left", "round"), buildEyeball(frame, "right", "round")],
      [buildIris(frame, "left", "round", "cat"), buildIris(frame, "right", "round", "cat")],
      [buildLash(frame, "left", "wide"), buildLash(frame, "right", "wide")],
    ];
    for (const [left, right] of pairs) {
      expect(right.positions.length).toBe(left.positions.length);
      for (let i = 0; i < left.positions.length; i += 3) {
        expect(right.positions[i]).toBeCloseTo(-left.positions[i], 6);
        expect(right.positions[i + 1]).toBeCloseTo(left.positions[i + 1], 6);
        expect(right.positions[i + 2]).toBeCloseTo(left.positions[i + 2], 6);
        expect(right.normals[i]).toBeCloseTo(-left.normals[i], 4);
      }
      expect(triMeshIsWatertight(right.positions, right.indices)).toBe(triMeshIsWatertight(left.positions, left.indices));
    }
  });
});

describe("치아·혀·눈썹·속눈썹", () => {
  it("치아와 혀가 입 bbox 안에 있다", () => {
    const bounds = mouthBounds(frame);
    expect(boundsContain(bounds, buildTeeth(frame))).toBe(true);
    expect(boundsContain(bounds, buildTongue(frame))).toBe(true);
    expectValidTriMesh(buildTeeth(frame));
    expectValidTriMesh(buildTongue(frame));
  });

  it("눈썹은 눈 위, 속눈썹은 안구 근처에 있고 메시가 유효하다", () => {
    const brows = buildBrows(frame);
    expectValidTriMesh(brows);
    const bb = triMeshBounds(brows.positions);
    expect(bb.min[1]).toBeGreaterThan(eyeCenter(frame, "left")[1]);
    expect(bb.min[0]).toBeCloseTo(-bb.max[0], 5);
    for (const eyes of SLOT_PRESET_IDS.eyes) {
      const lash = buildLash(frame, "left", eyes);
      expectValidTriMesh(lash);
      const lb = triMeshBounds(lash.positions);
      const c = eyeCenter(frame, "left");
      expect(Math.abs((lb.min[0] + lb.max[0]) / 2 - c[0])).toBeLessThan(eyeballRadius(frame) * 1.2);
      expect(lb.max[1]).toBeGreaterThan(c[1]);
    }
  });
});
