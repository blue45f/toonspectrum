/**
 * AI 식자 보조 — 말풍선 타입별 폰트 추천
 *
 * 대사 톤(말풍선 타입)에 어울리는 무료 웹폰트를 추천한다.
 * 전부 Google Fonts 무료 폰트 — 유료 폰트 라이선스 걱정 없음.
 */

import type { AiBalloonKind } from "./ai-balloon-placement";

export interface AiBalloonFont {
  /** 폰트 이름 (한글) */
  readonly name: string;
  /** CSS font-family 스택 */
  readonly family: string;
  /** Google Fonts 로드용 패밀리명 (이미 로드된 폰트는 null) */
  readonly googleFont: string | null;
  /** 잘 어울리는 말풍선 타입 (우선순위 순) */
  readonly suits: readonly AiBalloonKind[];
  /** 추천 이유 */
  readonly reason: { readonly ko: string; readonly en: string };
}

/**
 * 무료 웹툰 폰트 큐레이션.
 * suits 첫 번째 원소가 가장 잘 어울리는 타입이다.
 */
export const AI_BALLOON_FONTS: readonly AiBalloonFont[] = [
  {
    name: "고운돋움",
    family: "'Gowun Dodum', 'Noto Sans KR', sans-serif",
    googleFont: "Gowun+Dodum",
    suits: ["speech", "narration", "thought"],
    reason: { ko: "깔끔한 손글씨 느낌의 기본 대사체", en: "Clean handwritten feel for everyday dialogue" },
  },
  {
    name: "도현체",
    family: "'Do Hyeon', 'Black Han Sans', sans-serif",
    googleFont: "Do+Hyeon",
    suits: ["shout", "speech"],
    reason: { ko: "힘 있고 굵은 외침·강조 대사체", en: "Bold and punchy for shouts and emphasis" },
  },
  {
    name: "블랙한산스",
    family: "'Black Han Sans', 'Do Hyeon', sans-serif",
    googleFont: "Black+Han+Sans",
    suits: ["shout", "narration"],
    reason: { ko: "제목급 임팩트의 외침·효과음체", en: "Poster-level impact for shouts and SFX" },
  },
  {
    name: "푸어스토리",
    family: "'Poor Story', 'Gowun Dodum', cursive, sans-serif",
    googleFont: "Poor+Story",
    suits: ["whisper", "thought", "speech"],
    reason: { ko: "가늘고 여린 속삭임·독백체", en: "Delicate strokes for whispers and monologues" },
  },
  {
    name: "고운바탕",
    family: "'Gowun Batang', 'Noto Serif KR', serif, sans-serif",
    googleFont: "Gowun+Batang",
    suits: ["thought", "narration", "whisper"],
    reason: { ko: "부드러운 명조 계열의 생각·나레이션체", en: "Soft serif for thoughts and narration" },
  },
  {
    name: "주아체",
    family: "'Jua', 'Gowun Dodum', sans-serif",
    googleFont: "Jua",
    suits: ["speech", "shout"],
    reason: { ko: "둥글고 친근한 일상 대사체", en: "Round and friendly for casual dialogue" },
  },
] as const;

/**
 * 말풍선 타입에 맞는 폰트를 우선순위 순으로 추천한다.
 * 추천 폰트가 부족하면 전체 목록 뒤에 붙여 최소 3개는 보장.
 */
export function recommendBalloonFonts(kind: AiBalloonKind, limit = 3): readonly AiBalloonFont[] {
  const ranked = [...AI_BALLOON_FONTS].sort((a, b) => {
    const rankOf = (f: AiBalloonFont): number => {
      const i = f.suits.indexOf(kind);
      return i === -1 ? 99 : i;
    };
    return rankOf(a) - rankOf(b);
  });
  return ranked.slice(0, Math.max(1, limit));
}

/** Google Fonts CSS URL 생성 (필요한 폰트만) */
export function balloonFontCssUrl(fonts: readonly AiBalloonFont[]): string {
  const families = fonts
    .map((f) => f.googleFont)
    .filter((g): g is string => g !== null);
  if (families.length === 0) return "";
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}
