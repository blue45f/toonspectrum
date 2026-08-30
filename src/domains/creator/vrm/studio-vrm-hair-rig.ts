/**
 * 생성형 캐릭터의 **헤어 체인 리그 + 스프링본 계획**.
 *
 * 왜 필요한가. 헤어 메시는 전 정점이 `head` 에 100% 묶여 있었다. 짧은 머리는 그래도 되지만
 * 긴 머리는 머리 관절 아래로 최대 0.43 m(`hime-noble` 뒷머리) 내려가므로, 고개를 돌리면 그
 * 길이가 통째로 머리 관절을 중심으로 강체 회전한다 — 머리카락이 어깨를 뚫고 지나가고,
 * 무엇보다 **흔들리지 않는다**. 익스포트한 리그에 헤어 조인트가 없으니 스프링본이 물릴 곳도
 * 없었다.
 *
 * 이 모듈은 **매달린 파츠 전부**에 조인트를 심고 `VRMC_springBone` 스프링으로 낼 계획을
 * 만든다. 스튜디오 런타임은 이미 스프링본을 돌리므로(studio-vrm-physics ·
 * studio-vrm-springbone-bridge 가 `vrm.update(dt)` 를 친다) 생성 캐릭터도 임포트한 VRM 과
 * 똑같이 머리카락이 흔들린다.
 *
 * ---------------------------------------------------------------------------
 * 파츠 모양이 세 가지라 체인 만드는 법도 세 가지다
 * ---------------------------------------------------------------------------
 *  - **가닥**(`tapered-capsule`) — 곡선 중심선을 따라 조인트를 심고, 정점은 축 방향
 *    파라미터로 이웃한 두 마디에 나눠 싣는다.
 *  - **덩어리**(매달린 `ellipsoid`/`sphere`, 주로 뒷머리 시트) — 파츠 로컬 Y 를 따라
 *    위에서 아래로 조인트를 심는다. 정점 배분은 가닥과 같은 식이다.
 *  - **땋은 머리**(`<prefix>-seg-<n>` 스피어 열) — 세그먼트가 이미 순서 있는 사슬이므로
 *    세그먼트 하나에 조인트 하나를 주고 **통째로 강체**로 묶는다(구슬 사슬과 같다).
 *    사슬의 뿌리는 매듭(`<prefix>-tie`)이고 흔들리지 않는다.
 *
 * 규약
 *  - 조인트는 전부 **비휴머노이드 노드**다. 휴머노이드 본 맵은 15본 그대로다.
 *  - 체인의 첫 조인트는 `head` 의 자식이고 **흔들리지 않는다**(VRM 스프링의 루트 규약).
 *  - IBM 은 휴머노이드 리그와 같은 규약 — rest 월드 위치의 **역이동만** 담는다.
 */

import {
  applyTrs,
  meshClamp,
  type MeshMat3,
  type MeshVec3,
} from "./studio-vrm-humanoid-mesh-geometry";

import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";

export const STUDIO_VRM_HAIR_RIG_VERSION = 2 as const;

/**
 * 가닥·덩어리 하나에 심는 체인 조인트 수(뿌리 포함).
 *
 * 4개 = 뿌리 1 + 흔들리는 마디 3. 땋은 머리는 세그먼트 수가 곧 마디 수라 이 값을 쓰지 않는다.
 */
export const STUDIO_VRM_HAIR_CHAIN_JOINTS = 4;

/**
 * 이 높이보다 덜 내려온 덩어리 파츠는 리그를 달지 않는다(머리 관절 기준, 신장 배율 곱하기 전).
 *
 * 정수리에 얹힌 번·삐침머리는 흔들릴 이유가 없고, 흔들리면 오히려 두피에서 떠 보인다.
 * 실측하면 번은 머리 관절보다 **위**(−0.10 m)에 있고 뒷머리 시트는 0.14~0.43 m 아래다.
 */
const HAIR_RIG_MIN_DROP = 0.06;

/** 매달린 것으로 볼 수 있는 덩어리 역할. `cap` 은 두피 껍질, `bang` 은 이마에 붙는다. */
const HANGING_BLOB_ROLES = new Set<AvatarForgeHairPart["role"]>([
  "back",
  "side",
  "tail",
  "bun",
  "ahoge",
]);

/** 파츠에 적용된 최종 TRS(두개골 적합까지 끝난 값). */
export type StudioVrmHairPartTransform = {
  readonly translation: MeshVec3;
  readonly rotation: MeshMat3;
  readonly scale: MeshVec3;
};

export type StudioVrmHairPartInput = {
  readonly part: AvatarForgeHairPart;
  readonly transform: StudioVrmHairPartTransform;
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
  readonly id: string;
  /** 뿌리 → 끝 순서. 앞 조인트가 항상 부모다. */
  readonly joints: readonly StudioVrmHairJoint[];
  /** 펼친 조인트 목록에서 이 체인의 첫 조인트 위치. */
  readonly jointOffset: number;
  readonly stiffness: number;
  readonly gravityPower: number;
  readonly dragForce: number;
};

/**
 * 파츠 하나를 어떻게 스킨할지.
 *  - `blend` — 축 방향 파라미터로 이웃한 두 마디에 나눠 싣는다(가닥·덩어리).
 *  - `rigid` — 파츠 전체를 마디 하나에 싣는다(땋은 머리 세그먼트·매듭).
 */
export type StudioVrmHairBinding =
  | { readonly kind: "blend"; readonly chain: StudioVrmHairChain }
  | { readonly kind: "rigid"; readonly chain: StudioVrmHairChain; readonly jointInChain: number };

export type StudioVrmHairRig = {
  readonly version: typeof STUDIO_VRM_HAIR_RIG_VERSION;
  readonly chains: readonly StudioVrmHairChain[];
  /** 체인들을 펼친 조인트 목록. 스킨 `joints` 확장 순서이자 조인트 인덱스 순서다. */
  readonly joints: readonly StudioVrmHairJoint[];
  /** 파츠 id → 스킨 방법. 여기 없는 파츠는 `head` 에 그대로 묶인다. */
  readonly bindings: ReadonlyMap<string, StudioVrmHairBinding>;
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

function place(input: StudioVrmHairPartInput, unit: MeshVec3): MeshVec3 {
  const { transform } = input;
  return applyTrs(unit, transform.translation, transform.rotation, transform.scale);
}

/** 파츠 아래 끝이 머리 관절보다 얼마나 내려와 있는가(m). 음수면 관절보다 위다. */
function partDrop(input: StudioVrmHairPartInput, headWorldRest: MeshVec3): number {
  return headWorldRest[1] - (input.transform.translation[1] - Math.abs(input.transform.scale[1]));
}

/** 땋은 머리 세그먼트 id — `<prefix>-seg-<n>`. 그룹 1 = prefix, 그룹 2 = index. */
const BRAID_SEGMENT_ID = /^(.+)-seg-(\d+)$/u;

type ChainDraft = {
  readonly id: string;
  readonly joints: readonly StudioVrmHairJoint[];
  readonly length: number;
  /** 이 체인에 강체로 묶일 파츠 id → 체인 안 마디 번호. */
  readonly rigid: ReadonlyMap<string, number>;
  /** 이 체인에 축 방향으로 배분될 파츠 id. */
  readonly blend: readonly string[];
};

function chainLength(joints: readonly StudioVrmHairJoint[]): number {
  let total = 0;
  for (let index = 1; index < joints.length; index += 1) {
    const [x, y, z] = subtract(joints[index].worldRest, joints[index - 1].worldRest);
    total += Math.hypot(x, y, z);
  }
  return total;
}

function jointsFrom(
  samples: readonly { readonly world: MeshVec3; readonly hitRadius: number }[],
  namePrefix: string,
  headWorldRest: MeshVec3,
): StudioVrmHairJoint[] {
  const joints: StudioVrmHairJoint[] = [];
  let previous = headWorldRest;
  samples.forEach((sample, index) => {
    joints.push({
      name: `HairJoint_${namePrefix}_${index}`,
      localTranslation: subtract(sample.world, previous),
      worldRest: sample.world,
      hitRadius: sample.hitRadius,
    });
    previous = sample.world;
  });
  return joints;
}

/** 가닥 — 곡선 중심선을 따라 균등하게. */
function draftStrandChain(input: StudioVrmHairPartInput, headWorldRest: MeshVec3): ChainDraft {
  const { part, transform } = input;
  const girth = (Math.abs(transform.scale[0]) + Math.abs(transform.scale[2])) / 2;
  const samples = Array.from({ length: STUDIO_VRM_HAIR_CHAIN_JOINTS }, (_unused, index) => {
    const t = index / (STUDIO_VRM_HAIR_CHAIN_JOINTS - 1);
    return {
      world: place(input, studioVrmHairStrandSpine(part, t)),
      hitRadius: Math.max(0.004, strandRadius(part, t) * girth),
    };
  });
  const joints = jointsFrom(samples, part.id, headWorldRest);
  return {
    id: part.id,
    joints,
    length: chainLength(joints),
    rigid: new Map(),
    blend: [part.id],
  };
}

/** 덩어리 — 파츠 로컬 Y 를 따라 위에서 아래로. 뒷머리 시트가 여기 해당한다. */
function draftBlobChain(input: StudioVrmHairPartInput, headWorldRest: MeshVec3): ChainDraft {
  const { part, transform } = input;
  // 충돌 반경은 **앞뒤 두께**로 잡는다. 좌우로 넓은 시트에서 좌우 폭을 쓰면 등에서 크게 떠 버린다.
  const hitRadius = meshClamp(Math.abs(transform.scale[2]), 0.004, 0.06);
  const samples = Array.from({ length: STUDIO_VRM_HAIR_CHAIN_JOINTS }, (_unused, index) => {
    const t = index / (STUDIO_VRM_HAIR_CHAIN_JOINTS - 1);
    return { world: place(input, [0, 1 - t * 2, 0]), hitRadius };
  });
  const joints = jointsFrom(samples, part.id, headWorldRest);
  return {
    id: part.id,
    joints,
    length: chainLength(joints),
    rigid: new Map(),
    blend: [part.id],
  };
}

/** 땋은 머리 — 세그먼트가 곧 마디다. 매듭이 있으면 그게 흔들리지 않는 뿌리가 된다. */
function draftBraidChain(
  prefix: string,
  tie: StudioVrmHairPartInput | undefined,
  segments: readonly StudioVrmHairPartInput[],
  headWorldRest: MeshVec3,
): ChainDraft {
  const members = tie ? [tie, ...segments] : segments;
  const samples = members.map((member) => ({
    world: member.transform.translation,
    hitRadius: Math.max(
      0.004,
      (Math.abs(member.transform.scale[0]) + Math.abs(member.transform.scale[2])) / 2,
    ),
  }));
  const joints = jointsFrom(samples, prefix, headWorldRest);
  const rigid = new Map<string, number>();
  members.forEach((member, index) => rigid.set(member.part.id, index));
  return { id: prefix, joints, length: chainLength(joints), rigid, blend: [] };
}

/**
 * 매달린 헤어 파츠에 체인 조인트를 심는다.
 *
 * 흔들림 세기는 체인 길이에서 뽑는다 — 짧은 삐침머리가 롱헤어처럼 출렁이면 어색하다.
 * `dragForce` 는 짧을수록 크게(빨리 멎게), `stiffness` 는 짧을수록 크게(덜 휘게) 잡는다.
 */
export function buildStudioVrmHairRig(
  parts: readonly StudioVrmHairPartInput[],
  headWorldRest: MeshVec3,
  heightScale = 1,
): StudioVrmHairRig | null {
  const minDrop = HAIR_RIG_MIN_DROP * heightScale;

  // 1. 땋은 머리 묶기 — `<prefix>-seg-<n>` 은 이미 순서 있는 사슬이다.
  const braidSegments = new Map<string, StudioVrmHairPartInput[]>();
  const ties = new Map<string, StudioVrmHairPartInput>();
  const singles: StudioVrmHairPartInput[] = [];
  for (const input of parts) {
    const match = BRAID_SEGMENT_ID.exec(input.part.id);
    if (match !== null && input.part.role === "braid") {
      const group = braidSegments.get(match[1]) ?? [];
      group.push(input);
      braidSegments.set(match[1], group);
      continue;
    }
    if (input.part.id.endsWith("-tie")) {
      ties.set(input.part.id.slice(0, -"-tie".length), input);
      continue;
    }
    singles.push(input);
  }

  const drafts: ChainDraft[] = [];

  for (const [prefix, group] of braidSegments) {
    const ordered = [...group].sort(
      (left, right) =>
        Number(BRAID_SEGMENT_ID.exec(left.part.id)?.[2] ?? 0)
        - Number(BRAID_SEGMENT_ID.exec(right.part.id)?.[2] ?? 0),
    );
    const deepest = Math.max(...ordered.map((entry) => partDrop(entry, headWorldRest)));
    if (deepest <= minDrop) continue;
    drafts.push(draftBraidChain(prefix, ties.get(prefix), ordered, headWorldRest));
  }
  // 사슬이 만들어지지 않은 매듭은 정수리 장식이므로 머리에 그대로 둔다.
  for (const [prefix, tie] of ties) {
    if (!drafts.some((draft) => draft.id === prefix)) singles.push(tie);
  }

  for (const input of singles) {
    // 가닥은 길이와 무관하게 전부 흔들린다. 앞머리도 뿌리가 헤어라인에 고정된 채 끝만
    // 움직이므로 자연스럽다 — 실제 아바타의 앞머리도 스프링본을 단다.
    if (input.part.primitive === "tapered-capsule") {
      drafts.push(draftStrandChain(input, headWorldRest));
      continue;
    }
    // 덩어리는 **매달린 것만** 흔든다. 정수리에 얹힌 번·삐침머리가 흔들리면 두피에서 떠 보인다.
    if (!HANGING_BLOB_ROLES.has(input.part.role)) continue;
    if (partDrop(input, headWorldRest) <= minDrop) continue;
    drafts.push(draftBlobChain(input, headWorldRest));
  }

  if (drafts.length === 0) return null;

  const chains: StudioVrmHairChain[] = [];
  const joints: StudioVrmHairJoint[] = [];
  const bindings = new Map<string, StudioVrmHairBinding>();

  for (const draft of drafts) {
    // 0.10 m 안팎의 삐침머리는 거의 굳게, 0.45 m 롱헤어는 느슨하게.
    const slack = meshClamp((draft.length - 0.08 * heightScale) / (0.32 * heightScale), 0, 1);
    const chain: StudioVrmHairChain = {
      id: draft.id,
      joints: draft.joints,
      jointOffset: joints.length,
      stiffness: 1.6 - 0.9 * slack,
      gravityPower: 0.06 + 0.14 * slack,
      dragForce: 0.72 - 0.3 * slack,
    };
    chains.push(chain);
    joints.push(...draft.joints);
    for (const partId of draft.blend) bindings.set(partId, { kind: "blend", chain });
    for (const [partId, jointInChain] of draft.rigid) {
      bindings.set(partId, { kind: "rigid", chain, jointInChain });
    }
  }

  return { version: STUDIO_VRM_HAIR_RIG_VERSION, chains, joints, bindings };
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
