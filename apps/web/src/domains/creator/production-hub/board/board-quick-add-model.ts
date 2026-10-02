/** 열 아래 "+ 카드 추가"의 입력 규칙. 한 번에 만들 수 있는 카드 수와 제목 길이를 서버 계약(제목 240자)에 맞춘다. */
export const QUICK_ADD_MAX_CARDS = 20;
export const QUICK_ADD_MAX_TITLE = 240;

/** 줄 단위로 나눈 카드 제목. 빈 줄은 버리고 개수·길이를 제한한다. */
export function splitQuickAddTitles(text: string): readonly string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim().slice(0, QUICK_ADD_MAX_TITLE))
    .filter(Boolean)
    .slice(0, QUICK_ADD_MAX_CARDS);
}
