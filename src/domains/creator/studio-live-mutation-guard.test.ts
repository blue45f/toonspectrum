import { describe, expect, it } from "vitest";

import {
  canBeginStudioLiveMutation,
  findConflictingStudioLiveLock,
  planStudioLiveHeldResourceClear,
  planStudioLiveHeldResourceReplace,
  selfHoldsStudioLiveLock,
  studioLiveElementResource,
  studioLiveMutationResources,
  studioLivePageResource,
} from "./studio-live-mutation-guard";

const now = 1_000_000;

function lock(
  resource: string,
  sessionId: string,
  leaseUntil = now + 10_000,
  displayName = "동료"
) {
  return {
    resource,
    claimId: `c-${resource}`,
    owner: { sessionId, displayName },
    leaseUntil,
  };
}

describe("studio live mutation guard", () => {
  it("builds hierarchical page and element resources", () => {
    expect(studioLivePageResource("p1")).toBe("page:p1");
    expect(studioLiveElementResource("p1", "e2")).toBe("element:p1:e2");
    expect(studioLiveMutationResources({ pageId: "p1", elementIds: ["e1", "e1", "e2"] })).toEqual([
      "element:p1:e1",
      "element:p1:e2",
    ]);
    expect(studioLiveMutationResources({ pageId: "p1", elementIds: [] })).toEqual(["page:p1"]);
  });

  it("ignores expired and self-owned locks", () => {
    const locks = [
      lock("page:p1", "self", now - 1),
      lock("element:p1:e1", "self", now + 5_000),
    ];
    expect(findConflictingStudioLiveLock(locks, "page:p1", "self", now)).toBeNull();
    expect(selfHoldsStudioLiveLock(locks, "element:p1:e1", "self", now)).toBe(true);
    expect(canBeginStudioLiveMutation({
      locks,
      pageId: "p1",
      elementIds: ["e1"],
      selfSessionId: "self",
      now,
    })).toEqual({ ok: true });
  });

  it("blocks when another editor holds page or element lock", () => {
    const pageLock = lock("page:p1", "other", now + 5_000, "민수");
    const deniedPage = canBeginStudioLiveMutation({
      locks: [pageLock],
      pageId: "p1",
      elementIds: ["e9"],
      selfSessionId: "self",
      now,
    });
    expect(deniedPage.ok).toBe(false);
    if (!deniedPage.ok) {
      expect(deniedPage.reason).toContain("민수");
      expect(deniedPage.lock.resource).toBe("page:p1");
    }

    const elementLock = lock("element:p1:e2", "other2", now + 5_000, "지영");
    const deniedElement = canBeginStudioLiveMutation({
      locks: [elementLock],
      pageId: "p1",
      elementIds: ["e2"],
      selfSessionId: "self",
      now,
    });
    expect(deniedElement.ok).toBe(false);
    if (!deniedElement.ok) expect(deniedElement.lock.resource).toBe("element:p1:e2");

    const deniedPageByChild = canBeginStudioLiveMutation({
      locks: [elementLock],
      pageId: "p1",
      elementIds: null,
      selfSessionId: "self",
      now,
    });
    expect(deniedPageByChild.ok).toBe(false);

    expect(canBeginStudioLiveMutation({
      locks: [elementLock],
      pageId: "p1",
      elementIds: ["sibling"],
      selfSessionId: "self",
      now,
    })).toEqual({ ok: true });
  });

  it("planStudioLiveHeldResourceReplace retains the intersection and changes only the delta", () => {
    const plan = planStudioLiveHeldResourceReplace(
      ["page:p1", "element:p1:a"],
      ["page:p1", "element:p1:b"]
    );
    expect(plan.toRelease).toEqual(["element:p1:a"]);
    expect(plan.toClaim).toEqual(["element:p1:b"]);
    expect(plan.held).toEqual(["page:p1", "element:p1:b"]);
  });

  it("planStudioLiveHeldResourceClear releases every tracked resource", () => {
    const plan = planStudioLiveHeldResourceClear(["page:p1", "element:p1:a"]);
    expect(plan.toRelease).toEqual(["page:p1", "element:p1:a"]);
    expect(plan.held).toEqual([]);
  });

  it("claim/release contract: simulated room never strands after replace+clear", () => {
    const claimed = new Set<string>();
    const room = {
      claimLock(resource: string) {
        claimed.add(resource);
      },
      releaseLock(resource: string) {
        claimed.delete(resource);
      },
    };
    let held: string[] = [];
    // First edit claim
    {
      const next = studioLiveMutationResources({ pageId: "p1", elementIds: null });
      const plan = planStudioLiveHeldResourceReplace(held, next);
      for (const resource of plan.toRelease) room.releaseLock(resource);
      for (const resource of plan.toClaim) room.claimLock(resource);
      held = [...plan.held];
    }
    expect([...claimed].sort()).toEqual(["page:p1"]);
    // A concrete element edit replaces the page-wide claim instead of holding both scopes.
    {
      const next = studioLiveMutationResources({ pageId: "p1", elementIds: ["e9"] });
      const plan = planStudioLiveHeldResourceReplace(held, next);
      for (const resource of plan.toRelease) room.releaseLock(resource);
      for (const resource of plan.toClaim) room.claimLock(resource);
      held = [...plan.held];
    }
    expect([...claimed].sort()).toEqual(["element:p1:e9"]);
    // Early-exit path: clear must empty room
    {
      const plan = planStudioLiveHeldResourceClear(held);
      for (const resource of plan.toRelease) room.releaseLock(resource);
      held = [...plan.held];
    }
    expect(held).toEqual([]);
    expect(claimed.size).toBe(0);
  });
});
