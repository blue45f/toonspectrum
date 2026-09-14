import { beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_AI_SETTINGS_STORAGE_KEY } from "@/shared/ai/unified-ai-settings";

import {
  canonicalStudioServerAiOperationId,
  completeStudioServerText,
  getStudioServerAiStatus,
  parseStudioServerAiCompletion,
  parseStudioServerAiFailoverMetadata,
} from "./studio-server-ai-client";

const OPERATION_ID = "composition-00000000-0000-4000-8000-000000000001";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function configureUserKey(): void {
  globalThis.sessionStorage.setItem(STUDIO_AI_SETTINGS_STORAGE_KEY, JSON.stringify({
    baseUrl: "https://provider.example/v1",
    apiKey: "user-secret-key",
    imageModel: "image-model",
    textModel: "text-model",
    imageGenerationPath: "/images/generations",
    imageEditPath: "/images/edits",
    chatCompletionsPath: "/chat/completions",
  }));
}

describe("studio user-funded AI client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("sessionStorage", memoryStorage());
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

  it("fails before fetch when the user has not configured a key", async () => {
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
      error: "통합 AI 설정에서 텍스트 API 키와 모델을 등록하세요.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the configured provider directly with the user's key", async () => {
    configureUserKey();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://provider.example/v1/chat/completions");
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
        model: "text-model-v2",
        requestId: `byok:${OPERATION_ID}`,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never reflects the API key from a provider response", async () => {
    configureUserKey();
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
    expect(JSON.stringify(result)).toContain("[secret removed]");
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
