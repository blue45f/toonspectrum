import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  buildCharacterConsistencyPrompt,
  colorizeLineArt,
  dataUrlToBlob,
  DEFAULT_STUDIO_AI_IMAGE_SIZE,
  generateBackgroundImage,
  generateConsistentCharacterImage,
  generateScenarioScenes,
  generateStudioWriterRoomDraft,
  isStudioAiConfigured,
  loadStudioAiSettings,
  loadStudioAiSessionSettings,
  saveStudioAiSettings,
  STUDIO_AI_DEFAULT_SETTINGS,
  STUDIO_AI_SETTINGS_KEY,
  studioTextAiTransportForOperation,
  suggestColorPalette,
  suggestDialogueLines,
  suggestSceneComposition,
  testAiConnection,
  translateDialogueBatch,
  type StudioAiSettings,
  type StudioAiStorage,
} from "./studio-ai-client";
import { createEmptyStudioWriterRoomDocument } from "./studio-writer-room";

// 인메모리 storage — studio-brand-kit.test.ts 계열과 동일하게 localStorage 인터페이스만 흉내낸다.
function createMemoryStorage(): StudioAiStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const CONFIGURED: StudioAiSettings = {
  ...STUDIO_AI_DEFAULT_SETTINGS,
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test-key",
};

function createAbortAwareFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const rejectAsAborted = () => {
        reject(Object.assign(new Error("provider-specific abort message"), { name: "AbortError" }));
      };
      if (init?.signal?.aborted) {
        rejectAsAborted();
        return;
      }
      init?.signal?.addEventListener("abort", rejectAsAborted, { once: true });
    })
  );
}

describe("studio-ai-client settings storage", () => {
  it("returns defaults when storage is empty/absent", () => {
    expect(loadStudioAiSettings(null)).toEqual(STUDIO_AI_DEFAULT_SETTINGS);
    expect(loadStudioAiSettings(createMemoryStorage())).toEqual(STUDIO_AI_DEFAULT_SETTINGS);
  });

  it("round-trips via save/load", () => {
    const storage = createMemoryStorage();
    saveStudioAiSettings(storage, CONFIGURED);
    expect(loadStudioAiSettings(storage)).toEqual(CONFIGURED);
  });

  it("falls back field-by-field on corrupt JSON or missing fields", () => {
    const storage = createMemoryStorage();
    storage.setItem(STUDIO_AI_SETTINGS_KEY, JSON.stringify({ baseUrl: "https://custom.example/v1" }));
    const loaded = loadStudioAiSettings(storage);
    expect(loaded.baseUrl).toBe("https://custom.example/v1");
    expect(loaded.imageModel).toBe(STUDIO_AI_DEFAULT_SETTINGS.imageModel);
    expect(loaded.apiKey).toBe(""); // 누락 필드는 기본값(빈 문자열)으로.

    storage.setItem(STUDIO_AI_SETTINGS_KEY, "{not json");
    expect(loadStudioAiSettings(storage)).toEqual(STUDIO_AI_DEFAULT_SETTINGS);
  });

  it("preserves an intentionally empty apiKey (does not coerce to default)", () => {
    const storage = createMemoryStorage();
    saveStudioAiSettings(storage, { ...STUDIO_AI_DEFAULT_SETTINGS, apiKey: "" });
    expect(loadStudioAiSettings(storage).apiKey).toBe("");
  });

  it("migrates a legacy persistent BYOK key into the tab session and removes the durable copy", () => {
    const session = createMemoryStorage();
    const legacy = createMemoryStorage();
    saveStudioAiSettings(legacy, CONFIGURED);

    expect(loadStudioAiSessionSettings(session, legacy)).toEqual(CONFIGURED);
    expect(loadStudioAiSettings(session)).toEqual(CONFIGURED);
    expect(legacy.getItem(STUDIO_AI_SETTINGS_KEY)).toBeNull();
  });

  it("prefers the current tab session and still deletes a stale legacy key", () => {
    const session = createMemoryStorage();
    const legacy = createMemoryStorage();
    const sessionSettings = { ...CONFIGURED, apiKey: "session-only-key" };
    saveStudioAiSettings(session, sessionSettings);
    saveStudioAiSettings(legacy, { ...CONFIGURED, apiKey: "stale-persistent-key" });

    expect(loadStudioAiSessionSettings(session, legacy)).toEqual(sessionSettings);
    expect(legacy.getItem(STUDIO_AI_SETTINGS_KEY)).toBeNull();
  });

  it("isStudioAiConfigured requires both baseUrl and apiKey", () => {
    expect(isStudioAiConfigured(STUDIO_AI_DEFAULT_SETTINGS)).toBe(false);
    expect(isStudioAiConfigured({ ...STUDIO_AI_DEFAULT_SETTINGS, apiKey: "sk-x" })).toBe(true);
    expect(isStudioAiConfigured({ ...STUDIO_AI_DEFAULT_SETTINGS, baseUrl: "", apiKey: "sk-x" })).toBe(false);
  });
});

describe("dataUrlToBlob", () => {
  it("decodes a base64 data URL", async () => {
    const dataUrl = `data:text/plain;base64,${btoa("hello")}`;
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("hello");
  });

  it("decodes a percent-encoded (non-base64) data URL", async () => {
    const dataUrl = "data:text/plain,Hello%20World%21";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("Hello World!");
  });

  it("decodes a base64 data URL that has extra mime parameters before the base64 flag (RFC 2397)", async () => {
    // 회귀 테스트: charset 등 추가 파라미터가 껴 있으면 이전 정규식(`;base64`가 mime 바로 다음이라고
    // 가정)은 유효한 data URL도 형식 불일치로 오판해 throw했다.
    const dataUrl = `data:text/plain;charset=utf-8;base64,${btoa("hi")}`;
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("hi");
  });

  it("decodes a non-base64 data URL that has extra mime parameters", async () => {
    const dataUrl = "data:text/plain;charset=utf-8,hi%20there";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("hi there");
  });

  it("falls back to application/octet-stream when no mime type is present", async () => {
    const blob = dataUrlToBlob("data:,hello");
    expect(blob.type).toBe("application/octet-stream");
    expect(await blob.text()).toBe("hello");
  });

  it("throws for non-data URLs (remote URLs unsupported)", () => {
    expect(() => dataUrlToBlob("https://example.com/image.png")).toThrow();
  });

  it("throws for a data: URL with no comma separator (malformed)", () => {
    expect(() => dataUrlToBlob("data:image/png;base64")).toThrow();
  });
});

describe("buildCharacterConsistencyPrompt", () => {
  it("wraps the situation prompt with fixed instructions to preserve the character's appearance", () => {
    const result = buildCharacterConsistencyPrompt("비 오는 골목에서 우산을 쓰고 서 있는 모습");
    expect(result).toContain("비 오는 골목에서 우산을 쓰고 서 있는 모습");
    expect(result).toContain("겉모습을 최대한 그대로 유지");
    expect(result).toContain("정체성과 외모는 바꾸지 말고");
  });

  it("trims the situation prompt before embedding it (no leading/trailing whitespace leaks through)", () => {
    const result = buildCharacterConsistencyPrompt("   눈밭에 서 있는 모습   ");
    expect(result).toContain("눈밭에 서 있는 모습");
    expect(result.includes("   눈밭")).toBe(false);
    expect(result.includes("모습   ")).toBe(false);
  });

  it("is deterministic for the same input (no randomness/timestamps)", () => {
    expect(buildCharacterConsistencyPrompt("웃는 모습")).toBe(buildCharacterConsistencyPrompt("웃는 모습"));
  });
});

describe("studio-ai-client network calls (fetch mocked)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("generateBackgroundImage", () => {
    it("does NOT call fetch when the key is missing (not_configured, no network)", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateBackgroundImage(STUDIO_AI_DEFAULT_SETTINGS, "교실, 낮, 창문으로 햇빛");

      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does NOT call fetch for a blank prompt even when configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateBackgroundImage(CONFIGURED, "   ");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends the exact OpenAI Images Generations request shape and parses b64_json", async () => {
      const mockFetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ b64_json: btoa("fake-png-bytes") }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateBackgroundImage(CONFIGURED, "교실, 낮, 창문으로 햇빛", { size: "1024x1792" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/images/generations");
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ Authorization: "Bearer sk-test-key", "Content-Type": "application/json" });
      expect(JSON.parse(init.body as string)).toEqual({
        model: CONFIGURED.imageModel,
        prompt: "교실, 낮, 창문으로 햇빛",
        n: 1,
        size: "1024x1792",
        response_format: "b64_json",
      });

      expect(result).toEqual({
        ok: true,
        data: { dataUrl: `data:image/png;base64,${btoa("fake-png-bytes")}`, width: 1024, height: 1792 },
      });
    });

    it("defaults to DEFAULT_STUDIO_AI_IMAGE_SIZE when no size is passed", async () => {
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: "AA==" }] }), { status: 200 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await generateBackgroundImage(CONFIGURED, "prompt");

      const [, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(init.body as string).size).toBe(DEFAULT_STUDIO_AI_IMAGE_SIZE);
    });

    it("returns http_error with the provider's error message on non-2xx", async () => {
      const mockFetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateBackgroundImage(CONFIGURED, "prompt");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("http_error");
        expect(result.error).toContain("401");
        expect(result.error).toContain("Invalid API key");
      }
    });

    it("returns network_error when fetch rejects", async () => {
      const mockFetch = vi.fn(async () => {
        throw new Error("offline");
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateBackgroundImage(CONFIGURED, "prompt");
      expect(result).toEqual({ ok: false, code: "network_error", error: "offline" });
    });

    it("forwards opts.signal to the JSON request and resolves an abort as network_error", async () => {
      const controller = new AbortController();
      const mockFetch = createAbortAwareFetch();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const resultPromise = generateBackgroundImage(CONFIGURED, "prompt", { signal: controller.signal });
      const [, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.signal).toBe(controller.signal);

      controller.abort();
      await expect(resultPromise).resolves.toEqual({
        ok: false,
        code: "network_error",
        error: "요청이 취소되었습니다.",
      });
    });

    it("returns parse_error when the response has no b64_json (e.g. url-only providers)", async () => {
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ data: [{ url: "https://cdn.example/x.png" }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateBackgroundImage(CONFIGURED, "prompt");
      expect(result).toEqual({ ok: false, code: "parse_error", error: expect.any(String) });
    });

    it("returns parse_error on malformed JSON body", async () => {
      const mockFetch = vi.fn(async () => new Response("not json", { status: 200 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateBackgroundImage(CONFIGURED, "prompt");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("parse_error");
    });
  });

  describe("colorizeLineArt", () => {
    const lineArtDataUrl = `data:image/png;base64,${btoa("line-art-bytes")}`;

    it("does NOT call fetch when not configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await colorizeLineArt(STUDIO_AI_DEFAULT_SETTINGS, lineArtDataUrl, "파스텔톤으로 채색해줘");

      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does NOT call fetch for a non-data-URL source", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await colorizeLineArt(CONFIGURED, "https://example.com/line.png", "채색해줘");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends a multipart request (image blob + prompt) without a manual Content-Type header", async () => {
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: btoa("colored") }] }), { status: 200 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await colorizeLineArt(CONFIGURED, lineArtDataUrl, "파스텔톤으로 채색해줘");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/images/edits");
      expect(init.method).toBe("POST");
      // Authorization만 수동 설정 — Content-Type은 fetch가 FormData boundary를 위해 자동 지정해야 하므로 빠져 있어야 한다.
      expect(init.headers).toEqual({ Authorization: "Bearer sk-test-key" });
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      expect(form.get("prompt")).toBe("파스텔톤으로 채색해줘");
      expect(form.get("model")).toBe(CONFIGURED.imageModel);
      expect(form.get("response_format")).toBe("b64_json");
      const imageField = form.get("image");
      expect(imageField).toBeInstanceOf(Blob);
      expect(await (imageField as Blob).text()).toBe("line-art-bytes");

      expect(result).toEqual({ ok: true, data: { dataUrl: `data:image/png;base64,${btoa("colored")}` } });
    });
  });

  describe("generateConsistentCharacterImage", () => {
    const referenceDataUrl = `data:image/png;base64,${btoa("reference-character-bytes")}`;
    const situationPrompt = "비 오는 골목에서 우산을 쓰고 서 있는 모습";

    it("does NOT call fetch when not configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(STUDIO_AI_DEFAULT_SETTINGS, referenceDataUrl, situationPrompt);

      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does NOT call fetch for a blank situation prompt even when configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(CONFIGURED, referenceDataUrl, "   ");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does NOT call fetch when the reference image is missing (empty string)", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(CONFIGURED, "", situationPrompt);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does NOT call fetch for a non-data-URL reference (remote URLs unsupported)", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(CONFIGURED, "https://example.com/character.png", situationPrompt);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends a multipart request (reference image blob + composed prompt) without a manual Content-Type header", async () => {
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ data: [{ b64_json: btoa("new-scene-bytes") }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(CONFIGURED, referenceDataUrl, situationPrompt);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/images/edits");
      expect(init.method).toBe("POST");
      // Authorization만 수동 설정 — Content-Type은 fetch가 FormData boundary를 위해 자동 지정해야 하므로 빠져 있어야 한다.
      expect(init.headers).toEqual({ Authorization: "Bearer sk-test-key" });
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      // 사용자가 입력한 situationPrompt 그대로가 아니라, buildCharacterConsistencyPrompt로 감싼 결과가 나가야 한다.
      expect(form.get("prompt")).toBe(buildCharacterConsistencyPrompt(situationPrompt));
      expect(form.get("model")).toBe(CONFIGURED.imageModel);
      expect(form.get("response_format")).toBe("b64_json");
      const imageField = form.get("image");
      expect(imageField).toBeInstanceOf(Blob);
      expect(await (imageField as Blob).text()).toBe("reference-character-bytes");

      expect(result).toEqual({ ok: true, data: { dataUrl: `data:image/png;base64,${btoa("new-scene-bytes")}` } });
    });

    it("returns parse_error when the response has no b64_json (e.g. url-only providers)", async () => {
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ data: [{ url: "https://cdn.example/x.png" }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(CONFIGURED, referenceDataUrl, situationPrompt);
      expect(result).toEqual({ ok: false, code: "parse_error", error: expect.any(String) });
    });

    it("returns http_error with the provider's error message on non-2xx", async () => {
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(CONFIGURED, referenceDataUrl, situationPrompt);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("http_error");
        expect(result.error).toContain("401");
        expect(result.error).toContain("Invalid API key");
      }
    });

    it("returns network_error when fetch rejects", async () => {
      const mockFetch = vi.fn(async () => {
        throw new Error("offline");
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateConsistentCharacterImage(CONFIGURED, referenceDataUrl, situationPrompt);
      expect(result).toEqual({ ok: false, code: "network_error", error: "offline" });
    });

    it("forwards opts.signal to the multipart request and resolves an abort as network_error", async () => {
      const controller = new AbortController();
      const mockFetch = createAbortAwareFetch();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const resultPromise = generateConsistentCharacterImage(CONFIGURED, referenceDataUrl, situationPrompt, {
        signal: controller.signal,
      });
      const [, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.signal).toBe(controller.signal);
      expect(init.body).toBeInstanceOf(FormData);

      controller.abort();
      await expect(resultPromise).resolves.toEqual({
        ok: false,
        code: "network_error",
        error: "요청이 취소되었습니다.",
      });
    });
  });

  describe("suggestSceneComposition", () => {
    it("does NOT call fetch when not configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestSceneComposition(STUDIO_AI_DEFAULT_SETTINGS, "주인공이 교실에 들어온다");

      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends a Chat Completions request and parses choices[0].message.content", async () => {
      const mockFetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "- 미디엄샷으로 시작\n- ..." } }] }), {
            status: 200,
          })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const byokTransport = { mode: "byok" as const };
      const operationTransport = studioTextAiTransportForOperation(
        byokTransport,
        "composition-00000000-0000-4000-8000-000000000021"
      );
      const result = await suggestSceneComposition(
        CONFIGURED,
        "주인공이 교실에 들어온다",
        operationTransport
      );

      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      expect(operationTransport).toBe(byokTransport);
      expect(new Headers(init.headers).has("Idempotency-Key")).toBe(false);
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(CONFIGURED.textModel);
      expect(body.messages[1]).toEqual({ role: "user", content: "주인공이 교실에 들어온다" });
      expect(body.messages[0].role).toBe("system");

      expect(result).toMatchObject({
        ok: true,
        data: {
          suggestion: "- 미디엄샷으로 시작\n- ...",
          textProvenance: {
            provider: "api.example.com",
            model: CONFIGURED.textModel,
            transport: "byok",
          },
        },
      });
    });

    it("returns invalid_input for blank scene text without calling fetch", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestSceneComposition(CONFIGURED, "  ");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("generateScenarioScenes", () => {
    it("does NOT call fetch when not configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateScenarioScenes(STUDIO_AI_DEFAULT_SETTINGS, "주인공이 학교 가는 길에 친구를 만난다");

      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does NOT call fetch for a blank story even when configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateScenarioScenes(CONFIGURED, "   ");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends a Chat Completions request carrying the sceneCountHint and parses the JSON scene plan", async () => {
      const content = JSON.stringify({
        characterDescription: "단발머리 여고생, 교복 차림",
        scenes: [
          { imagePrompt: "아침 등굣길, 골목", dialogue: "민수: 안녕!\n지영: 오랜만이야" },
          { imagePrompt: "교실, 창가 자리", dialogue: "" },
        ],
      });
      const mockFetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content } }],
              model: "provider-text-v2",
              usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
            }),
            { status: 200 }
          )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateScenarioScenes(CONFIGURED, "주인공이 학교 가는 길에 친구를 만난다", {
        sceneCountHint: 2,
        characterContext: "캐릭터 1\n- 외형 [고정]: 은빛 단발",
      });

      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(CONFIGURED.textModel);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("정확히 2개의 장면");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toContain("[캐릭터 바이블]");
      expect(body.messages[1].content).toContain("외형 [고정]: 은빛 단발");
      expect(body.messages[1].content).toContain("[스토리 아이디어]\n주인공이 학교 가는 길에 친구를 만난다");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.characterDescription).toBe("단발머리 여고생, 교복 차림");
      expect(result.data.scenes).toHaveLength(2);
      expect(result.data.textProvenance).toMatchObject({
        provider: "api.example.com",
        model: "provider-text-v2",
        transport: "byok",
        promptVersion: 1,
        usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      });
      expect(Number.isNaN(Date.parse(result.data.textProvenance.createdAt))).toBe(false);
    });

    it("surfaces parse_error when the response has no JSON object (e.g. a refusal message)", async () => {
      const mockFetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "죄송하지만 도와드릴 수 없습니다." } }] }), {
            status: 200,
          })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateScenarioScenes(CONFIGURED, "스토리");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("parse_error");
    });

    it("surfaces http_error on a failed request", async () => {
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({ error: "bad key" }), { status: 401 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateScenarioScenes(CONFIGURED, "스토리");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("http_error");
    });

    it("forwards opts.signal to the scenario JSON request and resolves an abort as network_error", async () => {
      const controller = new AbortController();
      const mockFetch = createAbortAwareFetch();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const resultPromise = generateScenarioScenes(CONFIGURED, "스토리", { signal: controller.signal });
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      const [, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.signal).toBe(controller.signal);

      controller.abort();
      await expect(resultPromise).resolves.toEqual({
        ok: false,
        code: "network_error",
        error: "요청이 취소되었습니다.",
      });
    });
  });

  describe("generateStudioWriterRoomDraft", () => {
    it("does not request an unconfigured transport", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateStudioWriterRoomDraft(STUDIO_AI_DEFAULT_SETTINGS, {
        stage: "premise",
        document: createEmptyStudioWriterRoomDocument(),
      });

      expect(result).toMatchObject({ ok: false, code: "not_configured" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns a reviewed candidate and provenance without applying it to the source document", async () => {
      const source = createEmptyStudioWriterRoomDocument();
      const content = JSON.stringify({
        stage: "premise",
        rationale: "주인공의 선택과 대가를 명확히 함",
        draft: { text: "꿈을 거래하는 소년이 마지막 꿈을 지키려 한다.", characterIds: [] },
      });
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content } }],
        model: "writer-model-v1",
        usage: { total_tokens: 321 },
      }), { status: 200 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateStudioWriterRoomDraft(CONFIGURED, {
        stage: "premise",
        document: source,
        direction: "미스터리 톤",
      });

      expect(source.stages.premise.text).toBe("");
      expect(result).toMatchObject({
        ok: true,
        data: {
          stage: "premise",
          rationale: "주인공의 선택과 대가를 명확히 함",
          draft: { text: "꿈을 거래하는 소년이 마지막 꿈을 지키려 한다." },
          textProvenance: {
            provider: "api.example.com",
            model: "writer-model-v1",
            transport: "byok",
            usage: { totalTokens: 321 },
          },
        },
      });
      const [, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.messages[0].content).toContain("전문 스토리 에디터");
      expect(body.messages[1].content).toContain("미스터리 톤");
    });

    it("rejects a structurally invalid candidate as parse_error", async () => {
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: '{"stage":"premise","rationale":"x","draft":{"text":"x"}}' } }],
      }), { status: 200 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await generateStudioWriterRoomDraft(CONFIGURED, {
        stage: "premise",
        document: createEmptyStudioWriterRoomDocument(),
      });

      expect(result).toMatchObject({ ok: false, code: "parse_error" });
    });
  });

  describe("translateDialogueBatch", () => {
    it("returns translations with the actual provider/model usage provenance", async () => {
      const content = JSON.stringify([
        { id: "bubble-1", text: "Hello!" },
        { id: "bubble-2", text: "Nice to meet you." },
      ]);
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content } }],
        model: "translation-model-v2",
        usage: { prompt_tokens: 42, completion_tokens: 18, total_tokens: 60 },
      }), { status: 200 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await translateDialogueBatch(
        CONFIGURED,
        [
          { id: "bubble-1", text: "안녕!" },
          { id: "bubble-2", text: "만나서 반가워." },
        ],
        "영어",
        "",
      );

      expect(result).toMatchObject({
        ok: true,
        data: {
          translations: [
            { id: "bubble-1", text: "Hello!" },
            { id: "bubble-2", text: "Nice to meet you." },
          ],
          textProvenance: {
            provider: "api.example.com",
            model: "translation-model-v2",
            transport: "byok",
            usage: { promptTokens: 42, completionTokens: 18, totalTokens: 60 },
          },
        },
      });
    });
  });

  describe("suggestDialogueLines", () => {
    it("does NOT call fetch when not configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestDialogueLines(STUDIO_AI_DEFAULT_SETTINGS, "옛 친구를 알아보고 반가워하는 장면");

      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns invalid_input for blank situation text without calling fetch", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestDialogueLines(CONFIGURED, "   ");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends a Chat Completions request and parses the JSON candidate array", async () => {
      const content = JSON.stringify([
        { speaker: "민수", text: "나 전학왔어.", kind: "speech" },
        { speaker: "", text: "(교실이 순간 조용해진다)", kind: "narration" },
      ]);
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestDialogueLines(CONFIGURED, "주인공이 전학 첫날 교실에 들어온다");

      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(CONFIGURED.textModel);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1]).toEqual({ role: "user", content: "주인공이 전학 첫날 교실에 들어온다" });

      expect(result).toMatchObject({
        ok: true,
        data: {
          candidates: [
            { speaker: "민수", text: "나 전학왔어.", kind: "speech" },
            { speaker: "", text: "(교실이 순간 조용해진다)", kind: "narration" },
          ],
          textProvenance: {
            provider: "api.example.com",
            model: CONFIGURED.textModel,
            transport: "byok",
          },
        },
      });
    });

    it("passes existingContext through into the system prompt when given", async () => {
      const content = JSON.stringify([{ speaker: "", text: "오랜만이야.", kind: "speech" }]);
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await suggestDialogueLines(CONFIGURED, "상황", { existingContext: "민수: 안녕!" });

      const [, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.messages[0].content).toContain("민수: 안녕!");
    });

    it("surfaces parse_error when the response has no JSON array (e.g. a refusal message)", async () => {
      const mockFetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "죄송하지만 도와드릴 수 없습니다." } }] }), {
            status: 200,
          })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestDialogueLines(CONFIGURED, "상황");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("parse_error");
    });

    it("surfaces http_error on a failed request", async () => {
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({ error: "bad key" }), { status: 401 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestDialogueLines(CONFIGURED, "상황");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("http_error");
    });
  });

  describe("suggestColorPalette", () => {
    it("does NOT call fetch when not configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestColorPalette(STUDIO_AI_DEFAULT_SETTINGS, "스릴러, 어둡고 차가운 느낌");

      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns invalid_input for blank mood text without calling fetch", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestColorPalette(CONFIGURED, "   ");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends a Chat Completions request and parses the JSON palette object", async () => {
      const content = JSON.stringify({
        name: "스릴러 - 어둡고 차가운",
        colors: [
          { hex: "#101820", role: "주조색" },
          { hex: "#c94f4f", role: "포인트색" },
        ],
      });
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestColorPalette(CONFIGURED, "스릴러, 어둡고 차가운 느낌");

      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(CONFIGURED.textModel);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1]).toEqual({ role: "user", content: "스릴러, 어둡고 차가운 느낌" });

      expect(result).toMatchObject({
        ok: true,
        data: {
          name: "스릴러 - 어둡고 차가운",
          colors: [
            { hex: "#101820", role: "주조색" },
            { hex: "#c94f4f", role: "포인트색" },
          ],
          textProvenance: {
            provider: "api.example.com",
            model: CONFIGURED.textModel,
            transport: "byok",
          },
        },
      });
    });

    it("surfaces parse_error when the response has no JSON object (e.g. a refusal message)", async () => {
      const mockFetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "죄송하지만 도와드릴 수 없습니다." } }] }), {
            status: 200,
          })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestColorPalette(CONFIGURED, "무드");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("parse_error");
    });

    it("surfaces http_error on a failed request", async () => {
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({ error: "bad key" }), { status: 401 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await suggestColorPalette(CONFIGURED, "무드");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("http_error");
    });
  });

  describe("testAiConnection", () => {
    it("does NOT call fetch when not configured", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await testAiConnection(STUDIO_AI_DEFAULT_SETTINGS);
      expect(result).toEqual({ ok: false, code: "not_configured", error: expect.any(String) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("pings the chat completions endpoint with max_tokens:1 and reports latency", async () => {
      const mockFetch = vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content: "pong" } }] }), { status: 200 })
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await testAiConnection(CONFIGURED);

      const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      expect(JSON.parse(init.body as string).max_tokens).toBe(1);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("surfaces http_error on failed auth", async () => {
      const mockFetch = vi.fn(async () => new Response(JSON.stringify({ error: "bad key" }), { status: 401 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await testAiConnection(CONFIGURED);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("http_error");
    });
  });
});
