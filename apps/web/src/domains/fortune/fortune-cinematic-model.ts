import { FORTUNE_EXPERIENCES, fortuneReadingText } from "@toonspectrum/core/fortune";
import type { FortuneReading } from "@toonspectrum/core/fortune";

export type FortuneSceneTheme = "violet" | "rose" | "mint" | "gold";
export const FORTUNE_INTENTS = [
  { id: "inspire", label: "영감이 필요해요", title: "빈 페이지도, 이야기의 시작.", line: "오늘의 상징에서 첫 선을 발견해 볼까요?", theme: "violet", content: ["creative", "tarot-three", "lucky"] },
  { id: "connect", label: "마음을 알고 싶어요", title: "우리 사이, 한 칸의 여백.", line: "정답을 찾기보다 서로에게 건넬 질문을 골라요.", theme: "rose", content: ["love-match", "team-match", "romance"] },
  { id: "focus", label: "하루를 준비해요", title: "주인공의 다음 선택은?", line: "오늘의 흐름을 읽고, 내가 할 수 있는 한 가지부터.", theme: "gold", content: ["today", "weekly", "career"] },
  { id: "rest", label: "잠깐 쉬어 갈래요", title: "쉬어 가는 컷도 필요하니까.", line: "가볍게 한 장. 내 속도로 다음 장면을 열어요.", theme: "mint", content: ["rest", "cookie", "dream"] },
] as const;

export function fortuneSceneTheme(id: string): FortuneSceneTheme {
  const group = FORTUNE_EXPERIENCES.find((item) => item.id === id)?.group;
  if (group === "관계·궁합") return "rose";
  if (group === "사주·역법" || group === "시간의 흐름") return "gold";
  if (group === "창작·일상") return "mint";
  return "violet";
}

/** Shuffling only rearranges the 22 numbered choices; it never changes a reading seed. */
export function shuffleFortuneDeck(random: () => number = Math.random, size: 22 | 78 = 22): number[] {
  const cards = Array.from({ length: size }, (_, i) => i);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const sample = random();
    const j = Math.floor(Math.max(0, Math.min(0.999999999, Number.isFinite(sample) ? sample : 0)) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export interface FortuneStoryScene {
  title: string;
  body: string;
  items: string[];
  card?: NonNullable<FortuneReading["cards"]>[number];
}

export function fortuneStoryScenes(reading: FortuneReading): FortuneStoryScene[] {
  return [
    { title: "이야기의 첫 장", body: reading.summary, items: [reading.eyebrow] },
    ...reading.sections.map((section, index) => ({
      title: section.title, body: section.body, items: section.items ?? [], card: reading.cards?.[index],
    })),
    { title: "다음 장면은 내가 그려요", body: "해석은 가능성을 떠올리는 이야기일 뿐, 결말을 정하지 않아요. 마음에 남은 단어 하나를 오늘의 한 컷으로 바꿔 보세요.", items: fortuneCreativeMission(reading) },
  ];
}

/** Editorial prompts, not additional fortune calculations or inferred personal traits. */
export function fortuneCreativeMission(reading: FortuneReading): string[] {
  if (reading.colors?.length) return ["팔레트에서 배경색 하나 고르기", "두 번째 색으로 주인공의 실루엣 그리기", "마지막 색은 이야기의 단서 한 곳에만 쓰기"];
  if (reading.cards?.length) return [`${reading.cards[0].name} 카드에서 마음에 드는 상징 찾기`, "그 상징을 든 캐릭터의 표정 그리기", "다음 컷에 이어질 짧은 대사 한 줄 적기"];
  if (reading.partnerChart) return ["두 인물의 서로 다른 표정 스케치하기", "같은 사건을 각자의 시선으로 한 컷씩 그리기", "서로에게 건네고 싶은 대사 한 줄 쓰기"];
  if (reading.id === "dream") return ["꿈의 상징 중 하나를 주인공으로 정하기", "현실에 없는 배경 하나 더하기", "대사 없이 감정이 보이는 장면 그리기"];
  if (reading.id === "rest" || reading.id === "cookie") return ["지금 눈에 보이는 작은 물건 하나 관찰하기", "편안한 속도로 외곽선만 그리기", "오늘의 나에게 짧은 응원 한 줄 남기기"];
  return ["해석에서 마음에 남는 단어 하나 고르기", "그 단어를 표정·소품·배경 중 하나로 바꾸기", "내가 만들고 싶은 다음 장면 한 컷 그리기"];
}

export function fortunePublicShare(reading: FortuneReading) {
  return {
    title: `ToonStudio · ${reading.title}`,
    text: fortuneReadingText(reading),
    // Never serialize birth dates, partner inputs, questions or chart data into a URL.
    path: `/fortune?content=${encodeURIComponent(reading.id)}`,
  };
}
