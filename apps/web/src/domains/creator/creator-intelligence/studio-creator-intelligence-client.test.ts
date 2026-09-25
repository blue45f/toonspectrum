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
        params: { provider: "pexels", q: "night alley", page: 2 },
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
