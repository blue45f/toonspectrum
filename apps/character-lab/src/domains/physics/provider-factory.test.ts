import { describe, expect, it } from "vitest";

import { PHYSICS_PROVIDER_IDS } from "../../contracts";

import { PhysicsProviderError } from "./builtin-provider";
import { PHYSICS_PROVIDER_CATALOG, createPhysicsProviderFactory } from "./provider-factory";

import type { PhysicsProviderId } from "../../contracts";

describe("physics/provider-factory", () => {
  it("카탈로그는 계약의 provider id와 1:1이다", () => {
    expect(PHYSICS_PROVIDER_CATALOG.map((d) => d.id)).toEqual([...PHYSICS_PROVIDER_IDS]);
    expect(PHYSICS_PROVIDER_CATALOG.find((d) => d.id === "builtin-pbd")?.role).toBe("primary");
    expect(PHYSICS_PROVIDER_CATALOG.find((d) => d.id === "havok")?.role).toBe("unavailable");
  });

  it("요청한 id의 provider만 만들고 알 수 없는 id는 거부한다", async () => {
    const factory = createPhysicsProviderFactory();
    for (const id of PHYSICS_PROVIDER_IDS) {
      const provider = await factory(id);
      expect(provider.id).toBe(id);
    }
    const builtin = await factory("builtin-pbd");
    expect((await builtin.init()).status).toBe("active");
    const havok = await factory("havok");
    expect((await havok.init()).status).toBe("unavailable");
    await expect(factory("bullet" as PhysicsProviderId)).rejects.toBeInstanceOf(PhysicsProviderError);
  });
});
