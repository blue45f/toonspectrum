import { describe, expect, it } from "vitest";

import {
  createAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  buildStudioVrmHairGeometryIdentity,
  planStudioVrmHairTransition,
} from "./studio-vrm-hair-transition";

describe("studio VRM hair transition", () => {
  it("does not rebuild generated geometry when only original-hair visibility changes", () => {
    const first = createAvatarForgeState("soft-bob").hair;
    const second = { ...first, replaceOriginal: !first.replaceOriginal };
    const plan = planStudioVrmHairTransition(first, second);

    expect(plan.visibilityChanged).toBe(true);
    expect(plan.geometryChanged).toBe(false);
    expect(plan.resetDynamicState).toBe(false);
    expect(buildStudioVrmHairGeometryIdentity(first))
      .toBe(buildStudioVrmHairGeometryIdentity(second));
  });

  it("forces a fresh surface and dynamic state when style or shape changes", () => {
    const bob = createAvatarForgeState("soft-bob").hair;
    const pony = { ...bob, style: "ponytail" as const };
    const longer = { ...pony, length: Math.min(1.7, pony.length + 0.2) };

    expect(planStudioVrmHairTransition(bob, pony)).toEqual(expect.objectContaining({
      styleChanged: true,
      geometryChanged: true,
      resetDynamicState: true,
      shouldRender: true,
    }));
    expect(planStudioVrmHairTransition(pony, longer).geometryChanged).toBe(true);
  });

  it("turning hair off disposes the previous surface without changing the visibility contract", () => {
    const hair = createAvatarForgeState("soft-bob").hair;
    const none = { ...hair, style: "none" as const };
    const plan = planStudioVrmHairTransition(hair, none);

    expect(plan.shouldRender).toBe(false);
    expect(plan.geometryChanged).toBe(true);
    expect(plan.styleChanged).toBe(true);
    expect(plan.visibilityChanged).toBe(false);
  });

  it("produces deterministic identities for equivalent sanitized values", () => {
    const hair = createAvatarForgeState("soft-bob").hair;
    expect(buildStudioVrmHairGeometryIdentity({ ...hair }))
      .toBe(buildStudioVrmHairGeometryIdentity(hair));
  });
});
