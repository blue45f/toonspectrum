import { beforeEach, describe, expect, it, vi } from "vitest";

import { setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONFIGURATION } from "@/shared/ai/user-ai-types";

import {
  canonicalStudioServerAiOperationId,
  completeStudioServerText,
  getStudioServerAiStatus,
  parseStudioServerAiCompletion,
  parseStudioServerAiFailoverMetadata,
} from "./studio-server-ai-client";

const OPERATION_ID = "composition-00000000-0000-4000-8000-000000000001";

function configureFreeTextConnection(): void {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      id: "test-free-text",
      label: "Test free text provider",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "user-secret-key",
      imageModel: "",
      textModel: "text-model",
      imageGenerationPath: "/images/generations",
      imageEditPath: "/images/edits",
      chatCompletionsPath: "/chat/completions",
      costPolicy: "provider-free-tier",
    }],
    assignments: {
      text: "test-free-text",
      image: null,
      inference: null,
      "three-d": null,
    },
  });
}

describe("studio free-only user AI client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setUserAiConfiguration(EMPTY_AI_CONFIGURATION);
  });

  it("reports that operator-funded server AI is unavailable", async () => {
    await expect(getStudioServerAiStatus()).resolves.toMatchObject({
      configured: false,
      provider: "none",
      operatorFunded: false,
      settingsHref: "/studio/ai-settings",
    });
  });

  it("accepts only canonical bounded operation identifiers", () => {
    expect(canonicalStudioServerAiOperationId(OPERATION_ID)).toBe(OPERATION_ID);
    expect(canonicalStudioServerAiOperationId(`  ${OPERATION_ID}  `)).toBeNull();
    expect(canonicalStudioServerAiOperationId("a".repeat(16))).toBe("a".repeat(16));
    expect(canonicalStudioServerAiOperationId("a".repeat(128))).toBe("a".repeat(128));
    expect(canonicalStudioServerAiOperationId("a".repeat(15))).toBeNull();
    expect(canonicalStudioServerAiOperationId("a".repeat(129))).toBeNull();
    expect(canonicalStudioServerAiOperationId("작업-0000000000000000")).toBeNull();
  });

  it("fails before fetch when no free text connection is assigned", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(completeStudioServerText({
      task: "composition",
      promptVersion: 1,
      system: "구도를 제안하세요.",
      user: "옥상 장면",
      operationId: OPERATION_ID,
    })).resolves.toEqual({
      ok: false,
      code: "http_error",
      error: "통합 AI 설정에서 무료 연결과 기능 연결을 선택하세요. 운영측 AI나 유료 모델로 대체하지 않습니다.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the configured free-tier provider directly with the user's key", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer user-secret-key");
      expect(init?.credentials).toBe("omit");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({ model: "text-model", max_tokens: 4096 });
      return new Response(JSON.stringify({
        model: "text-model-v2",
        choices: [{ message: { content: "  사용자 키 결과  " } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText({
      task: "composition",
      promptVersion: 1,
      system: "구도를 제안하세요.",
      user: "옥상 장면",
      operationId: OPERATION_ID,
    })).resolves.toEqual({
      ok: true,
      data: {
        content: "사용자 키 결과",
        provider: "user",
        model: "text-model",
        requestId: `byok:${OPERATION_ID}`,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never reflects the API key from a free-provider response", async () => {
    configureFreeTextConnection();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "user-secret-key를 숨긴 결과" } }],
    }), { status: 200 })));

    const result = await completeStudioServerText({
      task: "dialogue",
      promptVersion: 1,
      system: "대사를 제안하세요.",
      user: "인사",
      operationId: "dialogue-00000000-0000-4000-8000-000000000002",
    });
    expect(JSON.stringify(result)).not.toContain("user-secret-key");
    expect(JSON.stringify(result)).toContain("[비밀정보 제거]");
  });

  it("keeps legacy parser metadata allowlisted", () => {
    expect(parseStudioServerAiFailoverMetadata({
      attemptedProvider: "zai",
      attemptedModel: "glm",
      actualProvider: "deepseek",
      actualModel: "deepseek-v4",
      reason: "billing_quota_exhausted",
      rawError: "secret",
    }, { provider: "deepseek", model: "deepseek-v4" })).toEqual({
      attemptedProvider: "zai",
      attemptedModel: "glm",
      actualProvider: "deepseek",
      actualModel: "deepseek-v4",
      reason: "billing_quota_exhausted",
    });
    expect(parseStudioServerAiCompletion({
      content: "완료",
      provider: "user",
      model: "text-model",
      usage: { promptTokens: 10, totalTokens: 12 },
      rawError: "private",
    })).toEqual({
      content: "완료",
      provider: "user",
      model: "text-model",
      usage: { promptTokens: 10, totalTokens: 12 },
    });
  });
});
