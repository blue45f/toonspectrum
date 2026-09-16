import { describe, expect, it } from "vitest";

import {
  applyMusicThemePack,
  buildMusicPrompt,
  defaultMusicBrief,
  isMp3,
  MUSIC_MOODS,
  MUSIC_PURPOSES,
  MUSIC_THEME_PACKS,
  musicFilename,
  parseMusicBrief,
} from "./studio-music";

const valid = () => ({
  ...defaultMusicBrief(),
  scene: "눈 내리는 역에서 두 친구가 다시 만난다.",
  rightsConfirmed: true,
});

describe("studio music contract", () => {
  it("has distinct webtoon mood and theme presets with valid defaults", () => {
    expect(MUSIC_MOODS.length).toBeGreaterThanOrEqual(18);
    expect(MUSIC_THEME_PACKS).toHaveLength(12);
    expect(new Set(MUSIC_MOODS.map((mood) => mood.id)).size).toBe(MUSIC_MOODS.length);
    expect(new Set(MUSIC_THEME_PACKS.map((theme) => theme.id)).size).toBe(MUSIC_THEME_PACKS.length);
    for (const mood of MUSIC_MOODS) {
      expect(parseMusicBrief({ ...valid(), mood: mood.id, bpm: mood.bpm }).mood).toBe(mood.id);
    }
  });

  it.each(MUSIC_PURPOSES)("constructs a bounded, original instrumental prompt for $id", (purpose) => {
    const prompt = buildMusicPrompt({ ...valid(), purpose: purpose.id });
    expect(prompt).toContain(purpose.direction);
    expect(prompt).toContain("Strictly instrumental");
    expect(prompt).toContain("Do not imitate");
    expect(prompt.length).toBeLessThanOrEqual(4100);
  });

  it("keeps original Korean lyrics and max-length input inside provider limits", () => {
    const prompt = buildMusicPrompt({
      ...valid(),
      vocals: true,
      scene: "가".repeat(600),
      lyrics: "나".repeat(1200),
      title: "다".repeat(80),
      instruments: ["piano", "strings", "brass", "drums"],
      loop: true,
      arc: "twist",
      intensity: "cinematic",
    });
    expect(prompt).toContain("나".repeat(1200));
    expect(prompt).toContain("Korean diction");
    expect(prompt.length).toBeLessThanOrEqual(4100);
  });

  it("applies a complete theme without carrying previous rights consent", () => {
    const original = valid();
    const result = applyMusicThemePack(original, "hunter-raid");
    expect(result).toMatchObject({
      mood: "hunter",
      purpose: "trailer",
      intensity: "cinematic",
      arc: "twist",
      rightsConfirmed: false,
    });
    expect(result.instruments).not.toBe(original.instruments);
  });

  it("upgrades legacy saved briefs with new optional fields", () => {
    const current = valid();
    const legacy = Object.fromEntries(Object.entries(current).filter(([key]) => ![
      "episodeId",
      "lyricsLanguage",
      "intensity",
      "arc",
    ].includes(key)));
    expect(parseMusicBrief(legacy)).toMatchObject({
      episodeId: "",
      lyricsLanguage: "ko",
      intensity: "balanced",
      arc: "steady",
    });
  });

  it.each([
    { rightsConfirmed: false },
    { scene: " " },
    { scene: "x".repeat(601) },
    { title: "x".repeat(81) },
    { mood: "unknown" },
    { purpose: "unknown" },
    { intensity: "maximum" },
    { arc: "random" },
    { lyricsLanguage: "xx" },
    { seconds: 600 },
    { seconds: "30" },
    { bpm: NaN },
    { bpm: Infinity },
    { bpm: 60.5 },
    { bpm: 181 },
    { instruments: [] },
    { instruments: ["piano", "piano"] },
    { instruments: ["unknown"] },
    { vocals: false, lyrics: "words" },
    { vocals: true, lyrics: "" },
    { loop: "true" },
    { workId: "../../secret" },
    { episodeId: "episode-1", workId: "" },
    { episodeId: "../episode-1" },
    { arbitraryProviderUrl: "http://localhost" },
  ])("rejects unsafe or inconsistent brief %j", (patch) => {
    expect(() => parseMusicBrief({ ...valid(), ...patch })).toThrow();
  });

  it("rejects non-object requests", () => {
    for (const value of [null, [], "hello", 42]) {
      expect(() => parseMusicBrief(value)).toThrow();
    }
  });

  it("strips long period runs and preserves filename control-character safety", () => {
    expect(musicFilename(".".repeat(50_000) + "track" + ".".repeat(50_000))).toBe("track.mp3");
    expect(musicFilename(".".repeat(50_000))).toBe("toonstudio-music.mp3");
    expect(musicFilename("track" + String.fromCharCode(0, 31) + "name")).toBe("track__name.mp3");
    expect(musicFilename("가".repeat(100))).toBe("가".repeat(80) + ".mp3");
  });

  it("sanitizes download names and identifies MP3 instead of HTML", () => {
    expect(musicFilename("../../evil:track?")).toBe("_.._evil_track_.mp3");
    expect(musicFilename("...")).toBe("toonstudio-music.mp3");
    expect(isMp3(new TextEncoder().encode("<html>error</html>"))).toBe(false);
    expect(isMp3(new Uint8Array([73, 68, 51, ...Array(20).fill(0)]))).toBe(true);
  });
});
