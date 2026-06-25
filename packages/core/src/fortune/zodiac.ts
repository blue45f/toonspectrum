// apps/api/src/modules/fortune/zodiac.ts
//
// 서양 점성술 12별자리 — 생일(월/일)만으로 즉시 결과를 주는 가벼운 진입 운세.
// 사주처럼 생년월일시 전체가 필요 없어 라이트 유저 유입에 좋다.

export type ZodiacElement = "불" | "흙" | "바람" | "물";

export interface ZodiacSign {
  id: string;
  ko: string;
  en: string;
  glyph: string;
  element: ZodiacElement;
  dateRange: string;
  traits: string[];
  ruling: string; // 지배 행성
}

const SIGNS: Record<string, ZodiacSign> = {
  aries: { id: "aries", ko: "양자리", en: "Aries", glyph: "♈", element: "불", dateRange: "3.21~4.19", traits: ["열정", "도전", "리더십"], ruling: "화성" },
  taurus: { id: "taurus", ko: "황소자리", en: "Taurus", glyph: "♉", element: "흙", dateRange: "4.20~5.20", traits: ["안정", "끈기", "심미안"], ruling: "금성" },
  gemini: { id: "gemini", ko: "쌍둥이자리", en: "Gemini", glyph: "♊", element: "바람", dateRange: "5.21~6.21", traits: ["호기심", "재치", "소통"], ruling: "수성" },
  cancer: { id: "cancer", ko: "게자리", en: "Cancer", glyph: "♋", element: "물", dateRange: "6.22~7.22", traits: ["다정", "보호본능", "감수성"], ruling: "달" },
  leo: { id: "leo", ko: "사자자리", en: "Leo", glyph: "♌", element: "불", dateRange: "7.23~8.22", traits: ["자신감", "관대함", "표현력"], ruling: "태양" },
  virgo: { id: "virgo", ko: "처녀자리", en: "Virgo", glyph: "♍", element: "흙", dateRange: "8.23~9.22", traits: ["분석력", "완벽주의", "실용"], ruling: "수성" },
  libra: { id: "libra", ko: "천칭자리", en: "Libra", glyph: "♎", element: "바람", dateRange: "9.23~10.22", traits: ["균형", "조화", "심미"], ruling: "금성" },
  scorpio: { id: "scorpio", ko: "전갈자리", en: "Scorpio", glyph: "♏", element: "물", dateRange: "10.23~11.22", traits: ["통찰", "집중", "열망"], ruling: "명왕성" },
  sagittarius: { id: "sagittarius", ko: "사수자리", en: "Sagittarius", glyph: "♐", element: "불", dateRange: "11.23~12.24", traits: ["자유", "모험", "낙천"], ruling: "목성" },
  capricorn: { id: "capricorn", ko: "염소자리", en: "Capricorn", glyph: "♑", element: "흙", dateRange: "12.25~1.19", traits: ["성실", "야망", "인내"], ruling: "토성" },
  aquarius: { id: "aquarius", ko: "물병자리", en: "Aquarius", glyph: "♒", element: "바람", dateRange: "1.20~2.18", traits: ["독창", "개혁", "박애"], ruling: "천왕성" },
  pisces: { id: "pisces", ko: "물고기자리", en: "Pisces", glyph: "♓", element: "물", dateRange: "2.19~3.20", traits: ["감성", "공감", "상상력"], ruling: "해왕성" },
};

// (시작 md, id) — md = month*100 + day. 마지막은 연말 염소자리.
const RANGES: Array<[number, string]> = [
  [120, "aquarius"], [219, "pisces"], [321, "aries"], [420, "taurus"], [521, "gemini"],
  [622, "cancer"], [723, "leo"], [823, "virgo"], [923, "libra"], [1023, "scorpio"],
  [1123, "sagittarius"], [1225, "capricorn"],
];

export function getZodiacSign(month: number, day: number): ZodiacSign {
  const md = month * 100 + day;
  // 1.1~1.19 또는 12.25~12.31 → 염소자리
  if (md >= 1225 || md <= 119) return SIGNS.capricorn;
  let id = "capricorn";
  for (const [start, sid] of RANGES) {
    if (md >= start) id = sid;
  }
  return SIGNS[id];
}

// 원소별 추천 장르
export function genresByZodiacElement(element: ZodiacElement): string[] {
  switch (element) {
    case "불": return ["액션", "현판", "무협"];
    case "흙": return ["일상", "드라마", "성장"];
    case "바람": return ["로맨스", "개그", "학원"];
    case "물": return ["판타지", "미스터리", "로판"];
  }
}

// 원소별 행운 컬러
export const ZODIAC_ELEMENT_COLOR: Record<ZodiacElement, string> = {
  불: "붉은색",
  흙: "황금색",
  바람: "연두색",
  물: "푸른색",
};
