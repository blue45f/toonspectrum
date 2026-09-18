import { describe, expect, it } from "vitest";

import {
  buildMusicWorkBgmPatch,
  buildSiteOstCurationCandidate,
  normalizeHostedMusicUrl,
} from "./studio-music-publication";

import type { LocalMusicTrack } from "./studio-music-client";

import { defaultMusicBrief, MUSIC_TERMS_URL } from "@toonspectrum/core/studio-music";

function track(patch: Partial<ReturnType<typeof defaultMusicBrief>> = {}): LocalMusicTrack {
  return {
    ownerId: "owner-a",
    audio: new Blob(["ID3-test"], { type: "audio/mpeg" }),
    metadata: {
      id: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-09-18T00:00:00.000Z",
      provider: "elevenlabs",
      model: "music_v2_5",
      format: "mp3_44100_128",
      termsUrl: MUSIC_TERMS_URL,
      brief: {
        ...defaultMusicBrief(),
        title: "작품 오프닝",
        scene: "주인공이 첫 페이지를 달려 나간다.",
        workId: "work-a",
        episodeId: "episode-1",
        purpose: "opening",
        vocals: true,
        lyricsLanguage: "ko",
        rightsConfirmed: true,
        ...patch,
      },
    },
  };
}

describe("Studio music publication bridge", () => {
  it("accepts only durable HTTPS MP3 URLs", () => {
    expect(normalizeHostedMusicUrl(" https://cdn.example.test/ost/opening.mp3?rev=2 "))
      .toBe("https://cdn.example.test/ost/opening.mp3?rev=2");
    expect(() => normalizeHostedMusicUrl("http://example.test/a.mp3")).toThrow(/HTTPS/);
    expect(() => normalizeHostedMusicUrl("https://example.test/a.wav")).toThrow(/MP3/);
    // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
    expect(() => normalizeHostedMusicUrl("https://user:secret@example.test/a.mp3")).toThrow(/HTTPS/);
  });

  it("publishes a linked track into the work fx BGM consumed by the reader", () => {
    const result = buildMusicWorkBgmPatch({
      id: "work-a",
      isOwner: true,
      revision: 7,
      doc: { fx: { reveal: "fade-up", bgmMood: "calm", bgmUrl: "", bgmVolume: 0.35 } },
    }, track(), "https://cdn.example.test/work-a-opening.mp3");
    expect(result.baseRevision).toBe(7);
    expect(result.doc.fx).toMatchObject({
      reveal: "fade-up",
      bgmMood: "",
      bgmUrl: "https://cdn.example.test/work-a-opening.mp3",
      bgmVolume: 0.35,
    });
    expect(() => buildMusicWorkBgmPatch({
      id: "work-b", isOwner: true, doc: {},
    }, track(), "https://cdn.example.test/a.mp3")).toThrow(/현재 작품/);
  });

  it("creates a review-only site OST candidate rather than silently promoting it", () => {
    const candidate = buildSiteOstCurationCandidate(
      track({ mood: "romance", purpose: "ost" }),
      "https://cdn.example.test/romance.mp3",
    );
    expect(candidate.reviewRequired).toBe(true);
    expect(candidate.workId).toBe("work-a");
    expect(candidate.track).toMatchObject({
      src: "https://cdn.example.test/romance.mp3",
      role: "romance",
      origin: "original",
      vocalMode: "vocal",
      language: "ko",
    });
  });
});
