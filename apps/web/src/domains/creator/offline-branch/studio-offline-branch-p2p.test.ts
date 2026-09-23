import { describe, expect, it, vi } from "vitest";

import { connectStudioOfflineBranchPeerSync } from "./studio-offline-branch-p2p";

import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";
import type { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

describe("connectStudioOfflineBranchPeerSync", () => {
  it("does not rebroadcast an unchanged pending branch signature", () => {
    const broadcast = vi.fn();
    const peerIds: string[] = [];
    const unsubscribeFabric = vi.fn();
    const unregisterBulk = vi.fn();
    const unsubscribeRuntime = vi.fn();
    const status = {
      state: "editing" as const,
      pendingOperations: 1,
      conflicts: 0,
      canonicalAuthority: false,
      durability: "durable" as const,
      storageMessage: "test",
    };
    const runtime = {
      status,
      snapshot: { heads: ["head-1"] },
      subscribe: vi.fn((listener: (next: typeof status) => void) => {
        listener(status);
        return unsubscribeRuntime;
      }),
    } as unknown as StudioOfflineBranchRuntime;
    const room = {
      peerFabric: {
        broadcast,
        getPeers: vi.fn(() => peerIds.map((sessionId) => ({ sessionId }))),
        subscribe: vi.fn(() => unsubscribeFabric),
      },
      peerBulk: {
        register: vi.fn(() => unregisterBulk),
      },
    } as unknown as StudioLiveRoom;

    const sync = connectStudioOfflineBranchPeerSync({
      runtime,
      room,
      workId: "work-1",
      scope: "user-1",
    });

    expect(sync.enabled).toBe(true);
    expect(broadcast).toHaveBeenCalledTimes(1);
    sync.announce();
    expect(broadcast).toHaveBeenCalledTimes(1);

    peerIds.push("peer-2");
    sync.announce();
    expect(broadcast).toHaveBeenCalledTimes(2);

    sync.close();
    expect(unsubscribeRuntime).toHaveBeenCalledOnce();
    expect(unsubscribeFabric).toHaveBeenCalledOnce();
    expect(unregisterBulk).toHaveBeenCalledOnce();
  });
});
