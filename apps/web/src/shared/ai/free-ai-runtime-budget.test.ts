import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FREE_AI_RUNTIME_BUDGET_STORAGE_KEY,
  getFreeAiRuntimeBudgetSnapshot,
  guardFreeAiRuntimeRequest,
  MANAGED_FREE_DAILY_REQUEST_LIMIT,
  MANAGED_FREE_MAX_OUTPUT_TOKENS,
  recordFreeAiRuntimeResponse,
  resetFreeAiRuntimeBudget,
} from "./free-ai-runtime-budget";
import type { UserAiConnection } from "./user-ai-types";

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);


class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

const managedConnection: UserAiConnection = {
  id: "openrouter-user",
  label: "OpenRouter free",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "user-key",
  textModel: "openrouter/free",
  imageModel: "",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  costPolicy: "openrouter-free",
};

const localConnection: UserAiConnection = {
  ...managedConnection,
  id: "local",
  baseUrl: "http://localhost:8082/v1",
  apiKey: "",
  textModel: "qwen",
  costPolicy: "local-zero-cost",
};

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  resetFreeAiRuntimeBudget();
});

afterEach(() => {
  resetFreeAiRuntimeBudget();
  vi.unstubAllGlobals();
});

describe("free AI runtime budget guard", () => {
  it("does not limit or rewrite a local zero-cost request", async () => {
    const body = { model: "qwen", max_tokens: 4096, n: 2 };
    const result = await guardFreeAiRuntimeRequest(
      localConnection,
      "text",
      "/chat/completions",
      "POST",
      body,
      NOW,
    );

    expect(result.guarded).toBe(false);
    expect(result.body).toBe(body);
    expect(getFreeAiRuntimeBudgetSnapshot(localConnection, NOW).requestLimit).toBeNull();
  });

  it("forces the configured free model and clamps costly fan-out and output", async () => {
    const prompt = "비공개 원고는 원장에 저장되면 안 됩니다.";
    const result = await guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/chat/completions",
      "POST",
      {
        model: "vendor/paid-model",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 999_999,
        n: 4,
        best_of: 8,
        logprobs: true,
        top_logprobs: 20,
        store: true,
      },
      NOW,
    );

    expect(result.guarded).toBe(true);
    expect(result.maxOutputTokens).toBe(MANAGED_FREE_MAX_OUTPUT_TOKENS);
    expect(result.body).toMatchObject({
      model: "openrouter/free",
      max_tokens: MANAGED_FREE_MAX_OUTPUT_TOKENS,
      n: 1,
      best_of: 1,
      logprobs: false,
      store: false,
    });
    expect(result.body).not.toHaveProperty("top_logprobs");
    const status = getFreeAiRuntimeBudgetSnapshot(managedConnection, NOW);
    expect(status.requests).toBe(1);
    expect(status.reservedTokens).toBeGreaterThan(MANAGED_FREE_MAX_OUTPUT_TOKENS);
    expect(JSON.stringify(status)).not.toContain(prompt);
    expect(globalThis.localStorage.getItem(FREE_AI_RUNTIME_BUDGET_STORAGE_KEY)).not.toContain(prompt);
  });

  it("only permits model listing and chat completions on managed free providers", async () => {
    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/images/generations",
      "POST",
      { prompt: "test" },
      NOW,
    )).rejects.toThrow(/GET \/models|POST \/chat\/completions/u);

    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      NOW,
    )).resolves.toMatchObject({ guarded: true, reservedTokens: 0 });
  });

  it("fails closed after the local daily request safety cap", async () => {
    for (let index = 0; index < MANAGED_FREE_DAILY_REQUEST_LIMIT; index += 1) {
      await guardFreeAiRuntimeRequest(
        managedConnection,
        "text",
        "/models",
        "GET",
        undefined,
        NOW,
      );
    }

    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      NOW,
    )).rejects.toThrow(/안전 한도/u);
    expect(getFreeAiRuntimeBudgetSnapshot(managedConnection, NOW).remainingRequests).toBe(0);
  });

  it("fails closed when conservative token reservations reach the daily cap", async () => {
    const largePrompt = "x".repeat(124_000);
    await guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/chat/completions",
      "POST",
      { messages: [{ role: "user", content: largePrompt }], max_tokens: 1024 },
      NOW,
    );

    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/chat/completions",
      "POST",
      { messages: [{ role: "user", content: "second request" }] },
      NOW,
    )).rejects.toThrow(/토큰 예약 한도/u);
  });

  it("opens a breaker on provider rate limits and escalates a repeated 429 until UTC reset", async () => {
    await guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      NOW,
    );
    await recordFreeAiRuntimeResponse(
      managedConnection,
      429,
      new Headers({ "retry-after": "60" }),
      NOW,
    );

    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      NOW + 60_000,
    )).rejects.toThrow(/속도 제한/u);

    const afterFirstCooldown = NOW + 16 * 60_000;
    await guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      afterFirstCooldown,
    );
    await recordFreeAiRuntimeResponse(
      managedConnection,
      429,
      new Headers(),
      afterFirstCooldown,
    );

    const status = getFreeAiRuntimeBudgetSnapshot(managedConnection, afterFirstCooldown);
    expect(status.blockedReason).toBe("rate-limit");
    expect(status.blockedUntil).toBe(status.resetsAt);
  });

  it("locks a connection when the provider asks for payment until an explicit reset", async () => {
    await guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      NOW,
    );
    await recordFreeAiRuntimeResponse(
      managedConnection,
      402,
      new Headers(),
      NOW,
    );

    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      NOW + 2 * 24 * 60 * 60_000,
    )).rejects.toThrow(/결제를 요구/u);

    resetFreeAiRuntimeBudget(managedConnection);
    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/models",
      "GET",
      undefined,
      NOW + 2 * 24 * 60 * 60_000,
    )).resolves.toMatchObject({ guarded: true });
  });

  it("rejects streaming and oversized managed requests before network I/O", async () => {
    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/chat/completions",
      "POST",
      { stream: true, messages: [] },
      NOW,
    )).rejects.toThrow(/스트리밍/u);

    await expect(guardFreeAiRuntimeRequest(
      managedConnection,
      "text",
      "/chat/completions",
      "POST",
      { messages: [{ role: "user", content: "x".repeat(300_000) }] },
      NOW,
    )).rejects.toThrow(/256KiB/u);
  });
});
