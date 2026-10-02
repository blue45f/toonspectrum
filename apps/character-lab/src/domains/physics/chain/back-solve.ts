/**
 * 역산 회전(character-physics.md §4.4): 시뮬 입자 위치 → 보조 본 로컬 회전.
 *
 * 본 j의 월드 회전 = quatFromUnitVectors(restDir_j(월드), simDir_j) ∘ restWorldRot_j,
 * 로컬 회전 = inverse(parentWorldRot) ∘ worldRot. 루트→말단 순서로 적용하며 순수 함수다.
 * 말단 본(자식 없음)은 부모 회전을 그대로 잇는다.
 */
import { conjugateQuat, multiplyQuat, normalizeQuat, normalizeVec3, quatFromUnitVectors, rotateVec3 } from "../core/vec";

import type { CompiledChains } from "./chain-model";
import type { ChainState, Quat, Vec3 } from "../../../contracts";

export interface ChainBoneRotation {
  readonly bone: string;
  /** 부모(이전 본 또는 루트의 부모 본) 프레임 기준 로컬 회전 */
  readonly local: Quat;
  readonly world: Quat;
}

export interface BackSolveOptions {
  /** 체인별 루트 본의 부모 월드 회전(루트의 로컬 회전 산출용). 기본 항등 */
  readonly rootParentRotations?: Float32Array;
}

/** 체인 c의 본 회전 목록(루트→말단, 길이 = 입자 수) */
export function backSolveChainRotations(compiled: CompiledChains, state: ChainState, chainIndex: number, options: BackSolveOptions = {}): ChainBoneRotation[] {
  const { model } = compiled;
  const start = model.chainOffset[chainIndex];
  const count = model.chainLength[chainIndex];
  const restRoot: Quat = normalizeQuat([
    compiled.rootRestRotations[chainIndex * 4],
    compiled.rootRestRotations[chainIndex * 4 + 1],
    compiled.rootRestRotations[chainIndex * 4 + 2],
    compiled.rootRestRotations[chainIndex * 4 + 3],
  ]);
  let parentWorld: Quat = options.rootParentRotations
    ? normalizeQuat([
        options.rootParentRotations[chainIndex * 4],
        options.rootParentRotations[chainIndex * 4 + 1],
        options.rootParentRotations[chainIndex * 4 + 2],
        options.rootParentRotations[chainIndex * 4 + 3],
      ])
    : [0, 0, 0, 1];
  const out: ChainBoneRotation[] = [];
  let lastWorld: Quat = restRoot;
  for (let j = 0; j < count; j += 1) {
    const i = start + j;
    let world: Quat;
    if (j < count - 1) {
      const a = i * 3;
      const b = (i + 1) * 3;
      const simDir = normalizeVec3([state.pos[b] - state.pos[a], state.pos[b + 1] - state.pos[a + 1], state.pos[b + 2] - state.pos[a + 2]]);
      const restLocal: Vec3 = [model.restDirLocal[b], model.restDirLocal[b + 1], model.restDirLocal[b + 2]];
      const restDirWorld = rotateVec3(restRoot, restLocal);
      const swing = quatFromUnitVectors(restDirWorld, simDir);
      world = normalizeQuat(multiplyQuat(swing, restRoot));
    } else {
      world = lastWorld;
    }
    const local = normalizeQuat(multiplyQuat(conjugateQuat(parentWorld), world));
    out.push({ bone: compiled.particleBones[i] ?? `${compiled.chainIds[chainIndex]}_${j}`, local, world });
    parentWorld = world;
    lastWorld = world;
  }
  return out;
}

/** 역산 회전으로 FK를 돌려 입자 위치를 재구성한다(검증·export용). 루트 위치는 state에서 가져온다. */
export function forwardKinematicsFromRotations(compiled: CompiledChains, state: ChainState, chainIndex: number, rotations: readonly ChainBoneRotation[]): Float32Array {
  const { model } = compiled;
  const start = model.chainOffset[chainIndex];
  const count = model.chainLength[chainIndex];
  const out = new Float32Array(count * 3);
  const r = start * 3;
  out[0] = state.pos[r];
  out[1] = state.pos[r + 1];
  out[2] = state.pos[r + 2];
  for (let j = 1; j < count; j += 1) {
    const i = start + j;
    const restOffset: Vec3 = [
      compiled.restPositions[i * 3] - compiled.restPositions[(i - 1) * 3],
      compiled.restPositions[i * 3 + 1] - compiled.restPositions[(i - 1) * 3 + 1],
      compiled.restPositions[i * 3 + 2] - compiled.restPositions[(i - 1) * 3 + 2],
    ];
    // rest 월드 회전 R0에서 본 j-1의 로컬 오프셋 = R0⁻¹·restOffset, 현재 월드 = world_{j-1}·로컬
    const restRoot: Quat = [
      compiled.rootRestRotations[chainIndex * 4],
      compiled.rootRestRotations[chainIndex * 4 + 1],
      compiled.rootRestRotations[chainIndex * 4 + 2],
      compiled.rootRestRotations[chainIndex * 4 + 3],
    ];
    const localOffset = rotateVec3(conjugateQuat(normalizeQuat(restRoot)), restOffset);
    const parentWorld = rotations[j - 1]?.world ?? [0, 0, 0, 1];
    const worldOffset = rotateVec3(parentWorld, localOffset);
    out[j * 3] = out[(j - 1) * 3] + worldOffset[0];
    out[j * 3 + 1] = out[(j - 1) * 3 + 1] + worldOffset[1];
    out[j * 3 + 2] = out[(j - 1) * 3 + 2] + worldOffset[2];
  }
  return out;
}
