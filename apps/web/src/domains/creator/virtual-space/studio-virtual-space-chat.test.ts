import { describe, expect, it } from "vitest";

import {
  appendStudioChatMessage,
  isStudioVirtualSpaceChatScope,
  maskStudioChatProfanity,
  studioChatBubbleDurationMs,
  studioChatScopeAllows,
  STUDIO_CHAT_LOG_LIMIT,
  STUDIO_CHAT_NEARBY_RADIUS_PX,
  type StudioVirtualSpaceChatMessage,
} from "./studio-virtual-space-chat";

function message(index: number): StudioVirtualSpaceChatMessage {
  return {
    id: `peer:${index}`,
    sessionId: "peer",
    displayName: "동료",
    scope: "all",
    text: `메시지 ${index}`,
    at: index,
    self: false,
  };
}

describe("studioChatScopeAllows", () => {
  it("all 범위는 거리와 무관하게 허용한다", () => {
    expect(studioChatScopeAllows("all", 0)).toBe(true);
    expect(studioChatScopeAllows("all", 99_999)).toBe(true);
  });

  it("nearby 범위는 대화 반경 200px 안만 허용한다", () => {
    expect(studioChatScopeAllows("nearby", STUDIO_CHAT_NEARBY_RADIUS_PX)).toBe(true);
    expect(studioChatScopeAllows("nearby", STUDIO_CHAT_NEARBY_RADIUS_PX + 1)).toBe(false);
    expect(studioChatScopeAllows("nearby", Number.NaN)).toBe(false);
  });
});

describe("isStudioVirtualSpaceChatScope", () => {
  it("nearby와 all만 유효한 범위로 본다", () => {
    expect(isStudioVirtualSpaceChatScope("nearby")).toBe(true);
    expect(isStudioVirtualSpaceChatScope("all")).toBe(true);
    expect(isStudioVirtualSpaceChatScope("room")).toBe(false);
    expect(isStudioVirtualSpaceChatScope(undefined)).toBe(false);
  });
});

describe("studioChatBubbleDurationMs", () => {
  it("짧은 문장은 최소 4초, 긴 문장은 길이에 비례해 늘어난다", () => {
    expect(studioChatBubbleDurationMs("안녕")).toBe(4_080);
    expect(studioChatBubbleDurationMs("가".repeat(100))).toBe(8_000);
  });

  it("아무리 길어도 10초를 넘지 않는다", () => {
    expect(studioChatBubbleDurationMs("가".repeat(140))).toBe(9_600);
    expect(studioChatBubbleDurationMs("가".repeat(500))).toBe(10_000);
  });
});

describe("appendStudioChatMessage", () => {
  it("순서를 유지하며 붙이고 상한을 넘으면 오래된 것부터 버린다", () => {
    let log: readonly StudioVirtualSpaceChatMessage[] = [];
    for (let index = 0; index < STUDIO_CHAT_LOG_LIMIT + 5; index += 1) {
      log = appendStudioChatMessage(log, message(index));
    }
    expect(log).toHaveLength(STUDIO_CHAT_LOG_LIMIT);
    expect(log[0]?.text).toBe("메시지 5");
    expect(log.at(-1)?.text).toBe(`메시지 ${STUDIO_CHAT_LOG_LIMIT + 4}`);
  });

  it("원본 로그를 바꾸지 않는다", () => {
    const log = [message(0)];
    const next = appendStudioChatMessage(log, message(1));
    expect(log).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe("maskStudioChatProfanity", () => {
  it("명백한 비속어를 같은 길이의 *로 가린다", () => {
    expect(maskStudioChatProfanity("이건 시발 뭐야")).toBe("이건 ** 뭐야");
    expect(maskStudioChatProfanity("fucking hell")).toBe("******* hell");
  });

  it("일상 단어는 건드리지 않는다", () => {
    expect(maskStudioChatProfanity("우리 새끼 강아지")).toBe("우리 새끼 강아지");
    expect(maskStudioChatProfanity("미친 실력이네")).toBe("미친 실력이네");
    expect(maskStudioChatProfanity("안녕하세요")).toBe("안녕하세요");
  });
});
