import { describe, expect, it, vi } from "vitest";

import { StudioLiveAdapterCleanupService } from "./studio-live-adapter-cleanup.service";

import type { StudioLiveCleanupSocket } from "./studio-live-adapter-cleanup.service";

describe("StudioLiveAdapterCleanupService", () => {
  it("starts room leave, finalizes local state, then closes the transport", () => {
    const service = new StudioLiveAdapterCleanupService();
    const events: string[] = [];
    const pendingLeave = new Promise<void>(() => undefined);
    const socket: StudioLiveCleanupSocket = {
      leave(room) {
        events.push(`leave:${room}`);
        return pendingLeave;
      },
      disconnect(close) {
        events.push(`disconnect:${String(close)}`);
      },
    };

    service.closeRoomTransport({
      socket,
      room: "studio-live:work-1",
      finalizeLocalState: () => events.push("finalize"),
    });

    expect(events).toEqual([
      "leave:studio-live:work-1",
      "finalize",
      "disconnect:true",
    ]);
  });

  it("does not wait for a pending adapter leave before finalizing and disconnecting", () => {
    const service = new StudioLiveAdapterCleanupService();
    const finalizeLocalState = vi.fn();
    const disconnect = vi.fn();

    service.closeRoomTransport({
      socket: {
        leave: vi.fn(() => new Promise<void>(() => undefined)),
        disconnect,
      },
      room: "studio-live:work-1",
      finalizeLocalState,
    });

    expect(finalizeLocalState).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it("fails closed when adapter leave throws synchronously", () => {
    const service = new StudioLiveAdapterCleanupService();
    const finalizeLocalState = vi.fn();
    const disconnect = vi.fn();

    service.closeRoomTransport({
      socket: {
        leave() {
          throw new Error("adapter leave failed");
        },
        disconnect,
      },
      room: "studio-live:work-1",
      finalizeLocalState,
    });

    expect(finalizeLocalState).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it("handles rejected adapter leave promises without delaying cleanup", async () => {
    const service = new StudioLiveAdapterCleanupService();
    const finalizeLocalState = vi.fn();
    const disconnect = vi.fn();
    const leave = vi.fn(() => Promise.reject(new Error("adapter leave rejected")));

    service.closeRoomTransport({
      socket: { leave, disconnect },
      room: "studio-live:work-1",
      finalizeLocalState,
    });
    await Promise.resolve();

    expect(leave).toHaveBeenCalledWith("studio-live:work-1");
    expect(finalizeLocalState).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it("still closes the transport when caller-owned local cleanup throws", () => {
    const service = new StudioLiveAdapterCleanupService();
    const disconnect = vi.fn();

    expect(() =>
      service.closeRoomTransport({
        socket: { leave: vi.fn(), disconnect },
        room: "studio-live:work-1",
        finalizeLocalState() {
          throw new Error("local cleanup failed");
        },
      })
    ).toThrow("local cleanup failed");
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it("finalizes process-local state even when the socket is already absent", () => {
    const service = new StudioLiveAdapterCleanupService();
    const finalizeLocalState = vi.fn();

    service.closeRoomTransport({
      socket: undefined,
      room: "studio-live:work-1",
      finalizeLocalState,
    });

    expect(finalizeLocalState).toHaveBeenCalledOnce();
  });
});
