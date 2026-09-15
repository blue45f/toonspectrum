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

describe("managed free AI transport response limits", () => {
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

  it("sends the guarded model and output limit to the provider", async () => {
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

  it("reports a missing personal free connection without sending a request", async () => {
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

  it("falls through personal free connections by quality only after quota exhaustion", async () => {
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
      assignments: { text: null, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) {
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

  it("orders every reviewed personal free provider before OpenRouter and local fallbacks", async () => {
    const connections: UserAiConnection[] = [
      {
        ...managedConnection,
        id: "openrouter-ranked",
        label: "OpenRouter free",
      },
      {
        ...managedConnection,
        id: "mistral-ranked",
        label: "Mistral free",
        baseUrl: "https://api.mistral.ai/v1",
        textModel: "mistral-small-latest",
        costPolicy: "provider-free-tier",
      },
      {
        ...managedConnection,
        id: "cloudflare-ranked",
        label: "Cloudflare free",
        baseUrl: "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1",
        textModel: "@cf/openai/gpt-oss-120b",
        costPolicy: "provider-free-tier",
      },
      {
        ...managedConnection,
        id: "sambanova-ranked",
        label: "SambaNova free",
        baseUrl: "https://api.sambanova.ai/v1",
        textModel: "gpt-oss-120b",
        costPolicy: "provider-free-tier",
      },
      {
        ...managedConnection,
        id: "groq-ranked",
        label: "Groq free",
        baseUrl: "https://api.groq.com/openai/v1",
        textModel: "openai/gpt-oss-120b",
        costPolicy: "provider-free-tier",
      },
      {
        ...managedConnection,
        id: "gemini-ranked",
        label: "Gemini free",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        textModel: "gemini-3.8-flash",
        costPolicy: "provider-free-tier",
      },
    ];
    setUserAiConfiguration({
      version: 1,
      connections,
      assignments: { text: null, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: "OpenRouter final fallback" } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "free quota" }), { status: 429 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "OpenRouter final fallback",
      attemptedConnectionIds: [
        "gemini-ranked",
        "groq-ranked",
        "sambanova-ranked",
        "cloudflare-ranked",
        "mistral-ranked",
        "openrouter-ranked",
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
