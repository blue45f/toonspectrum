/**
 * rapier provider(보조 엔진, 소품·접지·접촉용): `@dimforge/rapier3d-deterministic-compat` 0.19.3을 동적 import해
 * 체인을 kinematic 루트 + dynamic 구(ball) + spherical ImpulseJoint로, 캡슐 충돌체를 kinematic capsule로 만든다.
 *
 * 결정성: 같은 버전·삽입 순서(체인 id 사전순, 관절 루트→말단, 캡슐 본 이름순)·고정 timestep·`takeSnapshot()` SHA-256.
 * Worker 없이 Node에서 실행 가능하며(compat 빌드는 wasm 내장), Worker 경계는 rapier/rapier-protocol.ts가 담당한다.
 * 자체 PBD와 달리 rest 방향 복원(stiffness)은 없고 중력·감쇠·관절만 있다(문서 parity/outfit.md에 명시).
 */
import { SETTLE_DEFAULTS, failVisible } from "../../contracts";
import { sha256Hex } from "../../shared/hash";

import { PhysicsProviderError } from "./builtin-provider";
import { normalizeQuat, quatFromUnitVectors, rotateVec3 } from "./core/vec";

import type { CapsuleCollider, ChainAnchor, PhysicsStatus, Quat, SettleReceipt, Vec3 } from "../../contracts";
import type { SnapshotHashProvider } from "./rapier/rapier-protocol";
import type RapierNamespace from "@dimforge/rapier3d-deterministic-compat";

export type RapierModule = typeof RapierNamespace;
export type RapierLoader = () => Promise<RapierModule>;

export interface RapierProviderOptions {
  /** 테스트·주입용 로더. 기본은 패키지 동적 import */
  readonly load?: RapierLoader;
  /** 중력 가속도(m/s²). 기본 -9.81 */
  readonly gravityY?: number;
  /** 구 입자 질량(kg). 기본 0.01 */
  readonly particleMass?: number;
}

export interface RapierProvider extends SnapshotHashProvider {
  readonly id: "rapier";
  /** 월드 변환이 없어 비활성인 충돌 본 */
  pendingColliderBones(): readonly string[];
  /** 삽입 순서(결정성 검증용): 체인 id → 바디 핸들 목록 */
  insertionOrder(): readonly { readonly chainId: string; readonly handles: readonly number[] }[];
}

const PARTICLE_GROUPS = (0x0001 << 16) | 0x0002;
const CAPSULE_GROUPS = (0x0002 << 16) | 0x0001;

const defaultLoader: RapierLoader = () => import("@dimforge/rapier3d-deterministic-compat");

interface ChainBodies {
  readonly chainId: string;
  readonly rootBone: string;
  readonly root: RapierNamespace.RigidBody;
  readonly bodies: RapierNamespace.RigidBody[];
}

interface CapsuleBody {
  readonly collider: CapsuleCollider;
  readonly body: RapierNamespace.RigidBody;
  readonly shape: RapierNamespace.Collider;
  active: boolean;
}

function sortedAnchors(chains: readonly ChainAnchor[]): ChainAnchor[] {
  return [...chains].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function sortedColliders(colliders: readonly CapsuleCollider[]): CapsuleCollider[] {
  return colliders
    .map((collider, index) => ({ collider, index }))
    .sort((a, b) => (a.collider.bone < b.collider.bone ? -1 : a.collider.bone > b.collider.bone ? 1 : a.index - b.index))
    .map((entry) => entry.collider);
}

/** VRM dragForce(스텝당 비율, dt=1/120 기준) → Rapier 선형 감쇠(1/s) */
export function dragForceToLinearDamping(dragForce: number, dt = SETTLE_DEFAULTS.dtSeconds): number {
  const clamped = Math.min(0.999, Math.max(0, dragForce));
  if (clamped <= 0) return 0;
  return -Math.log(1 - clamped) / dt;
}

export function createRapierProvider(options: RapierProviderOptions = {}): RapierProvider {
  const load = options.load ?? defaultLoader;
  const gravityY = options.gravityY ?? -9.81;
  const particleMass = options.particleMass ?? 0.01;
  let rapier: RapierModule | null = null;
  let world: RapierNamespace.World | null = null;
  let chainsInput: readonly ChainAnchor[] = [];
  let collidersInput: readonly CapsuleCollider[] = [];
  let chainBodies: ChainBodies[] = [];
  let capsuleBodies: CapsuleBody[] = [];
  const boneWorld = new Map<string, { position: Vec3; rotation: Quat }>();
  let disposed = false;

  const fail = (code: string, reasonKo: string, detail?: unknown): PhysicsProviderError => new PhysicsProviderError(failVisible(code, reasonKo, detail));

  const requireWorld = (): { rapier: RapierModule; world: RapierNamespace.World } => {
    if (disposed) throw fail("physics-disposed", "물리 provider가 이미 폐기되었습니다.");
    if (!rapier) throw fail("physics-rapier-not-initialized", "Rapier가 초기화되지 않았습니다(init 먼저 호출).");
    if (!world) throw fail("physics-no-chains", "setChains가 호출되지 않아 체인이 없습니다.");
    return { rapier, world };
  };

  const applyCapsuleTransform = (entry: CapsuleBody, rapierModule: RapierModule): void => {
    const transform = boneWorld.get(entry.collider.bone);
    if (!transform) return;
    const q = normalizeQuat(transform.rotation);
    const a = rotateVec3(q, entry.collider.a);
    const b = rotateVec3(q, entry.collider.b);
    const center: Vec3 = [
      transform.position[0] + (a[0] + b[0]) * 0.5,
      transform.position[1] + (a[1] + b[1]) * 0.5,
      transform.position[2] + (a[2] + b[2]) * 0.5,
    ];
    const axis: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const rot = quatFromUnitVectors([0, 1, 0], axis);
    entry.body.setNextKinematicTranslation(new rapierModule.Vector3(center[0], center[1], center[2]));
    entry.body.setNextKinematicRotation(new rapierModule.Quaternion(rot[0], rot[1], rot[2], rot[3]));
    if (!entry.active) {
      entry.body.setTranslation(new rapierModule.Vector3(center[0], center[1], center[2]), true);
      entry.body.setRotation(new rapierModule.Quaternion(rot[0], rot[1], rot[2], rot[3]), true);
      entry.shape.setEnabled(true);
      entry.active = true;
    }
  };

  const applyRootTransform = (entry: ChainBodies, rapierModule: RapierModule): void => {
    const transform = boneWorld.get(entry.rootBone);
    if (!transform) return;
    const q = normalizeQuat(transform.rotation);
    entry.root.setNextKinematicTranslation(new rapierModule.Vector3(transform.position[0], transform.position[1], transform.position[2]));
    entry.root.setNextKinematicRotation(new rapierModule.Quaternion(q[0], q[1], q[2], q[3]));
  };

  const buildWorld = (): void => {
    if (!rapier) throw fail("physics-rapier-not-initialized", "Rapier가 초기화되지 않았습니다(init 먼저 호출).");
    world?.free();
    const R = rapier;
    const next = new R.World(new R.Vector3(0, gravityY, 0));
    next.timestep = SETTLE_DEFAULTS.dtSeconds;
    chainBodies = [];
    capsuleBodies = [];
    for (const anchor of sortedAnchors(chainsInput)) {
      const rest0 = anchor.restPoints[0] as Vec3;
      const root = next.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(rest0[0], rest0[1], rest0[2]));
      const bodies: RapierNamespace.RigidBody[] = [];
      let parent = root;
      const damping = dragForceToLinearDamping(anchor.damping);
      for (let j = 1; j < anchor.restPoints.length; j += 1) {
        const rest = anchor.restPoints[j] as Vec3;
        const prev = anchor.restPoints[j - 1] as Vec3;
        const body = next.createRigidBody(
          R.RigidBodyDesc.dynamic()
            .setTranslation(rest[0], rest[1], rest[2])
            .setLinearDamping(damping)
            .setAngularDamping(damping)
            .setGravityScale(anchor.gravityScale)
            .setCanSleep(false),
        );
        next.createCollider(R.ColliderDesc.ball(Math.max(1e-3, anchor.radius)).setMass(particleMass).setCollisionGroups(PARTICLE_GROUPS), body);
        const anchor1 = new R.Vector3(rest[0] - prev[0], rest[1] - prev[1], rest[2] - prev[2]);
        next.createImpulseJoint(R.JointData.spherical(anchor1, new R.Vector3(0, 0, 0)), parent, body, true);
        bodies.push(body);
        parent = body;
      }
      chainBodies.push({ chainId: anchor.id, rootBone: anchor.boneNames[0] ?? anchor.id, root, bodies });
    }
    for (const collider of sortedColliders(collidersInput)) {
      const ax = collider.b[0] - collider.a[0];
      const ay = collider.b[1] - collider.a[1];
      const az = collider.b[2] - collider.a[2];
      const halfHeight = Math.sqrt(ax * ax + ay * ay + az * az) * 0.5;
      const body = next.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0));
      const shape = next.createCollider(R.ColliderDesc.capsule(halfHeight, collider.radius).setCollisionGroups(CAPSULE_GROUPS).setEnabled(false), body);
      const entry: CapsuleBody = { collider, body, shape, active: false };
      capsuleBodies.push(entry);
      applyCapsuleTransform(entry, R);
    }
    for (const entry of chainBodies) applyRootTransform(entry, R);
    world = next;
  };

  const readAllPositions = (): Float32Array => {
    let count = 0;
    for (const entry of chainBodies) count += entry.bodies.length;
    const out = new Float32Array(count * 3);
    let i = 0;
    for (const entry of chainBodies) {
      for (const body of entry.bodies) {
        const t = body.translation();
        out[i] = t.x;
        out[i + 1] = t.y;
        out[i + 2] = t.z;
        i += 3;
      }
    }
    return out;
  };

  const stepOnce = (dt: number): void => {
    const { rapier: R, world: w } = requireWorld();
    for (const entry of chainBodies) applyRootTransform(entry, R);
    for (const entry of capsuleBodies) applyCapsuleTransform(entry, R);
    w.timestep = dt;
    w.step();
  };

  return {
    id: "rapier",
    async init(): Promise<PhysicsStatus> {
      if (disposed) throw fail("physics-disposed", "물리 provider가 이미 폐기되었습니다.");
      try {
        const loaded = await load();
        await loaded.init();
        rapier = loaded;
        return { id: "rapier", status: "active", deterministic: true, versionLabel: `Rapier ${loaded.version()} deterministic-compat` };
      } catch (error) {
        rapier = null;
        return { id: "rapier", status: "unavailable", reasonKo: `Rapier 초기화에 실패했습니다: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    setChains(chains: readonly ChainAnchor[], colliders: readonly CapsuleCollider[]): void {
      if (disposed) throw fail("physics-disposed", "물리 provider가 이미 폐기되었습니다.");
      if (!rapier) throw fail("physics-rapier-not-initialized", "Rapier가 초기화되지 않았습니다(init 먼저 호출).");
      for (const anchor of chains) {
        if (anchor.boneNames.length !== anchor.restPoints.length || anchor.restPoints.length < 2) {
          throw fail("chain-invalid", `체인 "${anchor.id}"의 boneNames/restPoints 길이가 맞지 않거나 2 미만입니다.`);
        }
      }
      chainsInput = chains;
      collidersInput = colliders;
      buildWorld();
    },
    setBoneWorld(boneName: string, position: Vec3, rotation: Quat): void {
      boneWorld.set(boneName, { position, rotation });
      if (!rapier) return;
      for (const entry of chainBodies) if (entry.rootBone === boneName) applyRootTransform(entry, rapier);
      for (const entry of capsuleBodies) if (entry.collider.bone === boneName) applyCapsuleTransform(entry, rapier);
    },
    step(dtSeconds: number, substeps: number): void {
      const n = Math.max(1, Math.floor(substeps));
      for (let s = 0; s < n; s += 1) stepOnce(dtSeconds);
    },
    settle(maxSteps: number, velocityEpsilon: number): SettleReceipt {
      requireWorld();
      const limit = Math.min(Math.max(0, Math.floor(maxSteps)), SETTLE_DEFAULTS.maxSteps);
      let previous = readAllPositions();
      let steps = 0;
      let settled = false;
      let lastDelta = Number.POSITIVE_INFINITY;
      while (steps < limit) {
        stepOnce(SETTLE_DEFAULTS.dtSeconds);
        steps += 1;
        const current = readAllPositions();
        lastDelta = 0;
        for (let i = 0; i < current.length; i += 3) {
          const dx = current[i] - previous[i];
          const dy = current[i + 1] - previous[i + 1];
          const dz = current[i + 2] - previous[i + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > lastDelta) lastDelta = d;
        }
        previous = current;
        if (lastDelta <= velocityEpsilon) {
          settled = true;
          break;
        }
      }
      return { steps, settled, maxVelocity: Number.isFinite(lastDelta) ? lastDelta / SETTLE_DEFAULTS.dtSeconds : Number.POSITIVE_INFINITY };
    },
    readChainPositions(chainId: string): Float32Array {
      requireWorld();
      const entry = chainBodies.find((chain) => chain.chainId === chainId);
      if (!entry) throw fail("physics-unknown-chain", `알 수 없는 체인 id입니다: ${chainId}`);
      const out = new Float32Array((entry.bodies.length + 1) * 3);
      const root = entry.root.translation();
      out[0] = root.x;
      out[1] = root.y;
      out[2] = root.z;
      entry.bodies.forEach((body, j) => {
        const t = body.translation();
        out[(j + 1) * 3] = t.x;
        out[(j + 1) * 3 + 1] = t.y;
        out[(j + 1) * 3 + 2] = t.z;
      });
      return out;
    },
    reset(): void {
      if (!rapier || !world) return;
      buildWorld();
    },
    dispose(): void {
      disposed = true;
      world?.free();
      world = null;
      chainBodies = [];
      capsuleBodies = [];
    },
    async snapshotHash(): Promise<string> {
      const { world: w } = requireWorld();
      return sha256Hex(w.takeSnapshot());
    },
    pendingColliderBones() {
      return capsuleBodies.filter((entry) => !entry.active).map((entry) => entry.collider.bone);
    },
    insertionOrder() {
      return chainBodies.map((entry) => ({ chainId: entry.chainId, handles: [entry.root.handle, ...entry.bodies.map((body) => body.handle)] }));
    },
  };
}
