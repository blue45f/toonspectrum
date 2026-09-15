import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MANAGED_FREE_MAX_RESPONSE_BYTES,
  resetFreeAiRuntimeBudget,
} from "./free-ai-runtime-budget";
import { lockUserAi, setUserAiConfiguration } from "./user-ai-store";
import { userAiFetch } from "./user-ai-transport";
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
});
