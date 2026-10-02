import { describe, expect, it, vi } from "vitest";

import type { StudioLiveParticipant } from "../../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import {
  createSpaceChannelPort,
  sameSpaceProximityScope,
  SPACE_PROXIMITY_MEDIA_CHANNEL,
  spacePrivateZoneAt,
  spaceProximityMediaScope,
  unwrapSpaceChannelPayload,
  type SpaceProximityMediaPeer,
} from "./space-proximity-media";

const self = { point: { x: 0, y: 0 }, activity: "available" as const, privateZoneId: null };
const peer = (id: string, x: number, extra: Partial<SpaceProximityMediaPeer> = {}): SpaceProximityMediaPeer => ({
  id, point: { x, y: 0 }, activity: "available", privateZoneId: null, ...extra,
});

describe("spaceProximityMediaScope", () => {
  it("반경 안 팀원을 가까운 순으로 최대 3명 고른다", () => {
    const ids = spaceProximityMediaScope({ self, peers: [peer("d", 150), peer("a", 40), peer("far", 400), peer("b", 80), peer("c", 120)] });
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("이미 연결된 팀원은 조금 더 멀어질 때까지 유지해 경계에서 깜빡이지 않는다", () => {
    expect(spaceProximityMediaScope({ self, peers: [peer("a", 190)] })).toEqual([]);
    expect(spaceProximityMediaScope({ self, peers: [peer("a", 190)], previous: new Set(["a"]) })).toEqual(["a"]);
    expect(spaceProximityMediaScope({ self, peers: [peer("a", 260)], previous: new Set(["a"]) })).toEqual([]);
  });

  it("프라이빗 구역은 같은 구역끼리만, 자리 비움·차단·내가 집중 중이면 연결하지 않는다", () => {
    const peers = [peer("inside", 30, { privateZoneId: "room-1" }), peer("outside", 40), peer("away", 20, { activity: "away" }), peer("blocked", 10)];
    expect(spaceProximityMediaScope({ self, peers, blockedIds: ["blocked"] })).toEqual(["outside"]);
    expect(spaceProximityMediaScope({ self: { ...self, privateZoneId: "room-1" }, peers })).toEqual(["inside"]);
    expect(spaceProximityMediaScope({ self: { ...self, activity: "focused" }, peers })).toEqual([]);
  });

  it("순서만 다른 범위는 같은 범위로 본다", () => {
    expect(sameSpaceProximityScope(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSpaceProximityScope(["a"], ["a", "b"])).toBe(false);
  });

  it("지점이 들어 있는 프라이빗 음향 구역을 찾는다", () => {
    const zones = [{ id: "pub", x: 0, y: 0, width: 100, height: 100, policy: "public" }, { id: "priv", x: 50, y: 50, width: 100, height: 100, policy: "private" }];
    expect(spacePrivateZoneAt(zones, { x: 10, y: 10 })).toBeNull();
    expect(spacePrivateZoneAt(zones, { x: 120, y: 120 })).toBe("priv");
    expect(spacePrivateZoneAt(undefined, { x: 1, y: 1 })).toBeNull();
  });
});

describe("createSpaceChannelPort", () => {
  it("보낼 때 전용 채널로 감싸고, 받을 때 같은 채널만 풀어 전달한다", () => {
    const listeners: ((sender: StudioLiveParticipant, payload: string) => void)[] = [];
    const sent: string[] = [];
    const base: StudioLiveDirectPort = {
      getPeers: () => [],
      send: (_target, payload) => { sent.push(payload); return true; },
      subscribe: (listener) => { listeners.push(listener); return () => undefined; },
    };
    const port = createSpaceChannelPort(base);
    expect(port.send("bob", "{\"kind\":\"state\"}")).toBe(true);
    expect(unwrapSpaceChannelPayload(sent[0] ?? "", SPACE_PROXIMITY_MEDIA_CHANNEL)).toBe("{\"kind\":\"state\"}");
    const received = vi.fn();
    port.subscribe(received);
    const sender: StudioLiveParticipant = { sessionId: "bob", displayName: "Bob", role: "editor" };
    listeners[0]?.(sender, "{\"kind\":\"state\",\"epoch\":\"e1\"}");
    listeners[0]?.(sender, JSON.stringify({ channel: "other", payload: "x" }));
    listeners[0]?.(sender, sent[0] ?? "");
    expect(received).toHaveBeenCalledExactlyOnceWith(sender, "{\"kind\":\"state\"}");
  });
});
