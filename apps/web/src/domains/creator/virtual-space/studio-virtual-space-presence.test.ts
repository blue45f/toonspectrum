import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  parseStudioPresenceEmote,
  parseStudioPresenceUserStatus,
  parseStudioVirtualSpacePacket,
  sanitizeStudioPresenceBubble,
  STUDIO_PRESENCE_BUBBLE_MAX_LENGTH,
  STUDIO_PRESENCE_BUBBLE_TTL_MS,
  STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES,
  STUDIO_VIRTUAL_SPACE_WIRE,
  StudioVirtualSpacePresenceController,
} from "./studio-virtual-space-presence";

function participant(sessionId: string, displayName: string): StudioLiveParticipant {
  return { sessionId, displayName, role: "editor" };
}

/** 두 컨트롤러를 직접 연결하는 가짜 포트. send 즉시 상대에게 전달한다. */
function createLinkedPorts(participants: StudioLiveParticipant[]) {
  const listeners = new Map<string, (sender: StudioLiveParticipant, raw: string) => void>();
  const sent: { readonly from: string; readonly to: string; readonly raw: string }[] = [];
  const portFor = (self: StudioLiveParticipant): StudioLiveDirectPort => ({
    getPeers: () => participants,
    send: (targetSessionId: string, payload: string) => {
      sent.push({ from: self.sessionId, to: targetSessionId, raw: payload });
      listeners.get(targetSessionId)?.(self, payload);
      return true;
    },
    subscribe: (listener: (sender: StudioLiveParticipant, raw: string) => void) => {
      listeners.set(self.sessionId, listener);
      return () => {
        listeners.delete(self.sessionId);
      };
    },
  });
  return { portFor, sent };
}

function createClock() {
  let now = 1_700_000_000_000;
  const handlers: (() => void)[] = [];
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    tick: () => {
      for (const handler of [...handlers]) handler();
    },
    dependencies: {
      now: () => now,
      setInterval: (handler: () => void) => {
        handlers.push(handler);
        return handlers.length;
      },
      clearInterval: () => undefined,
    },
  };
}

describe("presence wire 호환성 (toonstudio-space-v1)", () => {
  it("구버전 패킷(확장 필드 없음)이 깨지지 않고 파싱된다", () => {
    const legacyRaw = JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "presence",
      sequence: 42,
      at: 1_700_000_000_000,
      state: {
        x: 780, y: 900, zoneId: "lobby", facing: "down",
        activity: "available", moving: false, avatarIndex: -1,
      },
    });
    const parsed = parseStudioVirtualSpacePacket(legacyRaw);
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind !== "presence") throw new Error("presence 패킷이어야 한다");
    expect(parsed.state.x).toBe(780);
    expect(parsed.state.emote).toBeUndefined();
    expect(parsed.state.bubble).toBeUndefined();
    expect(parsed.state.userStatus).toBeUndefined();
  });

  it("구버전 패킷에 appearance가 있어도 파싱된다", () => {
    const legacyRaw = JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "presence",
      sequence: 7,
      at: 1_700_000_000_000,
      state: {
        x: 100, y: 200, zoneId: "drawing", facing: "left",
        activity: "focused", moving: true, avatarIndex: 3,
        appearance: { skinKey: "toon-a", registryRevision: "r1", capabilities: ["idle", "walk-down"] },
      },
    });
    const parsed = parseStudioVirtualSpacePacket(legacyRaw);
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind !== "presence") throw new Error("presence 패킷이어야 한다");
    expect(parsed.state.appearance?.skinKey).toBe("toon-a");
    expect(parsed.state.emote).toBeUndefined();
  });

  it("신버전 패킷(emote·bubble·userStatus)이 왕복한다", () => {
    const raw = JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "presence",
      sequence: 9,
      at: 1_700_000_000_000,
      state: {
        x: 100, y: 200, zoneId: "lobby", facing: "up",
        activity: "available", moving: false, avatarIndex: -1,
        emote: "dance", bubble: "같이 그려요!", userStatus: "in-meeting",
      },
    });
    const parsed = parseStudioVirtualSpacePacket(raw);
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind !== "presence") throw new Error("presence 패킷이어야 한다");
    expect(parsed.state.emote).toBe("dance");
    expect(parsed.state.bubble).toBe("같이 그려요!");
    expect(parsed.state.userStatus).toBe("in-meeting");
  });

  it("모르는 emote·userStatus 값은 필드만 무시하고 패킷을 유지한다", () => {
    const raw = JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "presence",
      sequence: 11,
      at: 1_700_000_000_000,
      state: {
        x: 100, y: 200, zoneId: "lobby", facing: "down",
        activity: "available", moving: false, avatarIndex: -1,
        emote: "future-emote", userStatus: "do-not-disturb",
      },
    });
    const parsed = parseStudioVirtualSpacePacket(raw);
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind !== "presence") throw new Error("presence 패킷이어야 한다");
    expect(parsed.state.emote).toBeUndefined();
    expect(parsed.state.userStatus).toBeUndefined();
    expect(parsed.state.x).toBe(100);
  });

  it("잘못된 bubble은 무시하고 패킷을 유지한다", () => {
    const raw = JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "presence",
      sequence: 13,
      at: 1_700_000_000_000,
      state: {
        x: 100, y: 200, zoneId: "lobby", facing: "down",
        activity: "available", moving: false, avatarIndex: -1,
        bubble: 12345,
      },
    });
    const parsed = parseStudioVirtualSpacePacket(raw);
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind !== "presence") throw new Error("presence 패킷이어야 한다");
    expect(parsed.state.bubble).toBeUndefined();
  });
});

describe("presence 확장 필드 살균", () => {
  it("emote kind를 검증한다", () => {
    expect(parseStudioPresenceEmote("dance")).toBe("dance");
    expect(parseStudioPresenceEmote("wave")).toBe("wave");
    expect(parseStudioPresenceEmote("unknown")).toBeUndefined();
    expect(parseStudioPresenceEmote(null)).toBeUndefined();
    expect(parseStudioPresenceEmote(42)).toBeUndefined();
  });

  it("userStatus를 검증한다", () => {
    expect(parseStudioPresenceUserStatus("in-meeting")).toBe("in-meeting");
    expect(parseStudioPresenceUserStatus("break")).toBe("break");
    expect(parseStudioPresenceUserStatus("busy")).toBeUndefined();
  });

  it("말풍선 텍스트를 살균한다", () => {
    expect(sanitizeStudioPresenceBubble("  안녕하세요!  ")).toBe("안녕하세요!");
    expect(sanitizeStudioPresenceBubble("")).toBeUndefined();
    expect(sanitizeStudioPresenceBubble("   ")).toBeUndefined();
    expect(sanitizeStudioPresenceBubble("a\u0000b\u001Fc")).toBe("abc");
    expect(sanitizeStudioPresenceBubble("가".repeat(200))).toHaveLength(STUDIO_PRESENCE_BUBBLE_MAX_LENGTH);
    expect(sanitizeStudioPresenceBubble(null)).toBeUndefined();
  });
});

describe("StudioVirtualSpacePresenceController 확장 필드", () => {
  function createPair() {
    const clock = createClock();
    const self = participant("self-1", "나");
    const peer = participant("peer-1", "동료");
    const { portFor, sent } = createLinkedPorts([self, peer]);
    const peerController = new StudioVirtualSpacePresenceController(peer, portFor(peer), { x: 100, y: 100 }, clock.dependencies);
    const selfController = new StudioVirtualSpacePresenceController(self, portFor(self), { x: 780, y: 900 }, clock.dependencies);
    peerController.start();
    selfController.start();
    return { clock, self, peer, sent, peerController, selfController };
  }

  it("setEmote·setBubbleText·setUserStatus가 피어에게 전달된다", () => {
    const { clock, selfController, peerController, sent } = createPair();
    sent.length = 0;
    selfController.setEmote("cheer");
    selfController.setBubbleText("리뷰 시작해요!");
    selfController.setUserStatus("in-meeting");
    clock.tick(); // 90ms 틱에서 dirty 브로드캐스트

    const peers = peerController.snapshot().peers;
    expect(peers).toHaveLength(1);
    expect(peers[0]?.state.emote).toBe("cheer");
    expect(peers[0]?.state.bubble).toBe("리뷰 시작해요!");
    expect(peers[0]?.state.userStatus).toBe("in-meeting");
    // self 스냅샷에도 반영된다 (B 트랙 렌더용)
    expect(selfController.snapshot().self.emote).toBe("cheer");
  });

  it("userStatus를 null로 주면 필드를 지워 피어가 활동 표시로 돌아간다", () => {
    const { clock, selfController, peerController } = createPair();
    selfController.setUserStatus("break");
    clock.tick();
    expect(peerController.snapshot().peers[0]?.state.userStatus).toBe("break");
    selfController.setUserStatus(null);
    clock.tick();
    expect(selfController.snapshot().self.userStatus).toBeUndefined();
    expect(peerController.snapshot().peers[0]?.state.userStatus).toBeUndefined();
  });

  it("emote를 null로 주면 종료된다", () => {
    const { clock, selfController, peerController } = createPair();
    selfController.setEmote("dance");
    clock.tick();
    expect(peerController.snapshot().peers[0]?.state.emote).toBe("dance");
    selfController.setEmote(null);
    clock.tick();
    expect(peerController.snapshot().peers[0]?.state.emote).toBeUndefined();
  });

  it("말풍선 TTL이 지나면 송신 측이 지워 브로드캐스트한다", () => {
    const { clock, selfController, peerController, sent } = createPair();
    selfController.setBubbleText("잠깐만요");
    clock.tick();
    expect(peerController.snapshot().peers[0]?.state.bubble).toBe("잠깐만요");
    const sentBefore = sent.length;
    clock.advance(STUDIO_PRESENCE_BUBBLE_TTL_MS + 100);
    clock.tick();
    expect(selfController.snapshot().self.bubble).toBeUndefined();
    expect(peerController.snapshot().peers[0]?.state.bubble).toBeUndefined();
    expect(sent.length).toBeGreaterThan(sentBefore);
  });

  it("모든 확장 필드를 채워도 패킷이 1024바이트를 넘지 않는다", () => {
    const { clock, selfController, sent } = createPair();
    sent.length = 0;
    selfController.setEmote("celebrate");
    selfController.setBubbleText("가".repeat(STUDIO_PRESENCE_BUBBLE_MAX_LENGTH));
    selfController.setUserStatus("in-meeting");
    clock.tick();
    const encoder = new TextEncoder();
    expect(sent.length).toBeGreaterThan(0);
    for (const packet of sent) {
      expect(encoder.encode(packet.raw).byteLength)
        .toBeLessThanOrEqual(STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES);
    }
    // bubble 텍스트가 실제로 실렸는지 확인
    expect(sent.some((packet) => packet.raw.includes("가".repeat(10)))).toBe(true);
  });

  it("같은 값이면 재전송하지 않는다", () => {
    const { clock, selfController, sent } = createPair();
    selfController.setEmote("wave");
    clock.tick();
    const sentAfterFirst = sent.length;
    selfController.setEmote("wave");
    clock.tick();
    expect(sent.length).toBe(sentAfterFirst);
  });
});

describe("StudioVirtualSpacePresenceController 외형 동기화", () => {
  function createPair() {
    const clock = createClock();
    const self = participant("self-1", "나");
    const peer = participant("peer-1", "동료");
    const { portFor, sent } = createLinkedPorts([self, peer]);
    const peerController = new StudioVirtualSpacePresenceController(peer, portFor(peer), { x: 100, y: 100 }, clock.dependencies);
    const selfController = new StudioVirtualSpacePresenceController(self, portFor(self), { x: 780, y: 900 }, clock.dependencies);
    peerController.start();
    selfController.start();
    return { clock, selfController, peerController, sent };
  }

  const appearance = { skinKey: "toon-a", registryRevision: "r1", capabilities: ["idle", "walk-down"] as const };

  it("setAppearance가 피어에게 전달된다", () => {
    const { clock, selfController, peerController } = createPair();
    selfController.setAppearance({ ...appearance, capabilities: [...appearance.capabilities] });
    clock.tick();
    const peerState = peerController.snapshot().peers[0]?.state;
    expect(peerState?.appearance?.skinKey).toBe("toon-a");
    expect(peerState?.appearance?.registryRevision).toBe("r1");
    expect(peerState?.appearance?.capabilities).toEqual(["idle", "walk-down"]);
    // self 스냅샷에도 반영된다 (B 트랙 렌더용)
    expect(selfController.snapshot().self.appearance?.skinKey).toBe("toon-a");
  });

  it("update()로 이동해도 외형이 유지된다", () => {
    const { clock, selfController, peerController } = createPair();
    selfController.setAppearance({ ...appearance, capabilities: [...appearance.capabilities] });
    clock.tick();
    selfController.update({ x: 800, y: 920 });
    clock.tick();
    const peerState = peerController.snapshot().peers[0]?.state;
    expect(peerState?.x).toBe(800);
    expect(peerState?.appearance?.skinKey).toBe("toon-a");
  });

  it("같은 외형이면 재전송하지 않는다", () => {
    const { clock, selfController, sent } = createPair();
    selfController.setAppearance({ ...appearance, capabilities: [...appearance.capabilities] });
    clock.tick();
    const sentAfterFirst = sent.length;
    selfController.setAppearance({ ...appearance, capabilities: [...appearance.capabilities] });
    clock.tick();
    expect(sent.length).toBe(sentAfterFirst);
  });

  it("잘못된 외형은 무시하고 기존 외형을 유지한다", () => {
    const { clock, selfController, peerController, sent } = createPair();
    selfController.setAppearance({ ...appearance, capabilities: [...appearance.capabilities] });
    clock.tick();
    sent.length = 0;
    // 빈 skinKey는 appearance 스키마(TOKEN)를 통과하지 못한다
    selfController.setAppearance({ skinKey: "", registryRevision: "r1", capabilities: [] });
    clock.tick();
    expect(selfController.snapshot().self.appearance?.skinKey).toBe("toon-a");
    expect(peerController.snapshot().peers[0]?.state.appearance?.skinKey).toBe("toon-a");
    expect(sent.length).toBe(0);
  });

  it("외형을 실어도 패킷이 1024바이트를 넘지 않는다", () => {
    const { clock, selfController, sent } = createPair();
    sent.length = 0;
    selfController.setAppearance({
      skinKey: "a".repeat(64),
      registryRevision: "r".repeat(64),
      capabilities: ["idle", "walk-down", "walk-left", "walk-right", "walk-up", "talk", "draw", "review", "wave", "sit"],
    });
    selfController.setBubbleText("가".repeat(STUDIO_PRESENCE_BUBBLE_MAX_LENGTH));
    clock.tick();
    const encoder = new TextEncoder();
    expect(sent.length).toBeGreaterThan(0);
    for (const packet of sent) {
      expect(encoder.encode(packet.raw).byteLength)
        .toBeLessThanOrEqual(STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES);
    }
  });
});
