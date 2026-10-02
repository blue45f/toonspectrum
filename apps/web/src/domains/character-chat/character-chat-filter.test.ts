/**
 * 금지 주제 가드 테스트 — 입력 차단과 답변 교체 규칙.
 */

import { describe, expect, it } from "vitest";

import {
  characterDeflectionLine,
  findForbiddenTopicHits,
  guardCharacterChatTurn,
  sanitizeCharacterReply,
} from "./character-chat-filter";

const profile = {
  characterName: "레이나",
  forbiddenTopics: ["왕의 죽음", "최종화 결말"],
};

describe("findForbiddenTopicHits", () => {
  it("금지 주제가 포함된 텍스트를 찾는다", () => {
    expect(findForbiddenTopicHits(profile, "왕의 죽음에 대해 알려줘")).toEqual([
      { topic: "왕의 죽음" },
    ]);
  });

  it("공백·대소문자 차이를 흡수한다", () => {
    expect(findForbiddenTopicHits(profile, "왕의  죽음")).toHaveLength(1);
  });

  it("관계없는 텍스트는 통과한다", () => {
    expect(findForbiddenTopicHits(profile, "오늘 날씨는 어때?")).toEqual([]);
    expect(findForbiddenTopicHits(profile, "")).toEqual([]);
  });

  it("금지 주제가 없으면 항상 통과한다", () => {
    expect(findForbiddenTopicHits({ forbiddenTopics: [] }, "왕의 죽음")).toEqual([]);
  });
});

describe("guardCharacterChatTurn", () => {
  it("금지 주제 입력은 matchedTopics와 함께 막는다", () => {
    const guard = guardCharacterChatTurn(profile, "최종화 결말 스포해줘");
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) expect(guard.matchedTopics).toEqual(["최종화 결말"]);
  });

  it("일반 입력은 허용한다", () => {
    expect(guardCharacterChatTurn(profile, "월광검은 어떻게 배웠어?")).toEqual({ allowed: true });
  });
});

describe("sanitizeCharacterReply", () => {
  it("깨끗한 답변은 그대로 돌려준다", () => {
    const result = sanitizeCharacterReply(profile, "월광검은 단장님께 배웠다.");
    expect(result).toEqual({ text: "월광검은 단장님께 배웠다.", replaced: false, matchedTopics: [] });
  });

  it("금지 주제가 섞인 답변은 회피 문구로 통째로 교체한다", () => {
    const result = sanitizeCharacterReply(profile, "왕의 죽음은 사실 자살이 아니라…");
    expect(result.replaced).toBe(true);
    expect(result.text).toBe(characterDeflectionLine(profile));
    expect(result.text).not.toContain("자살");
  });
});
