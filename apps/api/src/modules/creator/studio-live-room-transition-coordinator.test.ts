import { describe, expect, it, vi } from "vitest";

import { StudioLiveRoomTransitionCoordinator } from "./studio-live-room-transition-coordinator";

import type {
  StudioLiveRoomAdapterSocket,
  StudioLiveRoomTransitionState,
} from "./studio-live-room-transition-coordinator";

function adapterSocket(events: string[]): StudioLiveRoomAdapterSocket {
  return {
    async join(room) {
      events.push(`join:${room}`);
    },
    async leave(room) {
      events.push(`leave:${room}`);
    },
  };
}

describe("StudioLiveRoomTransitionCoordinator", () => {
  it("joins the next room before consulting the synchronous current-state boundary", async () => {
    const coordinator = new StudioLiveRoomTransitionCoordinator();
    const events: string[] = [];

    await expect(
      coordinator.enterNextRoom({
        socket: adapterSocket(events),
        nextRoom: "room:new",
        joinNextRoom: true,
        currentState: () => {
          events.push("guard");
          return "current";
        },
        onIsolationFailure: vi.fn(),
      })
    ).resolves.toBe("current");
    expect(events).toEqual(["join:room:new", "guard"]);
  });

  it.each(["socket_stale", "generation_stale"] as const)(
    "rolls back a speculative join when the boundary reports %s",
    async (state) => {
      const coordinator = new StudioLiveRoomTransitionCoordinator();
      const events: string[] = [];

      await expect(
        coordinator.enterNextRoom({
          socket: adapterSocket(events),
          nextRoom: "room:new",
          joinNextRoom: true,
          currentState: () => {
            events.push("guard");
            return state;
          },
          onIsolationFailure: vi.fn(),
        })
      ).resolves.toBe(state);
      expect(events).toEqual(["join:room:new", "guard", "leave:room:new"]);
    }
  );

  it("checks current state without adapter I/O for a same-room rejoin", async () => {
    const coordinator = new StudioLiveRoomTransitionCoordinator();
    const events: string[] = [];
    const socket = adapterSocket(events);

    await expect(
      coordinator.enterNextRoom({
        socket,
        nextRoom: "room:same",
        joinNextRoom: false,
        currentState: () => "generation_stale",
        onIsolationFailure: vi.fn(),
      })
    ).resolves.toBe("generation_stale");
    expect(events).toEqual([]);
  });

  it("rolls back the speculative room and preserves an old-room leave failure", async () => {
    const coordinator = new StudioLiveRoomTransitionCoordinator();
    const events: string[] = [];
    const socket: StudioLiveRoomAdapterSocket = {
      join: vi.fn(),
      async leave(room) {
        events.push(`leave:${room}`);
        if (room === "room:old") throw new Error("old room adapter failure");
      },
    };

    await expect(
      coordinator.leavePreviousRoom({
        socket,
        previousRoom: "room:old",
        speculativeNextRoom: "room:new",
        currentState: () => "current",
        onIsolationFailure: vi.fn(),
      })
    ).rejects.toThrow("old room adapter failure");
    expect(events).toEqual(["leave:room:old", "leave:room:new"]);
  });

  it.each(["socket_stale", "generation_stale"] as const)(
    "rolls back the speculative room after an old-room leave reports %s",
    async (state) => {
      const coordinator = new StudioLiveRoomTransitionCoordinator();
      const events: string[] = [];

      await expect(
        coordinator.leavePreviousRoom({
          socket: adapterSocket(events),
          previousRoom: "room:old",
          speculativeNextRoom: "room:new",
          currentState: () => {
            events.push("guard");
            return state;
          },
          onIsolationFailure: vi.fn(),
        })
      ).resolves.toBe(state);
      expect(events).toEqual(["leave:room:old", "guard", "leave:room:new"]);
    }
  );

  it("delegates fail-closed transport policy when rollback cannot isolate the room", async () => {
    const coordinator = new StudioLiveRoomTransitionCoordinator();
    const onIsolationFailure = vi.fn();
    const socket: StudioLiveRoomAdapterSocket = {
      async join() {},
      async leave() {
        throw new Error("rollback failed");
      },
    };

    await expect(
      coordinator.enterNextRoom({
        socket,
        nextRoom: "room:new",
        joinNextRoom: true,
        currentState: () => "socket_stale",
        onIsolationFailure,
      })
    ).resolves.toBe("socket_stale");
    expect(onIsolationFailure).toHaveBeenCalledOnce();
  });

  it("exposes the same bounded rollback for a gateway resume-boundary recheck", async () => {
    const coordinator = new StudioLiveRoomTransitionCoordinator();
    const events: string[] = [];
    const onIsolationFailure = vi.fn();

    await coordinator.rollbackEnteredRoom(
      adapterSocket(events),
      "room:speculative",
      onIsolationFailure
    );

    expect(events).toEqual(["leave:room:speculative"]);
    expect(onIsolationFailure).not.toHaveBeenCalled();
  });

  it("best-effort cleanup swallows synchronous and asynchronous adapter failures", async () => {
    const coordinator = new StudioLiveRoomTransitionCoordinator();
    const synchronous: StudioLiveRoomAdapterSocket = {
      join: vi.fn(),
      leave() {
        throw new Error("sync leave failure");
      },
    };
    const asynchronous: StudioLiveRoomAdapterSocket = {
      join: vi.fn(),
      leave: vi.fn(async () => {
        throw new Error("async leave failure");
      }),
    };

    expect(() => coordinator.leaveJoinedRoomBestEffort(synchronous, "room:new")).not.toThrow();
    coordinator.leaveJoinedRoomBestEffort(asynchronous, "room:new");
    await Promise.resolve();
    expect(asynchronous.leave).toHaveBeenCalledWith("room:new");
  });

  it("returns only the caller-supplied state without owning socket-current policy", async () => {
    const coordinator = new StudioLiveRoomTransitionCoordinator();
    const states: StudioLiveRoomTransitionState[] = ["socket_stale"];

    await expect(
      coordinator.enterNextRoom({
        socket: adapterSocket([]),
        nextRoom: "room:replacement",
        joinNextRoom: false,
        currentState: () => states[0] ?? "current",
        onIsolationFailure: vi.fn(),
      })
    ).resolves.toBe("socket_stale");
  });
});
