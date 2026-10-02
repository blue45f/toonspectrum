/**
 * builtin-pbd provider(1급 엔진): 자체 결정적 XPBD 체인 솔버를 PhysicsProvider 포트에 맞춘다.
 * setChains 실패(예산 초과 등)는 PhysicsProviderError(LabFailure 포함)로 던진다(무음 축소 금지).
 */
import { SETTLE_DEFAULTS, failVisible } from "../../contracts";

import { createPbdChainSolver } from "./pbd-chain";

import type { PbdChainSolver, PbdChainSolverOptions } from "./pbd-chain";
import type { CapsuleCollider, ChainAnchor, LabFailure, PhysicsProvider, PhysicsReceipt, PhysicsStatus, Quat, SettleReceipt, Vec3, WindInput } from "../../contracts";

export const BUILTIN_PBD_VERSION_LABEL = "toon-pbd 1.0 (XPBD f32, dt 1/120 ×2)";

/** provider 호출 실패를 LabFailure와 함께 던진다. */
export class PhysicsProviderError extends Error {
  readonly failure: LabFailure;

  constructor(failure: LabFailure) {
    super(failure.reasonKo);
    this.name = "PhysicsProviderError";
    this.failure = failure;
  }
}

export interface BuiltinPbdProvider extends PhysicsProvider {
  readonly id: "builtin-pbd";
  /** 현재 컴파일된 솔버(setChains 전에는 null) */
  solver(): PbdChainSolver | null;
  setWind(wind: WindInput | null): void;
  receipt(poseHash: string): Promise<PhysicsReceipt>;
  /** 월드 변환이 없어 비활성인 충돌 본(진단) */
  pendingColliderBones(): readonly string[];
}

export function createBuiltinPbdProvider(options: PbdChainSolverOptions = {}): BuiltinPbdProvider {
  let solver: PbdChainSolver | null = null;
  let pendingBoneWorld: Array<{ bone: string; position: Vec3; rotation: Quat }> = [];
  let wind: WindInput | null = options.wind ?? null;
  let disposed = false;

  const requireSolver = (): PbdChainSolver => {
    if (disposed) throw new PhysicsProviderError(failVisible("physics-disposed", "물리 provider가 이미 폐기되었습니다."));
    if (!solver) throw new PhysicsProviderError(failVisible("physics-no-chains", "setChains가 호출되지 않아 체인이 없습니다."));
    return solver;
  };

  return {
    id: "builtin-pbd",
    init(): Promise<PhysicsStatus> {
      return Promise.resolve({ id: "builtin-pbd", status: "active", deterministic: true, versionLabel: BUILTIN_PBD_VERSION_LABEL });
    },
    setChains(chains: readonly ChainAnchor[], colliders: readonly CapsuleCollider[]): void {
      if (disposed) throw new PhysicsProviderError(failVisible("physics-disposed", "물리 provider가 이미 폐기되었습니다."));
      const result = createPbdChainSolver(chains, colliders, { ...options, wind });
      if (!result.ok) throw new PhysicsProviderError(result.failure);
      solver = result.solver;
      for (const entry of pendingBoneWorld) solver.setBoneWorld(entry.bone, entry.position, entry.rotation);
      pendingBoneWorld = [];
    },
    setBoneWorld(boneName: string, position: Vec3, rotation: Quat): void {
      if (solver) solver.setBoneWorld(boneName, position, rotation);
      else pendingBoneWorld.push({ bone: boneName, position, rotation });
    },
    step(dtSeconds: number, substeps: number): void {
      requireSolver().step(dtSeconds, substeps);
    },
    settle(maxSteps: number, velocityEpsilon: number): SettleReceipt {
      return requireSolver().settle(Math.min(maxSteps, SETTLE_DEFAULTS.maxSteps), velocityEpsilon);
    },
    readChainPositions(chainId: string): Float32Array {
      return requireSolver().readChainPositions(chainId);
    },
    reset(): void {
      solver?.reset();
    },
    dispose(): void {
      disposed = true;
      solver = null;
      pendingBoneWorld = [];
    },
    solver() {
      return solver;
    },
    setWind(next) {
      wind = next;
      solver?.setWind(next);
    },
    receipt(poseHash) {
      return requireSolver().receipt(poseHash);
    },
    pendingColliderBones() {
      return solver ? solver.pendingColliderBones() : [];
    },
  };
}
