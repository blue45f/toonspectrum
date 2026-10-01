/**
 * NPC 응답자 테스트 (Track 4 · 벤치마크 gap 3)
 */
import { describe, expect, it } from "vitest";

import {
  askStudioNpc,
  createLlmNpcResponder,
  createNpcConversation,
  createScriptedNpcResponder,
  STUDIO_NPC_CONVERSATION_WINDOW,
  type StudioNpcConversation,
  type StudioNpcResponderInput,
} from "./studio-virtual-space-npc-responder";

function input(overrides: Partial<StudioNpcResponderInput> = {}): StudioNpcResponderInput {
  return {
    npcId: "npc-guide-1",
    archetypeKey: "guide",
    npcName: "두리",
    userText: "안녕하세요!",
    locale: "ko",
    history: [],
    ...overrides,
  };
}

describe("스크립트 응답자", () => {
  const responder = createScriptedNpcResponder();

  it("id가 scripted이다", () => {
    expect(responder.id).toBe("scripted");
  });

  it("인사에는 아키타입 인사말로 답한다", async () => {
    const result = await responder.respond(input({ userText: "안녕!" }));
    expect(result.scripted).toBe(true);
    expect(result.textKo.trim().length).toBeGreaterThan(0);
    expect(result.textEn.trim().length).toBeGreaterThan(0);
    expect(result.suggestedFollowups?.length).toBeGreaterThan(0);
  });

  it("감사·작별 키워드에 답한다", async () => {
    const thanks = await responder.respond(input({ userText: "고마워요" }));
    expect(thanks.textKo).toContain("천만에요");
    const bye = await responder.respond(input({ userText: "잘가요" }));
    expect(bye.textKo).toContain("안녕히");
  });

  it("빈 입력에는 되묻는다", async () => {
    const result = await responder.respond(input({ userText: "   " }));
    expect(result.textKo).toContain("다시");
  });

  it("알 수 없는 아키타입도 폴백으로 답한다", async () => {
    const result = await responder.respond(input({ archetypeKey: "unknown", userText: "뭐해?" }));
    expect(result.textKo.trim().length).toBeGreaterThan(0);
  });

  it("바리스타는 바리스타 말투로 답한다", async () => {
    const result = await responder.respond(input({ archetypeKey: "barista", userText: "안녕" }));
    expect(result.textKo.length).toBeGreaterThan(0);
  });
});

describe("LLM 응답자 팩토리", () => {
  it("설정이 없으면 미설정 스텁을 반환한다", async () => {
    const responder = createLlmNpcResponder({});
    expect(responder.id).toBe("llm-unconfigured");
    const result = await responder.respond(input({}));
    expect(result.scripted).toBe(true);
    expect(result.textKo).toContain("API 키");
  });

  it("영어 로케일에는 영어로 안내한다", async () => {
    const responder = createLlmNpcResponder({});
    const result = await responder.respond(input({ locale: "en" }));
    expect(result.textEn).toContain("API key");
  });

  it("설정이 있으면 llm id를 갖는다 (실제 호출은 후속 작업)", async () => {
    const responder = createLlmNpcResponder({ endpoint: "https://llm.example/v1", apiKey: "test" });
    expect(responder.id).toBe("llm");
    const act = async () => { await responder.respond(input({})); };
    await expect(act()).rejects.toThrow("미구현");
  });
});

describe("대화 세션", () => {
  it("질문→응답 턴이 쌓인다", async () => {
    const responder = createScriptedNpcResponder();
    let conversation: StudioNpcConversation = createNpcConversation("npc-guide-1", "guide", "두리");
    const first = await askStudioNpc(responder, conversation, "안녕!", "ko");
    expect(first.conversation.turns).toHaveLength(2);
    expect(first.conversation.turns[0]?.role).toBe("user");
    expect(first.conversation.turns[1]?.role).toBe("npc");
    conversation = first.conversation;
    const second = await askStudioNpc(responder, conversation, "고마워", "ko");
    expect(second.conversation.turns).toHaveLength(4);
  });

  it("히스토리 윈도우를 초과하면 오래된 턴부터 버린다", async () => {
    const responder = createScriptedNpcResponder();
    let conversation: StudioNpcConversation = createNpcConversation("npc-guide-1", "guide", "두리");
    for (let index = 0; index < STUDIO_NPC_CONVERSATION_WINDOW + 4; index += 1) {
      const step = await askStudioNpc(responder, conversation, `질문 ${index}`, "ko");
      conversation = step.conversation;
    }
    expect(conversation.turns.length).toBeLessThanOrEqual(STUDIO_NPC_CONVERSATION_WINDOW);
  });

  it("context의 방 이름을 위치 질문에 쓴다", async () => {
    const responder = createScriptedNpcResponder();
    const conversation = createNpcConversation("npc-guide-1", "guide", "두리");
    const { result } = await askStudioNpc(responder, conversation, "여기가 어디야?", "ko", { roomName: "로비" });
    expect(result.textKo).toContain("로비");
  });
});
