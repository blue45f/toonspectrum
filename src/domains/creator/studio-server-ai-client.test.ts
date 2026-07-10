import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeStudioServerText,
  getStudioServerAiStatus,
  parseStudioServerAiCompletion,
  parseStudioServerAiFailoverMetadata,
} from "./studio-server-ai-client";

const { apiGet, apiPost, toApiError } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toApiError: vi.fn(async (error: unknown) => (error instanceof Error ? error : new Error("실패"))),
}));

vi.mock("@/src/infrastructure/api", () => ({
  api: { get: apiGet, post: apiPost },
  toApiError,
}));

describe("studio-server-ai-client", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    toApiError.mockClear();
  });

  it("키가 없는 공개 상태 정보만 읽는다", async () => {
    apiGet.mockResolvedValue({
      configured: true,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      providers: [
        { id: "zai", label: "Z.ai", configured: false, model: "glm-5.1" },
        { id: "deepseek", label: "DeepSeek", configured: true, model: "deepseek-v4-flash" },
      ],
      selection: { default: "auto", order: ["zai", "deepseek"], fallback: true },
      capabilities: ["composition"],
      requiresAuth: true,
    });
    await expect(getStudioServerAiStatus()).resolves.toMatchObject({ configured: true, provider: "deepseek" });
    expect(apiGet).toHaveBeenCalledWith("/studio-ai/status", { signal: undefined });
  });

  it("서버 텍스트 응답을 정규화한다", async () => {
    apiPost.mockResolvedValue({
      content: "  결과  ",
      provider: "zai",
      model: "glm-5.1",
      requestId: "zai-request-1",
    });
    const result = await completeStudioServerText({
      task: "composition",
      promptVersion: 1,
      system: "구도를 제안하세요.",
      user: "옥상 장면",
      provider: "zai",
    });
    expect(result).toEqual({
      ok: true,
      data: { content: "결과", provider: "zai", model: "glm-5.1", requestId: "zai-request-1" },
    });
    expect(apiPost).toHaveBeenCalledWith(
      "/studio-ai/chat",
      {
        task: "composition",
        promptVersion: 1,
        system: "구도를 제안하세요.",
        user: "옥상 장면",
        provider: "zai",
      },
      { signal: undefined }
    );
  });

  it("잔액 소진으로 대체 공급자가 응답한 이력을 안전한 구조로 보존한다", async () => {
    apiPost.mockResolvedValue({
      content: "  대체 공급자 결과  ",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "deepseek-request-1",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      failover: {
        attemptedProvider: "zai",
        attemptedModel: "glm-5.1",
        actualProvider: "deepseek",
        actualModel: "deepseek-v4-flash",
        reason: "billing_quota_exhausted",
        providerError: "provider-private-error",
      },
      apiKey: "server-secret-key",
      providerError: "provider-private-error",
    });

    const result = await completeStudioServerText({
      task: "scenario",
      promptVersion: 1,
      system: "JSON 장면을 만드세요.",
      user: "비 오는 옥상",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        content: "대체 공급자 결과",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        requestId: "deepseek-request-1",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        failover: {
          attemptedProvider: "zai",
          attemptedModel: "glm-5.1",
          actualProvider: "deepseek",
          actualModel: "deepseek-v4-flash",
          reason: "billing_quota_exhausted",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("server-secret-key");
    expect(JSON.stringify(result)).not.toContain("provider-private-error");
  });

  it("최상위 실제 공급자와 불일치하거나 허용되지 않은 전환 사유는 폐기한다", () => {
    expect(parseStudioServerAiFailoverMetadata(
      {
        attemptedProvider: "zai",
        attemptedModel: "glm-5.1",
        actualProvider: "deepseek",
        actualModel: "wrong-model",
        reason: "billing_quota_exhausted",
      },
      { provider: "deepseek", model: "deepseek-v4-flash" }
    )).toBeUndefined();
    expect(parseStudioServerAiFailoverMetadata(
      {
        attemptedProvider: "zai",
        attemptedModel: "glm-5.1",
        actualProvider: "deepseek",
        actualModel: "deepseek-v4-flash",
        reason: "raw-provider-error",
      },
      { provider: "deepseek", model: "deepseek-v4-flash" }
    )).toBeUndefined();
  });

  it("선택 메타데이터가 손상돼도 본문과 실제 provider/model은 유지하되 원문 필드는 전파하지 않는다", () => {
    const parsed = parseStudioServerAiCompletion({
      content: "완료",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      usage: { promptTokens: -1, completionTokens: 3.5, totalTokens: 8 },
      failover: {
        attemptedProvider: "zai",
        attemptedModel: "glm-5.1",
        actualProvider: "deepseek",
        actualModel: "mismatch",
        reason: "billing_quota_exhausted",
        rawError: "private-upstream-body",
      },
      rawError: "private-upstream-body",
    });

    expect(parsed).toEqual({
      content: "완료",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      usage: { totalTokens: 8 },
    });
    expect(JSON.stringify(parsed)).not.toContain("private-upstream-body");
  });

  it("필수 실제 provider/model이 잘못된 응답은 비밀값을 반사하지 않는 parse_error로 거부한다", async () => {
    apiPost.mockResolvedValue({
      content: "결과",
      provider: "server-secret-key",
      model: "deepseek-v4-flash",
    });

    const result = await completeStudioServerText({
      task: "composition",
      promptVersion: 1,
      system: "구도를 제안하세요.",
      user: "옥상 장면",
    });

    expect(result).toEqual({
      ok: false,
      code: "parse_error",
      error: "서버 AI 응답 형식을 확인하지 못했어요.",
    });
    expect(JSON.stringify(result)).not.toContain("server-secret-key");
  });

  it("API 오류를 UI용 결과로 변환한다", async () => {
    apiPost.mockRejectedValue(new Error("로그인이 필요해요."));
    await expect(
      completeStudioServerText({
        task: "palette",
        promptVersion: 1,
        system: "JSON 팔레트를 만드세요.",
        user: "새벽 바다",
      })
    ).resolves.toMatchObject({ ok: false, code: "http_error", error: "로그인이 필요해요." });
  });
});
