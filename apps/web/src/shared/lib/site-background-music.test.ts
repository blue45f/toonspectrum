// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  parseSiteBgmManifest,
  readSiteBgmPreferences,
  resolveSiteBgmExperience,
  resolveSiteOstTrackIndex,
  writeSiteBgmExpanded,
  writeSiteBgmFollowRoute,
  writeSiteBgmIntensity,
  writeSiteBgmStyle,
  writeSiteBgmVocals,
  type SiteOstTrack,
} from "./site-background-music";

function originalTrack(overrides: Partial<SiteOstTrack> = {}): SiteOstTrack {
  return {
    id: "draw-your-world-vocal",
    src: "/audio/original/draw-your-world-vocal.mp3",
    title: "Draw Your World",
    artist: "ToonSpectrum Original",
    role: "opening",
    origin: "original",
    vocalMode: "vocal",
    language: "ko",
    summary: "툰스펙트럼 오리지널 오프닝",
    license: "Eleven Music original generation; commercial use subject to reviewed Music Terms",
    creditUrl: "https://elevenlabs.io/eleven-music-model-specific-terms",
    profiles: ["animation", "cinematic"],
    intensity: "epic",
    durationMs: 210_000,
    bpm: 154,
    provider: "elevenlabs",
    model: "music_v2_5",
    sha256: "a".repeat(64),
    generatedAt: "2026-09-18T00:00:00.000Z",
    c2paRequested: true,
    status: "published",
    songId: "song_123",
    ...overrides,
  };
}

describe("site background music policy", () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ["/", "home", "pop"],
    ["/studio/projects", "creator", "atelier_focus"],
    ["/story-lab", "story", "worldbuilding"],
    ["/production/projects/project-1/episodes", "production", "synthwave"],
    ["/discover", "discovery", "library_night"],
    ["/titles/romance-1", "catalog", "worldbuilding"],
    ["/ranking", "trends", "citypop"],
    ["/community", "community", "slice_of_life"],
    ["/market", "market", "funky"],
    ["/learn/basics", "learning", "library_night"],
    ["/fortune", "fortune", "mystery_noir"],
    ["/studio/assets/characters/new", "romance", "royal_waltz"],
    ["/studio/bg3d", "story", "worldbuilding"],
    ["/studio/assets", "market", "funky"],
    ["/about", "healing", "healing_walk"],
    ["/showcase/challenges", "playful", "happy"],
    ["/studio/p/project-1/story", "story", "worldbuilding"],
    ["/studio/p/project-1/production", "production", "synthwave"],
    ["/studio/p/project-1/assets", "market", "funky"],
  ])("maps %s to %s / %s", (pathname, id, moodId) => {
    expect(resolveSiteBgmExperience(pathname)).toMatchObject({ id, moodId, suspended: false });
  });

  it.each([
    "/studio/assets/audio",
    "/studio/animatic",
    "/studio/promo",
    "/studio/spatial",
    "/studio/live",
    "/create/promo",
    "/showcase/promo",
    "/read/spatial",
    "/play/roulette",
    "/messages",
    "/admin",
    "/auth/login",
    "/account",
  ])("suspends global music on audio-conflicting route %s", (pathname) => {
    const experience = resolveSiteBgmExperience(pathname);
    expect(experience.suspended).toBe(true);
    expect(experience.suspensionReason.length).toBeGreaterThan(10);
  });

  it("uses style, intensity and vocal preference when selecting an original", () => {
    const experience = resolveSiteBgmExperience("/");
    const tracks = [
      originalTrack({ id: "opening-instrumental", src: "/audio/original/opening-instrumental.mp3", vocalMode: "instrumental", profiles: ["cinematic"], intensity: "normal" }),
      originalTrack({ id: "opening-vocal", src: "/audio/original/opening-vocal.mp3", vocalMode: "vocal", profiles: ["animation"], intensity: "epic" }),
      originalTrack({ id: "ending-vocal", src: "/audio/original/ending-vocal.mp3", role: "ending", vocalMode: "vocal", profiles: ["animation"], intensity: "epic" }),
    ];
    expect(resolveSiteOstTrackIndex(tracks, experience, { style: "animation", intensity: "epic", vocals: "vocal" })).toBe(1);
    expect(resolveSiteOstTrackIndex(tracks, experience, { style: "cinematic", intensity: "normal", vocals: "instrumental" })).toBe(0);
  });

  it("prefers instrumental music automatically on long-form creator routes", () => {
    const experience = resolveSiteBgmExperience("/studio/projects");
    const tracks = [
      originalTrack({ id: "creator-vocal", src: "/audio/original/creator-vocal.mp3", role: "creator", vocalMode: "vocal", profiles: ["webtoon"], intensity: "normal" }),
      originalTrack({ id: "creator-instrumental", src: "/audio/original/creator-instrumental.mp3", role: "creator", vocalMode: "instrumental", profiles: ["webtoon"], intensity: "normal" }),
    ];
    expect(resolveSiteOstTrackIndex(tracks, experience)).toBe(1);
  });

  it("persists adaptive OST preferences", () => {
    expect(readSiteBgmPreferences()).toEqual({
      followRoute: true,
      expanded: false,
      style: "auto",
      intensity: "normal",
      vocals: "auto",
    });
    writeSiteBgmFollowRoute(false);
    writeSiteBgmExpanded(true);
    writeSiteBgmStyle("cinematic");
    writeSiteBgmIntensity("epic");
    writeSiteBgmVocals("instrumental");
    expect(readSiteBgmPreferences()).toEqual({
      followRoute: false,
      expanded: true,
      style: "cinematic",
      intensity: "epic",
      vocals: "instrumental",
    });
  });

  it("accepts only reviewed original assets with production provenance", () => {
    const good = originalTrack();
    const tracks = parseSiteBgmManifest({
      tracks: [
        good,
        { ...good, id: "legacy-ref", src: "/audio/legacy.mp3", origin: "licensed-reference" },
        { ...good, id: "external", src: "https://untrusted.example/theme.mp3" },
        { ...good, id: "missing-integrity", sha256: "bad" },
        { ...good, id: "not-c2pa", c2paRequested: false },
        { ...good, id: "draft", status: "draft" },
      ],
    });
    expect(tracks).toEqual([good]);
  });
});
