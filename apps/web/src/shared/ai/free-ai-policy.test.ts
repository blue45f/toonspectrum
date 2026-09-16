import { describe, expect, it } from "vitest";

import {
  assertFreeAiConnection,
  FREE_AI_PRESETS,
  freeAiConnectionPolicyIssue,
  inferLegacyUserAiCostPolicy,
  isOpenRouterFreeModel,
} from "./free-ai-policy";

const connection = {
  baseUrl: "http://localhost:8082/v1",
  apiKey: "",
  textModel: "local-model",
  imageModel: "",
  costPolicy: "local-zero-cost" as const,
};

describe("free-only AI connection policy", () => {
  it("allows a keyless loopback model and rejects a remote URL disguised as local", () => {
    expect(() => assertFreeAiConnection(connection, "text")).not.toThrow();
    expect(freeAiConnectionPolicyIssue({
      ...connection,
      baseUrl: "https://example.com/v1",
    })).toMatch(/localhost|루프백/u);
  });

  it("requires the model needed by an assigned capability", () => {
    expect(() => assertFreeAiConnection({
      ...connection,
      textModel: "",
    }, "text")).toThrow(/텍스트 모델/u);
    expect(() => assertFreeAiConnection({
      ...connection,
      imageModel: "",
    }, "image")).toThrow(/이미지 모델/u);
  });

  it("allows only the OpenRouter free router or :free variants", () => {
    expect(isOpenRouterFreeModel("openrouter/free")).toBe(true);
    expect(isOpenRouterFreeModel("vendor/model:free")).toBe(true);
    expect(isOpenRouterFreeModel("vendor/paid-model")).toBe(false);

    const free = {
      ...connection,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "user-key",
      textModel: "openrouter/free",
      costPolicy: "openrouter-free" as const,
    };
    expect(() => assertFreeAiConnection(free, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...free,
      textModel: "openrouter/auto",
    }, "text")).toThrow(/free/u);
    expect(() => assertFreeAiConnection(free, "image")).toThrow(/텍스트/u);
    expect(() => assertFreeAiConnection({
      ...free,
      apiKey: "",
    }, "text")).toThrow(/API 키/u);
  });

  it("restricts provider free-tier mode to exact official text endpoints", () => {
    const groq = {
      ...connection,
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "user-key",
      costPolicy: "provider-free-tier" as const,
    };
    expect(() => assertFreeAiConnection(groq, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.sambanova.ai/v1",
      textModel: "DeepSeek-V3.1",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.mistral.ai/v1",
      textModel: "mistral-small-latest",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://workspace_123456.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.z.ai/api/paas/v4",
      textModel: "glm-4.7-flash",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.siliconflow.cn/v1",
      textModel: "THUDM/GLM-Z1-9B-0414",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://workspace_123456.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen-paid-or-unreviewed",
    }, "text")).toThrow(/허용 모델/u);
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.z.ai/api/paas/v4",
      textModel: "glm-5.1",
    }, "text")).toThrow(/GLM-4\.7-Flash/u);
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.siliconflow.cn/v1",
      textModel: "deepseek-ai/DeepSeek-V4-Pro",
    }, "text")).toThrow(/THUDM\/GLM-Z1-9B-0414/u);
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.example.com/v1",
    }, "text")).toThrow(/공식 OpenAI 호환 API/u);
    expect(() => assertFreeAiConnection({
      ...groq,
      baseUrl: "https://api.groq.com/v1",
    }, "text")).toThrow(/공식 OpenAI 호환 API/u);
    expect(() => assertFreeAiConnection(groq, "three-d")).toThrow(/텍스트 기능/u);
  });

  it("does not let public managed APIs masquerade as self-hosted", () => {
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "user-key",
      costPolicy: "self-hosted-zero-cost",
    }, "text")).toThrow(/공개 AI 제공자/u);
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://workspace_123456.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      apiKey: "user-key",
      costPolicy: "self-hosted-zero-cost",
    }, "text")).toThrow(/공개 AI 제공자/u);
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://my-private-runtime.example/v1",
      apiKey: "",
      costPolicy: "self-hosted-zero-cost",
    }, "text")).toThrow(/인증 토큰/u);
  });

  it("quarantines ambiguous legacy connections", () => {
    expect(inferLegacyUserAiCostPolicy({
      baseUrl: "https://api.openai.com/v1",
      textModel: "gpt-4o-mini",
      imageModel: "",
    })).toBe("unverified");
    expect(inferLegacyUserAiCostPolicy({
      baseUrl: "http://localhost:11434/v1",
      textModel: "qwen",
      imageModel: "",
    })).toBe("local-zero-cost");
  });

  it("ships only free-policy presets", () => {
    expect(FREE_AI_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(FREE_AI_PRESETS.map((preset) => String(preset.costPolicy))).not.toContain("unverified");
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "sambanova-free")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "mistral-free")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "qwen-beijing-free")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "zai-free")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "siliconflow-free")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.textModel === "openrouter/free")).toBe(true);
    expect(FREE_AI_PRESETS.every((preset) => preset.imageModel === "")).toBe(true);
  });
});
