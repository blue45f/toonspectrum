import { describe, expect, it } from "vitest";

import { StudioAiChatSchema } from "./studio-ai.dto";

describe("StudioAiChatSchema", () => {
  it("텍스트 창작 요청을 고정된 최소 계약으로 검증한다", () => {
    const result = StudioAiChatSchema.parse({
      task: "dialogue",
      promptVersion: 1,
      system: "JSON 배열로 대사를 제안하세요.",
      user: "비 오는 버스 정류장",
    });
    expect(result).toEqual({
      task: "dialogue",
      promptVersion: 1,
      system: "JSON 배열로 대사를 제안하세요.",
      user: "비 오는 버스 정류장",
    });
  });

  it("허용되지 않은 작업과 과도한 토큰 요청을 거부한다", () => {
    expect(
      StudioAiChatSchema.safeParse({
        task: "general-chat",
        promptVersion: 1,
        system: "x",
        user: "y",
        maxTokens: 99_999,
      }).success
    ).toBe(false);
  });

  it("서버 제공자는 auto·Z.ai·DeepSeek만 명시적으로 선택할 수 있다", () => {
    expect(StudioAiChatSchema.safeParse({ ...StudioAiChatSchema.parse({
      task: "dialogue",
      promptVersion: 1,
      system: "대사를 제안하세요.",
      user: "장면",
    }), provider: "zai" }).success).toBe(true);
    expect(StudioAiChatSchema.safeParse({
      task: "dialogue",
      provider: "unknown-provider",
      promptVersion: 1,
      system: "대사를 제안하세요.",
      user: "장면",
    }).success).toBe(false);
  });
});
