/**
 * physics-bridge — NullEngine 하네스에 DI 모의 provider를 꽂아 검증한다: 요청한 provider 하나만 만들고(무음 대체 금지),
 * 체인·캡슐을 넘기고, 체인 루트 본의 운동학 월드 변환을 넘기며, 역산 회전을 보조 본 TransformNode에 반영한다.
 * 실제 내장 PBD 솔버와의 결합(`solver()` 포트)은 구조적 모의로 검증하고, 실제 provider 통합은 app 조립(composition)이 맡는다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isLabFailure } from "../contracts";
import { qNormalize, quatFromTo, v3Normalize, v3Sub } from "../shared/math";
import { createMockPhysicsProvider } from "../testing/mock-engine";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { backSolveSource, createNullEngineHarness, swingsFromPositions } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { CapsuleCollider, ChainAnchor, PhysicsProvider, PhysicsProviderFactory, PhysicsProviderId, PhysicsStatus, Quat, SettleReceipt, Vec3 } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

interface ProviderLog {
  readonly created: PhysicsProviderId[];
  disposed: number;
  steps: number;
  settles: number;
  chains: readonly ChainAnchor[];
  colliders: readonly CapsuleCollider[];
  readonly boneWorlds: Array<{ bone: string; position: Vec3; rotation: Quat }>;
}

/** 체인을 Z축 둘레로 90° 돌린 입자 위치를 돌려주는 모의 provider(회전은 로그로 확인) */
function movingProvider(log: ProviderLog, status?: PhysicsStatus): PhysicsProviderFactory {
  return async (id) => {
    log.created.push(id);
    const base = createMockPhysicsProvider(id, status);
    let chains: readonly ChainAnchor[] = [];
    const provider: PhysicsProvider = {
      ...base,
      setChains(next, colliders) {
        chains = next;
        log.chains = next;
        log.colliders = colliders;
      },
      setBoneWorld(bone, position, rotation) {
        log.boneWorlds.push({ bone, position, rotation });
      },
      step() {
        log.steps += 1;
      },
      settle(maxSteps): SettleReceipt {
        log.settles += 1;
        return { steps: Math.min(maxSteps, 42), settled: true, maxVelocity: 0 };
      },
      readChainPositions(chainId) {
        const chain = chains.find((candidate) => candidate.id === chainId);
        if (!chain) return new Float32Array(0);
        const root = chain.restPoints[0] as Vec3;
        const out = new Float32Array(chain.restPoints.length * 3);
        chain.restPoints.forEach((point, index) => {
          // (x, y) → (−y, x): 루트 둘레 +90°(Z축)
          const dx = point[0] - root[0];
          const dy = point[1] - root[1];
          out[index * 3] = root[0] - dy;
          out[index * 3 + 1] = root[1] + dx;
          out[index * 3 + 2] = point[2];
        });
        return out;
      },
      dispose() {
        log.disposed += 1;
      },
    };
    return provider;
  };
}

function newLog(): ProviderLog {
  return { created: [], disposed: 0, steps: 0, settles: 0, chains: [], colliders: [], boneWorlds: [] };
}

let harness: NullEngineHarness;
let log: ProviderLog;

beforeEach(async () => {
  log = newLog();
  harness = await createNullEngineHarness({ physicsProviders: movingProvider(log), now: () => 5_000 });
  await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
});

afterEach(() => {
  harness.dispose();
});

describe("provider 선택과 체인 전달", () => {
  it("요청한 provider 하나만 만들고 상태를 돌려주며 체인·캡슐을 넘긴다", async () => {
    const status = await harness.engine.setPhysicsProvider("builtin-pbd");
    expect(status).toMatchObject({ id: "builtin-pbd", status: "active" });
    expect(log.created).toEqual(["builtin-pbd"]);
    expect(log.chains.map((chain) => chain.id)).toEqual(["hair-main"]);
    expect(log.colliders).toHaveLength(1);
    expect(harness.engine.readHud().physicsProvider).toBe("builtin-pbd");
  });

  it("provider를 바꾸면 이전 provider를 해제하고 새 하나만 만든다(자동 대체 없음)", async () => {
    await harness.engine.setPhysicsProvider("builtin-pbd");
    await harness.engine.setPhysicsProvider("rapier");
    expect(log.created).toEqual(["builtin-pbd", "rapier"]);
    expect(log.disposed).toBe(1);
    expect(harness.engine.readHud().physicsProvider).toBe("rapier");
  });

  it("unavailable 상태는 그대로 돌려주고(throw 없음) 스텝·settle을 하지 않는다", async () => {
    const unavailable: PhysicsStatus = { id: "havok", status: "unavailable", reasonKo: "@babylonjs/havok 미설치" };
    const local = newLog();
    const other = await createNullEngineHarness({ physicsProviders: movingProvider(local, unavailable) });
    try {
      await other.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
      const status = await other.engine.setPhysicsProvider("havok");
      expect(status).toEqual(unavailable);
      other.engine.renderFrame();
      const receipt = await other.engine.settle(30);
      expect(receipt).toEqual({ steps: 0, settled: true, maxVelocity: 0 });
      expect(local.steps).toBe(0);
      expect(local.settles).toBe(0);
      expect(local.chains).toEqual([]);
    } finally {
      other.dispose();
    }
  });

  it("팩토리가 reject하면 physics-provider-init-failed LabFailure로 알린다(다른 provider 시도 없음)", async () => {
    const failing = await createNullEngineHarness({ physicsProviders: () => Promise.reject(new Error("wasm 로드 실패")) });
    try {
      const failure = await failing.engine.setPhysicsProvider("rapier").then(
        () => null,
        (error: unknown) => error,
      );
      expect(isLabFailure(failure)).toBe(true);
      expect(failure).toMatchObject({ code: "physics-provider-init-failed" });
      expect((failure as { reasonKo: string }).reasonKo).toContain("rapier");
    } finally {
      failing.dispose();
    }
  });

  it("provider를 고르기 전에는 step·settle이 아무 일도 하지 않는다", async () => {
    harness.engine.renderFrame();
    expect(log.steps).toBe(0);
    await expect(harness.engine.settle(10)).resolves.toEqual({ steps: 0, settled: true, maxVelocity: 0 });
  });
});

describe("스텝·settle과 본 반영", () => {
  it("renderFrame이 체인 루트·캡슐 본의 월드 변환을 provider에 넘긴다(루트 = 부모 월드 × rest 로컬)", async () => {
    await harness.engine.setPhysicsProvider("builtin-pbd");
    harness.engine.renderFrame();
    expect(log.steps).toBe(1);
    const root = log.boneWorlds.find((entry) => entry.bone === "hair_0");
    const head = log.boneWorlds.find((entry) => entry.bone === "head");
    expect(root).toBeDefined();
    expect(head).toBeDefined();
    // 머리 월드 위치 = hips(0.95)+spine(0.15)+chest(0.15)+upperChest(0.12)+neck(0.1)+head(0.08)
    expect(head?.position[1]).toBeCloseTo(1.55, 5);
    // 체인 루트 hair_0은 head + (0, 0.12, −0.05)
    expect(root?.position[1]).toBeCloseTo(1.67, 5);
    expect(root?.position[2]).toBeCloseTo(-0.05, 5);
  });

  it("머리를 돌리면 체인 루트의 운동학 변환도 따라 돈다", async () => {
    await harness.engine.setPhysicsProvider("builtin-pbd");
    const quarter = Math.SQRT1_2;
    harness.engine.applyPlan(applyPlanFixture({ boneRotations: { head: [0, quarter, 0, quarter] } }));
    harness.engine.renderFrame();
    const root = log.boneWorlds.filter((entry) => entry.bone === "hair_0").at(-1);
    // 머리 Y축 +90°: rest 로컬 (0, 0.12, −0.05)의 z 성분이 월드 x로 간다.
    expect(root?.position[0]).toBeCloseTo(-0.05, 5);
    expect(root?.position[2]).toBeCloseTo(0, 5);
  });

  it("역산 회전이 보조 본 TransformNode의 로컬 회전으로 반영된다", async () => {
    await harness.engine.setPhysicsProvider("builtin-pbd");
    harness.engine.renderFrame();
    const chain = log.chains[0];
    expect(chain).toBeDefined();
    if (!chain) return;
    const rest = chain.restPoints;
    const dir = (a: Vec3, b: Vec3): Vec3 => v3Normalize(v3Sub(b, a));
    // provider가 돌려준 입자(루트 둘레 +90° Z) 방향으로 rest 방향을 돌리는 월드 스윙
    const rotated = (v: Vec3): Vec3 => [-v[1], v[0], v[2]];
    const swing0 = qNormalize(quatFromTo(dir(rest[0] as Vec3, rest[1] as Vec3), rotated(dir(rest[0] as Vec3, rest[1] as Vec3))));
    const hair0 = harness.engine.readBone("hair_0");
    expect(hair0?.rotation[0]).toBeCloseTo(swing0[0], 4);
    expect(hair0?.rotation[1]).toBeCloseTo(swing0[1], 4);
    expect(hair0?.rotation[2]).toBeCloseTo(swing0[2], 4);
    expect(hair0?.rotation[3]).toBeCloseTo(swing0[3], 4);
    // 머리가 rest이므로 부모 월드가 항등 → 로컬 = 월드
    expect(hair0?.localRotation[2]).toBeCloseTo(swing0[2], 4);
    // 말단 본은 직전 스윙을 잇는다
    const tip = harness.engine.readBone("hair_2");
    expect(tip?.auxiliary).toBe(true);
    expect(tip?.rotation[3]).not.toBeCloseTo(1, 3);
  });

  it("settle은 provider.settle 영수증을 돌려주고 본에 회전을 반영하며 상한을 지킨다", async () => {
    await harness.engine.setPhysicsProvider("builtin-pbd");
    const receipt = await harness.engine.settle(10_000);
    expect(receipt).toEqual({ steps: 42, settled: true, maxVelocity: 0 });
    expect(log.settles).toBe(1);
    expect(harness.engine.readBone("hair_0")?.localRotation[3]).not.toBeCloseTo(1, 3);
  });

  it("renderPasses(settleSteps>0)는 캡처 전에 settle을 돌리고 provenance에 provider·스텝을 기록한다", async () => {
    await harness.engine.setPhysicsProvider("builtin-pbd");
    const result = await harness.engine.renderPasses({ width: 16, height: 16, passes: ["lit"], transparentBackground: true, settleSteps: 7 });
    expect(log.settles).toBe(1);
    expect(result.provenance).toMatchObject({ physicsProvider: "builtin-pbd", settleSteps: 7, synthetic: true, backend: "null" });
  });
});

describe("진단·영수증·구조적 포트", () => {
  it("provider에 receipt 포트가 있으면 결정성 영수증을 돌려주고 없으면 null이다", async () => {
    await harness.engine.setPhysicsProvider("builtin-pbd");
    expect(await harness.engine.physicsReceipt("pose-abc")).toBeNull();

    const withReceipt: PhysicsProviderFactory = async (id) => {
      const base = await movingProvider(newLog())(id);
      return Object.assign(base, {
        receipt: async (poseHash: string) => ({ providerId: id, stateHash: `state:${poseHash}`, steps: 3 }),
        pendingColliderBones: () => ["leftHand"],
      });
    };
    const second = await createNullEngineHarness({ physicsProviders: withReceipt });
    try {
      await second.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
      await second.engine.setPhysicsProvider("builtin-pbd");
      expect(await second.engine.physicsReceipt("pose-abc")).toEqual({ providerId: "builtin-pbd", stateHash: "state:pose-abc", steps: 3 });
      expect(second.engine.pendingColliderBones()).toEqual(["leftHand"]);
    } finally {
      second.dispose();
    }
  });

  it("receipt가 던지면 physics-receipt-failed LabFailure로 바뀐다", async () => {
    const throwing: PhysicsProviderFactory = async (id) =>
      Object.assign(await movingProvider(newLog())(id), {
        receipt: async () => {
          throw new Error("해시 실패");
        },
      });
    const other = await createNullEngineHarness({ physicsProviders: throwing });
    try {
      await other.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
      await other.engine.setPhysicsProvider("builtin-pbd");
      await expect(other.engine.physicsReceipt("x")).rejects.toMatchObject({ code: "physics-receipt-failed" });
    } finally {
      other.dispose();
    }
  });

  it("solver().boneRotations 포트가 있으면 그 월드 회전을 쓴다(구조적 판별)", async () => {
    const target: Quat = qNormalize([0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]);
    const withSolver: PhysicsProviderFactory = async (id) => {
      const base = await movingProvider(newLog())(id);
      const solverPort = {
        boneRotations: (chainId: string) =>
          chainId === "hair-main"
            ? [
                { bone: "hair_0", local: target, world: target },
                { bone: "hair_1", local: [0, 0, 0, 1] as Quat, world: target },
                { bone: "hair_2", local: [0, 0, 0, 1] as Quat, world: target },
              ]
            : [],
      };
      return Object.assign(base, { solver: () => solverPort });
    };
    const other = await createNullEngineHarness({ physicsProviders: withSolver });
    try {
      await other.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
      await other.engine.setPhysicsProvider("builtin-pbd");
      other.engine.renderFrame();
      const hair0 = other.engine.readBone("hair_0");
      expect(hair0?.rotation[2]).toBeCloseTo(target[2], 4);
      expect(hair0?.rotation[3]).toBeCloseTo(target[3], 4);
      // 자식도 같은 월드 회전을 받고 로컬은 부모 월드의 역으로 상쇄되어 항등에 가깝다
      expect(other.engine.readBone("hair_1")?.rotation[2]).toBeCloseTo(target[2], 4);
      expect(other.engine.readBone("hair_1")?.localRotation[3]).toBeCloseTo(1, 4);
    } finally {
      other.dispose();
    }
  });

  it("backSolveSource는 solver 포트가 없거나 형식이 틀리면 null이다", () => {
    const plain = createMockPhysicsProvider("builtin-pbd");
    expect(backSolveSource(plain)).toBeNull();
    expect(backSolveSource({ ...plain, solver: () => null } as PhysicsProvider)).toBeNull();
    expect(backSolveSource({ ...plain, solver: () => ({ boneRotations: 5 }) } as unknown as PhysicsProvider)).toBeNull();
    expect(backSolveSource({ ...plain, solver: () => ({ boneRotations: () => [] }) } as unknown as PhysicsProvider)).not.toBeNull();
  });

  it("swingsFromPositions: 변화 없음 → 항등, 90° 회전 → 해당 스윙, 퇴화 구간은 직전 값을 잇는다", () => {
    const rest: Vec3[] = [
      [0, 1, 0],
      [0, 0.9, 0],
      [0, 0.8, 0],
    ];
    const same = swingsFromPositions(rest, new Float32Array([0, 1, 0, 0, 0.9, 0, 0, 0.8, 0]));
    for (const q of same) expect(q[3]).toBeCloseTo(1, 6);
    expect(same).toHaveLength(3);
    // 모든 입자를 +X 방향으로 눕힘: 아래(−Y)를 향하던 방향 → +X
    const lying = swingsFromPositions(rest, new Float32Array([0, 1, 0, 0.1, 1, 0, 0.2, 1, 0]));
    const expected = qNormalize(quatFromTo([0, -1, 0], [1, 0, 0]));
    expect(lying[0]?.[2]).toBeCloseTo(expected[2], 5);
    expect(lying[0]?.[3]).toBeCloseTo(expected[3], 5);
    expect(lying[2]).toEqual(lying[1]);
    // 두 입자가 겹치면(방향 길이 0) 직전 스윙을 유지한다
    const degenerate = swingsFromPositions(rest, new Float32Array([0, 1, 0, 0, 1, 0, 0, 0.8, 0]));
    expect(degenerate[0]).toEqual([0, 0, 0, 1]);
    // 입자 수가 rest보다 적으면 가능한 만큼만
    expect(swingsFromPositions(rest, new Float32Array([0, 1, 0, 0, 0.9, 0]))).toHaveLength(2);
  });
});
