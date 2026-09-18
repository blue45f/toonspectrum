import { describe, expect, it } from "vitest";

import {
  applyMusicThemePack,
  buildMusicCompositionPlan,
  buildMusicPrompt,
  defaultMusicBrief,
  isMp3,
  MUSIC_MOODS,
  MUSIC_PURPOSES,
  MUSIC_SONG_STRUCTURES,
  MUSIC_THEME_PACKS,
  MUSIC_VOCAL_STYLES,
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

  it("offers bounded original vocal directions without named-artist cloning", () => {
    expect(MUSIC_VOCAL_STYLES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(MUSIC_VOCAL_STYLES.map((entry) => entry.id)).size).toBe(MUSIC_VOCAL_STYLES.length);
    const prompt = buildMusicPrompt({ ...valid(), vocals: true, lyrics: "우리의 페이지를 열어", vocalStyle: "power-vocal", purpose: "opening" });
    expect(prompt).toContain("powerful lead vocal");
    expect(prompt).toContain("animation soundtrack");
    expect(prompt).toContain("non-derivative refrain");
  });

  it("builds a section-controlled anime OST composition plan with exact duration", () => {
    expect(MUSIC_SONG_STRUCTURES.length).toBeGreaterThanOrEqual(5);
    const plan = buildMusicCompositionPlan({
      ...valid(),
      vocals: true,
      purpose: "opening",
      songStructure: "anime-op",
      seconds: 60,
      lyrics: "[Verse]\n눈 덮인 플랫폼 끝에 네가 서 있어\n돌아온 계절이 우리를 부르고\n[Pre-Chorus]\n한 걸음만 더 가까이\n[Chorus]\n다시 우리의 페이지를 열어\n같은 내일을 향해 달려\n[Bridge]\n두려움도 이름을 잃어",
    });
    expect(plan.chunks.length).toBeGreaterThanOrEqual(6);
    expect(plan.chunks.reduce((sum, chunk) => sum + chunk.duration_ms, 0)).toBe(60_000);
    expect(plan.chunks.every((chunk) => chunk.duration_ms >= 3_000)).toBe(true);
    expect(plan.chunks[0]?.positive_styles).toContain("fully original animation soundtrack");
    expect(plan.chunks.find((chunk) => chunk.text.startsWith("[Chorus]"))?.text).toContain("다시 우리의 페이지를 열어");
    expect(plan.chunks.find((chunk) => chunk.text.startsWith("[Final Chorus]"))?.text).toContain("다시 우리의 페이지를 열어");
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
      "vocalStyle",
      "songStructure",
      "lyricTheme",
      "intensity",
      "arc",
    ].includes(key)));
    expect(parseMusicBrief(legacy)).toMatchObject({
      episodeId: "",
      lyricsLanguage: "ko",
      vocalStyle: "bright-heroine",
      songStructure: "anime-op",
      lyricTheme: "",
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
    { vocalStyle: "celebrity-clone" },
    { songStructure: "through-composed" },
    { lyricTheme: "x".repeat(181) },
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
