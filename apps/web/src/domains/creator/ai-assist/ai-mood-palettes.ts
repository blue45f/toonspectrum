/**
 * AI 채색 보조 — 분위기별 자동 팔레트 추천
 *
 * 씬 분위기(장르/감정) 태그를 입력하면 어울리는 색상 팔레트를 추천한다.
 * 네이버 웹툰 AI 페인터가 영역별 채색 스타일을 학습한 것처럼,
 * 여기서는 웹툰 색채 이론 기반 큐레이션 팔레트로 같은 UX를 제공한다.
 */

export interface BilingualLabel {
  readonly ko: string;
  readonly en: string;
}

/** 씬 분위기 태그 */
export type AiSceneMood =
  | "romance"
  | "thriller"
  | "action"
  | "daily"
  | "fantasy"
  | "horror"
  | "nostalgia"
  | "sci-fi";

export interface AiMoodPalette {
  readonly mood: AiSceneMood;
  readonly label: BilingualLabel;
  /** [피부, 머리카락, 의상1, 의상2, 배경, 강조] */
  readonly colors: readonly [string, string, string, string, string, string];
  readonly description: BilingualLabel;
}

export const AI_MOOD_PALETTES: readonly AiMoodPalette[] = [
  {
    mood: "romance",
    label: { ko: "로맨스", en: "Romance" },
    colors: ["#ffd9c9", "#8a5a4b", "#ffb3c6", "#fff0f3", "#ffe8ec", "#ff5d8f"],
    description: { ko: "따뜻한 핑크 톤으로 설렘을 표현", en: "Warm pinks for fluttering hearts" },
  },
  {
    mood: "thriller",
    label: { ko: "스릴러", en: "Thriller" },
    colors: ["#e8d5c4", "#2b2b3a", "#3d3d5c", "#1a1a2e", "#23233a", "#c1121f"],
    description: { ko: "차가운 블루그레이와 대비되는 레드 포인트", en: "Cold blue-grays with a striking red accent" },
  },
  {
    mood: "action",
    label: { ko: "액션", en: "Action" },
    colors: ["#f0c8a8", "#3a2e2a", "#d62828", "#f77f00", "#2b2d42", "#fcbf49"],
    description: { ko: "강렬한 원색 대비로 박진감 강조", en: "Bold primary contrasts for impact" },
  },
  {
    mood: "daily",
    label: { ko: "일상", en: "Daily life" },
    colors: ["#ffe0bd", "#6b4f3a", "#a8d5ba", "#fff3d6", "#d6e8f0", "#ff9f1c"],
    description: { ko: "편안한 파스텔 톤의 일상 색감", en: "Comfortable pastel tones of everyday life" },
  },
  {
    mood: "fantasy",
    label: { ko: "판타지", en: "Fantasy" },
    colors: ["#f5e6d3", "#e0e0f5", "#7b6fd0", "#3d348b", "#191736", "#b8f2e6"],
    description: { ko: "신비로운 보라·민트 판타지 색감", en: "Mystical purples and mints" },
  },
  {
    mood: "horror",
    label: { ko: "호러", en: "Horror" },
    colors: ["#d8cfc0", "#1a1a1a", "#4a4a4a", "#0d0d0d", "#26262e", "#6a040f"],
    description: { ko: "거의 무채색에 핏빛 레드 한 방울", en: "Near-monochrome with a drop of blood red" },
  },
  {
    mood: "nostalgia",
    label: { ko: "노스탤지어", en: "Nostalgia" },
    colors: ["#f2d8b3", "#8b6f47", "#d4a373", "#faedcd", "#ccd5ae", "#e76f51"],
    description: { ko: "바랜 필름 같은 세피아 톤", en: "Faded-film sepia tones" },
  },
  {
    mood: "sci-fi",
    label: { ko: "SF", en: "Sci-Fi" },
    colors: ["#e0fbfc", "#3d5a80", "#98c1d9", "#293241", "#0b132b", "#00f5d4"],
    description: { ko: "차가운 메탈릭과 네온 시안", en: "Cold metallics with neon cyan" },
  },
] as const;

export function getMoodPalette(mood: AiSceneMood): AiMoodPalette {
  return AI_MOOD_PALETTES.find((p) => p.mood === mood) ?? AI_MOOD_PALETTES[3];
}

/** 대사 텍스트에서 분위기를 추정하는 키워드 기반 휴리스틱 */
const MOOD_KEYWORDS: Readonly<Record<AiSceneMood, readonly string[]>> = {
  romance: ["사랑", "좋아해", "심쿵", "설레", "고백", "데이트", "love", "kiss"],
  thriller: ["위험", "조심", "추적", "비밀", "거짓말", "danger", "secret", "lie"],
  action: ["공격", "싸워", "달려", "폭발", "승리", "fight", "attack", "run"],
  daily: ["밥", "학교", "출근", "주말", "커피", "school", "lunch", "weekend"],
  fantasy: ["마법", "드래곤", "왕국", "마왕", "검", "magic", "dragon", "kingdom"],
  horror: ["귀신", "무서", "어둠", "피", "죽", "ghost", "scary", "dark", "blood"],
  nostalgia: ["그때", "추억", "어릴 적", "옛날", "그리워", "memory", "childhood"],
  "sci-fi": ["우주", "로봇", "AI", "미래", "행성", "space", "robot", "future"],
};

/**
 * 대사/내레이션 텍스트로 씬 분위기를 추정한다.
 * 키워드 매칭 점수 기반 — 유료 AI API 없이 동작하는 경량 휴리스틱.
 */
export function guessMoodFromText(text: string): AiSceneMood {
  const lower = text.toLowerCase();
  let best: AiSceneMood = "daily";
  let bestScore = 0;
  for (const palette of AI_MOOD_PALETTES) {
    const keywords = MOOD_KEYWORDS[palette.mood];
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = palette.mood;
    }
  }
  return best;
}
