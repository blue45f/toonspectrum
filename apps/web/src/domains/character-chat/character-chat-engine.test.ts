/**
 * 캐릭터 챗 엔진 어댑터 테스트 — 결과 계약(throw 금지)과 엔진 선택 규칙.
 */

import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_AI_CONFIGURATION,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";
import { UserAiTransportError } from "@/shared/ai/user-ai-transport";

import {
  createByokCharacterChatEngine,
  createUnavailableCharacterChatEngine,
  hasCharacterChatTextRoute,
  resolveCharacterChatEngine,
} from "./character-chat-engine";
import { buildCharacterChatProfile } from "./character-chat-profile";

const profile = buildCharacterChatProfile(
  {
    characterName: "레이나",
    workTitle: "달 그림자 기사단",
    workSlug: "",
    authorName: "작가김",
    description: "떠돌이 검사",
    personality: "겉은 차갑다.",
    speechStyle: "짧은 반말",
    worldview: "아르테미아.",
    greeting: "",
    forbiddenTopics: ["왕의 죽음"],
    appearanceHint: "",
    avatarUrl: "",
    canonSheetId: "",
    chatEnabled: true,
  },
  { id: "p1" },
);

function configWithTextConnection(): UserAiConfiguration {
  return {
    ...EMPTY_AI_CONFIGURATION,
    connections: [
      {
        id: "conn-1",
        label: "테스트 연결",
        baseUrl: "https://api.example.com/v1",
        apiKey: "<redacted>",
        textModel: "test-model",
        imageModel: "",
        imageGenerationPath: "/images/generations",
        imageEditPath: "/images/edits",
        chatCompletionsPath: "/chat/completions",
        costPolicy: "user-funded-byok",
      },
    ],
  };
}

describe("createUnavailableCharacterChatEngine", () => {
  it("항상 not_configured를 돌려주고 throw하지 않는다", async () => {
    const engine = createUnavailableCharacterChatEngine();
    const result = await engine.generateReply({ profile, history: [], userText: "안녕" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_configured");
      expect(result.error).toContain("AI");
    }
  });
});

describe("createByokCharacterChatEngine", () => {
  it("완성 결과를 캐릭터 답변으로 돌려준다", async () => {
    const completer = vi.fn(async (system: string, user: string) => {
      expect(system).toContain("레이나");
      expect(user).toContain("안녕");
      return " …누구지. ";
    });
    const engine = createByokCharacterChatEngine(completer);
    const result = await engine.generateReply({ profile, history: [], userText: "안녕" });
    expect(result).toEqual({ ok: true, text: "…누구지." });
    expect(completer).toHaveBeenCalledTimes(1);
  });

  it("금지 주제가 섞인 답변은 회피 문구로 교체한다", async () => {
    const engine = createByokCharacterChatEngine(async () => "왕의 죽음은 사실…");
    const result = await engine.generateReply({ profile, history: [], userText: "비밀 알려줘" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).not.toContain("왕의 죽음은 사실");
      expect(result.text).toContain("레이나");
    }
  });

  it("빈 답변은 empty_reply다", async () => {
    const engine = createByokCharacterChatEngine(async () => "   ");
    const result = await engine.generateReply({ profile, history: [], userText: "안녕" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_reply");
  });

  it("전송 계층의 not-configured 오류를 not_configured로 변환한다", async () => {
    const engine = createByokCharacterChatEngine(async () => {
      throw new UserAiTransportError("not-configured", "연결 없음");
    });
    const result = await engine.generateReply({ profile, history: [], userText: "안녕" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });

  it("일반 오류는 request_failed로 변환하고 throw하지 않는다", async () => {
    const engine = createByokCharacterChatEngine(async () => {
      throw new Error("네트워크 단절");
    });
    const result = await engine.generateReply({ profile, history: [], userText: "안녕" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("request_failed");
  });
});

describe("resolveCharacterChatEngine", () => {
  it("설정이 비면 unavailable 엔진을 고른다", () => {
    expect(resolveCharacterChatEngine(EMPTY_AI_CONFIGURATION).id).toBe("unavailable");
    expect(hasCharacterChatTextRoute(EMPTY_AI_CONFIGURATION)).toBe(false);
  });

  it("텍스트 연결이 있으면 BYOK 엔진을 고른다", () => {
    const config = configWithTextConnection();
    expect(hasCharacterChatTextRoute(config)).toBe(true);
    expect(resolveCharacterChatEngine(config).id).toBe("byok-user-ai");
  });

  it("키 없는 연결은 텍스트 경로로 치지 않는다", () => {
    const config = configWithTextConnection();
    const keyless: UserAiConfiguration = {
      ...config,
      connections: config.connections.map((connection) => ({ ...connection, apiKey: "" })),
    };
    expect(hasCharacterChatTextRoute(keyless)).toBe(false);
  });
});
