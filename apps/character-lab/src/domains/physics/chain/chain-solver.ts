/**
 * 결정적 XPBD 체인 스텝(character-physics.md §4.2).
 *
 * 서브스텝마다: Verlet 예측(dragForce 감쇠, rest 방향 복원 stiffness, 중력, 바람)
 * → XPBD 굽힘(i-2, i) → XPBD 거리(i-1, i) 반복 → FTL 정확 길이 패스(distanceCompliance 0일 때,
 * Müller·Kim·Chentanez 2012 "Fast Simulation of Inextensible Hair and Fur" 개념)
 * → 캡슐 투영 ↔ 거리 재적용 4회 → 최종 캡슐 투영(관통 0).
 *
 * 입자 순서는 compile 시 고정이며 커널은 `+ - * / sqrt fround`만 쓴다. λ는 서브스텝마다 0으로 초기화한다.
 */
import { CHAIN_PARAMS_STRIDE } from "../../../contracts";
import { projectParticleOutOfCapsules } from "../collision/capsule";
import { windGustFactor } from "../core/noise";
import { f32Length3, f32Lerp, rotateVec3ByQuat } from "../core/vec";

import type { CompiledChains } from "./chain-model";
import type { CapsuleSet, ChainState, WindInput } from "../../../contracts";

const F = Math.fround;

/** 캡슐 투영 ↔ 거리 제약 재적용 최대 횟수. 라운드에서 관통이 0이면 조기 종료한다(설계 기본 4 이상 수렴 보장용 상한). */
export const COLLISION_ROUNDS = 12;

export interface ChainStepInput {
  /** 서브스텝 dt(초). 기본 1/120 */
  readonly dt: number;
  /** 서브스텝 수. 기본 2 */
  readonly substeps: number;
  /** 거리 제약 Gauss-Seidel 반복(기본 2) */
  readonly iterations?: number;
  /** 체인별 루트 월드 위치 xyz(현재 프레임 목표). 없으면 현재 위치 유지 */
  readonly rootPositions?: Float32Array;
  /** 체인별 루트 월드 회전 xyzw(현재). 없으면 rest 회전 */
  readonly rootRotations?: Float32Array;
  readonly capsules?: CapsuleSet | null;
  readonly wind?: WindInput | null;
}

export interface ChainStepStats {
  /** 이번 스텝의 입자 최대 변위(m) */
  readonly maxDelta: number;
  /** 최대 캡슐 관통 깊이(최종 투영 전) */
  readonly maxPenetration: number;
}

/** 솔버 스크래치(λ 누적, 루트 시작 위치). 할당을 피하려고 재사용한다. */
export interface ChainScratch {
  lambdaDist: Float32Array;
  lambdaBend: Float32Array;
  rootStart: Float32Array;
  restDirWorld: Float32Array;
  startPos: Float32Array;
}

export function createChainScratch(compiled: CompiledChains): ChainScratch {
  const n = compiled.model.particleCount;
  return {
    lambdaDist: new Float32Array(n),
    lambdaBend: new Float32Array(n),
    rootStart: new Float32Array(compiled.model.chainCount * 3),
    restDirWorld: new Float32Array(n * 3),
    startPos: new Float32Array(n * 3),
  };
}

function solveDistanceXpbd(
  pos: Float32Array,
  invMass: Float32Array,
  a: number,
  b: number,
  rest: number,
  alphaTilde: number,
  lambda: Float32Array,
  lambdaIndex: number,
): void {
  const wa = invMass[a];
  const wb = invMass[b];
  const wSum = F(wa + wb);
  if (wSum === 0) return;
  const ax = a * 3;
  const bx = b * 3;
  const dx = F(pos[bx] - pos[ax]);
  const dy = F(pos[bx + 1] - pos[ax + 1]);
  const dz = F(pos[bx + 2] - pos[ax + 2]);
  const len = f32Length3(dx, dy, dz);
  if (len === 0) return;
  const c = F(len - rest);
  const deltaLambda = F(F(F(-c) - F(alphaTilde * lambda[lambdaIndex])) / F(wSum + alphaTilde));
  lambda[lambdaIndex] = F(lambda[lambdaIndex] + deltaLambda);
  const nx = F(dx / len);
  const ny = F(dy / len);
  const nz = F(dz / len);
  // a는 -n 방향, b는 +n 방향으로 deltaLambda·w 만큼
  const sa = F(deltaLambda * wa);
  const sb = F(deltaLambda * wb);
  pos[ax] = F(pos[ax] - F(nx * sa));
  pos[ax + 1] = F(pos[ax + 1] - F(ny * sa));
  pos[ax + 2] = F(pos[ax + 2] - F(nz * sa));
  pos[bx] = F(pos[bx] + F(nx * sb));
  pos[bx + 1] = F(pos[bx + 1] + F(ny * sb));
  pos[bx + 2] = F(pos[bx + 2] + F(nz * sb));
}

/** 루트→말단 FTL 패스: 자식만 움직여 길이를 정확히 맞춘다. */
function followTheLeader(pos: Float32Array, restLength: Float32Array, start: number, count: number): void {
  for (let j = 1; j < count; j += 1) {
    const a = (start + j - 1) * 3;
    const b = (start + j) * 3;
    const dx = F(pos[b] - pos[a]);
    const dy = F(pos[b + 1] - pos[a + 1]);
    const dz = F(pos[b + 2] - pos[a + 2]);
    const len = f32Length3(dx, dy, dz);
    if (len === 0) continue;
    const s = F(restLength[start + j] / len);
    pos[b] = F(pos[a] + F(dx * s));
    pos[b + 1] = F(pos[a + 1] + F(dy * s));
    pos[b + 2] = F(pos[a + 2] + F(dz * s));
  }
}

function applyDistanceSweeps(
  model: CompiledChains["model"],
  pos: Float32Array,
  scratch: ChainScratch,
  dt: number,
  iterations: number,
): void {
  const dtSq = F(dt * dt);
  for (let c = 0; c < model.chainCount; c += 1) {
    const start = model.chainOffset[c];
    const count = model.chainLength[c];
    const distCompliance = model.paramsPerChain[c * CHAIN_PARAMS_STRIDE + 7];
    const alphaTilde = F(distCompliance / dtSq);
    for (let it = 0; it < iterations; it += 1) {
      for (let j = 1; j < count; j += 1) {
        const i = start + j;
        solveDistanceXpbd(pos, model.invMass, i - 1, i, model.restLength[i], alphaTilde, scratch.lambdaDist, i);
      }
    }
    if (distCompliance === 0) followTheLeader(pos, model.restLength, start, count);
  }
}

/**
 * 한 프레임(substeps × dt)을 진행해 `out`에 새 상태를 쓴다. `out`은 `state`와 같은 객체여도 된다.
 * 순수 커널: 같은 (model, state, input)이면 같은 바이트를 낸다.
 */
export function stepChainsInto(
  compiled: CompiledChains,
  state: ChainState,
  input: ChainStepInput,
  out: { pos: Float32Array; prev: Float32Array },
  scratch: ChainScratch,
): ChainStepStats {
  const { model } = compiled;
  const substeps = Math.max(1, Math.floor(input.substeps));
  const iterations = Math.max(1, Math.floor(input.iterations ?? 2));
  const dt = F(input.dt);
  const pos = out.pos;
  const prev = out.prev;
  if (pos !== state.pos) pos.set(state.pos);
  if (prev !== state.prev) prev.set(state.prev);
  const capsules = input.capsules ?? null;
  const wind = input.wind ?? null;

  // 루트 보간 시작점(현재 루트 위치)
  for (let c = 0; c < model.chainCount; c += 1) {
    const r = model.chainOffset[c] * 3;
    scratch.rootStart[c * 3] = pos[r];
    scratch.rootStart[c * 3 + 1] = pos[r + 1];
    scratch.rootStart[c * 3 + 2] = pos[r + 2];
  }
  // 체인별 rest 방향(월드) = 루트 회전 × restDirLocal
  for (let c = 0; c < model.chainCount; c += 1) {
    const start = model.chainOffset[c];
    const count = model.chainLength[c];
    let qx = compiled.rootRestRotations[c * 4];
    let qy = compiled.rootRestRotations[c * 4 + 1];
    let qz = compiled.rootRestRotations[c * 4 + 2];
    let qw = compiled.rootRestRotations[c * 4 + 3];
    if (input.rootRotations) {
      qx = input.rootRotations[c * 4];
      qy = input.rootRotations[c * 4 + 1];
      qz = input.rootRotations[c * 4 + 2];
      qw = input.rootRotations[c * 4 + 3];
    }
    for (let j = 1; j < count; j += 1) {
      const i = (start + j) * 3;
      rotateVec3ByQuat(qx, qy, qz, qw, model.restDirLocal[i], model.restDirLocal[i + 1], model.restDirLocal[i + 2], scratch.restDirWorld, i);
    }
  }

  let maxDelta = 0;
  let maxPenetration = 0;
  const startPos = scratch.startPos;
  startPos.set(pos);

  for (let s = 0; s < substeps; s += 1) {
    const t = F((s + 1) / substeps);
    scratch.lambdaDist.fill(0);
    scratch.lambdaBend.fill(0);
    const timeSeconds = F(F(state.stepIndex * substeps + s) * dt);
    const gust = wind ? windGustFactor(wind.seed, timeSeconds) : 0;

    for (let c = 0; c < model.chainCount; c += 1) {
      const start = model.chainOffset[c];
      const count = model.chainLength[c];
      const pb = c * CHAIN_PARAMS_STRIDE;
      const stiffness = model.paramsPerChain[pb];
      const drag = F(1 - model.paramsPerChain[pb + 1]);
      const gravityPower = model.paramsPerChain[pb + 2];
      const gx = F(model.paramsPerChain[pb + 3] * gravityPower);
      const gy = F(model.paramsPerChain[pb + 4] * gravityPower);
      const gz = F(model.paramsPerChain[pb + 5] * gravityPower);
      const windScale = model.paramsPerChain[pb + 8];
      let wx = 0;
      let wy = 0;
      let wz = 0;
      if (wind && windScale !== 0) {
        const k = F(F(wind.strength * gust) * windScale);
        wx = F(wind.dir[0] * k);
        wy = F(wind.dir[1] * k);
        wz = F(wind.dir[2] * k);
      }
      // 루트: 시작→목표 보간(invMass 0)
      const r = start * 3;
      if (input.rootPositions) {
        pos[r] = f32Lerp(scratch.rootStart[c * 3], input.rootPositions[c * 3], t);
        pos[r + 1] = f32Lerp(scratch.rootStart[c * 3 + 1], input.rootPositions[c * 3 + 1], t);
        pos[r + 2] = f32Lerp(scratch.rootStart[c * 3 + 2], input.rootPositions[c * 3 + 2], t);
      }
      prev[r] = pos[r];
      prev[r + 1] = pos[r + 1];
      prev[r + 2] = pos[r + 2];
      // Verlet 예측
      for (let j = 1; j < count; j += 1) {
        const i = (start + j) * 3;
        const px = pos[i];
        const py = pos[i + 1];
        const pz = pos[i + 2];
        const vx = F(F(px - prev[i]) * drag);
        const vy = F(F(py - prev[i + 1]) * drag);
        const vz = F(F(pz - prev[i + 2]) * drag);
        const ax = F(F(F(scratch.restDirWorld[i] * stiffness) + gx) + wx);
        const ay = F(F(F(scratch.restDirWorld[i + 1] * stiffness) + gy) + wy);
        const az = F(F(F(scratch.restDirWorld[i + 2] * stiffness) + gz) + wz);
        prev[i] = px;
        prev[i + 1] = py;
        prev[i + 2] = pz;
        pos[i] = F(F(px + vx) + F(ax * dt));
        pos[i + 1] = F(F(py + vy) + F(ay * dt));
        pos[i + 2] = F(F(pz + vz) + F(az * dt));
      }
      // 굽힘(i-2, i)
      const bendCompliance = model.paramsPerChain[pb + 6];
      const bendAlpha = F(bendCompliance / F(dt * dt));
      for (let j = 2; j < count; j += 1) {
        const i = start + j;
        solveDistanceXpbd(pos, model.invMass, i - 2, i, model.bendRestLength[i], bendAlpha, scratch.lambdaBend, i);
      }
    }

    applyDistanceSweeps(model, pos, scratch, dt, iterations);

    if (capsules && capsules.count > 0) {
      // 투영 → 거리 재적용을 번갈아 관통과 길이 오차가 함께 0에 수렴하도록 한다(라운드 관통 0이면 종료)
      for (let round = 0; round < COLLISION_ROUNDS; round += 1) {
        let roundPenetration = 0;
        for (let i = 0; i < model.particleCount; i += 1) {
          if (model.invMass[i] === 0) continue;
          const pen = projectParticleOutOfCapsules(pos, i, capsules, t, model.hitRadius[i]);
          if (pen > roundPenetration) roundPenetration = pen;
        }
        if (round === 0 && roundPenetration > maxPenetration) maxPenetration = roundPenetration;
        if (roundPenetration === 0) break;
        applyDistanceSweeps(model, pos, scratch, dt, iterations);
      }
      // 최종 투영: 관통 0 보장(수렴했으면 아무것도 움직이지 않는다)
      for (let i = 0; i < model.particleCount; i += 1) {
        if (model.invMass[i] === 0) continue;
        projectParticleOutOfCapsules(pos, i, capsules, t, model.hitRadius[i]);
      }
    }
  }

  for (let i = 0; i < model.particleCount; i += 1) {
    const o = i * 3;
    const d = f32Length3(F(pos[o] - startPos[o]), F(pos[o + 1] - startPos[o + 1]), F(pos[o + 2] - startPos[o + 2]));
    if (d > maxDelta) maxDelta = d;
  }
  return { maxDelta, maxPenetration };
}

/** 새 ChainState를 돌려주는 순수 래퍼 */
export function stepChains(compiled: CompiledChains, state: ChainState, input: ChainStepInput, scratch?: ChainScratch): ChainState {
  const out = { pos: new Float32Array(state.pos.length), prev: new Float32Array(state.prev.length) };
  stepChainsInto(compiled, state, input, out, scratch ?? createChainScratch(compiled));
  return { pos: out.pos, prev: out.prev, stepIndex: state.stepIndex + 1 };
}

/** 운동 에너지 Σ ½|pos-prev|²/dt² (invMass>0 입자, 검증용) */
export function kineticEnergy(model: CompiledChains["model"], state: ChainState, dt: number): number {
  let total = 0;
  for (let i = 0; i < model.particleCount; i += 1) {
    if (model.invMass[i] === 0) continue;
    const o = i * 3;
    const vx = (state.pos[o] - state.prev[o]) / dt;
    const vy = (state.pos[o + 1] - state.prev[o + 1]) / dt;
    const vz = (state.pos[o + 2] - state.prev[o + 2]) / dt;
    total += 0.5 * (vx * vx + vy * vy + vz * vz);
  }
  return total;
}

/** 거리 제약 최대 오차 |len - rest| (검증용) */
export function maxDistanceError(model: CompiledChains["model"], pos: Float32Array): number {
  let worst = 0;
  for (let c = 0; c < model.chainCount; c += 1) {
    const start = model.chainOffset[c];
    const count = model.chainLength[c];
    for (let j = 1; j < count; j += 1) {
      const a = (start + j - 1) * 3;
      const b = (start + j) * 3;
      const dx = pos[b] - pos[a];
      const dy = pos[b + 1] - pos[a + 1];
      const dz = pos[b + 2] - pos[a + 2];
      const err = Math.abs(Math.sqrt(dx * dx + dy * dy + dz * dz) - model.restLength[start + j]);
      if (err > worst) worst = err;
    }
  }
  return worst;
}
