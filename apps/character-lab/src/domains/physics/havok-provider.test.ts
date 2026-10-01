import { describe, expect, it } from "vitest";

import { PhysicsProviderError } from "./builtin-provider";
import { HAVOK_UNAVAILABLE_REASON_KO, createHavokProvider } from "./havok-provider";

describe("physics/havok-provider", () => {
  it("항상 unavailable이며 시뮬레이션 호출은 사유와 함께 실패한다", async () => {
    const provider = createHavokProvider();
    const status = await provider.init();
    expect(status).toEqual({ id: "havok", status: "unavailable", reasonKo: HAVOK_UNAVAILABLE_REASON_KO });
    expect(HAVOK_UNAVAILABLE_REASON_KO).toContain("@babylonjs/havok");
    expect(() => provider.setChains([], [])).toThrow(PhysicsProviderError);
    expect(() => provider.step(1 / 120, 2)).toThrow(/havok/u);
    expect(() => provider.settle(10, 1e-5)).toThrow(PhysicsProviderError);
    expect(() => provider.readChainPositions("x")).toThrow(PhysicsProviderError);
    expect(() => provider.reset()).not.toThrow();
    expect(() => provider.dispose()).not.toThrow();
  });
});
