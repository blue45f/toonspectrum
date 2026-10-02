/**
 * outfit 테스트 픽스처(결정적): 두피 표면과 단순 절차 바디(원통 스윕 휴머노이드).
 * 테스트 파일이 아니므로 typecheck·lint 대상이며, humanoid 작업자의 실제 BodySurface 대신
 * 계약(contracts/outfit-port.ts)만으로 outfit builder를 검증한다.
 */
import { BODY_REGIONS, HUMANOID_BONE_NAMES, bodyRegionIndex, paramMorphName } from "../../contracts";
import { v3Add, v3Normalize, v3Scale } from "../../shared/math";

import { MeshAccumulator, blendJoints, sphericalDirection } from "./geometry";

import type { BodyRegion, BodySurface, HumanoidBoneName, MorphDelta, ScalpSurface, SurfaceSample, Vec3 } from "../../contracts";

export const FIXTURE_HEAD_CENTER: Vec3 = [0, 1.62, 0];
export const FIXTURE_HEAD_RADIUS = 0.1;

function boneIndex(name: HumanoidBoneName): number {
  return HUMANOID_BONE_NAMES.indexOf(name);
}

/** 두피 표면: 상반구 샘플(위도 6 × 경도 16, 결정적 순서) */
export function scalpSurfaceFixture(scale = 1): ScalpSurface {
  const radius = FIXTURE_HEAD_RADIUS * scale;
  const up: Vec3 = [0, 1, 0];
  const forward: Vec3 = [0, 0, 1];
  const samples: SurfaceSample[] = [];
  for (let r = 0; r <= 6; r += 1) {
    const elevation = (r / 6) * (Math.PI * 0.55);
    for (let s = 0; s < 16; s += 1) {
      const azimuth = (s / 16) * Math.PI * 2;
      const dir = sphericalDirection(up, forward, azimuth, elevation);
      samples.push({ position: v3Add(FIXTURE_HEAD_CENTER, v3Scale(dir, radius)), normal: dir, uv: [s / 16, r / 6] });
    }
  }
  return { center: FIXTURE_HEAD_CENTER, radius, up, forward, samples };
}

interface TubeSpec {
  readonly region: BodyRegion;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly radiusFrom: number;
  readonly radiusTo: number;
  readonly rings: number;
  /** 링 비율 t(0..1) → 본 블렌드 */
  readonly bones: (t: number) => { a: HumanoidBoneName; b: HumanoidBoneName; t: number };
}

const SIDES = 12;

function bodyTubes(): TubeSpec[] {
  const two = (a: HumanoidBoneName, b: HumanoidBoneName) => (t: number) => ({ a, b, t: Math.min(1, Math.max(0, (t - 0.4) / 0.2)) });
  const one = (a: HumanoidBoneName) => () => ({ a, b: a, t: 0 });
  const limbs: TubeSpec[] = [];
  for (const side of ["left", "right"] as const) {
    const sx = side === "left" ? 1 : -1;
    const upperArm: HumanoidBoneName = side === "left" ? "leftUpperArm" : "rightUpperArm";
    const lowerArm: HumanoidBoneName = side === "left" ? "leftLowerArm" : "rightLowerArm";
    const hand: HumanoidBoneName = side === "left" ? "leftHand" : "rightHand";
    const upperLeg: HumanoidBoneName = side === "left" ? "leftUpperLeg" : "rightUpperLeg";
    const lowerLeg: HumanoidBoneName = side === "left" ? "leftLowerLeg" : "rightLowerLeg";
    const foot: HumanoidBoneName = side === "left" ? "leftFoot" : "rightFoot";
    limbs.push(
      { region: side === "left" ? "leftArm" : "rightArm", from: [sx * 0.2, 1.4, 0], to: [sx * 0.23, 0.78, 0], radiusFrom: 0.045, radiusTo: 0.032, rings: 10, bones: two(upperArm, lowerArm) },
      { region: side === "left" ? "leftHand" : "rightHand", from: [sx * 0.23, 0.78, 0], to: [sx * 0.235, 0.66, 0], radiusFrom: 0.03, radiusTo: 0.02, rings: 4, bones: one(hand) },
      { region: side === "left" ? "leftLeg" : "rightLeg", from: [sx * 0.09, 0.9, 0], to: [sx * 0.095, 0.08, 0], radiusFrom: 0.08, radiusTo: 0.05, rings: 12, bones: two(upperLeg, lowerLeg) },
      { region: side === "left" ? "leftFoot" : "rightFoot", from: [sx * 0.095, 0.05, -0.02], to: [sx * 0.095, 0.035, 0.13], radiusFrom: 0.045, radiusTo: 0.035, rings: 4, bones: one(foot) },
    );
  }
  return [
    { region: "hips", from: [0, 0.85, 0], to: [0, 1.0, 0], radiusFrom: 0.13, radiusTo: 0.125, rings: 4, bones: one("hips") },
    { region: "torso", from: [0, 1.0, 0], to: [0, 1.45, 0], radiusFrom: 0.12, radiusTo: 0.16, rings: 10, bones: two("spine", "upperChest") },
    { region: "neck", from: [0, 1.45, 0], to: [0, 1.53, 0], radiusFrom: 0.05, radiusTo: 0.05, rings: 3, bones: one("neck") },
    ...limbs,
  ];
}

export interface BodyFixture {
  readonly body: BodySurface;
  readonly morphs: readonly MorphDelta[];
}

/**
 * 단순 바디: 원통 튜브(엉덩이·몸통·목·팔·손·다리·발) + 머리 구. 정점마다 영역·스킨 가중치가 있고
 * morph 3종(어깨 너비 ±, 엉덩이 +)을 함께 돌려준다.
 */
export function bodySurfaceFixture(): BodyFixture {
  const acc = new MeshAccumulator();
  const regions: number[] = [];
  for (const tube of bodyTubes()) {
    const axis = v3Normalize([tube.to[0] - tube.from[0], tube.to[1] - tube.from[1], tube.to[2] - tube.from[2]]);
    const base = acc.vertexCount;
    for (let r = 0; r <= tube.rings; r += 1) {
      const t = r / tube.rings;
      const center = v3Add(tube.from, v3Scale([tube.to[0] - tube.from[0], tube.to[1] - tube.from[1], tube.to[2] - tube.from[2]], t));
      const radius = tube.radiusFrom + (tube.radiusTo - tube.radiusFrom) * t;
      const blend = tube.bones(t);
      const skin = blendJoints(boneIndex(blend.a), boneIndex(blend.b), blend.t);
      // 축에 수직인 두 방향(축이 거의 y면 x/z, 아니면 y/x)
      const a: Vec3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const b: Vec3 = v3Normalize([axis[1] * a[2] - axis[2] * a[1], axis[2] * a[0] - axis[0] * a[2], axis[0] * a[1] - axis[1] * a[0]]);
      const a2: Vec3 = v3Normalize([b[1] * axis[2] - b[2] * axis[1], b[2] * axis[0] - b[0] * axis[2], b[0] * axis[1] - b[1] * axis[0]]);
      for (let s = 0; s < SIDES; s += 1) {
        const angle = (s / SIDES) * Math.PI * 2;
        const dir: Vec3 = v3Normalize(v3Add(v3Scale(a2, Math.cos(angle)), v3Scale(b, Math.sin(angle))));
        acc.pushVertex(v3Add(center, v3Scale(dir, radius)), dir, [s / SIDES, t], skin);
        regions.push(bodyRegionIndex(tube.region));
      }
    }
    for (let r = 0; r < tube.rings; r += 1) {
      for (let s = 0; s < SIDES; s += 1) {
        const s1 = (s + 1) % SIDES;
        acc.pushQuad(base + r * SIDES + s, base + r * SIDES + s1, base + (r + 1) * SIDES + s1, base + (r + 1) * SIDES + s);
      }
    }
  }
  // 머리 구(위도 8 × 경도 12)
  const headBase = acc.vertexCount;
  const headSkin = blendJoints(boneIndex("head"), boneIndex("head"), 0);
  const latRings = 8;
  for (let r = 0; r <= latRings; r += 1) {
    const el = (r / latRings) * Math.PI;
    for (let s = 0; s < SIDES; s += 1) {
      const az = (s / SIDES) * Math.PI * 2;
      const dir = sphericalDirection([0, 1, 0], [0, 0, 1], az, el);
      acc.pushVertex(v3Add(FIXTURE_HEAD_CENTER, v3Scale(dir, FIXTURE_HEAD_RADIUS)), dir, [s / SIDES, r / latRings], headSkin);
      regions.push(bodyRegionIndex("head"));
    }
  }
  for (let r = 0; r < latRings; r += 1) {
    for (let s = 0; s < SIDES; s += 1) {
      const s1 = (s + 1) % SIDES;
      acc.pushQuad(headBase + r * SIDES + s, headBase + r * SIDES + s1, headBase + (r + 1) * SIDES + s1, headBase + (r + 1) * SIDES + s);
    }
  }
  const buffers = acc.build();
  const vertexCount = buffers.positions.length / 3;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexCount; v += 1) {
    for (let k = 0; k < 3; k += 1) {
      const value = buffers.positions[v * 3 + k];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
    }
  }
  const regionOfVertex = Uint8Array.from(regions);
  const body: BodySurface = {
    positions: buffers.positions,
    normals: buffers.normals,
    uvs: buffers.uvs,
    indices: buffers.indices,
    jointIndices: buffers.jointIndices,
    jointWeights: buffers.jointWeights,
    regionOfVertex,
    bounds: { min, max },
  };
  return { body, morphs: bodyMorphFixtures(body) };
}

/** 어깨 너비 ±(몸통 상부·팔 전체 x 이동), 엉덩이 +(엉덩이 영역 방사 확장) */
export function bodyMorphFixtures(body: BodySurface): MorphDelta[] {
  const vertexCount = body.positions.length / 3;
  const torso = bodyRegionIndex("torso");
  const leftArm = bodyRegionIndex("leftArm");
  const rightArm = bodyRegionIndex("rightArm");
  const leftHand = bodyRegionIndex("leftHand");
  const rightHand = bodyRegionIndex("rightHand");
  const hips = bodyRegionIndex("hips");
  const shoulderPlus = new Float32Array(vertexCount * 3);
  const shoulderMinus = new Float32Array(vertexCount * 3);
  const hipPlus = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) {
    const region = body.regionOfVertex[v];
    const x = body.positions[v * 3];
    const y = body.positions[v * 3 + 1];
    const z = body.positions[v * 3 + 2];
    let dx = 0;
    if (region === torso && y > 1.3) dx = Math.sign(x) * 0.03 * Math.min(1, (y - 1.3) / 0.15);
    if (region === leftArm || region === leftHand) dx = 0.03;
    if (region === rightArm || region === rightHand) dx = -0.03;
    shoulderPlus[v * 3] = dx;
    shoulderMinus[v * 3] = -dx;
    if (region === hips) {
      const len = Math.hypot(x, z);
      if (len > 1e-6) {
        hipPlus[v * 3] = (x / len) * 0.02;
        hipPlus[v * 3 + 2] = (z / len) * 0.02;
      }
    }
  }
  return [
    { name: paramMorphName("shoulderWidth", "+"), deltaPositions: shoulderPlus },
    { name: paramMorphName("shoulderWidth", "-"), deltaPositions: shoulderMinus },
    { name: paramMorphName("hip", "+"), deltaPositions: hipPlus },
  ];
}

/** 영역 이름 → 인덱스 역매핑(테스트 가독성용) */
export function regionName(index: number): BodyRegion {
  return BODY_REGIONS[index] ?? "torso";
}
