/**
 * 물리 provider 포트. 자체 결정적 PBD(1급)·Rapier(선택)·Havok(미설치 사유 표시).
 * 무음 대체 금지: 요청한 provider 하나만 시도하고 실패를 `unavailable`로 노출한다.
 */
import type { CapsuleCollider, ChainAnchor } from "./mesh-data";
import type { Quat, Vec3 } from "./pose";

export const PHYSICS_PROVIDER_IDS = ["builtin-pbd", "rapier", "havok"] as const;
export type PhysicsProviderId = (typeof PHYSICS_PROVIDER_IDS)[number];

export const PHYSICS_PROVIDER_LABELS_KO: Readonly<Record<PhysicsProviderId, string>> = {
  "builtin-pbd": "내장 PBD(결정적)",
  rapier: "Rapier 0.19.3",
  havok: "Havok(미설치)",
};

export type PhysicsStatus =
  | {
      readonly id: PhysicsProviderId;
      readonly status: "active";
      readonly deterministic: boolean;
      readonly versionLabel: string;
    }
  | {
      readonly id: PhysicsProviderId;
      readonly status: "unavailable";
      readonly reasonKo: string;
    };

export interface SettleReceipt {
  readonly steps: number;
  /** velocityEpsilon 아래로 수렴했으면 true, 상한 도달이면 false */
  readonly settled: boolean;
  readonly maxVelocity: number;
}

export interface PhysicsProvider {
  readonly id: PhysicsProviderId;
  init(): Promise<PhysicsStatus>;
  setChains(chains: readonly ChainAnchor[], colliders: readonly CapsuleCollider[]): void;
  /** 체인 루트·충돌 캡슐 본의 월드 변환을 갱신한다(스텝 전 호출). */
  setBoneWorld(boneName: string, position: Vec3, rotation: Quat): void;
  step(dtSeconds: number, substeps: number): void;
  settle(maxSteps: number, velocityEpsilon: number): SettleReceipt;
  /** 체인 입자 위치(xyz × 입자 수). 결정성 영수증 해시 대상. */
  readChainPositions(chainId: string): Float32Array;
  reset(): void;
  dispose(): void;
}

export type PhysicsProviderFactory = (id: PhysicsProviderId) => Promise<PhysicsProvider>;

/** settle 기본값(character-physics.md §4.5) */
export const SETTLE_DEFAULTS = Object.freeze({
  dtSeconds: 1 / 120,
  substeps: 2,
  defaultSteps: 120,
  maxSteps: 600,
  velocityEpsilon: 1e-5,
});

const PROVIDER_SET: ReadonlySet<string> = new Set(PHYSICS_PROVIDER_IDS);

export function isPhysicsProviderId(value: string): value is PhysicsProviderId {
  return PROVIDER_SET.has(value);
}
