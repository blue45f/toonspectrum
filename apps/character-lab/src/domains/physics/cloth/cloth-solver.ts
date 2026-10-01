/**
 * 클로스 XPBD 스텝(character-physics.md §4.2). 가속도 단위(m/s²) Verlet, 서브스텝당 제약 반복 최대 4회,
 * 핀 입자는 pinWorld로 고정, 캡슐 투영 후 거리 재적용·최종 투영. 커널은 `+ - * / sqrt fround`만.
 */
import { projectParticleOutOfCapsules } from "../collision/capsule";
import { windGustFactor } from "../core/noise";
import { f32Length3 } from "../core/vec";

import type { ClothState, CompiledCloth } from "./cloth-model";
import type { CapsuleSet, Vec3, WindInput } from "../../../contracts";

const F = Math.fround;

/** 클로스 제약 반복 상한(character-physics.md §4.2) */
export const CLOTH_MAX_ITERATIONS = 4;

export interface ClothStepInput {
  readonly dt: number;
  readonly substeps: number;
  /** 제약 반복(1..4, 기본 4) */
  readonly iterations?: number;
  /** 중력 가속도(m/s², 기본 [0, -9.81, 0]) */
  readonly gravity?: Vec3;
  /** 속도 감쇠 0..1(기본 0.05) */
  readonly drag?: number;
  /** 핀별 월드 위치 xyz(model.pin 순서). 없으면 rest 유지 */
  readonly pinWorld?: Float32Array;
  readonly capsules?: CapsuleSet | null;
  readonly wind?: WindInput | null;
  /** 입자 충돌 반경(기본 0.01) */
  readonly particleRadius?: number;
}

export interface ClothStepStats {
  readonly maxDelta: number;
  readonly maxPenetration: number;
}

export interface ClothScratch {
  lambdaEdge: Float32Array;
  lambdaBend: Float32Array;
  startPos: Float32Array;
}

export function createClothScratch(compiled: CompiledCloth): ClothScratch {
  return {
    lambdaEdge: new Float32Array(compiled.model.edge.length / 2),
    lambdaBend: new Float32Array(compiled.model.bendPair.length / 2),
    startPos: new Float32Array(compiled.model.particleCount * 3),
  };
}

function solvePairs(pos: Float32Array, invMass: Float32Array, pairs: Uint32Array, rest: Float32Array, alphaTilde: number, lambda: Float32Array): void {
  const count = pairs.length / 2;
  for (let k = 0; k < count; k += 1) {
    const a = pairs[k * 2];
    const b = pairs[k * 2 + 1];
    const wa = invMass[a];
    const wb = invMass[b];
    const wSum = F(wa + wb);
    if (wSum === 0) continue;
    const ax = a * 3;
    const bx = b * 3;
    const dx = F(pos[bx] - pos[ax]);
    const dy = F(pos[bx + 1] - pos[ax + 1]);
    const dz = F(pos[bx + 2] - pos[ax + 2]);
    const len = f32Length3(dx, dy, dz);
    if (len === 0) continue;
    const c = F(len - rest[k]);
    const deltaLambda = F(F(F(-c) - F(alphaTilde * lambda[k])) / F(wSum + alphaTilde));
    lambda[k] = F(lambda[k] + deltaLambda);
    const nx = F(dx / len);
    const ny = F(dy / len);
    const nz = F(dz / len);
    const sa = F(deltaLambda * wa);
    const sb = F(deltaLambda * wb);
    pos[ax] = F(pos[ax] - F(nx * sa));
    pos[ax + 1] = F(pos[ax + 1] - F(ny * sa));
    pos[ax + 2] = F(pos[ax + 2] - F(nz * sa));
    pos[bx] = F(pos[bx] + F(nx * sb));
    pos[bx + 1] = F(pos[bx + 1] + F(ny * sb));
    pos[bx + 2] = F(pos[bx + 2] + F(nz * sb));
  }
}

function applyPins(model: CompiledCloth["model"], pos: Float32Array, prev: Float32Array, pinWorld: Float32Array | undefined, rest: Float32Array): void {
  for (let k = 0; k < model.pin.length; k += 1) {
    const p = model.pin[k] * 3;
    const src = pinWorld ?? rest;
    const o = pinWorld ? k * 3 : p;
    pos[p] = src[o];
    pos[p + 1] = src[o + 1];
    pos[p + 2] = src[o + 2];
    prev[p] = pos[p];
    prev[p + 1] = pos[p + 1];
    prev[p + 2] = pos[p + 2];
  }
}

export function stepClothInto(compiled: CompiledCloth, state: ClothState, input: ClothStepInput, out: { pos: Float32Array; prev: Float32Array }, scratch: ClothScratch): ClothStepStats {
  const { model } = compiled;
  const substeps = Math.max(1, Math.floor(input.substeps));
  const iterations = Math.min(CLOTH_MAX_ITERATIONS, Math.max(1, Math.floor(input.iterations ?? CLOTH_MAX_ITERATIONS)));
  const dt = F(input.dt);
  const dtSq = F(dt * dt);
  const gravity = input.gravity ?? [0, -9.81, 0];
  const drag = F(1 - (input.drag ?? 0.05));
  const radius = input.particleRadius ?? 0.01;
  const capsules = input.capsules ?? null;
  const wind = input.wind ?? null;
  const pos = out.pos;
  const prev = out.prev;
  if (pos !== state.pos) pos.set(state.pos);
  if (prev !== state.prev) prev.set(state.prev);
  scratch.startPos.set(pos);
  const edgeAlpha = F(compiled.distanceCompliance / dtSq);
  const bendAlpha = F(compiled.bendCompliance / dtSq);
  let maxPenetration = 0;

  for (let s = 0; s < substeps; s += 1) {
    const t = F((s + 1) / substeps);
    scratch.lambdaEdge.fill(0);
    scratch.lambdaBend.fill(0);
    const timeSeconds = F(F(state.stepIndex * substeps + s) * dt);
    let wx = 0;
    let wy = 0;
    let wz = 0;
    if (wind) {
      const k = F(wind.strength * windGustFactor(wind.seed, timeSeconds));
      wx = F(wind.dir[0] * k);
      wy = F(wind.dir[1] * k);
      wz = F(wind.dir[2] * k);
    }
    const ax = F(F(gravity[0] + wx) * dtSq);
    const ay = F(F(gravity[1] + wy) * dtSq);
    const az = F(F(gravity[2] + wz) * dtSq);
    for (let i = 0; i < model.particleCount; i += 1) {
      if (model.invMass[i] === 0) continue;
      const o = i * 3;
      const px = pos[o];
      const py = pos[o + 1];
      const pz = pos[o + 2];
      const vx = F(F(px - prev[o]) * drag);
      const vy = F(F(py - prev[o + 1]) * drag);
      const vz = F(F(pz - prev[o + 2]) * drag);
      prev[o] = px;
      prev[o + 1] = py;
      prev[o + 2] = pz;
      pos[o] = F(F(px + vx) + ax);
      pos[o + 1] = F(F(py + vy) + ay);
      pos[o + 2] = F(F(pz + vz) + az);
    }
    applyPins(model, pos, prev, input.pinWorld, compiled.restPositions);
    for (let it = 0; it < iterations; it += 1) {
      solvePairs(pos, model.invMass, model.edge, model.edgeRest, edgeAlpha, scratch.lambdaEdge);
      solvePairs(pos, model.invMass, model.bendPair, model.bendRest, bendAlpha, scratch.lambdaBend);
    }
    if (capsules && capsules.count > 0) {
      for (let i = 0; i < model.particleCount; i += 1) {
        if (model.invMass[i] === 0) continue;
        const pen = projectParticleOutOfCapsules(pos, i, capsules, t, radius);
        if (pen > maxPenetration) maxPenetration = pen;
      }
      solvePairs(pos, model.invMass, model.edge, model.edgeRest, edgeAlpha, scratch.lambdaEdge);
      for (let i = 0; i < model.particleCount; i += 1) {
        if (model.invMass[i] === 0) continue;
        projectParticleOutOfCapsules(pos, i, capsules, t, radius);
      }
    }
  }
  let maxDelta = 0;
  for (let i = 0; i < model.particleCount; i += 1) {
    const o = i * 3;
    const d = f32Length3(F(pos[o] - scratch.startPos[o]), F(pos[o + 1] - scratch.startPos[o + 1]), F(pos[o + 2] - scratch.startPos[o + 2]));
    if (d > maxDelta) maxDelta = d;
  }
  return { maxDelta, maxPenetration };
}

export function stepCloth(compiled: CompiledCloth, state: ClothState, input: ClothStepInput, scratch?: ClothScratch): ClothState {
  const out = { pos: new Float32Array(state.pos.length), prev: new Float32Array(state.prev.length) };
  stepClothInto(compiled, state, input, out, scratch ?? createClothScratch(compiled));
  return { pos: out.pos, prev: out.prev, stepIndex: state.stepIndex + 1 };
}

/** 거리(구조·전단) 제약 최대 오차(검증용) */
export function maxClothEdgeError(model: CompiledCloth["model"], pos: Float32Array): number {
  let worst = 0;
  const count = model.edge.length / 2;
  for (let k = 0; k < count; k += 1) {
    const a = model.edge[k * 2] * 3;
    const b = model.edge[k * 2 + 1] * 3;
    const dx = pos[b] - pos[a];
    const dy = pos[b + 1] - pos[a + 1];
    const dz = pos[b + 2] - pos[a + 2];
    const err = Math.abs(Math.sqrt(dx * dx + dy * dy + dz * dz) - model.edgeRest[k]);
    if (err > worst) worst = err;
  }
  return worst;
}
