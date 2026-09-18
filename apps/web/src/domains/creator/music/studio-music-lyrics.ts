import {
  MUSIC_ARCS,
  MUSIC_LYRIC_LANGUAGES,
  MUSIC_MOODS,
  MUSIC_PURPOSES,
  MUSIC_SONG_STRUCTURES,
  MUSIC_VOCAL_STYLES,
  type MusicBrief,
} from "@toonspectrum/core/studio-music";

export const MUSIC_LYRICS_SYSTEM_PROMPT = [
  "You are a professional lyricist for fully original animation-style webtoon opening, ending and character soundtracks.",
  "Write entirely new lyrics. Never imitate, quote, paraphrase or continue an existing song, artist, franchise theme or copyrighted lyric.",
  "Do not mention real artists, copyrighted characters or brands unless the user explicitly owns and supplied them.",
  "Return lyrics only. Use concise section labels such as [Verse], [Pre-Chorus], [Chorus], [Bridge] when useful.",
  "Match animation-theme pacing: a vivid opening image, one emotional turn, a singable pre-chorus lift when length allows, and a memorable but entirely original refrain.",
  "Keep the result singable, concrete and free from production notes or explanations.",
].join("\n");

function lyricLineTarget(seconds: number): string {
  if (seconds <= 15) return "4 to 6 short lyric lines";
  if (seconds <= 30) return "8 to 12 lyric lines including one short refrain";
  if (seconds <= 45) return "12 to 18 lyric lines with verse and chorus";
  return "16 to 24 lyric lines with verse, chorus and a brief bridge";
}

export function buildMusicLyricsUserPrompt(brief: MusicBrief): string {
  const mood = MUSIC_MOODS.find((entry) => entry.id === brief.mood);
  const purpose = MUSIC_PURPOSES.find((entry) => entry.id === brief.purpose);
  const arc = MUSIC_ARCS.find((entry) => entry.id === brief.arc);
  const language = MUSIC_LYRIC_LANGUAGES.find((entry) => entry.id === brief.lyricsLanguage);
  const vocalStyle = MUSIC_VOCAL_STYLES.find((entry) => entry.id === brief.vocalStyle);
  const structure = MUSIC_SONG_STRUCTURES.find((entry) => entry.id === brief.songStructure);
  if (!mood || !purpose || !arc || !language || !vocalStyle || !structure) throw new Error("가사 설정을 확인해 주세요.");
  return [
    `Write ${lyricLineTarget(brief.seconds)} in ${language.prompt}.`,
    `Webtoon title or track title: ${brief.title.trim() || "Untitled"}`,
    `Music use: ${purpose.label}. Mood: ${mood.label}. Emotional arc: ${arc.label}. Vocal character: ${vocalStyle.label}.`,
    `Song structure: ${structure.label}. Follow this arc: ${structure.hint}.`,
    `Lyric theme or chorus-hook direction: ${brief.lyricTheme.trim() || "derive a distinctive original theme from the scene"}.`,
    `Scene and character emotion: ${brief.scene.trim()}`,
    "Use details from the scene as imagery, but do not merely summarize the plot.",
    "The refrain must be original, easy to sing and emotionally clear without generic filler.",
    "Output only the finished lyrics. Do not wrap them in markdown fences.",
  ].join("\n");
}

export function normalizeGeneratedLyrics(value: string): string {
  let result = value.trim();
  result = result.replace(/^```(?:text|markdown|lyrics)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  result = result.replace(/^(?:가사|lyrics)\s*[:：]\s*/iu, "");
  result = result
    .split(/\r?\n/u)
    .map((line) => line.replace(/^#{1,6}\s*/u, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (!result) throw new Error("AI가 사용할 수 있는 가사를 만들지 못했습니다.");
  if (result.length > 1200) result = result.slice(0, 1200).trimEnd();
  return result;
}
