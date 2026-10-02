/**
 * 물리 브리지: PhysicsProviderFactory(DI)로 요청한 provider 하나만 만들고(무음 대체 금지), 리그의 체인 앵커·캡슐을
 * 넘긴 뒤 매 프레임 setBoneWorld(체인 루트 본 `hair_<style>_<i>_0`·`skirt_<i>_0`·`ribbon_<i>_0`의 운동학 변환 =
 * 부모 본 월드 × rest 로컬, 충돌 캡슐 본 월드) → step → 역산 회전을 보조 본 TransformNode의 로컬 회전으로 반영한다.
 * settle은 scene.render 없이 provider만 N스텝 돌린다. provider 실패(PhysicsProviderError 등)는 LabFailure로 던진다.
 *
 * 역산 회전 규약(outfit-physics docs/parity/outfit.md §1, chain/back-solve.ts): 본 j의 월드 스윙 = quatFromUnitVectors(restDir_j, simDir_j),
 * 노드 월드 회전 = 스윙 ∘ rest 월드 회전, 로컬 = 부모 노드 절대 회전⁻¹ ∘ 노드 월드. builtin-pbd는 `solver()?.boneRotations(chainId)`로
 * 받고(구조적 판별, render는 domains/physics를 import하지 않는다), 그 포트가 없는 provider(rapier)는 같은 식을 입자 위치에서 계산한다.
 * 위치는 FK가 재구성하므로 직접 쓰지 않는다(길이 보존은 solver 책임).
 */
import { SETTLE_DEFAULTS, failVisible, isLabFailure } from "../../contracts";
import { qConjugate, qMultiply, qNormalize, qRotateVec3, quatFromTo, v3Add, v3Length, v3Normalize, v3Sub } from "../../shared/math";

import { rigBoneWorld } from "./character-rig";
import { fromQuaternion, toQuaternion } from "./convert";

import type { CharacterRig, RigBone } from "./character-rig";
import type { LabFailure, PhysicsProvider, PhysicsProviderFactory, PhysicsProviderId, PhysicsStatus, Quat, SettleReceipt, Vec3 } from "../../contracts";

export interface PhysicsBridge {
  /** provider 하나를 만들어 초기화하고 체인을 넘긴다. 초기화·체인 설정이 실패하면 만든 provider를 해제하고 비활성(status null)으로 되돌린 뒤 LabFailure를 던진다. */
  setProvider(id: PhysicsProviderId): Promise<PhysicsStatus>;
  /** 리그를 바꾼다. 활성 provider가 새 체인을 거부하면 provider를 해제하고 비활성으로 되돌린 뒤 LabFailure를 던진다. */
  bindRig(rig: CharacterRig | null): void;
  /**
   * 활성 provider·체인이 있을 때 한 프레임 스텝 + 본 반영. 스텝 중 오류가 나면 provider를 해제해 물리를 중단하고
   * (status → unavailable) 그 실패(LabFailure)를 던진다 — 렌더 루프가 잡아 알려야 한다.
   */
  step(dtSeconds?: number, substeps?: number): void;
  settle(maxSteps: number): Promise<SettleReceipt>;
  currentId(): PhysicsProviderId;
  status(): PhysicsStatus | null;
  /** 월드 변환이 아직 없어 비활성인 충돌 캡슐 본(provider가 진단 포트를 주면, 아니면 빈 배열) */
  pendingColliderBones(): readonly string[];
  /** 결정성 영수증(provider가 포트를 주면, 아니면 null) */
  receipt(poseHash: string): Promise<PhysicsReceiptLike | null>;
  /** 마지막 스텝/settle에서 회전을 적용한 보조 본 수(테스트·HUD 진단) */
  appliedBoneCount(): number;
  dispose(): void;
}

/** chain/back-solve.ts ChainBoneRotation과 구조적으로 같다 */
export interface ChainBoneRotationLike {
  readonly bone: string;
  readonly local: Quat;
  readonly world: Quat;
}

/** contracts/physics-chain.ts PhysicsReceipt와 구조적으로 같다(필드는 provider가 채운다) */
export interface PhysicsReceiptLike {
  readonly providerId: PhysicsProviderId;
  readonly stateHash: string;
  readonly steps: number;
}

interface BackSolveSource {
  boneRotations(chainId: string): readonly ChainBoneRotationLike[];
}

/** builtin-pbd provider의 `solver()` 포트를 구조적으로 찾는다. 없으면 null. */
export function backSolveSource(provider: PhysicsProvider): BackSolveSource | null {
  const getter = (provider as { solver?: unknown }).solver;
  if (typeof getter !== "function") return null;
  const value: unknown = (getter as () => unknown).call(provider);
  if (typeof value !== "object" || value === null) return null;
  return typeof (value as { boneRotations?: unknown }).boneRotations === "function" ? (value as BackSolveSource) : null;
}

/** 입자 위치에서 월드 스윙 회전을 계산한다(back-solve와 같은 식, provider 무관 폴백). 길이 = 입자 수. */
export function swingsFromPositions(restPoints: readonly Vec3[], positions: Float32Array): Quat[] {
  const count = Math.min(restPoints.length, Math.floor(positions.length / 3));
  const out: Quat[] = [];
  let last: Quat = [0, 0, 0, 1];
  for (let j = 0; j < count; j += 1) {
    if (j < count - 1) {
      const restA = restPoints[j] as Vec3;
      const restB = restPoints[j + 1] as Vec3;
      const restDir = v3Sub(restB, restA);
      const simDir: Vec3 = [(positions[(j + 1) * 3] ?? 0) - (positions[j * 3] ?? 0), (positions[(j + 1) * 3 + 1] ?? 0) - (positions[j * 3 + 1] ?? 0), (positions[(j + 1) * 3 + 2] ?? 0) - (positions[j * 3 + 2] ?? 0)];
      last = v3Length(restDir) > 1e-9 && v3Length(simDir) > 1e-9 ? qNormalize(quatFromTo(v3Normalize(restDir), v3Normalize(simDir))) : last;
    }
    out.push(last);
  }
  return out;
}

export interface PhysicsBridgeDeps {
  readonly factory: PhysicsProviderFactory;
  readonly now?: () => number;
}

function toFailure(error: unknown, code: string, reasonKo: string, now: number): LabFailure {
  if (isLabFailure(error)) return error;
  const nested = (error as { failure?: unknown } | null)?.failure;
  if (isLabFailure(nested)) return nested;
  return failVisible(code, reasonKo, error, now);
}

/** 체인 루트의 운동학(물리 전) 월드 변환: 부모 본 월드 × rest 로컬 */
export function kinematicBoneWorld(rig: CharacterRig, rb: RigBone): { readonly position: Vec3; readonly rotation: Quat } {
  const parent = rb.parentName ? rig.bones.get(rb.parentName) : undefined;
  if (!parent) return rigBoneWorld(rb);
  const parentWorld = rigBoneWorld(parent);
  return {
    position: v3Add(parentWorld.position, qRotateVec3(parentWorld.rotation, rb.restTranslation)),
    rotation: qNormalize(qMultiply(parentWorld.rotation, rb.restLocal)),
  };
}

export function createPhysicsBridge(deps: PhysicsBridgeDeps): PhysicsBridge {
  const now = deps.now ?? (() => Date.now());
  let provider: PhysicsProvider | null = null;
  let status: PhysicsStatus | null = null;
  let currentId: PhysicsProviderId = "builtin-pbd";
  let rig: CharacterRig | null = null;
  /** provider가 현재 리그의 체인·캡슐을 받아들였는지. false면 provider는 `step`·`settle`을 할 수 없다(체인 없음). */
  let chainsReady = false;

  const active = (): boolean => provider !== null && status?.status === "active" && chainsReady && rig !== null && rig.chains.length > 0;

  /** 해제 중 난 오류는 호출자가 이미 던지려는 원래 실패를 가리지 않도록 삼킨다(버려지는 provider라 알릴 곳이 없다). */
  const disposeQuietly = (target: PhysicsProvider): void => {
    try {
      target.dispose();
    } catch {
      // 의도적으로 무시: 원래 실패(체인 거부·초기화 실패·스텝 실패)가 호출자에게 전달된다.
    }
  };

  /** 현재 provider를 해제하고 비활성으로 되돌린다(다시 `setProvider`로 고르기 전까지 step·settle은 아무 일도 하지 않는다). */
  const discardProvider = (next: PhysicsStatus | null): void => {
    const old = provider;
    provider = null;
    status = next;
    chainsReady = false;
    if (old) disposeQuietly(old);
  };

  const pushChains = (): void => {
    chainsReady = false;
    if (!provider || !rig || status?.status !== "active") return;
    try {
      provider.setChains(rig.chains, rig.colliders);
    } catch (error) {
      throw toFailure(error, "physics-chains-rejected", "물리 provider가 체인·캡슐 설정을 거부했습니다.", now());
    }
    chainsReady = true;
  };

  const pushBoneWorlds = (): void => {
    if (!provider || !rig) return;
    for (const chain of rig.chains) {
      const rootName = chain.boneNames[0];
      const root = rootName ? rig.bones.get(rootName) : undefined;
      if (!root) continue;
      const world = kinematicBoneWorld(rig, root);
      provider.setBoneWorld(root.name, world.position, world.rotation);
    }
    for (const collider of rig.colliders) {
      const rb = rig.humanoid.get(collider.bone);
      if (!rb) continue;
      const world = rigBoneWorld(rb);
      provider.setBoneWorld(collider.bone, world.position, world.rotation);
    }
  };

  let appliedBones = 0;

  /** 체인별 월드 스윙(루트→말단). provider 포트 우선, 없으면 위치 기반 폴백. */
  const chainSwings = (chainId: string, restPoints: readonly Vec3[]): Quat[] | null => {
    if (!provider) return null;
    const source = backSolveSource(provider);
    if (source) {
      try {
        return source.boneRotations(chainId).map((rotation) => qNormalize(rotation.world));
      } catch (error) {
        throw toFailure(error, "physics-back-solve-failed", `체인 '${chainId}'의 역산 회전을 읽지 못했습니다.`, now());
      }
    }
    return swingsFromPositions(restPoints, provider.readChainPositions(chainId));
  };

  const applyRotations = (): void => {
    if (!provider || !rig) return;
    appliedBones = 0;
    for (const chain of rig.chains) {
      const swings = chainSwings(chain.id, chain.restPoints);
      if (!swings) continue;
      // 루트→말단 순서: 자식의 로컬은 방금 갱신한 부모의 절대 회전 기준이어야 한다.
      for (let j = 0; j < chain.boneNames.length; j += 1) {
        const name = chain.boneNames[j];
        const rb = name ? rig.bones.get(name) : undefined;
        const swing = swings[j];
        if (!rb || !swing) continue;
        const parentNode = rb.node.parent;
        let parentWorld: Quat = [0, 0, 0, 1];
        if (parentNode && "computeWorldMatrix" in parentNode && "absoluteRotationQuaternion" in parentNode) {
          const transform = parentNode as { computeWorldMatrix(force: boolean): unknown; absoluteRotationQuaternion: { x: number; y: number; z: number; w: number } };
          transform.computeWorldMatrix(true);
          parentWorld = fromQuaternion(transform.absoluteRotationQuaternion);
        }
        const nodeWorld = qNormalize(qMultiply(swing, rb.restWorld));
        rb.node.rotationQuaternion = toQuaternion(qNormalize(qMultiply(qConjugate(parentWorld), nodeWorld)));
        rb.node.computeWorldMatrix(true);
        appliedBones += 1;
      }
    }
  };

  return {
    async setProvider(id) {
      discardProvider(null);
      currentId = id;
      let created: PhysicsProvider | null = null;
      let initStatus: PhysicsStatus;
      try {
        created = await deps.factory(id);
        initStatus = await created.init();
      } catch (error) {
        // init()에서 실패했어도 factory가 만든 인스턴스(WASM·워커 자원)는 해제한다.
        if (created) disposeQuietly(created);
        throw toFailure(error, "physics-provider-init-failed", `물리 provider '${id}' 초기화에 실패했습니다.`, now());
      }
      provider = created;
      status = initStatus;
      try {
        pushChains();
      } catch (error) {
        // 체인을 거부한 provider를 active로 남기면 renderFrame의 step이 매 프레임 던져 렌더 루프가 멈춘다 → 해제하고 비활성으로 되돌린다.
        discardProvider(null);
        throw error;
      }
      return initStatus;
    },
    bindRig(next) {
      rig = next;
      try {
        pushChains();
      } catch (error) {
        // 새 리그를 거부한 provider는 리그와 맞지 않는 상태이므로 같은 방식으로 해제한다(다시 고르면 새 provider로 시도).
        discardProvider(null);
        throw error;
      }
    },
    step(dtSeconds = SETTLE_DEFAULTS.dtSeconds, substeps = SETTLE_DEFAULTS.substeps) {
      if (!active() || !provider) return;
      try {
        pushBoneWorlds();
        provider.step(dtSeconds, substeps);
        applyRotations();
      } catch (error) {
        // 같은 예외가 매 프레임 반복되지 않도록 물리를 중단한다(unavailable 상태 + 사유). 호출자(렌더 루프)가 실패를 알린다.
        const failure = toFailure(error, "physics-step-failed", "물리 스텝 중 오류가 나 물리를 중단했습니다.", now());
        discardProvider({ id: currentId, status: "unavailable", reasonKo: failure.reasonKo });
        throw failure;
      }
    },
    async settle(maxSteps) {
      const steps = Math.min(SETTLE_DEFAULTS.maxSteps, Math.max(0, Math.floor(maxSteps)));
      if (!active() || !provider) return { steps: 0, settled: true, maxVelocity: 0 };
      pushBoneWorlds();
      let receipt: SettleReceipt;
      try {
        receipt = provider.settle(steps, SETTLE_DEFAULTS.velocityEpsilon);
      } catch (error) {
        throw toFailure(error, "physics-settle-failed", "물리 settle에 실패했습니다.", now());
      }
      applyRotations();
      return receipt;
    },
    currentId: () => currentId,
    status: () => status,
    pendingColliderBones() {
      const getter = (provider as { pendingColliderBones?: unknown } | null)?.pendingColliderBones;
      if (typeof getter !== "function" || !provider) return [];
      const value: unknown = (getter as () => unknown).call(provider);
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    },
    async receipt(poseHash) {
      const getter = (provider as { receipt?: unknown } | null)?.receipt;
      if (typeof getter !== "function" || !provider || !active()) return null;
      try {
        const value: unknown = await (getter as (hash: string) => unknown).call(provider, poseHash);
        return typeof value === "object" && value !== null && typeof (value as { stateHash?: unknown }).stateHash === "string" ? (value as PhysicsReceiptLike) : null;
      } catch (error) {
        throw toFailure(error, "physics-receipt-failed", "물리 결정성 영수증을 만들지 못했습니다.", now());
      }
    },
    appliedBoneCount: () => appliedBones,
    dispose() {
      provider?.dispose();
      provider = null;
      status = null;
      chainsReady = false;
      rig = null;
    },
  };
}
