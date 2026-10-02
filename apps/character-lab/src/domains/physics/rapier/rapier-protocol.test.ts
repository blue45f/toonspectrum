import { describe, expect, it } from "vitest";

import { failVisible } from "../../../contracts";
import { PhysicsProviderError } from "../builtin-provider";
import { chainAnchorFixture, headColliderFixture } from "../fixtures";

import { createRapierProtocolHandler, rapierRequestSchema } from "./rapier-protocol";

import type { SnapshotHashProvider } from "./rapier-protocol";
import type { PhysicsStatus, SettleReceipt } from "../../../contracts";

function mockProvider(log: string[]): SnapshotHashProvider {
  return {
    id: "rapier",
    init: async (): Promise<PhysicsStatus> => {
      log.push("init");
      return { id: "rapier", status: "active", deterministic: true, versionLabel: "mock" };
    },
    setChains: (chains) => {
      log.push(`setChains:${chains.map((c) => c.id).join(",")}`);
    },
    setBoneWorld: (bone) => {
      log.push(`bone:${bone}`);
    },
    step: (dt, substeps) => {
      log.push(`step:${dt}:${substeps}`);
    },
    settle: (): SettleReceipt => ({ steps: 3, settled: true, maxVelocity: 0 }),
    readChainPositions: (chainId) => {
      if (chainId === "missing") throw new PhysicsProviderError(failVisible("physics-unknown-chain", "없는 체인", undefined, 1));
      return new Float32Array([1, 2, 3]);
    },
    reset: () => {
      log.push("reset");
    },
    dispose: () => {
      log.push("dispose");
    },
    snapshotHash: async () => "ab".repeat(32),
  };
}

describe("physics/rapier 프로토콜", () => {
  it("zod 스키마가 잘못된 요청을 거부한다", () => {
    expect(rapierRequestSchema.safeParse({ type: "step", seq: 1, dt: 0, substeps: 1 }).success).toBe(false);
    expect(rapierRequestSchema.safeParse({ type: "step", seq: 1, dt: 1 / 120, substeps: 2, extra: 1 }).success).toBe(false);
    expect(rapierRequestSchema.safeParse({ type: "setChains", seq: 2, chains: [{ ...chainAnchorFixture(), restPoints: [] }], colliders: [] }).success).toBe(false);
    expect(rapierRequestSchema.safeParse({ type: "setChains", seq: 2, chains: [chainAnchorFixture()], colliders: [{ ...headColliderFixture(), bone: "skull" }] }).success).toBe(false);
    expect(rapierRequestSchema.safeParse({ type: "settle", seq: 3, maxSteps: 601, velocityEpsilon: 1e-5 }).success).toBe(false);
    expect(rapierRequestSchema.safeParse({ type: "setChains", seq: 2, chains: [chainAnchorFixture()], colliders: [headColliderFixture()] }).success).toBe(true);
  });

  it("핸들러는 요청을 순서대로 provider에 적용하고 실패를 LabFailure로 응답한다", async () => {
    const log: string[] = [];
    const handler = createRapierProtocolHandler(mockProvider(log), () => 7);
    const init = await handler({ type: "init", seq: 0 });
    expect(init).toMatchObject({ seq: 0, ok: true, result: { kind: "status" } });
    const set = await handler({ type: "setChains", seq: 1, chains: [chainAnchorFixture({ id: "h" })], colliders: [headColliderFixture()] });
    expect(set.ok).toBe(true);
    await handler({ type: "setBoneWorld", seq: 2, bone: "head", position: [0, 1.5, 0], rotation: [0, 0, 0, 1] });
    await handler({ type: "step", seq: 3, dt: 1 / 120, substeps: 2 });
    const settle = await handler({ type: "settle", seq: 4, maxSteps: 120, velocityEpsilon: 1e-5 });
    expect(settle).toMatchObject({ ok: true, result: { kind: "settle", receipt: { steps: 3, settled: true } } });
    const read = await handler({ type: "read", seq: 5, chainId: "h" });
    expect(read.ok && read.result.kind === "positions" ? Array.from(read.result.positions) : null).toEqual([1, 2, 3]);
    const hash = await handler({ type: "snapshotHash", seq: 6 });
    expect(hash).toMatchObject({ ok: true, result: { kind: "hash", hash: "ab".repeat(32) } });
    const bad = await handler({ type: "read", seq: 7, chainId: "missing" });
    expect(bad).toMatchObject({ seq: 7, ok: false, failure: { code: "physics-unknown-chain" } });
    const invalid = await handler({ type: "warp", seq: 8 });
    expect(invalid).toMatchObject({ seq: 8, ok: false, failure: { code: "rapier-protocol-invalid", at: 7 } });
    const garbage = await handler("nope");
    expect(garbage).toMatchObject({ seq: -1, ok: false });
    expect(log).toEqual(["init", "setChains:h", "bone:head", "step:0.008333333333333333:2"]);
  });
});
