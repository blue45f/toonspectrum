import { FORTUNE_EXPERIENCES, type FortuneGroup } from "@toonspectrum/core/fortune";

export const FORTUNE_CAMPUS_ROOMS = [
  { id: "calendar", title: "역법 서가·오행 정원", en: "Calendar & elements", group: "사주·역법", experiences: ["saju", "almanac", "elements", "ten-gods", "cycles", "terms"] },
  { id: "time", title: "시간의 회랑", en: "Gallery of time", group: "시간의 흐름", experiences: ["today", "tomorrow", "weekly", "monthly", "yearly"] },
  { id: "relations", title: "관계 살롱", en: "Relationship salon", group: "관계·궁합", experiences: ["love-match", "friend-match", "family-match", "team-match"] },
  { id: "symbols", title: "타로실·별자리 돔", en: "Tarot & symbols", group: "카드·상징", experiences: ["tarot", "tarot-three", "zodiac", "animal", "dream", "numerology"] },
  { id: "creative", title: "상징 정원·쉼의 테라스", en: "Inspiration & quiet terrace", group: "창작·일상", experiences: ["romance", "money", "career", "study", "creative", "rest", "lucky", "cookie"] },
] as const satisfies readonly { id: string; title: string; en: string; group: FortuneGroup; experiences: readonly string[] }[];

export function fortuneCampusRoom(experienceId: string) {
  return FORTUNE_CAMPUS_ROOMS.find((room) => (room.experiences as readonly string[]).includes(experienceId)) ?? null;
}
export function fortuneCampusHref(experienceId: string): string | null {
  if (experienceId !== "character" && !FORTUNE_EXPERIENCES.some((item) => item.id === experienceId)) return null;
  return `/fortune?${new URLSearchParams({ content: experienceId })}`;
}
