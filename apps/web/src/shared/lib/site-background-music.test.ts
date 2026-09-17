// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  parseSiteBgmManifest,
  readSiteBgmPreferences,
  resolveSiteBgmExperience,
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

  it("persists source, automatic page following and panel state", () => {
    expect(readSiteBgmPreferences()).toEqual({
      source: "page-theme",
      followRoute: true,
      expanded: false,
    });
    writeSiteBgmSource("vocal-ost");
    writeSiteBgmFollowRoute(false);
    writeSiteBgmExpanded(true);
    expect(readSiteBgmPreferences()).toEqual({
      source: "vocal-ost",
      followRoute: false,
      expanded: true,
    });
  });

  it("accepts only bounded same-origin audio entries with explicit provenance", () => {
    const tracks = parseSiteBgmManifest({
      tracks: [
        {
          src: "/audio/theme.mp3",
          title: "Theme",
          artist: "Artist",
          license: "Approved license",
          creditUrl: "https://example.com/credit",
        },
        {
          src: "https://untrusted.example/theme.mp3",
          title: "External",
          artist: "Artist",
          license: "Unknown",
          creditUrl: "https://example.com/credit",
        },
        {
          src: "/audio/missing-credit.mp3",
          title: "No credit",
          artist: "Artist",
          license: "License",
          creditUrl: "javascript:alert(1)",
        },
      ],
    });
    expect(tracks).toEqual([
      {
        src: "/audio/theme.mp3",
        title: "Theme",
        artist: "Artist",
        license: "Approved license",
        creditUrl: "https://example.com/credit",
      },
    ]);
  });
});
