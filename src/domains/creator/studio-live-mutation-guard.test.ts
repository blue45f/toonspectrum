import { describe, expect, it } from "vitest";

import {
  canBeginStudioLiveMutation,
  findConflictingStudioLiveLock,
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
      "page:p1",
      "element:p1:e1",
      "element:p1:e2",
    ]);
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
  });
});
