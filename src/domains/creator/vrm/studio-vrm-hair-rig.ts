/**
 * 생성형 캐릭터의 **헤어 체인 리그 + 스프링본 계획**.
 *
 * 왜 필요한가. 헤어 메시는 전 정점이 `head` 에 100% 묶여 있었다. 짧은 머리는 그래도 되지만
 * 긴 머리는 머리 관절 아래로 최대 0.51 m(`hime-noble`) 내려가므로, 고개를 돌리면 그 길이가
 * 통째로 머리 관절을 중심으로 강체 회전한다 — 머리카락이 어깨를 뚫고 지나가고, 무엇보다
 * **흔들리지 않는다**. 익스포트한 리그에 헤어 조인트가 없으니 스프링본이 물릴 곳도 없었다.
 *
 * 이 모듈은 가닥(tapered-capsule) 하나마다 축을 따라 체인 조인트를 심고, 그 체인을
 * `VRMC_springBone` 스프링으로 낼 계획을 만든다. 스튜디오 런타임은 이미 스프링본을 돌리므로
 * (studio-vrm-physics · studio-vrm-springbone-bridge 가 `vrm.update(dt)` 를 친다) 생성
 * 캐릭터도 임포트한 VRM 과 똑같이 머리카락이 흔들린다.
 *
 * ---------------------------------------------------------------------------
 * 규약
 * ---------------------------------------------------------------------------
 *  - 조인트는 전부 **비휴머노이드 노드**다. 휴머노이드 본 맵은 15본 그대로다.
 *  - 체인의 첫 조인트는 `head` 의 자식이고 **흔들리지 않는다**(VRM 스프링의 루트 규약).
 *    가닥 뿌리를 여기에 묶으면 두피에 붙은 것과 같아진다.
 *  - IBM 은 휴머노이드 리그와 같은 규약 — rest 월드 위치의 **역이동만** 담는다.
 *    조인트에 스케일이 없으므로 회전만으로 흔들린다.
 */

import {
  applyTrs,
  meshClamp,
  type MeshMat3,
  type MeshVec3,
} from "./studio-vrm-humanoid-mesh-geometry";

import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";

export const STUDIO_VRM_HAIR_RIG_VERSION = 1 as const;

/**
 * 가닥 하나에 심는 체인 조인트 수(뿌리 포함).
 *
 * 4개 = 뿌리 1 + 흔들리는 마디 3. 마디를 늘리면 더 부드럽게 흔들리지만 스킨 조인트 수가
 * 가닥 수만큼 곱해져 커진다 — 가장 조인트가 많은 `twin-braid-village` 가 이 값에서 130개다.
 */
export const STUDIO_VRM_HAIR_CHAIN_JOINTS = 4;

/** 가닥 파츠에 적용된 최종 TRS(두개골 적합까지 끝난 값). */
export type StudioVrmHairPartTransform = {
  readonly translation: MeshVec3;
  readonly rotation: MeshMat3;
  readonly scale: MeshVec3;
};

export type StudioVrmHairJoint = {
  readonly name: string;
  /** 부모 기준 로컬 이동. 부모는 체인의 앞 조인트이고, 첫 조인트의 부모는 `head` 다. */
  readonly localTranslation: MeshVec3;
  /** rest 월드 위치. 메시 저작 좌표계이자 IBM 의 기준. */
  readonly worldRest: MeshVec3;
  /** 이 마디가 차지하는 굵기. 스프링 충돌 반경으로 그대로 쓴다. */
  readonly hitRadius: number;
};

export type StudioVrmHairChain = {
  readonly partId: string;
  /** 뿌리 → 끝 순서. 앞 조인트가 항상 부모다. */
  readonly joints: readonly StudioVrmHairJoint[];
  /** 펼친 조인트 목록에서 이 체인의 첫 조인트 위치. */
  readonly jointOffset: number;
  readonly stiffness: number;
  readonly gravityPower: number;
  readonly dragForce: number;
};

export type StudioVrmHairRig = {
  readonly version: typeof STUDIO_VRM_HAIR_RIG_VERSION;
  readonly chains: readonly StudioVrmHairChain[];
  /** 체인들을 펼친 조인트 목록. 스킨 `joints` 확장 순서이자 조인트 인덱스 순서다. */
  readonly joints: readonly StudioVrmHairJoint[];
};

/**
 * 가닥의 **중심선**(파츠 로컬). `t` 0 = 뿌리, 1 = 끝.
 *
 * `addHairStrand` 가 정점을 찍는 축과 **같은 식**이어야 조인트가 가닥 한가운데를 지난다.
 * 어긋나면 흔들릴 때 가닥이 축을 중심으로 비틀린다.
 */
export function studioVrmHairStrandSpine(part: AvatarForgeHairPart, t: number): MeshVec3 {
  const waveAmount = part.wave ?? 0;
  const waveFrequency = part.waveFrequency ?? 2.4;
  const aspectX = meshClamp(part.scale[1] / Math.max(1e-4, Math.abs(part.scale[0])), 1, 10);
  const aspectZ = meshClamp(part.scale[1] / Math.max(1e-4, Math.abs(part.scale[2])), 1, 10);
  const spineCurveX = Math.sin(t * Math.PI * 2.15) * part.curl * 0.58 * t;
  const spineCurveZ = Math.sin(t * Math.PI) * part.curl * 0.34;
  const curveX =
    waveAmount > 0
      ? spineCurveX + Math.sin(t * Math.PI * waveFrequency) * waveAmount * 0.17 * aspectX * t
      : spineCurveX;
  const curveZ =
    waveAmount > 0
      ? spineCurveZ + Math.cos(t * Math.PI * waveFrequency) * waveAmount * 0.07 * aspectZ * t
      : spineCurveZ;
  return [curveX, 1 - t * 2, curveZ];
}

/** 가닥 굵기(파츠 로컬 반경). `addHairStrand` 의 테이퍼와 같은 식이다. */
function strandRadius(part: AvatarForgeHairPart, t: number): number {
  return Math.max(0.08, 1 - part.taper * t ** 0.72);
}

function subtract(a: MeshVec3, b: MeshVec3): MeshVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * 가닥마다 체인 조인트를 심는다.
 *
 * 흔들림 세기는 가닥 길이에서 뽑는다 — 짧은 삐침머리가 롱헤어처럼 출렁이면 어색하다.
 * `dragForce` 는 짧을수록 크게(빨리 멎게), `stiffness` 는 짧을수록 크게(덜 휘게) 잡는다.
 */
export function buildStudioVrmHairRig(
  strands: readonly { readonly part: AvatarForgeHairPart; readonly transform: StudioVrmHairPartTransform }[],
  headWorldRest: MeshVec3,
): StudioVrmHairRig | null {
  if (strands.length === 0) return null;

  const chains: StudioVrmHairChain[] = [];
  const joints: StudioVrmHairJoint[] = [];

  for (const { part, transform } of strands) {
    const place = (t: number): MeshVec3 =>
      applyTrs(studioVrmHairStrandSpine(part, t), transform.translation, transform.rotation, transform.scale);

    const root = place(0);
    const tip = place(1);
    const length = Math.hypot(tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]);
    // 굵기는 파츠 로컬 반경 1 이 월드에서 얼마인지로 환산한다. 가닥은 가로 스케일이
    // 좌우/앞뒤로 다를 수 있으므로 둘의 평균을 쓴다.
    const girth = (Math.abs(transform.scale[0]) + Math.abs(transform.scale[2])) / 2;

    const chainJoints: StudioVrmHairJoint[] = [];
    let previous = headWorldRest;
    for (let index = 0; index < STUDIO_VRM_HAIR_CHAIN_JOINTS; index += 1) {
      const t = index / (STUDIO_VRM_HAIR_CHAIN_JOINTS - 1);
      const worldRest = place(t);
      chainJoints.push({
        name: `HairJoint_${part.id}_${index}`,
        localTranslation: subtract(worldRest, previous),
        worldRest,
        hitRadius: Math.max(0.004, strandRadius(part, t) * girth),
      });
      previous = worldRest;
    }

    // 0.10 m 안팎의 삐침머리는 거의 굳게, 0.45 m 롱헤어는 느슨하게.
    const slack = meshClamp((length - 0.08) / 0.32, 0, 1);
    chains.push({
      partId: part.id,
      joints: chainJoints,
      jointOffset: joints.length,
      stiffness: 1.6 - 0.9 * slack,
      gravityPower: 0.06 + 0.14 * slack,
      dragForce: 0.72 - 0.3 * slack,
    });
    joints.push(...chainJoints);
  }

  return { version: STUDIO_VRM_HAIR_RIG_VERSION, chains, joints };
}

/** 헤어 조인트의 `inverseBindMatrices` — 휴머노이드 리그와 같은 규약(역이동만, 열 우선). */
export function studioVrmHairRigInverseBindMatrices(rig: StudioVrmHairRig): number[] {
  const matrices: number[] = [];
  for (const joint of rig.joints) {
    const [x, y, z] = joint.worldRest;
    matrices.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1);
  }
  return matrices;
}
