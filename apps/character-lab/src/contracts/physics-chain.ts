/**
 * 결정적 체인·클로스 솔버 자료구조 계약(character-physics.md §4.1·§4.3).
 *
 * SoA Float32Array로 고정해 CPU 커널과 WGSL compute 커널이 같은 레이아웃을 쓴다.
 * 런타임 커널은 `+ - * / Math.sqrt Math.fround`만 쓰고(`Math.hypot/sin/cos/pow`는 compile 단계만),
 * 입자·체인·제약·캡슐 순서는 compile 시 정렬 고정한다.
 */
import type { PhysicsProviderId } from "./physics";
import type { Vec3 } from "./pose";

export const DETERMINISM_SCOPES = ["cross-engine-f32", "same-device-f32"] as const;
export type DeterminismScope = (typeof DETERMINISM_SCOPES)[number];

export interface ChainParams {
  /** rest 방향 복원력(VRMC_springBone stiffness) */
  readonly stiffness: number;
  /** 속도 감쇠(VRMC_springBone dragForce) */
  readonly dragForce: number;
  readonly gravityPower: number;
  readonly gravityDir: Vec3;
  /** (i, i+2) 굽힘 제약 compliance */
  readonly bendCompliance: number;
  readonly distanceCompliance: number;
  readonly windScale: number;
}

export interface ChainJointDef {
  readonly bone: string;
  /** 입자 충돌 반경(m), 없으면 체인 기본 */
  readonly hitRadius?: number;
}

export interface ChainDef {
  readonly id: string;
  readonly rootBone: string;
  readonly joints: readonly ChainJointDef[];
  readonly params: ChainParams;
}

/** 역할별 기본 파라미터(character-physics.md §4.7) */
export const CHAIN_PARAM_DEFAULTS: Readonly<Record<"hair" | "skirt" | "ribbon" | "jiggle", ChainParams>> = {
  hair: {
    stiffness: 1.0,
    dragForce: 0.5,
    gravityPower: 0.05,
    gravityDir: [0, -1, 0],
    bendCompliance: 1e-4,
    distanceCompliance: 0,
    windScale: 1,
  },
  skirt: {
    stiffness: 0.6,
    dragForce: 0.4,
    gravityPower: 0.15,
    gravityDir: [0, -1, 0],
    bendCompliance: 1e-5,
    distanceCompliance: 0,
    windScale: 1,
  },
  ribbon: {
    stiffness: 0.4,
    dragForce: 0.3,
    gravityPower: 0.1,
    gravityDir: [0, -1, 0],
    bendCompliance: 5e-4,
    distanceCompliance: 0,
    windScale: 1,
  },
  jiggle: {
    stiffness: 2.0,
    dragForce: 0.7,
    gravityPower: 0,
    gravityDir: [0, -1, 0],
    bendCompliance: 0,
    distanceCompliance: 0,
    windScale: 0,
  },
};

export const CHAIN_HIT_RADIUS_DEFAULTS: Readonly<Record<"hair" | "skirt" | "ribbon" | "jiggle", number>> = {
  hair: 0.02,
  skirt: 0.01,
  ribbon: 0.015,
  jiggle: 0.03,
};

/** 체인당 paramsPerChain 레이아웃(float 수) */
export const CHAIN_PARAMS_STRIDE = 9;

/** compile 결과. 모든 배열은 입자(particle) 또는 체인(chain) 인덱스 기준 SoA. */
export interface ChainModel {
  readonly particleCount: number;
  readonly chainCount: number;
  /** 체인별 첫 입자 인덱스 */
  readonly chainOffset: Uint32Array;
  /** 체인별 입자 수 */
  readonly chainLength: Uint32Array;
  /** 입자별 역질량(루트 0) */
  readonly invMass: Float32Array;
  /** 입자별 부모와의 rest 거리(루트 0) */
  readonly restLength: Float32Array;
  /** 입자별 (i-2, i) 굽힘 rest 거리(앞 두 입자 0) */
  readonly bendRestLength: Float32Array;
  /** 입자별 부모 로컬 rest 방향 xyz */
  readonly restDirLocal: Float32Array;
  readonly hitRadius: Float32Array;
  /** 체인별 CHAIN_PARAMS_STRIDE개: stiffness, dragForce, gravityPower, gx, gy, gz, bendCompliance, distanceCompliance, windScale */
  readonly paramsPerChain: Float32Array;
  /** compile 입력의 결정적 해시(fnv1a64 hex) */
  readonly modelHash: string;
}

export interface ChainState {
  /** 입자 위치 xyz */
  readonly pos: Float32Array;
  /** 직전 스텝 위치 xyz(Verlet) */
  readonly prev: Float32Array;
  readonly stepIndex: number;
}

export interface CapsuleSet {
  readonly count: number;
  readonly head: Float32Array;
  readonly tail: Float32Array;
  readonly radius: Float32Array;
  readonly prevHead: Float32Array;
  readonly prevTail: Float32Array;
}

export interface ClothModel {
  readonly particleCount: number;
  readonly invMass: Float32Array;
  /** 거리 제약 (a, b) 쌍 */
  readonly edge: Uint32Array;
  readonly edgeRest: Float32Array;
  /** 굽힘 제약 (a, b) 쌍 */
  readonly bendPair: Uint32Array;
  readonly bendRest: Float32Array;
  /** 핀 입자 인덱스 */
  readonly pin: Uint32Array;
  /** 핀별 본 인덱스 */
  readonly pinBone: Uint16Array;
  /** 핀별 본 로컬 오프셋 xyz */
  readonly pinOffsetLocal: Float32Array;
  /** 삼각형 인덱스 */
  readonly tri: Uint32Array;
  readonly modelHash: string;
}

export interface WindInput {
  readonly dir: Vec3;
  readonly strength: number;
  readonly seed: number;
}

/** 캡처·export 메타에 첨부하는 결정성 영수증(character-physics.md §4.3) */
export interface PhysicsReceipt {
  readonly providerId: PhysicsProviderId;
  readonly determinismScope: DeterminismScope;
  readonly modelHash: string;
  readonly poseHash: string;
  readonly steps: number;
  readonly dt: number;
  /** sha256(pos bytes) hex */
  readonly stateHash: string;
}

/** 성능 예산(character-physics.md §4.8). 초과는 compile 단계 `budget-exceeded` 실패. */
export const PHYSICS_BUDGET = Object.freeze({
  maxChains: 64,
  maxParticlesPerChain: 16,
  maxChainParticles: 1024,
  maxClothStrips: 4,
  maxClothParticles: 512 * 4,
  maxCapsules: 24,
  settleDefaultSteps: 120,
  settleMaxSteps: 600,
  rapierMaxBodies: 32,
  rapierMaxSteps: 240,
});
