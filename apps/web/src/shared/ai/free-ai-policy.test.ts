import { describe, expect, it } from "vitest";

import {
  assertFreeAiConnection,
  FREE_AI_PRESETS,
  freeAiConnectionPolicyIssue,
  inferLegacyUserAiCostPolicy,
  isOpenRouterFreeModel,
} from "./free-ai-policy";

const connection = {
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "user-key",
  textModel: "free-text-model",
  imageModel: "",
  costPolicy: "provider-free-tier" as const,
};

describe("cloud-only AI connection policy", () => {
  it("rejects loopback and private-network runtimes", () => {
    expect(freeAiConnectionPolicyIssue({
      ...connection,
      baseUrl: "http://localhost:8082/v1",
    }, "text")).toMatch(/공개 HTTPS|localhost/u);
    expect(freeAiConnectionPolicyIssue({
      ...connection,
      baseUrl: "https://192.168.0.3/v1",
    }, "text")).toMatch(/사설망/u);
  });

  it("allows explicit user-funded cloud BYOK and requires capability models", () => {
    const paid = {
      ...connection,
      baseUrl: "https://api.openai.com/v1",
      costPolicy: "user-funded-byok" as const,
    };
    expect(() => assertFreeAiConnection(paid, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({ ...paid, textModel: "" }, "text")).toThrow(/텍스트 모델/u);
    expect(() => assertFreeAiConnection({ ...paid, imageModel: "" }, "image")).toThrow(/이미지 모델/u);
    expect(() => assertFreeAiConnection({ ...paid, apiKey: "" }, "text")).toThrow(/API 키/u);
  });

  it("allows only the OpenRouter free router or :free variants", () => {
    expect(isOpenRouterFreeModel("openrouter/free")).toBe(true);
    expect(isOpenRouterFreeModel("vendor/model:free")).toBe(true);
    expect(isOpenRouterFreeModel("vendor/paid-model")).toBe(false);

    const free = {
      ...connection,
      baseUrl: "https://openrouter.ai/api/v1",
      textModel: "openrouter/free",
      costPolicy: "openrouter-free" as const,
    };
    expect(() => assertFreeAiConnection(free, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({ ...free, textModel: "openrouter/auto" }, "text")).toThrow(/free/u);
    expect(() => assertFreeAiConnection(free, "image")).toThrow(/텍스트/u);
  });

  it("restricts automatic free-tier mode to reviewed official text endpoints", () => {
    expect(() => assertFreeAiConnection(connection, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://router.huggingface.co/v1",
      textModel: "meta-llama/Llama-3.1-8B-Instruct",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://api.cerebras.ai/v1",
      textModel: "llama3.1-8b",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://workspace_123456.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
    }, "text")).not.toThrow();
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://workspace_123456.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.8-27b",
    }, "text")).toThrow(/무료 할당량/u);
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://api.z.ai/api/paas/v4",
      textModel: "glm-5.1",
    }, "text")).toThrow(/GLM-4\.7-Flash/u);
    expect(() => assertFreeAiConnection({
      ...connection,
      baseUrl: "https://api.example.com/v1",
    }, "text")).toThrow(/공식 OpenAI 호환 API/u);
    expect(() => assertFreeAiConnection(connection, "three-d")).toThrow(/텍스트 기능/u);
  });

  it("quarantines ambiguous legacy and local settings", () => {
    expect(inferLegacyUserAiCostPolicy({
      baseUrl: "https://api.openai.com/v1",
      textModel: "gpt-4o-mini",
      imageModel: "",
    })).toBe("unverified");
    expect(inferLegacyUserAiCostPolicy({
      baseUrl: "http://localhost:11434/v1",
      textModel: "qwen",
      imageModel: "",
    })).toBe("unverified");
  });

  it("ships cloud presets without local or self-hosted routes", () => {
    expect(FREE_AI_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(FREE_AI_PRESETS.map((preset) => String(preset.costPolicy))).not.toContain("unverified");
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "huggingface-free")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "cerebras-free")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.id === "custom-cloud")).toBe(true);
    expect(FREE_AI_PRESETS.some((preset) => preset.textModel === "openrouter/free")).toBe(true);
    expect(FREE_AI_PRESETS.every((preset) => !preset.baseUrl.includes("localhost"))).toBe(true);
  });
});
