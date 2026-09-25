import { describe, expect, it, vi } from "vitest";

import { createCreatorIntelligenceCore } from "./creator-intelligence-core";

const stamp = Date.parse("2026-09-18T00:00:00.000Z");

function json(value: unknown): Response {
  return Response.json(value);
}

describe("creator intelligence provider gates", () => {
  it("keeps optional commercial providers disabled without explicit configuration", () => {
    const fetcher = vi.fn<typeof fetch>();
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => ({}) });
    const status = core.describe();
    expect(status.references.openverse.status).toBe("ready");
    expect(status.scene.status).toBe("disabled");
    expect(status.anilist.status).toBe("disabled");
    expect(status.freesound.status).toBe("disabled");
    expect(status.meshy.status).toBe("disabled");
    expect(status.safeSearch.status).toBe("disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not call Pexels when the server key is absent", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => ({}) });
    const result = await core.searchReferences("pexels", "night street");
    expect(result.status).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("creator intelligence reference providers", () => {
  it("normalizes Openverse as discovery-only and keeps source provenance", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      result_count: 1,
      results: [{
        id: "ov-1",
        title: "Rainy alley",
        creator: "Example Artist",
        foreign_landing_url: "https://example.org/art/rainy-alley",
        thumbnail: "https://images.example.org/rainy.jpg",
        license: "cc0",
        license_version: "1.0",
        license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
        width: 1200,
        height: 800,
      }],
    }));
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => ({}), now: () => stamp });
    const result = await core.searchReferences("openverse", "rainy alley");
    expect(result.status).toBe("ready");
    expect(result.items[0]).toMatchObject({
      id: "openverse:ov-1",
      title: "Rainy alley",
      rightsStatus: "verify-source",
      importable: false,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("api.openverse.org/v1/images/");
  });
  it("keeps Pexels API keys server-side and preserves license metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      total_results: 1,
      photos: [{
        id: 12,
        width: 1000,
        height: 1500,
        url: "https://www.pexels.com/photo/12/",
        photographer: "Photo Maker",
        photographer_url: "https://www.pexels.com/@photo-maker/",
        alt: "Street reference",
        src: { medium: "https://images.pexels.com/photos/12/pexels-photo-12.jpeg" },
      }],
    }));
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => ({ PEXELS_API_KEY: "secret-key" }) });
    const result = await core.searchReferences("pexels", "street pose");
    expect(result.items[0]).toMatchObject({
      id: "pexels:12",
      license: "Pexels License",
      rightsStatus: "provider-license",
    });
    expect(result.cache).toEqual({ hit: false, ttlSeconds: 21_600 });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).not.toContain("secret-key");
    expect(new Headers(init?.headers).get("authorization")).toBe("secret-key");
  });

  it("uses a 24-hour Pixabay cache to protect the free rate limit", async () => {
    let current = stamp;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json({
      totalHits: 1,
      hits: [{
        id: 34,
        pageURL: "https://pixabay.com/photos/city-night-34/",
        tags: "city, night, lights",
        user: "Reference Maker",
        webformatURL: "https://cdn.pixabay.com/photo/34_640.jpg",
        imageWidth: 1920,
        imageHeight: 1080,
      }],
    }));
    const core = createCreatorIntelligenceCore({
      fetch: fetcher,
      env: () => ({ PIXABAY_API_KEY: "pixabay-secret" }),
      now: () => current,
    });

    const first = await core.searchReferences("pixabay", "night city", 1);
    const second = await core.searchReferences("pixabay", "night city", 1);

    expect(first.items[0]).toMatchObject({
      id: "pixabay:34",
      license: "Pixabay Content License",
      rightsStatus: "provider-license",
    });
    expect(first.cache).toEqual({ hit: false, ttlSeconds: 86_400 });
    expect(second.cache).toEqual({ hit: true, ttlSeconds: 86_400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("key")).toBe("pixabay-secret");
    expect(requestUrl.searchParams.get("safesearch")).toBe("true");

    current += 24 * 60 * 60 * 1_000 + 1;
    const refreshed = await core.searchReferences("pixabay", "night city", 1);
    expect(refreshed.cache).toEqual({ hit: false, ttlSeconds: 86_400 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
describe("creator intelligence production providers", () => {
  it("translates through DeepL without exposing the key in the request URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      translations: [{ text: "Hello", detected_source_language: "KO" }],
    }));
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => ({ DEEPL_API_KEY: "deep-secret" }) });
    const result = await core.translate("deepl", { text: "안녕하세요", targetLanguage: "EN" });
    expect(result).toMatchObject({ status: "ready", provider: "deepl", text: "Hello" });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.deepl.com/v2/translate");
    expect(String(url)).not.toContain("deep-secret");
    expect(new Headers(init?.headers).get("authorization")).toBe("DeepL-Auth-Key deep-secret");
  });

  it("does not call AniList until the operator enables its commercial/API gate", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => ({}) });
    const result = await core.searchAniList("Frieren", "ANIME");
    expect(result).toEqual({ status: "disabled", items: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires an explicit public HTTPS URL before starting Meshy", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => ({ CREATOR_INTELLIGENCE_MESHY_ENABLED: "true", MESHY_API_KEY: "meshy" }) });
    await expect(core.createMeshyJob({ imageUrl: "http://localhost/secret.png" })).rejects.toThrow("HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe("creator intelligence voice providers", () => {
  const voiceEnv = {
    CREATOR_INTELLIGENCE_VOICE_ENABLED: "true",
    GEMINI_TTS_API_KEY: "gemini-voice-secret",
    DEEPGRAM_API_KEY: "deepgram-voice-secret",
  };

  function minimalWaveBase64(): string {
    const bytes = Buffer.alloc(44);
    bytes.write("RIFF", 0, "ascii");
    bytes.writeUInt32LE(36, 4);
    bytes.write("WAVE", 8, "ascii");
    bytes.write("fmt ", 12, "ascii");
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(24_000, 24);
    bytes.writeUInt32LE(48_000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36, "ascii");
    bytes.writeUInt32LE(0, 40);
    return bytes.toString("base64");
  }

  it("reports cloud voice availability only after explicit enablement", () => {
    const disabled = createCreatorIntelligenceCore({ fetch: vi.fn<typeof fetch>(), env: () => ({}) });
    expect(disabled.describe().voice.gemini.status).toBe("disabled");
    expect(disabled.describe().voice.deepgram.status).toBe("disabled");

    const ready = createCreatorIntelligenceCore({ fetch: vi.fn<typeof fetch>(), env: () => voiceEnv });
    expect(ready.describe().voice.gemini.status).toBe("ready");
    expect(ready.describe().voice.deepgram.status).toBe("ready");
  });

  it("sends exact authored text and acting metadata to Gemini TTS", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      steps: [{
        type: "model_output",
        content: [{
          type: "audio",
          data: minimalWaveBase64(),
          mime_type: "audio/wav",
        }],
      }],
    }));
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => voiceEnv, now: () => stamp });
    const result = await core.synthesizeVoice("gemini", {
      text: "안녕하세요. 자막을 그대로 읽습니다.",
      style: "차분하고 또렷하게",
      voice: "Kore",
      language: "ko",
    });

    expect(result).toMatchObject({
      status: "ready",
      provider: "gemini",
      model: "gemini-3.8-flash-lite-tts",
      voice: "Kore",
      mimeType: "audio/wav",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(String(url)).not.toContain("gemini-voice-secret");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("gemini-voice-secret");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gemini-3.8-flash-lite-tts",
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Kore" }] },
    });
    expect(JSON.stringify(body)).toContain("안녕하세요. 자막을 그대로 읽습니다.");
    expect(JSON.stringify(body)).toContain("차분하고 또렷하게");
  });

  it("uses Deepgram Aura only for supported non-Korean text", async () => {
    const audio = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(audio, {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    }));
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => voiceEnv, now: () => stamp });
    const result = await core.synthesizeVoice("deepgram", {
      text: "Welcome to ToonSpectrum Voice Studio.",
      language: "en",
    });

    expect(result).toMatchObject({
      status: "ready",
      provider: "deepgram",
      model: "aura-2-thalia-en",
      mimeType: "audio/mpeg",
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://api.deepgram.com/v1/speak");
    expect(String(url)).toContain("model=aura-2-thalia-en");
    expect(String(url)).not.toContain("deepgram-voice-secret");
    expect(new Headers(init?.headers).get("authorization")).toBe("Token deepgram-voice-secret");
  });

  it.each([
    { text: "이 자막은 한국어입니다.", language: "ko" },
    { text: "この字幕は日本語です。", language: "ja" },
    { text: "Bonjour, ToonSpectrum.", language: "fr" },
  ])("rejects non-English Deepgram requests before spending provider credit", async ({ text, language }) => {
    const fetcher = vi.fn<typeof fetch>();
    const core = createCreatorIntelligenceCore({ fetch: fetcher, env: () => voiceEnv });
    await expect(core.synthesizeVoice("deepgram", { text, language })).rejects.toThrow("영문 대사");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
