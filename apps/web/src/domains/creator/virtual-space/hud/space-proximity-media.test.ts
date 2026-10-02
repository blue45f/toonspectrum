import { describe, expect, it, vi } from "vitest";

import type { StudioLiveParticipant } from "../../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import {
  createSpaceChannelPort,
  sameSpaceProximityScope,
  SPACE_PROXIMITY_MEDIA_CHANNEL,
  SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS,
  SPACE_PROXIMITY_MEDIA_RADIUS,
  spacePrivateZoneAt,
  spaceProximityMediaGain,
  spaceProximityMediaScope,
  spaceProximityMediaScopePeers,
  spaceProximityRangeRadii,
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

describe("spaceProximityMediaGain", () => {
  it("가까우면 1, 이탈 경계에서 0으로 단조롭게 줄어든다", () => {
    const distances = [0, 32, 64, 100, 140, 168, 192, 216, 260];
    const gains = distances.map((distance) => spaceProximityMediaGain(distance));
    expect(gains[0]).toBe(1);
    expect(gains[2]).toBe(1);
    expect(gains[7]).toBe(0);
    expect(gains[8]).toBe(0);
    for (let index = 1; index < gains.length; index += 1) {
      expect(gains[index]!).toBeLessThanOrEqual(gains[index - 1]!);
    }
  });

  it("진입 경계(168px)에서는 0이 아닌 낮은 값이라 소리가 갑자기 붙지 않는다", () => {
    const atEnter = spaceProximityMediaGain(SPACE_PROXIMITY_MEDIA_RADIUS);
    expect(atEnter).toBeGreaterThan(0);
    expect(atEnter).toBeLessThan(0.5);
    // 경계를 오갈 때 볼륨이 튀지 않는다: 168px 안팎의 차이가 작다.
    expect(Math.abs(spaceProximityMediaGain(160) - spaceProximityMediaGain(176))).toBeLessThan(0.15);
    expect(spaceProximityMediaGain(SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS)).toBe(0);
  });

  it("유효하지 않은 거리와 끄기 모드는 항상 0이다", () => {
    expect(spaceProximityMediaGain(Number.NaN)).toBe(0);
    expect(spaceProximityMediaGain(-10)).toBe(0);
    expect(spaceProximityMediaGain(0, { range: "off" })).toBe(0);
    expect(spaceProximityMediaGain(100, { range: "off" })).toBe(0);
  });

  it("좁게 모드는 더 가까운 거리에서 0이 된다", () => {
    expect(spaceProximityMediaGain(32, { range: "quiet" })).toBe(1);
    expect(spaceProximityMediaGain(80, { range: "quiet" })).toBeGreaterThan(0);
    expect(spaceProximityMediaGain(80, { range: "quiet" })).toBeLessThan(0.5);
    expect(spaceProximityMediaGain(112, { range: "quiet" })).toBe(0);
    expect(spaceProximityMediaGain(150)).toBeGreaterThan(0);
  });

  it("프라이빗 구역 안에서는 페이드 없이 연결 범위 안에서 1이다", () => {
    expect(spaceProximityMediaGain(200, { inPrivateZone: true })).toBe(1);
    expect(spaceProximityMediaGain(216, { inPrivateZone: true })).toBe(1);
    expect(spaceProximityMediaGain(217, { inPrivateZone: true })).toBe(0);
  });
});

describe("spaceProximityRangeRadii", () => {
  it("기본 모드는 기존 진입·이탈 반경을 그대로 쓴다", () => {
    expect(spaceProximityRangeRadii("standard")).toMatchObject({
      radius: SPACE_PROXIMITY_MEDIA_RADIUS,
      leaveRadius: SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS,
    });
    expect(spaceProximityRangeRadii("quiet")!.radius).toBeLessThan(SPACE_PROXIMITY_MEDIA_RADIUS);
    expect(spaceProximityRangeRadii("off")).toBeNull();
  });
});

describe("spaceProximityMediaScopePeers", () => {
  it("연결 대상을 거리·게인과 함께 가까운 순으로 돌려준다", () => {
    const scoped = spaceProximityMediaScopePeers({ self, peers: [peer("far-peer", 190), peer("near-peer", 40)] , previous: new Set(["far-peer"]) });
    expect(scoped.map((item) => item.id)).toEqual(["near-peer", "far-peer"]);
    expect(scoped[0]).toMatchObject({ distance: 40, gain: 1 });
    expect(scoped[1]!.distance).toBe(190);
    expect(scoped[1]!.gain).toBeGreaterThan(0);
    expect(scoped[1]!.gain).toBeLessThan(0.2);
    expect(spaceProximityMediaScope({ self, peers: [peer("near-peer", 40)] })).toEqual(["near-peer"]);
  });

  it("범위 모드가 끄기면 아무도 연결하지 않고, 좁게면 반경이 줄어든다", () => {
    const peers = [peer("a", 60), peer("b", 120)];
    expect(spaceProximityMediaScope({ self, peers, range: "off" })).toEqual([]);
    expect(spaceProximityMediaScope({ self, peers, range: "quiet" })).toEqual(["a"]);
    expect(spaceProximityMediaScope({ self, peers, range: "standard" })).toEqual(["a", "b"]);
  });

  it("프라이빗 구역 안에서는 게인이 거리에 줄지 않는다", () => {
    const scoped = spaceProximityMediaScopePeers({
      self: { ...self, privateZoneId: "room-1" },
      peers: [peer("inside", 150, { privateZoneId: "room-1" })],
    });
    expect(scoped).toEqual([{ id: "inside", distance: 150, gain: 1 }]);
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
