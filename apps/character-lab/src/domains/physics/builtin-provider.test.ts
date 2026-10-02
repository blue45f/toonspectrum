import { describe, expect, it } from "vitest";

import { SETTLE_DEFAULTS } from "../../contracts";
import { minimalHumanoidModelFixture } from "../../testing/recipe-fixtures";

import { PhysicsProviderError, createBuiltinPbdProvider } from "./builtin-provider";
import { chainAnchorFixture, headColliderFixture } from "./fixtures";

describe("physics/builtin-provider", () => {
  it("init은 active·deterministic이고 fixture 체인을 시뮬레이션한다", async () => {
    const provider = createBuiltinPbdProvider();
    const status = await provider.init();
    expect(status).toMatchObject({ id: "builtin-pbd", status: "active", deterministic: true });
    const model = minimalHumanoidModelFixture();
    provider.setChains(model.chains, model.colliders);
    provider.setBoneWorld("head", [0, 1.55, 0], [0, 0, 0, 1]);
    provider.setBoneWorld("hair_soft-bob_0_0", [0, 1.65, -0.05], [0, 0, 0, 1]);
    expect(provider.pendingColliderBones()).toEqual([]);
    provider.step(SETTLE_DEFAULTS.dtSeconds, SETTLE_DEFAULTS.substeps);
    const positions = provider.readChainPositions("hair-0");
    expect(positions.length).toBe(2 * 3);
    expect(Array.from(positions.subarray(0, 3))).toEqual(Array.from(Float32Array.from([0, 1.65, -0.05])));
    const receipt = provider.settle(SETTLE_DEFAULTS.defaultSteps, SETTLE_DEFAULTS.velocityEpsilon);
    expect(receipt.settled).toBe(true);
    const physicsReceipt = await provider.receipt("pose-hash");
    expect(physicsReceipt.stateHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(physicsReceipt.providerId).toBe("builtin-pbd");
    expect(physicsReceipt.steps).toBe(1 + receipt.steps);
    provider.reset();
    expect(Array.from(provider.readChainPositions("hair-0"))).toEqual(Array.from(Float32Array.from([0, 1.65, -0.05, 0, 1.57, -0.05])));
    provider.dispose();
    expect(() => provider.step(1 / 120, 2)).toThrow(PhysicsProviderError);
  });

  it("setChains 전 step·알 수 없는 체인·예산 초과는 fail-visible", async () => {
    const provider = createBuiltinPbdProvider();
    await provider.init();
    expect(() => provider.step(1 / 120, 2)).toThrow(PhysicsProviderError);
    provider.setChains([chainAnchorFixture()], [headColliderFixture()]);
    expect(() => provider.readChainPositions("nope")).toThrow(/알 수 없는 체인/u);
    expect(provider.pendingColliderBones()).toEqual(["head"]);
    const tooMany = Array.from({ length: 65 }, (_, i) => chainAnchorFixture({ id: `c${String(i).padStart(2, "0")}`, segments: 2 }));
    let caught: unknown = null;
    try {
      provider.setChains(tooMany, []);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PhysicsProviderError);
    if (caught instanceof PhysicsProviderError) expect(caught.failure.code).toBe("budget-exceeded");
  });

  it("같은 입력·같은 스텝은 같은 상태 해시를 낸다(setBoneWorld 순서 무관)", async () => {
    const make = async (order: "ab" | "ba") => {
      const provider = createBuiltinPbdProvider();
      await provider.init();
      const chains = [chainAnchorFixture({ id: "x", root: [0.05, 1.72, 0] }), chainAnchorFixture({ id: "y", root: [-0.05, 1.72, 0], direction: [-0.3, -1, 0] })];
      provider.setChains(order === "ab" ? chains : [...chains].reverse(), [headColliderFixture(), { bone: "neck", a: [0, 0, 0], b: [0, 0.1, 0], radius: 0.05 }]);
      const bones: Array<[string, [number, number, number]]> = [
        ["head", [0, 1.55, 0]],
        ["neck", [0, 1.45, 0]],
      ];
      for (const [bone, position] of order === "ab" ? bones : [...bones].reverse()) provider.setBoneWorld(bone, position, [0, 0, 0, 1]);
      for (let i = 0; i < 30; i += 1) provider.step(1 / 120, 2);
      return provider.solver()?.stateHash();
    };
    expect(await make("ab")).toBe(await make("ba"));
  });
});
