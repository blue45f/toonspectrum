import { describe, expect, it } from "vitest";

import { PhysicsProviderError } from "./builtin-provider";
import { chainAnchorFixture, headColliderFixture } from "./fixtures";
import { createRapierProvider, dragForceToLinearDamping } from "./rapier-provider";

describe("physics/rapier-provider (Node 실제 init)", () => {
  it("동적 import·init 후 체인 1개를 스텝하고 삽입 순서·스냅샷 해시가 결정적이다", async () => {
    const run = async () => {
      const provider = createRapierProvider();
      const status = await provider.init();
      expect(status.status).toBe("active");
      if (status.status === "active") {
        expect(status.deterministic).toBe(true);
        expect(status.versionLabel).toContain("0.19");
      }
      const chains = [chainAnchorFixture({ id: "b", root: [0.05, 1.72, 0], segments: 4 }), chainAnchorFixture({ id: "a", root: [-0.05, 1.72, 0], segments: 3, direction: [-0.3, -1, 0] })];
      provider.setChains(chains, [headColliderFixture()]);
      expect(provider.pendingColliderBones()).toEqual(["head"]);
      provider.setBoneWorld("head", [0, 1.55, 0], [0, 0, 0, 1]);
      expect(provider.pendingColliderBones()).toEqual([]);
      const order = provider.insertionOrder();
      expect(order.map((o) => o.chainId)).toEqual(["a", "b"]);
      const handles = order.flatMap((o) => [...o.handles]);
      for (let i = 1; i < handles.length; i += 1) expect(handles[i]).toBeGreaterThan(handles[i - 1] ?? -1);
      provider.step(1 / 120, 2);
      const positions = provider.readChainPositions("b");
      expect(positions.length).toBe(5 * 3);
      for (let i = 0; i < positions.length; i += 1) expect(Number.isFinite(positions[i])).toBe(true);
      expect(positions[0]).toBeCloseTo(0.05, 6);
      expect(positions[1]).toBeCloseTo(1.72, 6);
      expect(positions[2]).toBeCloseTo(0, 6);
      const receipt = provider.settle(60, 1e-7);
      expect(receipt.steps).toBeGreaterThan(0);
      expect(receipt.steps).toBeLessThanOrEqual(60);
      const hash = await provider.snapshotHash();
      expect(hash).toMatch(/^[0-9a-f]{64}$/u);
      expect(() => provider.readChainPositions("zzz")).toThrow(PhysicsProviderError);
      provider.dispose();
      return hash;
    };
    const first = await run();
    const second = await run();
    expect(second).toBe(first);
  }, 60000);

  it("init 전 setChains는 fail-visible이고 로더 실패는 unavailable 사유를 낸다", async () => {
    const fresh = createRapierProvider();
    expect(() => fresh.setChains([chainAnchorFixture()], [])).toThrow(PhysicsProviderError);
    const broken = createRapierProvider({ load: () => Promise.reject(new Error("wasm 로드 실패")) });
    const status = await broken.init();
    expect(status).toMatchObject({ id: "rapier", status: "unavailable" });
    if (status.status === "unavailable") expect(status.reasonKo).toContain("wasm 로드 실패");
    expect(dragForceToLinearDamping(0.5)).toBeCloseTo(Math.log(2) * 120, 6);
    expect(dragForceToLinearDamping(0)).toBe(0);
  });
});
