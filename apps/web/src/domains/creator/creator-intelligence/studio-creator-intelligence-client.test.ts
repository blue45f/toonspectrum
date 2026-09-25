import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/platform/api";

import { creatorIntelligenceClient } from "./studio-creator-intelligence-client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("creator intelligence public discovery transport", () => {
  it("omits ambient session cookies from public discovery reads", async () => {
    const request = vi.spyOn(api, "get").mockResolvedValue({} as never);

    await creatorIntelligenceClient.status();
    await creatorIntelligenceClient.references("pexels", "night alley", 2);
    await creatorIntelligenceClient.scene("Seoul", "2026-09-25");
    await creatorIntelligenceClient.anilist("Frieren", "ANIME");
    await creatorIntelligenceClient.soundSearch("door slam", 3);

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/creator-intelligence/status",
      { credentials: "omit" },
    );    expect(request).toHaveBeenNthCalledWith(
      2,
      "/creator-intelligence/references",
      {
        credentials: "omit",
        params: { provider: "pexels", q: "night alley", page: 2, media: "image" },
      },
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      "/creator-intelligence/scene",
      {
        credentials: "omit",
        params: { place: "Seoul", date: "2026-09-25" },
      },
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      "/creator-intelligence/anilist",
      {
        credentials: "omit",
        params: { q: "Frieren", type: "ANIME" },
      },
    );    expect(request).toHaveBeenNthCalledWith(
      5,
      "/creator-intelligence/sfx/search",
      {
        credentials: "omit",
        params: { q: "door slam", page: 3 },
      },
    );
  });

  it("keeps ambient credentials for job-specific provider reads", async () => {
    const request = vi.spyOn(api, "get").mockResolvedValue({} as never);

    await creatorIntelligenceClient.meshStatus("job/id");

    expect(request).toHaveBeenCalledWith(
      "/creator-intelligence/mesh/jobs/job%2Fid",
    );
  });
});


describe("creator intelligence paid transport", () => {
  it("reuses the same key after an uncertain transport failure, then rotates after success", async () => {
    const request = vi.spyOn(api, "post")
      .mockRejectedValueOnce(new TypeError("network disconnected"))
      .mockResolvedValue({ status: "ready" } as never);

    await expect(creatorIntelligenceClient.soundGenerate(
      "retry-safe rain",
      2,
      false,
    )).rejects.toThrow("network disconnected");
    await creatorIntelligenceClient.soundGenerate("retry-safe rain", 2, false);
    await creatorIntelligenceClient.soundGenerate("retry-safe rain", 2, false);

    const keys = request.mock.calls.map((call) => {
      const options = call[2] as { headers?: Record<string, string> } | undefined;
      return options?.headers?.["Idempotency-Key"] ?? "";
    });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(request.mock.calls.every((call) => {
      const options = call[2] as { retry?: number } | undefined;
      return options?.retry === 0;
    })).toBe(true);
  });

  it("adds a unique idempotency key to every operator-funded request", async () => {
    const request = vi.spyOn(api, "post").mockResolvedValue({ status: "ready" } as never);

    await creatorIntelligenceClient.voiceSynthesize({
      provider: "gemini",
      text: "안녕하세요",
    });
    await creatorIntelligenceClient.soundGenerate("door slam", 2, false);
    await creatorIntelligenceClient.translate({
      provider: "deepl",
      text: "hello",
      targetLanguage: "KO",
    });
    await creatorIntelligenceClient.meshCreate("https://example.com/input.png");
    await creatorIntelligenceClient.safeSearch("data:image/png;base64,AAAA");

    const keys = request.mock.calls.map((call) => {
      const options = call[2] as { headers?: Record<string, string> } | undefined;
      return options?.headers?.["Idempotency-Key"] ?? "";
    });
    expect(keys).toHaveLength(5);
    expect(keys.every((key) => /^[a-z-]+-[A-Za-z0-9-]{8,}$/u.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(request.mock.calls.every((call) => {
      const options = call[2] as { retry?: number } | undefined;
      return options?.retry === 0;
    })).toBe(true);
  });
});
