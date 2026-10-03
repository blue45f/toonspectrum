import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { STUDIO_CHAT_TYPING_TTL_MS } from "./studio-virtual-space-chat";
import {
  parseStudioVirtualSpacePacket,
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

const SELF = participant("self-session", "나");
const PEER = participant("peer-session", "동료");

function createPair(peerPoint = { x: 100, y: 100 }) {
  const clock = createClock();
  const { portFor, sent } = createLinkedPorts([SELF, PEER]);
  const self = new StudioVirtualSpacePresenceController(SELF, portFor(SELF), { x: 100, y: 100 }, clock.dependencies);
  const peer = new StudioVirtualSpacePresenceController(PEER, portFor(PEER), peerPoint, clock.dependencies);
  self.start();
  peer.start();
  // 시작 브로드캐스트는 상대 구독 전에 나갈 수 있어, 강제 브로드캐스트로 서로의 위치를 교환한다.
  self.refresh();
  peer.refresh();
  return { clock, self, peer, sent };
}

describe("채팅·타이핑 패킷 파싱", () => {
  it("유효한 chat 패킷을 파싱하고 금칙을 마스킹한다", () => {
    const parsed = parseStudioVirtualSpacePacket(JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE, kind: "chat", sequence: 7, at: 100,
      scope: "nearby", text: "시발 이거 봐",
    }));
    expect(parsed?.kind).toBe("chat");
    if (parsed?.kind !== "chat") throw new Error("chat 패킷이어야 한다");
    expect(parsed.scope).toBe("nearby");
    expect(parsed.text).toBe("** 이거 봐");
  });

  it("모르는 범위·빈 문장·제어문자뿐인 chat 패킷은 버린다", () => {
    const base = { wire: STUDIO_VIRTUAL_SPACE_WIRE, kind: "chat", sequence: 1, at: 1 };
    expect(parseStudioVirtualSpacePacket(JSON.stringify({ ...base, scope: "room", text: "안녕" }))).toBeNull();
    expect(parseStudioVirtualSpacePacket(JSON.stringify({ ...base, scope: "all", text: "   " }))).toBeNull();
    expect(parseStudioVirtualSpacePacket(JSON.stringify({ ...base, scope: "all", text: "\u0001\u0002" }))).toBeNull();
  });

  it("typing 패킷은 boolean이 아니면 버린다", () => {
    const base = { wire: STUDIO_VIRTUAL_SPACE_WIRE, kind: "typing", sequence: 1, at: 1, scope: "all" };
    expect(parseStudioVirtualSpacePacket(JSON.stringify({ ...base, typing: true }))?.kind).toBe("typing");
    expect(parseStudioVirtualSpacePacket(JSON.stringify({ ...base, typing: "yes" }))).toBeNull();
  });

  it("구버전 파서 관점: 모르는 kind는 presence를 깨지 않는다", () => {
    // 구버전 클라이언트는 chat/typing 패킷을 null로 버리고, 기존 presence 패킷은 그대로 읽는다.
    const legacy = parseStudioVirtualSpacePacket(JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE, kind: "presence", sequence: 3, at: 5,
      state: { x: 10, y: 10, zoneId: "lobby", facing: "down", activity: "available", moving: false, avatarIndex: 0 },
    }));
    expect(legacy?.kind).toBe("presence");
  });
});

describe("말풍선 채팅 송수신", () => {
  it("보낸 채팅이 상대 로그·말풍선과 내 로그·말풍선에 함께 남는다", () => {
    const { self, peer } = createPair();
    expect(self.sendChat("all", "안녕하세요!")).toBe(true);

    const peerSnapshot = peer.snapshot();
    expect(peerSnapshot.chatMessages).toHaveLength(1);
    expect(peerSnapshot.chatMessages[0]).toMatchObject({ text: "안녕하세요!", scope: "all", self: false, displayName: "나" });
    expect(peerSnapshot.chatBubbles.map((bubble) => bubble.text)).toEqual(["안녕하세요!"]);

    const selfSnapshot = self.snapshot();
    expect(selfSnapshot.chatMessages[0]).toMatchObject({ text: "안녕하세요!", self: true });
    expect(selfSnapshot.selfChatBubble?.text).toBe("안녕하세요!");
    expect(selfSnapshot.chatBubbles).toHaveLength(0);
  });

  it("빈 문장은 보내지 않는다", () => {
    const { self, peer } = createPair();
    expect(self.sendChat("all", "   ")).toBe(false);
    expect(peer.snapshot().chatMessages).toHaveLength(0);
  });

  it("nearby 채팅은 반경 안 상대에게만 닿는다", () => {
    const near = createPair({ x: 250, y: 100 }); // 150px 거리
    near.self.sendChat("nearby", "가까이서만 들려요");
    expect(near.peer.snapshot().chatMessages).toHaveLength(1);

    const far = createPair({ x: 900, y: 100 }); // 800px 거리
    far.self.sendChat("nearby", "멀면 안 들려요");
    expect(far.peer.snapshot().chatMessages).toHaveLength(0);
    expect(far.peer.snapshot().chatBubbles).toHaveLength(0);
    // 전체 채팅은 거리와 무관하게 닿는다.
    far.self.sendChat("all", "전체 공지");
    expect(far.peer.snapshot().chatMessages.map((item) => item.text)).toEqual(["전체 공지"]);
  });

  it("말풍선은 표시 시간이 지나면 tick에서 정리된다", () => {
    const { clock, self, peer } = createPair();
    self.sendChat("all", "안녕");
    expect(peer.snapshot().chatBubbles).toHaveLength(1);
    clock.advance(10_001);
    clock.tick();
    expect(peer.snapshot().chatBubbles).toHaveLength(0);
    expect(self.snapshot().selfChatBubble).toBeNull();
    // 로그는 말풍선이 사라져도 남는다.
    expect(peer.snapshot().chatMessages).toHaveLength(1);
  });
});

describe("타이핑 표시", () => {
  it("입력 중 신호가 상대 snapshot에 뜨고, 끄면 사라진다", () => {
    const { self, peer } = createPair();
    self.setChatTyping("nearby", true);
    expect(peer.snapshot().peerTyping.map((item) => item.sessionId)).toEqual(["self-session"]);
    self.setChatTyping("nearby", false);
    expect(peer.snapshot().peerTyping).toHaveLength(0);
  });

  it("새로고침이 없으면 TTL 뒤에 snapshot에서 자동으로 사라진다", () => {
    const { clock, self, peer } = createPair();
    self.setChatTyping("all", true);
    expect(peer.snapshot().peerTyping).toHaveLength(1);
    // 송신 측이 새로고침을 멈춘 상황을 가정한다(tick을 돌리면 송신 측이 재전송하므로 돌리지 않는다).
    clock.advance(STUDIO_CHAT_TYPING_TTL_MS + 1);
    expect(peer.snapshot().peerTyping).toHaveLength(0);
  });

  it("메시지를 보내면 상대의 입력 중 표시가 즉시 끝난다", () => {
    const { self, peer } = createPair();
    self.setChatTyping("all", true);
    expect(peer.snapshot().peerTyping).toHaveLength(1);
    self.sendChat("all", "다 썼어요");
    expect(peer.snapshot().peerTyping).toHaveLength(0);
  });

  it("nearby 타이핑은 멀리 있는 상대에게 보이지 않는다", () => {
    const far = createPair({ x: 900, y: 100 });
    far.self.setChatTyping("nearby", true);
    expect(far.peer.snapshot().peerTyping).toHaveLength(0);
    far.self.setChatTyping("all", true);
    expect(far.peer.snapshot().peerTyping).toHaveLength(1);
  });
});
