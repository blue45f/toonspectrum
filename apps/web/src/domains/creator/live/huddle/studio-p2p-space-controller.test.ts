import { describe, expect, it, vi } from "vitest";

import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";
import {
  StudioP2pSpaceController,
  STUDIO_P2P_SPACE_HEARTBEAT_MS,
  type StudioP2pSpaceDependencies,
} from "./studio-p2p-space-controller";

const A: StudioLiveParticipant = { sessionId: "a", displayName: "작가 A", role: "editor" };
const B: StudioLiveParticipant = { sessionId: "b", displayName: "작가 B", role: "editor" };

function pair() {
  const listeners = new Map<string, (sender: StudioLiveParticipant, raw: string) => void>();
  const packets: { from: string; to: string; raw: string }[] = [];
  function port(self: StudioLiveParticipant, other: StudioLiveParticipant): StudioLiveDirectPort {
    return {
      getPeers: () => [other],
      subscribe: (listener) => {
        listeners.set(self.sessionId, listener);
        return () => { listeners.delete(self.sessionId); };
      },
      send: (target, raw) => {
        packets.push({ from: self.sessionId, to: target, raw });
        listeners.get(target)?.(self, raw);
        return true;
      },
    };
  }
  const a = new StudioP2pSpaceController(A, port(A, B), { id: () => "epoch-a" });
  const b = new StudioP2pSpaceController(B, port(B, A), { id: () => "epoch-b" });
  a.start();
  b.start();
  a.flush();
  return { a, b, packets };
}

describe("StudioP2pSpaceController", () => {
  it("exchanges ephemeral positions only through the direct RTC lane", () => {
    const { a, b, packets } = pair();
    expect(a.snapshot().peers[0]?.participant.sessionId).toBe("b");
    expect(b.snapshot().peers[0]?.participant.sessionId).toBe("a");

    a.enterZone("drawing");
    const remote = b.snapshot().peers[0];
    expect(remote?.state.zone).toBe("drawing");
    expect(packets.some(({ raw }) => JSON.parse(raw).kind === "space-state")).toBe(true);

    a.close();
    b.close();
  });

  it("derives proximity from the same room and normalized coordinates", () => {
    const { a, b } = pair();
    a.enterZone("review");
    b.enterZone("review");
    a.flush();
    b.flush();

    expect(a.snapshot().nearbySessionIds).toEqual(["b"]);
    expect(b.snapshot().nearbySessionIds).toEqual(["a"]);

    b.enterZone("writers");
    b.flush();
    expect(a.snapshot().nearbySessionIds).toEqual([]);

    a.close();
    b.close();
  });

  it("throttles rapid pointer movement but flushes the final location", () => {
    let now = 1_000;
    const send = vi.fn<StudioLiveDirectPort["send"]>(() => true);
    const port: StudioLiveDirectPort = {
      getPeers: () => [B],
      subscribe: () => () => undefined,
      send,
    };
    const controller = new StudioP2pSpaceController(A, port, { id: () => "epoch-a", now: () => now });
    controller.start();
    send.mockClear();

    controller.moveTo(20, 20);
    now += 10;
    controller.moveTo(30, 30);
    expect(send).toHaveBeenCalledTimes(1);

    controller.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls.at(-1)?.[1] as string)).toMatchObject({ x: 30, y: 30 });

    controller.close();
  });

  it("expires peers that leave the authenticated direct peer set", () => {
    let now = 0;
    let tick: () => void = () => undefined;
    let peers: StudioLiveParticipant[] = [B];
    let inbound: (sender: StudioLiveParticipant, raw: string) => void = () => undefined;
    const deps: StudioP2pSpaceDependencies = {
      id: () => "epoch-a",
      now: () => now,
      setInterval: (callback, delay) => {
        expect(delay).toBe(STUDIO_P2P_SPACE_HEARTBEAT_MS);
        tick = callback;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: vi.fn(),
    };
    const port: StudioLiveDirectPort = {
      getPeers: () => peers,
      subscribe: (listener) => {
        inbound = listener;
        return () => { inbound = () => undefined; };
      },
      send: () => true,
    };
    const controller = new StudioP2pSpaceController(A, port, deps);
    controller.start();
    inbound(B, JSON.stringify({
      kind: "space-state",
      epoch: "epoch-b",
      sequence: 1,
      x: 17,
      y: 17,
      zone: "lobby",
      activity: "available",
    }));
    expect(controller.snapshot().peers).toHaveLength(1);

    peers = [];
    now += STUDIO_P2P_SPACE_HEARTBEAT_MS;
    tick();
    expect(controller.snapshot().peers).toHaveLength(0);

    controller.close();
  });

  it("does not start a space session for viewers", () => {
    const subscribe = vi.fn(() => () => undefined);
    const send = vi.fn<StudioLiveDirectPort["send"]>(() => true);
    const controller = new StudioP2pSpaceController(
      { ...A, role: "viewer" },
      { getPeers: () => [B], subscribe, send },
      { id: () => "epoch-viewer" },
    );
    controller.start();
    expect(subscribe).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    controller.close();
  });
});
