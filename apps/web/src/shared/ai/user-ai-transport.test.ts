import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MANAGED_FREE_MAX_RESPONSE_BYTES,
  resetFreeAiRuntimeBudget,
} from "./free-ai-runtime-budget";
import { lockUserAi, setUserAiConfiguration } from "./user-ai-store";
import { completeUserAiTextDetailed, userAiFetch } from "./user-ai-transport";
import type { UserAiConnection } from "./user-ai-types";

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

beforeEach(() => {
  resetFreeAiRuntimeBudget();
  setUserAiConfiguration({
    version: 1,
    connections: [managedConnection],
    assignments: {
      text: managedConnection.id,
      image: null,
      inference: null,
      "three-d": null,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  lockUserAi(false);
  resetFreeAiRuntimeBudget();
});

describe("managed cloud AI transport", () => {
  it.each([200, 500])(
    "rejects an oversized %i response without retrying",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(
        new Uint8Array(MANAGED_FREE_MAX_RESPONSE_BYTES + 1),
        { status },
      ));
      vi.stubGlobal("fetch", fetchMock);

      await expect(userAiFetch(
        "text",
        "/chat/completions",
        { messages: [{ role: "user", content: "hello" }] },
      )).rejects.toThrow(/응답 용량/u);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("sends the guarded free model and output limit to the provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await userAiFetch(
      "text",
      "/chat/completions",
      {
        model: "vendor/paid-model",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 50_000,
        n: 9,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "openrouter/free",
      max_tokens: 1_024,
      n: 1,
    });
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
  });

  it("reports a missing cloud route without sending a request", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [],
      assignments: { text: null, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({
      code: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps user-funded BYOK out of automatic fallback until explicitly enabled", async () => {
    const paid: UserAiConnection = {
      ...managedConnection,
      id: "paid-user",
      label: "Paid cloud",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "paid-key",
      textModel: "gpt-4.1-mini",
      costPolicy: "user-funded-byok",
      priority: 1,
    };
    const groq: UserAiConnection = {
      ...managedConnection,
      id: "groq-user",
      label: "Groq free",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "groq-user-key",
      textModel: "groq-free-model",
      costPolicy: "provider-free-tier",
      priority: 100,
    };
    setUserAiConfiguration({
      version: 1,
      connections: [paid, groq],
      assignments: { text: paid.id, image: null, inference: null, "three-d": null },
      routing: {
        mode: "automatic",
        allowPaidFallback: false,
        managedPoolPriority: 50,
        serverProviderOrder: ["gemini", "groq"],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Free route" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "Free route",
      connection: { id: "groq-user" },
      attemptedConnectionIds: ["groq-user"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.groq.com");
  });

  it("does not invoke a paid-only route when paid fallback is disabled", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        id: "paid-only",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "paid-key",
        textModel: "gpt-4.1-mini",
        costPolicy: "user-funded-byok",
      }],
      assignments: { text: "paid-only", image: null, inference: null, "three-d": null },
      routing: {
        mode: "automatic",
        allowPaidFallback: false,
        managedPoolPriority: 50,
        serverProviderOrder: ["gemini", "groq"],
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({
      code: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses multiple keys and models in explicit priority order after safe authentication failure", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        id: "groq-multi",
        label: "Groq multi route",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "legacy-key",
        textModel: "legacy-model",
        costPolicy: "provider-free-tier",
        priority: 10,
        apiKeys: [
          { id: "backup", label: "Backup", apiKey: "key-b", enabled: true, priority: 20 },
          { id: "primary", label: "Primary", apiKey: "key-a", enabled: true, priority: 10 },
        ],
        models: [
          { id: "quality", label: "Quality", model: "model-quality", capability: "text", enabled: true, priority: 20 },
          { id: "fast", label: "Fast", model: "model-fast", capability: "text", enabled: true, priority: 10 },
        ],
      }],
      assignments: { text: "groq-multi", image: null, inference: null, "three-d": null },
      routing: {
        mode: "priority",
        allowPaidFallback: false,
        managedPoolPriority: 100,
        serverProviderOrder: ["groq", "gemini"],
      },
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization === "Bearer key-a") {
        return new Response(JSON.stringify({ error: "invalid key" }), { status: 401 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Backup key result" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "Backup key result",
      connection: {
        id: "groq-multi",
        apiKeyProfileId: "backup",
        modelProfileId: "fast",
      },
      attemptedRouteIds: [
        "groq-multi:fast:primary",
        "groq-multi:fast:backup",
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls through free providers by quality only after quota exhaustion", async () => {
    const gemini: UserAiConnection = {
      ...managedConnection,
      id: "gemini-user",
      label: "Gemini free",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "gemini-user-key",
      textModel: "gemini-free-model",
      costPolicy: "provider-free-tier",
    };
    const groq: UserAiConnection = {
      ...managedConnection,
      id: "groq-user",
      label: "Groq free",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "groq-user-key",
      textModel: "groq-free-model",
      costPolicy: "provider-free-tier",
    };
    setUserAiConfiguration({
      version: 1,
      connections: [groq, gemini],
      assignments: { text: groq.id, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(String(input));
      if (
        requestUrl.protocol === "https:"
        && requestUrl.hostname === "generativelanguage.googleapis.com"
      ) {
        return new Response(JSON.stringify({ error: "quota" }), { status: 429 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Groq fallback" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "Groq fallback",
      connection: { id: "groq-user" },
      attemptedConnectionIds: ["gemini-user", "groq-user"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an ambiguous provider failure on another key or model", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        apiKeys: [
          { id: "primary", label: "Primary", apiKey: "key-a", enabled: true, priority: 10 },
          { id: "backup", label: "Backup", apiKey: "key-b", enabled: true, priority: 20 },
        ],
        models: [
          { id: "fast", label: "Fast", model: "openrouter/free", capability: "text", enabled: true, priority: 10 },
        ],
      }],
      assignments: { text: managedConnection.id, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "provider unavailable" }),
      { status: 500, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({
      code: "http-error",
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
