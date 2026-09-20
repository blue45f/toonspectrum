import { resolveFortuneBirth } from "./fortune-calendar";
import { drawTarot, FORTUNE_MAJOR_ARCANA, seededRandom, type TarotCard } from "./fortune-engine";

export type FortuneTarotDeck = "major-22" | "full-78";
export const FORTUNE_FULL_TAROT_REVISION = "toonstudio-tarot-78-v1";
// Original Korean editorial prompts. No third-party card text or imagery is copied.
const SUITS = [
  { ko: "완드", en: "Wands", theme: "시도와 추진력", question: "지금 시작할 수 있는 작은 행동", caution: "속도를 낮추고 필요한 에너지를 확인하는 시간" },
  { ko: "컵", en: "Cups", theme: "감정과 관계", question: "서로의 마음을 존중하는 표현", caution: "상대의 마음을 짐작하기보다 직접 묻는 대화" },
  { ko: "소드", en: "Swords", theme: "생각과 소통", question: "복잡한 생각을 명확하게 정리할 방법", caution: "단정적인 말을 질문으로 바꾸는 연습" },
  { ko: "펜타클", en: "Pentacles", theme: "일상과 기반", question: "작업을 지속할 수 있는 현실적인 습관", caution: "성과보다 지금 가능한 범위를 점검하는 과정" },
] as const;
const RANKS = [
  ["에이스", "Ace", "작은 씨앗", "아직 완성되지 않아도 좋은 첫 시도를 그려 보세요."],
  ["2", "Two", "두 가지 선택", "서로 다른 두 관점을 한 화면에 나란히 배치해 보세요."],
  ["3", "Three", "함께 만드는 장면", "누군가와 나누면 더 풍부해질 아이디어를 적어 보세요."],
  ["4", "Four", "잠시 머무는 자리", "편안함과 익숙함이 어떻게 다른지 떠올려 보세요."],
  ["5", "Five", "차이를 발견하기", "갈등하는 두 인물에게 각자 설득력 있는 이유를 붙여 보세요."],
  ["6", "Six", "주고받는 연결", "최근 받았던 작은 도움을 장면으로 기록해 보세요."],
  ["7", "Seven", "한 발 떨어져 보기", "여러 가능성 가운데 지금 해볼 한 가지를 골라 보세요."],
  ["8", "Eight", "반복 속의 변화", "같은 동작을 세 번 그리며 조금씩 바뀌는 점을 찾아보세요."],
  ["9", "Nine", "나의 공간", "혼자 있을 때 힘이 되는 사물을 하나 그려 보세요."],
  ["10", "Ten", "한 장면의 마무리", "끝내고 싶은 일과 이어가고 싶은 일을 구분해 보세요."],
  ["시종", "Page", "배우는 시선", "처음 발견한 것처럼 익숙한 사물을 관찰해 보세요."],
  ["기사", "Knight", "움직이는 의지", "목적지보다 움직임이 드러나는 포즈를 만들어 보세요."],
  ["여왕", "Queen", "기르는 태도", "무언가를 돌보는 인물의 손동작을 상상해 보세요."],
  ["왕", "King", "책임 있는 선택", "이끌기와 경청하기가 함께 드러나는 대사를 써 보세요."],
] as const;
export function fortuneTarotCatalog() {
  const majors = FORTUNE_MAJOR_ARCANA.map((card) => ({ ...card, keywords: [...card.keywords], reversed: [...card.reversed],
    uprightText: `${card.name}의 '${card.keywords[0]}'을 한 컷의 소재로 삼아 보세요. 내가 선택할 수 있는 다음 행동을 적어 보세요.`,
    reversedText: `${card.name}의 상징을 뒤집어 읽어 보세요. '${card.reversed[0]}'은 운명이나 진단이 아니라 다른 관점을 찾는 질문입니다.` }));
  const minors = SUITS.flatMap((suit, suitIndex) => RANKS.map(([ko, en, keyword, action], rank) => ({
    id: 22 + suitIndex * 14 + rank, name: `${suit.ko} ${ko}`, nameEn: `${en} of ${suit.en}`,
    keywords: [suit.theme, keyword, "창작 질문"], reversed: ["다른 관점", "속도 조절", keyword],
    uprightText: `${suit.theme}에서 ${suit.question}을 떠올려 보세요. ${action}`,
    reversedText: `${suit.caution}이 필요할 수 있습니다. ${action} 카드가 상황을 판정하지는 않습니다.`,
  })));
  return [...majors, ...minors];
}
export async function drawFortuneTarot(deck: FortuneTarotDeck, date: string, pick: number, spread: "one" | "three") {
  resolveFortuneBirth({ date });
  if (!Number.isInteger(pick) || pick < 0 || pick > (deck === "full-78" ? 77 : 21) || !["one", "three"].includes(spread)) throw new Error("카드 선택을 확인해 주세요.");
  if (deck === "major-22") return (await drawTarot([], "leona", pick, spread, undefined, date)).cards;
  if (deck !== "full-78") throw new Error("지원하지 않는 타로 덱입니다.");
  const cards = fortuneTarotCatalog();
  const random = seededRandom(`${FORTUNE_FULL_TAROT_REVISION}:${date}:${pick}:${spread}`);
  // Fisher-Yates: bounded work, no duplicate/retry exhaustion, same selection can be replayed.
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const positions = spread === "three" ? ["지금의 장면", "다른 관점", "작은 실천"] : ["오늘의 질문"];
  return positions.map((position, index): TarotCard & { position: string } => {
    const card = cards[index], reversed = random() > 0.58;
    return { id: card.id, name: card.name, nameEn: card.nameEn, position, type: reversed ? "reversed" : "upright",
      keywords: [...(reversed ? card.reversed : card.keywords)], description: reversed ? card.reversedText : card.uprightText };
  });
}
