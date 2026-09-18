import { describe, expect, it } from "vitest";

import { defaultMusicBrief } from "@toonspectrum/core/studio-music";

import {
  buildMusicLyricsUserPrompt,
  MUSIC_LYRICS_SYSTEM_PROMPT,
  normalizeGeneratedLyrics,
} from "./studio-music-lyrics";

const brief = () => ({
  ...defaultMusicBrief(),
  title: "비가 그친 플랫폼",
  scene: "오랫동안 헤어졌던 두 사람이 막차가 떠난 역에서 다시 만나 서로의 진심을 확인한다.",
  vocals: true,
  lyricsLanguage: "ko",
  songStructure: "anime-op",
  lyricTheme: "다시 시작할 용기와 다음 페이지",
  arc: "build",
});

describe("studio music lyric assistant", () => {
  it("creates an original-only, scene-grounded request", () => {
    const prompt = buildMusicLyricsUserPrompt(brief());
    expect(MUSIC_LYRICS_SYSTEM_PROMPT).toContain("Never imitate");
    expect(prompt).toContain("비가 그친 플랫폼");
    expect(prompt).toContain("Korean");
    expect(prompt).toContain("점층 상승");
    expect(prompt).toContain("애니 OP 정석");
    expect(prompt).toContain("다시 시작할 용기와 다음 페이지");
    expect(prompt).toContain("Output only the finished lyrics");
  });

  it("normalizes fenced model output without deleting section labels", () => {
    expect(normalizeGeneratedLyrics("```lyrics\n# [Verse]\n비가 멎은 플랫폼\n\n\n[Chorus]\n다시 너를 불러\n```"))
      .toBe("[Verse]\n비가 멎은 플랫폼\n\n[Chorus]\n다시 너를 불러");
  });

  it("rejects empty model output and bounds saved lyrics", () => {
    expect(() => normalizeGeneratedLyrics("```text\n \n```")) .toThrow();
    expect(normalizeGeneratedLyrics("가".repeat(1500))).toHaveLength(1200);
  });
});
