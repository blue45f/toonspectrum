/**
 * 체인 compile(character-physics.md §4.1·§4.3): ChainDef + rest 위치 → SoA ChainModel.
 *
 * - 체인은 id 사전순, 입자는 루트→말단 순으로 정렬 고정(입력 순서 셔플에도 같은 모델·해시).
 * - restDirLocal은 루트 본 rest 프레임 기준 방향(rootRestRotation 기본 항등 = VRM rest 규약).
 * - 예산(PHYSICS_BUDGET) 초과·정합성 위반은 `budget-exceeded`/`chain-invalid` LabFailure로 돌려준다(무음 축소 금지).
 */
import { CHAIN_HIT_RADIUS_DEFAULTS, CHAIN_PARAMS_STRIDE, CHAIN_PARAM_DEFAULTS, PHYSICS_BUDGET, failVisible } from "../../../contracts";
import { fnv1a64Hex } from "../../../shared/hash";
import { stableStringify } from "../../../shared/stable-json";
import { conjugateQuat, normalizeQuat, normalizeVec3, rotateVec3 } from "../core/vec";

import type { ChainAnchor, ChainDef, ChainModel, ChainParams, ChainState, LabFailure, Quat, Vec3 } from "../../../contracts";

const F = Math.fround;

export interface ChainCompileInput {
  readonly def: ChainDef;
  /** joints와 같은 길이의 rest 월드(모델 공간) 위치 */
  readonly restPoints: readonly Vec3[];
  /** 루트 본의 rest 월드 회전(기본 항등) */
  readonly rootRestRotation?: Quat;
}

/** compile 결과: 계약 ChainModel + 체인 id·루트 본·rest 상태 */
export interface CompiledChains {
  readonly model: ChainModel;
  /** 체인 인덱스 → id(정렬 후) */
  readonly chainIds: readonly string[];
  readonly rootBones: readonly string[];
  /** 입자별 본 이름(정렬 후, 입자 인덱스 순) */
  readonly particleBones: readonly string[];
  /** rest 입자 위치 xyz */
  readonly restPositions: Float32Array;
  /** 체인별 루트 rest 회전 xyzw */
  readonly rootRestRotations: Float32Array;
}

export type ChainCompileResult = { readonly ok: true; readonly compiled: CompiledChains } | { readonly ok: false; readonly failure: LabFailure };

function isFiniteVec3(v: Vec3): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function validateParams(params: ChainParams): string | null {
  const numbers = [params.stiffness, params.dragForce, params.gravityPower, params.bendCompliance, params.distanceCompliance, params.windScale];
  if (!numbers.every(Number.isFinite)) return "파라미터에 NaN/무한대가 있습니다.";
  if (params.dragForce < 0 || params.dragForce > 1) return `dragForce(${params.dragForce})는 0..1이어야 합니다.`;
  if (params.bendCompliance < 0 || params.distanceCompliance < 0) return "compliance는 음수일 수 없습니다.";
  if (!isFiniteVec3(params.gravityDir)) return "gravityDir에 NaN이 있습니다.";
  return null;
}

/** ChainAnchor(mesh-data 계약) → ChainCompileInput. 역할별 기본 파라미터에 앵커 값을 덮어쓴다. */
export function chainInputFromAnchor(anchor: ChainAnchor): ChainCompileInput {
  const base = CHAIN_PARAM_DEFAULTS[anchor.role];
  const radius = Number.isFinite(anchor.radius) && anchor.radius > 0 ? anchor.radius : CHAIN_HIT_RADIUS_DEFAULTS[anchor.role];
  return {
    def: {
      id: anchor.id,
      rootBone: anchor.boneNames[0] ?? anchor.id,
      joints: anchor.boneNames.map((bone) => ({ bone, hitRadius: radius })),
      params: {
        ...base,
        stiffness: anchor.stiffness,
        dragForce: anchor.damping,
        gravityPower: anchor.gravityScale,
      },
    },
    restPoints: anchor.restPoints,
  };
}

export function chainInputsFromAnchors(anchors: readonly ChainAnchor[]): ChainCompileInput[] {
  return anchors.map(chainInputFromAnchor);
}

/** 입력을 결정적으로 정렬·검증하고 ChainModel을 만든다. */
export function compileChainModel(inputs: readonly ChainCompileInput[], now?: number): ChainCompileResult {
  const fail = (code: string, reasonKo: string): ChainCompileResult => ({ ok: false, failure: failVisible(code, reasonKo, undefined, now) });
  const sorted = [...inputs].sort((a, b) => (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0));
  if (sorted.length > PHYSICS_BUDGET.maxChains) {
    return fail("budget-exceeded", `체인 수(${sorted.length})가 예산(${PHYSICS_BUDGET.maxChains})을 넘습니다.`);
  }
  const seen = new Set<string>();
  let particleCount = 0;
  for (const input of sorted) {
    const { def, restPoints } = input;
    if (seen.has(def.id)) return fail("chain-invalid", `체인 id "${def.id}"가 중복됩니다.`);
    seen.add(def.id);
    if (def.joints.length < 2) return fail("chain-invalid", `체인 "${def.id}"의 관절 수(${def.joints.length})는 2 이상이어야 합니다.`);
    if (def.joints.length > PHYSICS_BUDGET.maxParticlesPerChain) {
      return fail("budget-exceeded", `체인 "${def.id}"의 입자 수(${def.joints.length})가 예산(${PHYSICS_BUDGET.maxParticlesPerChain})을 넘습니다.`);
    }
    if (restPoints.length !== def.joints.length) {
      return fail("chain-invalid", `체인 "${def.id}"의 restPoints 길이(${restPoints.length})가 관절 수(${def.joints.length})와 다릅니다.`);
    }
    if (!restPoints.every(isFiniteVec3)) return fail("chain-invalid", `체인 "${def.id}"의 restPoints에 NaN이 있습니다.`);
    const paramError = validateParams(def.params);
    if (paramError) return fail("chain-invalid", `체인 "${def.id}": ${paramError}`);
    for (let i = 1; i < restPoints.length; i += 1) {
      const a = restPoints[i - 1] as Vec3;
      const b = restPoints[i] as Vec3;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      if (dx * dx + dy * dy + dz * dz < 1e-12) {
        return fail("chain-invalid", `체인 "${def.id}"의 입자 ${i - 1}·${i} rest 거리가 0입니다.`);
      }
    }
    particleCount += def.joints.length;
  }
  if (particleCount > PHYSICS_BUDGET.maxChainParticles) {
    return fail("budget-exceeded", `총 입자 수(${particleCount})가 예산(${PHYSICS_BUDGET.maxChainParticles})을 넘습니다.`);
  }

  const chainCount = sorted.length;
  const chainOffset = new Uint32Array(chainCount);
  const chainLength = new Uint32Array(chainCount);
  const invMass = new Float32Array(particleCount);
  const restLength = new Float32Array(particleCount);
  const bendRestLength = new Float32Array(particleCount);
  const restDirLocal = new Float32Array(particleCount * 3);
  const hitRadius = new Float32Array(particleCount);
  const paramsPerChain = new Float32Array(chainCount * CHAIN_PARAMS_STRIDE);
  const restPositions = new Float32Array(particleCount * 3);
  const rootRestRotations = new Float32Array(chainCount * 4);
  const chainIds: string[] = [];
  const rootBones: string[] = [];
  const particleBones: string[] = [];

  let offset = 0;
  sorted.forEach((input, c) => {
    const { def, restPoints } = input;
    const rootRot = normalizeQuat(input.rootRestRotation ?? [0, 0, 0, 1]);
    const rootInv = conjugateQuat(rootRot);
    chainIds.push(def.id);
    rootBones.push(def.rootBone);
    chainOffset[c] = offset;
    chainLength[c] = def.joints.length;
    rootRestRotations[c * 4] = rootRot[0];
    rootRestRotations[c * 4 + 1] = rootRot[1];
    rootRestRotations[c * 4 + 2] = rootRot[2];
    rootRestRotations[c * 4 + 3] = rootRot[3];
    const p = def.params;
    const base = c * CHAIN_PARAMS_STRIDE;
    paramsPerChain[base] = p.stiffness;
    paramsPerChain[base + 1] = p.dragForce;
    paramsPerChain[base + 2] = p.gravityPower;
    const g = normalizeVec3(p.gravityDir);
    paramsPerChain[base + 3] = g[0];
    paramsPerChain[base + 4] = g[1];
    paramsPerChain[base + 5] = g[2];
    paramsPerChain[base + 6] = p.bendCompliance;
    paramsPerChain[base + 7] = p.distanceCompliance;
    paramsPerChain[base + 8] = p.windScale;
    const defaultRadius = CHAIN_HIT_RADIUS_DEFAULTS.hair;
    def.joints.forEach((joint, j) => {
      const i = offset + j;
      const point = restPoints[j] as Vec3;
      particleBones.push(joint.bone);
      restPositions[i * 3] = point[0];
      restPositions[i * 3 + 1] = point[1];
      restPositions[i * 3 + 2] = point[2];
      invMass[i] = j === 0 ? 0 : 1;
      hitRadius[i] = joint.hitRadius !== undefined && Number.isFinite(joint.hitRadius) && joint.hitRadius >= 0 ? joint.hitRadius : defaultRadius;
      if (j >= 1) {
        const prev = restPoints[j - 1] as Vec3;
        const dx = F(point[0] - prev[0]);
        const dy = F(point[1] - prev[1]);
        const dz = F(point[2] - prev[2]);
        restLength[i] = F(Math.sqrt(F(F(F(dx * dx) + F(dy * dy)) + F(dz * dz))));
        const dirLocal = rotateVec3(rootInv, normalizeVec3([dx, dy, dz]));
        restDirLocal[i * 3] = dirLocal[0];
        restDirLocal[i * 3 + 1] = dirLocal[1];
        restDirLocal[i * 3 + 2] = dirLocal[2];
      }
      if (j >= 2) {
        const prev2 = restPoints[j - 2] as Vec3;
        const dx = F(point[0] - prev2[0]);
        const dy = F(point[1] - prev2[1]);
        const dz = F(point[2] - prev2[2]);
        bendRestLength[i] = F(Math.sqrt(F(F(F(dx * dx) + F(dy * dy)) + F(dz * dz))));
      }
    });
    offset += def.joints.length;
  });

  const modelHash = fnv1a64Hex(
    stableStringify(
      sorted.map((input) => ({
        def: input.def,
        restPoints: input.restPoints.map((v) => [F(v[0]), F(v[1]), F(v[2])]),
        rootRestRotation: input.rootRestRotation ?? [0, 0, 0, 1],
      })),
    ),
  );

  return {
    ok: true,
    compiled: {
      model: {
        particleCount,
        chainCount,
        chainOffset,
        chainLength,
        invMass,
        restLength,
        bendRestLength,
        restDirLocal,
        hitRadius,
        paramsPerChain,
        modelHash,
      },
      chainIds,
      rootBones,
      particleBones,
      restPositions,
      rootRestRotations,
    },
  };
}

/** rest 위치로 초기화한 상태(pos = prev = rest, stepIndex 0) */
export function createChainState(compiled: CompiledChains): ChainState {
  return {
    pos: new Float32Array(compiled.restPositions),
    prev: new Float32Array(compiled.restPositions),
    stepIndex: 0,
  };
}

/** 체인 c의 입자 위치 xyz × n 복사본 */
export function readChainSlice(compiled: CompiledChains, state: ChainState, chainIndex: number): Float32Array {
  const start = compiled.model.chainOffset[chainIndex] * 3;
  const length = compiled.model.chainLength[chainIndex] * 3;
  return state.pos.slice(start, start + length);
}
