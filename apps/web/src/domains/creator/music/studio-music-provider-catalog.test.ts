import { describe, expect, it } from "vitest";

import {
  buildMusicProviderHandoff,
  findMusicProvider,
  MUSIC_PROVIDER_CATALOG,
  MUSIC_PROVIDER_VERIFIED_AT,
} from "./studio-music-provider-catalog";

import { defaultMusicBrief } from "@toonspectrum/core/studio-music";

describe("AI music provider catalogue", () => {
  it("keeps provider identifiers and official destinations deterministic", () => {
    const ids = MUSIC_PROVIDER_CATALOG.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      "ace-step-local",
      "adobe-firefly",
      "soundverse",
      "elevenlabs",
      "suno",
    ]));
    for (const provider of MUSIC_PROVIDER_CATALOG) {
      expect(new URL(provider.homeUrl).protocol).toBe("https:");
      expect(provider.capabilities.length).toBeGreaterThan(0);
      expect(provider.rightsNote.length).toBeGreaterThan(20);
    }
  });
  it("exposes only verified MCP and CLI endpoints", () => {
    expect(findMusicProvider("soundverse").mcp).toMatchObject({
      serverUrl: "https://mcp.soundverse.ai/mcp",
      auth: "oauth",
    });
    expect(findMusicProvider("elevenlabs")).toMatchObject({
      mcp: { serverUrl: "https://api.elevenlabs.io/v1/mcp", auth: "oauth" },
      cli: { command: "elevenlabs auth login" },
    });
    expect(findMusicProvider("stable-audio")).toMatchObject({
      publicationPolicy: "license-review",
      freeAccess: expect.stringContaining("비상업"),
      capabilities: expect.arrayContaining(["browser", "api"]),
    });
    expect(findMusicProvider("stable-audio").rightsNote).toContain("운영 자동 호출");
    expect(MUSIC_PROVIDER_CATALOG.filter((provider) => (
      provider.publicationPolicy === "site-original"
    )).map((provider) => provider.id)).toEqual(["ace-step-local"]);
  });

  it("creates a review-only handoff without dispatching a provider request", () => {
    const brief = {
      ...defaultMusicBrief(),
      title: "별빛 원고",
      scene: "마감 직전, 작가가 마지막 컷을 완성한다.",
      workId: "work-a",
      episodeId: "episode-7",
      vocals: false,
      lyrics: "discarded vocal draft",
      rightsConfirmed: true,
    };
    const result = buildMusicProviderHandoff(
      "adobe-firefly",
      brief,
      "cinematic instrumental webtoon background score",
      "2026-09-25T00:00:00.000Z",
    );
    expect(result).toMatchObject({
      version: 1,
      createdAt: "2026-09-25T00:00:00.000Z",
      verifiedAt: MUSIC_PROVIDER_VERIFIED_AT,
      reviewRequired: true,
      autoPublish: false,
      provider: {
        id: "adobe-firefly",
        publicationPolicy: "commercial-review",
      },
      brief: {
        title: "별빛 원고",
        workId: "work-a",
        episodeId: "episode-7",
        lyrics: "",
        sourceRightsConfirmed: true,
      },
    });
    expect(result.rightsChecklist.length).toBeGreaterThanOrEqual(4);
    expect(result.outputChecklist.length).toBeGreaterThanOrEqual(4);
  });

  it("fails closed for unknown providers and empty prompts", () => {
    expect(() => findMusicProvider("unknown-provider")).toThrow(/지원하지 않는/);
    expect(() => buildMusicProviderHandoff(
      "suno",
      defaultMusicBrief(),
      "   ",
    )).toThrow(/프롬프트/);
  });
});
