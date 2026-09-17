// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  parseSiteBgmManifest,
  readSiteBgmPreferences,
  resolveSiteBgmExperience,
  resolveSiteOstTrackIndex,
  writeSiteBgmExpanded,
  writeSiteBgmFollowRoute,
  writeSiteBgmSource,
} from "./site-background-music";

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
    ["/title/romance-1", "catalog", "worldbuilding"],
    ["/author/kim", "catalog", "worldbuilding"],
    ["/compare", "discovery", "library_night"],
    ["/references", "learning", "library_night"],
    ["/research/assets", "market", "funky"],
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

  it("prefers a same-role original OST over licensed references", () => {
    const experience = resolveSiteBgmExperience("/");
    const tracks = [
      { id: "ref-opening", src: "/audio/ref.mp3", title: "Reference", artist: "Artist", role: "opening" as const, origin: "licensed-reference" as const, vocalMode: "vocal" as const, language: "ko", summary: "ref", license: "license", creditUrl: "https://example.com/ref" },
      { id: "original-ending", src: "/audio/end.mp3", title: "Ending", artist: "ToonSpectrum", role: "ending" as const, origin: "original" as const, vocalMode: "vocal" as const, language: "ko", summary: "ending", license: "original", creditUrl: "https://example.com/end" },
      { id: "original-opening", src: "/audio/open.mp3", title: "Opening", artist: "ToonSpectrum", role: "opening" as const, origin: "original" as const, vocalMode: "vocal" as const, language: "ko", summary: "opening", license: "original", creditUrl: "https://example.com/open" },
    ];
    expect(resolveSiteOstTrackIndex(tracks, experience)).toBe(2);
  });

  it("persists source, automatic page following and panel state", () => {
    expect(readSiteBgmPreferences()).toEqual({
      source: "original-ost",
      followRoute: true,
      expanded: false,
    });
    writeSiteBgmSource("focus-instrumental");
    writeSiteBgmFollowRoute(false);
    writeSiteBgmExpanded(true);
    expect(readSiteBgmPreferences()).toEqual({
      source: "focus-instrumental",
      followRoute: false,
      expanded: true,
    });
    localStorage.setItem("ts_site_bgm_source", "page-theme");
    expect(readSiteBgmPreferences().source).toBe("focus-instrumental");
    localStorage.setItem("ts_site_bgm_source", "vocal-ost");
    expect(readSiteBgmPreferences().source).toBe("original-ost");
  });

  it("accepts only bounded same-origin audio entries with explicit provenance", () => {
    const tracks = parseSiteBgmManifest({
      tracks: [
        {
          id: "theme-original", src: "/audio/theme.mp3", title: "Theme", artist: "ToonSpectrum",
          role: "opening", origin: "original", vocalMode: "vocal", language: "ko",
          summary: "오리지널 오프닝", license: "ToonSpectrum original", creditUrl: "https://example.com/credit",
        },
        {
          id: "external", src: "https://untrusted.example/theme.mp3", title: "External", artist: "Artist",
          role: "opening", origin: "licensed-reference", vocalMode: "vocal", language: "en",
          summary: "External", license: "Unknown", creditUrl: "https://example.com/credit",
        },
        {
          id: "bad-credit", src: "/audio/missing-credit.mp3", title: "No credit", artist: "Artist",
          role: "romance", origin: "licensed-reference", vocalMode: "vocal", language: "ko",
          summary: "Bad credit", license: "License", creditUrl: "javascript:alert(1)",
        },
      ],
    });
    expect(tracks).toEqual([
      {
        id: "theme-original", src: "/audio/theme.mp3", title: "Theme", artist: "ToonSpectrum",
        role: "opening", origin: "original", vocalMode: "vocal", language: "ko",
        summary: "오리지널 오프닝", license: "ToonSpectrum original", creditUrl: "https://example.com/credit",
      },
    ]);
  });
});
