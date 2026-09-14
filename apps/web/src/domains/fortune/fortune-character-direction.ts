import type { FortuneReading } from "@toonspectrum/core/fortune";
import { comicCast } from "@/shared/components/comic/comic-cast";
import type { ComicCastId, ComicMood } from "@/shared/components/comic/comic-cast";

export function fortuneComicMood(id: string): ComicMood {
  if (["love-match", "team-match", "romance"].includes(id)) return "heart";
  if (["rest", "cookie", "dream"].includes(id)) return "rest";
  if (["today", "tomorrow", "weekly", "monthly", "yearly", "career", "study", "money"].includes(id)) return "quest";
  return "spark";
}
const DIRECTION = {
  spark: { label: "영감이 번뜩이는 컷", sfx: "번뜩!", prompt: "눈에 띈 상징 하나를 소품으로 바꿔 볼까요?", banter: "그럼 이건 정답지가 아니라 소재집이네? 좋아, 주인공에게 엉뚱한 소품 하나 쥐여 주자!" },
  heart: { label: "마음을 잇는 컷", sfx: "두근!", prompt: "같은 장면을 두 인물의 표정으로 그려 봐요.", banter: "잠깐, 상대 마음을 읽었다고 결론 내리진 말자! 다음 대사는 직접 물어보는 걸로?" },
  quest: { label: "주인공의 선택 컷", sfx: "척!", prompt: "주인공이 오늘 할 수 있는 작은 행동 하나를 골라요.", banter: "오늘도 거대한 퀘스트라고? 아니지! 물 한 잔, 메모 한 줄도 멋진 첫 컷이야." },
  rest: { label: "쉬어 가는 여백 컷", sfx: "후우—", prompt: "대사 없는 한 컷으로, 편안한 장면을 남겨요.", banter: "쉬는 장면은 건너뛰면 안 되지. 주인공도 충전해야 다음 화에 등장하니까!" },
} as const;
/** Editorial dialogue surrounds, but never replaces or recalculates, the source reading. */
export function fortuneCharacterDirection(reading: FortuneReading, cast: ComicCastId, index: number, last: boolean) {
  const actor = comicCast(cast);
  const mood = fortuneComicMood(reading.id);
  const direction = DIRECTION[mood];
  const companion: ComicCastId = actor.id === "danwoo" ? "ara" : "danwoo";
  const subject = reading.id === "money" ? "금전 이야기는 창작 소재로만 읽어요. 실제 투자나 지출은 정보와 예산을 확인해 결정해 주세요." : direction.prompt;
  const lead = index === 0 ? actor.intro : last ? actor.aside : {
    ara: `이번 장의 제목을 천천히 읽어 볼게요. ${subject}`,
    danwoo: `오호, 이 컷에 복선이 숨어 있군! ${subject}`,
    leona: `이 장면에서 작은 가능성을 발견해 봐요. ${subject}`,
    gaon: `이번 컷의 핵심만 짚자. ${subject}`,
  }[actor.id];
  return { ...direction, mood, lead, companion, reaction: last ? "해설은 여기까지! 이제 네 말풍선과 네 그림으로 다음 컷을 이어 줘." : actor.id === "danwoo" ? `단우, 결말을 미리 정하진 말아요. ${direction.prompt}` : direction.banter };
}
