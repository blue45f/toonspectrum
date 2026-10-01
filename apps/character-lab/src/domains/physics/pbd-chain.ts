/**
 * 결정적 XPBD 체인 솔버 파사드(스펙 §5.4 `createPbdChainSolver`).
 * ChainAnchor·CapsuleCollider(mesh-data 계약)를 compile해 본 월드 변환 갱신·스텝·settle·영수증을 제공한다.
 * 실패(예산 초과·정합성)는 LabFailure로 돌려주고 무음 축소하지 않는다.
 */
import { SETTLE_DEFAULTS, failVisible } from "../../contracts";

import { backSolveChainRotations } from "./chain/back-solve";
import { chainInputsFromAnchors, compileChainModel, createChainState, readChainSlice } from "./chain/chain-model";
import { settleChains } from "./chain/chain-settle";
import { createChainScratch, stepChainsInto } from "./chain/chain-solver";
import { commitCapsuleSet, createCapsuleSet, resetCapsuleHistory, writeCapsule } from "./collision/capsule";
import { createPhysicsReceipt, stateHashSync } from "./core/receipt";
import { normalizeQuat, rotateVec3 } from "./core/vec";

import type { ChainBoneRotation } from "./chain/back-solve";
import type { CompiledChains } from "./chain/chain-model";
import type { ChainScratch, ChainStepStats } from "./chain/chain-solver";
import type { MutableCapsuleSet } from "./collision/capsule";
import type { CapsuleCollider, ChainAnchor, ChainState, LabFailure, PhysicsReceipt, Quat, SettleReceipt, Vec3, WindInput } from "../../contracts";

export interface PbdChainSolverOptions {
  /** 서브스텝 dt(초). 기본 SETTLE_DEFAULTS.dtSeconds = 1/120 */
  readonly dt?: number;
  /** 서브스텝 수. 기본 2 */
  readonly substeps?: number;
  /** 거리 제약 반복. 기본 2 */
  readonly iterations?: number;
  readonly wind?: WindInput | null;
}

export interface BoneWorldTransform {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export interface PbdChainSolver {
  readonly compiled: CompiledChains;
  readonly dt: number;
  readonly substeps: number;
  /** 체인 루트·충돌 캡슐 본의 월드 변환 갱신(스텝 전 호출) */
  setBoneWorld(bone: string, position: Vec3, rotation: Quat): void;
  setWind(wind: WindInput | null): void;
  /** substeps × dt 만큼 진행 */
  step(dtSeconds?: number, substeps?: number): ChainStepStats;
  settle(maxSteps?: number, velocityEpsilon?: number): SettleReceipt;
  readChainPositions(chainId: string): Float32Array;
  /** 전체 입자 위치(복사본) */
  positions(): Float32Array;
  state(): ChainState;
  /** 체인 보조 본 회전(루트→말단) 역산 */
  boneRotations(chainId: string): ChainBoneRotation[];
  reset(): void;
  /** 동기 상태 해시(fnv1a64) */
  stateHash(): string;
  receipt(poseHash: string): Promise<PhysicsReceipt>;
  /** 월드 변환이 아직 없어 비활성인 충돌 캡슐 본 */
  pendingColliderBones(): readonly string[];
}

export type CreatePbdChainSolverResult = { readonly ok: true; readonly solver: PbdChainSolver } | { readonly ok: false; readonly failure: LabFailure };

interface ColliderSlot {
  readonly collider: CapsuleCollider;
  active: boolean;
  head: Vec3;
  tail: Vec3;
  prevHead: Vec3;
  prevTail: Vec3;
}

function sortColliders(colliders: readonly CapsuleCollider[]): CapsuleCollider[] {
  return colliders
    .map((collider, index) => ({ collider, index }))
    .sort((a, b) => (a.collider.bone < b.collider.bone ? -1 : a.collider.bone > b.collider.bone ? 1 : a.index - b.index))
    .map((entry) => entry.collider);
}

export function createPbdChainSolver(chains: readonly ChainAnchor[], colliders: readonly CapsuleCollider[], options: PbdChainSolverOptions = {}, now?: number): CreatePbdChainSolverResult {
  const compiledResult = compileChainModel(chainInputsFromAnchors(chains), now);
  if (!compiledResult.ok) return compiledResult;
  const compiled = compiledResult.compiled;
  const dt = options.dt ?? SETTLE_DEFAULTS.dtSeconds;
  const substeps = options.substeps ?? SETTLE_DEFAULTS.substeps;
  const iterations = options.iterations ?? 2;
  if (!(dt > 0) || !Number.isFinite(dt)) {
    return { ok: false, failure: failVisible("chain-invalid", `dt(${dt})는 양수여야 합니다.`, undefined, now) };
  }
  for (const collider of colliders) {
    if (!(collider.radius > 0) || !Number.isFinite(collider.radius)) {
      return { ok: false, failure: failVisible("chain-invalid", `캡슐 "${collider.bone}"의 반경(${collider.radius})은 양수여야 합니다.`, undefined, now) };
    }
  }
  const slots: ColliderSlot[] = sortColliders(colliders).map((collider) => ({
    collider,
    active: false,
    head: collider.a,
    tail: collider.b,
    prevHead: collider.a,
    prevTail: collider.b,
  }));
  const boneWorld = new Map<string, BoneWorldTransform>();
  let wind: WindInput | null = options.wind ?? null;
  let state = createChainState(compiled);
  const scratch: ChainScratch = createChainScratch(compiled);
  const rootPositions = new Float32Array(compiled.model.chainCount * 3);
  const rootRotations = new Float32Array(compiled.rootRestRotations);
  const chainIndexById = new Map<string, number>();
  compiled.chainIds.forEach((id, index) => chainIndexById.set(id, index));
  let capsuleSet: MutableCapsuleSet | null = null;
  let capsuleKey = "";

  const refreshRoots = (): void => {
    for (let c = 0; c < compiled.model.chainCount; c += 1) {
      const bone = compiled.rootBones[c] ?? "";
      const world = boneWorld.get(bone);
      const r = compiled.model.chainOffset[c] * 3;
      if (world) {
        rootPositions[c * 3] = world.position[0];
        rootPositions[c * 3 + 1] = world.position[1];
        rootPositions[c * 3 + 2] = world.position[2];
        const q = normalizeQuat(world.rotation);
        rootRotations[c * 4] = q[0];
        rootRotations[c * 4 + 1] = q[1];
        rootRotations[c * 4 + 2] = q[2];
        rootRotations[c * 4 + 3] = q[3];
      } else {
        rootPositions[c * 3] = compiled.restPositions[r];
        rootPositions[c * 3 + 1] = compiled.restPositions[r + 1];
        rootPositions[c * 3 + 2] = compiled.restPositions[r + 2];
        rootRotations[c * 4] = compiled.rootRestRotations[c * 4];
        rootRotations[c * 4 + 1] = compiled.rootRestRotations[c * 4 + 1];
        rootRotations[c * 4 + 2] = compiled.rootRestRotations[c * 4 + 2];
        rootRotations[c * 4 + 3] = compiled.rootRestRotations[c * 4 + 3];
      }
    }
  };

  /** 활성 캡슐만 모은 CapsuleSet(활성 집합이 바뀔 때만 재할당) */
  const activeCapsules = (): MutableCapsuleSet | null => {
    const active = slots.filter((slot) => slot.active);
    if (active.length === 0) return null;
    const key = active.map((slot) => slot.collider.bone).join("|");
    if (!capsuleSet || capsuleKey !== key || capsuleSet.count !== active.length) {
      capsuleSet = createCapsuleSet(active.length);
      capsuleKey = key;
      active.forEach((slot, i) => {
        writeCapsule(capsuleSet as MutableCapsuleSet, i, slot.prevHead, slot.prevTail, slot.collider.radius);
      });
      resetCapsuleHistory(capsuleSet);
    }
    const set = capsuleSet;
    active.forEach((slot, i) => writeCapsule(set, i, slot.head, slot.tail, slot.collider.radius));
    return set;
  };

  const commitCapsules = (): void => {
    for (const slot of slots) {
      slot.prevHead = slot.head;
      slot.prevTail = slot.tail;
    }
    if (capsuleSet) commitCapsuleSet(capsuleSet);
  };

  const runStep = (stepDt: number, stepSubsteps: number): ChainStepStats => {
    refreshRoots();
    const capsules = activeCapsules();
    const stats = stepChainsInto(compiled, state, { dt: stepDt, substeps: stepSubsteps, iterations, rootPositions, rootRotations, capsules, wind }, { pos: state.pos, prev: state.prev }, scratch);
    state = { pos: state.pos, prev: state.prev, stepIndex: state.stepIndex + 1 };
    commitCapsules();
    return stats;
  };

  const solver: PbdChainSolver = {
    compiled,
    dt,
    substeps,
    setBoneWorld(bone, position, rotation) {
      boneWorld.set(bone, { position, rotation });
      for (const slot of slots) {
        if (slot.collider.bone !== bone) continue;
        const q = normalizeQuat(rotation);
        const a = rotateVec3(q, slot.collider.a);
        const b = rotateVec3(q, slot.collider.b);
        const head: Vec3 = [position[0] + a[0], position[1] + a[1], position[2] + a[2]];
        const tail: Vec3 = [position[0] + b[0], position[1] + b[1], position[2] + b[2]];
        if (!slot.active) {
          slot.prevHead = head;
          slot.prevTail = tail;
          slot.active = true;
        }
        slot.head = head;
        slot.tail = tail;
      }
    },
    setWind(next) {
      wind = next;
    },
    step(stepDt = dt, stepSubsteps = substeps) {
      return runStep(stepDt, stepSubsteps);
    },
    settle(maxSteps = SETTLE_DEFAULTS.defaultSteps, velocityEpsilon = SETTLE_DEFAULTS.velocityEpsilon) {
      refreshRoots();
      const capsules = activeCapsules();
      // settle 동안 캡슐은 현재 위치에 고정(prev = current)
      if (capsules) resetCapsuleHistory(capsules);
      commitCapsules();
      const result = settleChains(compiled, state, { dt, substeps, iterations, rootPositions, rootRotations, capsules, wind }, { maxSteps, velocityEpsilon }, scratch);
      state = result.state;
      return result.receipt;
    },
    readChainPositions(chainId) {
      const index = chainIndexById.get(chainId);
      if (index === undefined) throw new Error(`알 수 없는 체인 id입니다: ${chainId}`);
      return readChainSlice(compiled, state, index);
    },
    positions() {
      return new Float32Array(state.pos);
    },
    state() {
      return { pos: new Float32Array(state.pos), prev: new Float32Array(state.prev), stepIndex: state.stepIndex };
    },
    boneRotations(chainId) {
      const index = chainIndexById.get(chainId);
      if (index === undefined) throw new Error(`알 수 없는 체인 id입니다: ${chainId}`);
      const parents = new Float32Array(compiled.model.chainCount * 4);
      for (let c = 0; c < compiled.model.chainCount; c += 1) {
        const bone = compiled.rootBones[c] ?? "";
        const world = boneWorld.get(bone);
        const q = world ? normalizeQuat(world.rotation) : [0, 0, 0, 1];
        parents[c * 4] = q[0];
        parents[c * 4 + 1] = q[1];
        parents[c * 4 + 2] = q[2];
        parents[c * 4 + 3] = q[3];
      }
      return backSolveChainRotations(compiled, state, index, { rootParentRotations: parents });
    },
    reset() {
      state = createChainState(compiled);
      for (const slot of slots) {
        slot.prevHead = slot.head;
        slot.prevTail = slot.tail;
      }
      if (capsuleSet) resetCapsuleHistory(capsuleSet);
    },
    stateHash() {
      return stateHashSync(state.pos);
    },
    receipt(poseHash) {
      return createPhysicsReceipt({
        providerId: "builtin-pbd",
        determinismScope: "cross-engine-f32",
        modelHash: compiled.model.modelHash,
        poseHash,
        steps: state.stepIndex,
        dt,
        positions: state.pos,
      });
    },
    pendingColliderBones() {
      return slots.filter((slot) => !slot.active).map((slot) => slot.collider.bone);
    },
  };
  return { ok: true, solver };
}
