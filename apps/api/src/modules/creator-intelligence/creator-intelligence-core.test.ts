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
  });});

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
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).not.toContain("secret-key");
    expect(new Headers(init?.headers).get("authorization")).toBe("secret-key");
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