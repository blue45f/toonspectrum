import { describe, expect, it } from "vitest";

import {
  buildStudioLiveLayerOwnershipByItemId,
  FREE_STUDIO_LIVE_LAYER_OWNERSHIP,
  listStudioLiveLayerOwnershipLocksOnPage,
  resolveStudioLiveLayerOwnership,
} from "./studio-live-layer-ownership";
import {
  studioLiveElementResource,
  studioLivePageResource,
  type StudioLiveLockLike,
} from "./studio-live-mutation-guard";

function lock(
  resource: string,
  sessionId: string,
  displayName: string,
  leaseUntil = Date.now() + 60_000,
): StudioLiveLockLike {
  return {
    resource,
    claimId: `claim-${sessionId}-${resource}`,
    owner: { sessionId, displayName },
    leaseUntil,
  };
}

describe("studio live layer ownership", () => {
  const pageId = "page-1";
  const layerA = "layer-a";
  const layerB = "layer-b";
  const now = 1_000_000;

  it("returns free ownership when no locks apply", () => {
    expect(
      resolveStudioLiveLayerOwnership({
        pageId,
        elementId: layerA,
        locks: [],
        selfSessionId: "me",
        now,
      }),
    ).toEqual(FREE_STUDIO_LIVE_LAYER_OWNERSHIP);
  });

  it("marks self-held element leases", () => {
    const ownership = resolveStudioLiveLayerOwnership({
      pageId,
      elementId: layerA,
      locks: [lock(studioLiveElementResource(pageId, layerA), "me", "나")],
      selfSessionId: "me",
      now,
    });
    expect(ownership.kind).toBe("self");
    expect(ownership.blocksLocalEdit).toBe(false);
    expect(ownership.statusLabel).toBe("내가 편집 중");
  });

  it("marks peer element leases as blocking", () => {
    const ownership = resolveStudioLiveLayerOwnership({
      pageId,
      elementId: layerA,
      locks: [lock(studioLiveElementResource(pageId, layerA), "peer", "민수")],
      selfSessionId: "me",
      now,
    });
    expect(ownership.kind).toBe("peer");
    expect(ownership.blocksLocalEdit).toBe(true);
    expect(ownership.ownerDisplayName).toBe("민수");
    expect(ownership.statusLabel).toContain("민수");
    expect(ownership.ownerColor).toMatch(/^#/);
  });

  it("page peer lock shadows every element on the page", () => {
    const ownership = resolveStudioLiveLayerOwnership({
      pageId,
      elementId: layerA,
      locks: [
        lock(studioLivePageResource(pageId), "peer", "지민"),
        lock(studioLiveElementResource(pageId, layerA), "me", "나"),
      ],
      selfSessionId: "me",
      now,
    });
    expect(ownership.kind).toBe("page-peer");
    expect(ownership.blocksLocalEdit).toBe(true);
    expect(ownership.statusLabel).toContain("페이지");
  });

  it("ignores expired leases", () => {
    expect(
      resolveStudioLiveLayerOwnership({
        pageId,
        elementId: layerA,
        locks: [
          lock(
            studioLiveElementResource(pageId, layerA),
            "peer",
            "만료",
            now - 1,
          ),
        ],
        selfSessionId: "me",
        now,
      }).kind,
    ).toBe("free");
  });

  it("builds a dense map only for non-free entries", () => {
    const map = buildStudioLiveLayerOwnershipByItemId({
      pageId,
      elementIds: [layerA, layerB],
      locks: [
        lock(studioLiveElementResource(pageId, layerA), "peer", "민수"),
      ],
      selfSessionId: "me",
      now,
    });
    expect(map.size).toBe(1);
    expect(map.get(layerA)?.kind).toBe("peer");
    expect(map.get(layerB)).toBeUndefined();
  });

  it("lists active locks that belong to a page", () => {
    const locks = listStudioLiveLayerOwnershipLocksOnPage(
      [
        lock(studioLiveElementResource(pageId, layerA), "peer", "민수"),
        lock(studioLivePageResource("other"), "peer", "다른페이지"),
        lock(studioLiveElementResource(pageId, layerB), "me", "나", now - 10),
      ],
      pageId,
      now,
    );
    expect(locks).toHaveLength(1);
    expect(locks[0]!.resource).toBe(studioLiveElementResource(pageId, layerA));
  });
});
