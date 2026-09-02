/**
 * webtoon-sfx-lexicon.ts
 *
 * Webtoon Comic SFX (Sound Effects) & Korean Onomatopoeia Lexicon.
 * Benchmarks specialized webtoon sound effect dictionaries and Sandoll/Clip Studio typography guides.
 *
 * - Curated categorization across 8 comic domains (impact, movement, emotion, atmosphere, etc.).
 * - Recommended typography styles (heavy gothic, dynamic brush script, emotional serif).
 * - Suggested border strokes, drop shadows, and 3D extrusion presets.
 */

export type SfxCategory =
  | "impact" // 타격 / 충돌 / 격투
  | "movement" // 속도 / 이동 / 대시
  | "emotion" // 심리 / 감정 / 긴장
  | "atmosphere" // 날씨 / 환경 / 배경음
  | "destruction" // 파괴 / 폭발 / 붕괴
  | "daily" // 일상 / 소품 / 사물
  | "magic-scifi" // 특수효과 / 마법 / SF
  | "whisper-silence"; // 속삭임 / 정적 / 은밀

export type SfxTypographyStyle =
  | "heavy-impact-sans" // 굵은 고딕 + 강한 테두리
  | "dynamic-action-brush" // 거친 붓글씨 캘리그라피
  | "emotional-handwrite" // 떨리는 손글씨 펜선
  | "tension-sharp-serif" // 날카로운 명조체
  | "scifi-glow-digital"; // 네온 발광 사이파이

export interface SfxLexiconItem {
  readonly id: string;
  readonly text: string;
  readonly category: SfxCategory;
  readonly categoryLabel: string;
  readonly meaning: string;
  readonly recommendedStyle: SfxTypographyStyle;
  readonly recommendedColor: string;
  readonly strokeColor: string;
  readonly defaultSizePt: number;
  readonly tags: readonly string[];
}

export const SFX_LEXICON_DATABASE: readonly SfxLexiconItem[] = [
  // 1. Impact (타격/충돌)
  {
    id: "sfx-kung",
    text: "쿵",
    category: "impact",
    categoryLabel: "타격/충돌",
    meaning: "묵직한 물체가 바닥이나 벽에 부딪힐 때의 깊은 충격음",
    recommendedStyle: "heavy-impact-sans",
    recommendedColor: "#facc15",
    strokeColor: "#000000",
    defaultSizePt: 64,
    tags: ["충격", "추락", "타격", "발자국", "무거운"],
  },
  {
    id: "sfx-kwang",
    text: "쾅",
    category: "impact",
    categoryLabel: "타격/충돌",
    meaning: "문이 세게 닫히거나 거대한 폭발 직전의 강렬한 충돌음",
    recommendedStyle: "heavy-impact-sans",
    recommendedColor: "#ef4444",
    strokeColor: "#ffffff",
    defaultSizePt: 72,
    tags: ["강타", "문", "충돌", "폭력", "위기"],
  },
  {
    id: "sfx-puk",
    text: "퍽",
    category: "impact",
    categoryLabel: "타격/충돌",
    meaning: "주먹이나 둔기로 급소를 정확히 가격했을 때의 타격음",
    recommendedStyle: "dynamic-action-brush",
    recommendedColor: "#ffffff",
    strokeColor: "#dc2626",
    defaultSizePt: 48,
    tags: ["주먹", "격투", "맞음", "피격", "클로즈업"],
  },
  {
    id: "sfx-zzueok",
    text: "쩌억",
    category: "impact",
    categoryLabel: "타격/충돌",
    meaning: "벽이나 얼음, 뼈가 강한 압력으로 갈라지는 파열음",
    recommendedStyle: "tension-sharp-serif",
    recommendedColor: "#38bdf8",
    strokeColor: "#000000",
    defaultSizePt: 56,
    tags: ["균열", "갈라짐", "파열", "얼음", "압도"],
  },

  // 2. Movement (속도/이동)
  {
    id: "sfx-shuuk",
    text: "슈욱",
    category: "movement",
    categoryLabel: "속도/이동",
    meaning: "공기를 가르며 고속으로 빠르게 회피하거나 돌진하는 소리",
    recommendedStyle: "dynamic-action-brush",
    recommendedColor: "#ffffff",
    strokeColor: "#0284c7",
    defaultSizePt: 48,
    tags: ["회피", "돌진", "바람", "순간이동", "민첩"],
  },
  {
    id: "sfx-seueuk",
    text: "스윽",
    category: "movement",
    categoryLabel: "속도/이동",
    meaning: "기척 없이 소리 없이 다가오거나 칼을 뽑는 섬뜩한 움직임",
    recommendedStyle: "tension-sharp-serif",
    recommendedColor: "#94a3b8",
    strokeColor: "#0f172a",
    defaultSizePt: 40,
    tags: ["암살", "접근", "발도", "기척", "긴장"],
  },
  {
    id: "sfx-beonjjeok",
    text: "번쩍",
    category: "movement",
    categoryLabel: "속도/이동",
    meaning: "눈이나 섬광, 검날이 순간적으로 빛을 반사하는 찰나",
    recommendedStyle: "heavy-impact-sans",
    recommendedColor: "#fef08a",
    strokeColor: "#854d0e",
    defaultSizePt: 52,
    tags: ["섬광", "깨달음", "눈빛", "검기", "각성"],
  },

  // 3. Emotion (심리/감정)
  {
    id: "sfx-dugeun",
    text: "두근",
    category: "emotion",
    categoryLabel: "심리/감정",
    meaning: "심장이 빠르게 뛰거나 로맨스/긴장 상황의 심장 박동음",
    recommendedStyle: "emotional-handwrite",
    recommendedColor: "#f43f5e",
    strokeColor: "#ffe4e6",
    defaultSizePt: 36,
    tags: ["심장", "설렘", "불안", "로맨스", "긴장"],
  },
  {
    id: "sfx-heumchit",
    text: "흠칫",
    category: "emotion",
    categoryLabel: "심리/감정",
    meaning: "예상치 못한 발언이나 인기척에 몸이 굳으며 놀라는 반응",
    recommendedStyle: "emotional-handwrite",
    recommendedColor: "#ffffff",
    strokeColor: "#475569",
    defaultSizePt: 34,
    tags: ["놀람", "경악", "비밀", "들킴", "반응"],
  },
  {
    id: "sfx-ggulkkuk",
    text: "꿀꺽",
    category: "emotion",
    categoryLabel: "심리/감정",
    meaning: "극도의 공포나 탐욕으로 침을 삼키는 순간의 호흡",
    recommendedStyle: "emotional-handwrite",
    recommendedColor: "#e2e8f0",
    strokeColor: "#1e293b",
    defaultSizePt: 32,
    tags: ["침", "공포", "긴장", "욕망", "조용함"],
  },

  // 4. Atmosphere (날씨/환경)
  {
    id: "sfx-juruk",
    text: "주룩주룩",
    category: "atmosphere",
    categoryLabel: "날씨/환경",
    meaning: "비가 쉼 없이 내리며 감성적이거나 울적한 분위기 조성",
    recommendedStyle: "emotional-handwrite",
    recommendedColor: "#60a5fa",
    strokeColor: "#ffffff",
    defaultSizePt: 38,
    tags: ["비", "장마", "눈물", "슬픔", "감성"],
  },
  {
    id: "sfx-kwareureung",
    text: "콰르릉",
    category: "atmosphere",
    categoryLabel: "날씨/환경",
    meaning: "하늘에서 천둥 번개가 치며 재앙이나 위기를 암시",
    recommendedStyle: "heavy-impact-sans",
    recommendedColor: "#eab308",
    strokeColor: "#18181b",
    defaultSizePt: 60,
    tags: ["천둥", "번개", "폭풍", "위기", "자연"],
  },

  // 5. Destruction (파괴/폭발)
  {
    id: "sfx-kwagwagwang",
    text: "콰과광",
    category: "destruction",
    categoryLabel: "파괴/폭발",
    meaning: "건물이나 지형이 무너지며 연쇄적으로 폭발하는 대형 파괴음",
    recommendedStyle: "heavy-impact-sans",
    recommendedColor: "#f97316",
    strokeColor: "#000000",
    defaultSizePt: 80,
    tags: ["폭발", "붕괴", "연쇄", "화염", "대파괴"],
  },
  {
    id: "sfx-wareureu",
    text: "와르르",
    category: "destruction",
    categoryLabel: "파괴/폭발",
    meaning: "돌무더기나 성벽이 힘없이 무너져 내리는 소리",
    recommendedStyle: "dynamic-action-brush",
    recommendedColor: "#cbd5e1",
    strokeColor: "#334155",
    defaultSizePt: 54,
    tags: ["낙석", "붕괴", "무너짐", "먼지", "잔해"],
  },

  // 6. Daily (일상/사물)
  {
    id: "sfx-dalkak",
    text: "달칵",
    category: "daily",
    categoryLabel: "일상/사물",
    meaning: "방문 잠금장치나 서랍, 권총의 공이치기가 맞물리는 소리",
    recommendedStyle: "tension-sharp-serif",
    recommendedColor: "#ffffff",
    strokeColor: "#0f172a",
    defaultSizePt: 32,
    tags: ["문", "열쇠", "잠금", "권총", "비밀"],
  },
  {
    id: "sfx-jjalang",
    text: "짤랑",
    category: "daily",
    categoryLabel: "일상/사물",
    meaning: "동전 주머니나 유리잔, 카페 문 앞 풍경 소리",
    recommendedStyle: "emotional-handwrite",
    recommendedColor: "#fbbf24",
    strokeColor: "#78350f",
    defaultSizePt: 30,
    tags: ["동전", "돈", "유리", "카페", "일상"],
  },

  // 7. Magic & Sci-Fi (특수효과/마법)
  {
    id: "sfx-pajijijik",
    text: "파지지직",
    category: "magic-scifi",
    categoryLabel: "특수/SF",
    meaning: "고전압 전격이나 마력 방전 스파크가 사방으로 튀는 음향",
    recommendedStyle: "scifi-glow-digital",
    recommendedColor: "#38bdf8",
    strokeColor: "#1e1b4b",
    defaultSizePt: 50,
    tags: ["전기", "스파크", "번개", "마법", "SF"],
  },
  {
    id: "sfx-woowoong",
    text: "우웅",
    category: "magic-scifi",
    categoryLabel: "특수/SF",
    meaning: "포탈 가동, 우주선 엔진 또는 강력한 아우라의 공명 진동음",
    recommendedStyle: "scifi-glow-digital",
    recommendedColor: "#a855f7",
    strokeColor: "#3b0764",
    defaultSizePt: 44,
    tags: ["포탈", "공명", "아우라", "엔진", "미스터리"],
  },

  // 8. Whisper & Silence (속삭임/정적)
  {
    id: "sfx-sogeunsogeun",
    text: "소근소근",
    category: "whisper-silence",
    categoryLabel: "속삭임/정적",
    meaning: "남몰래 뒤에서 귓속말을 하거나 비밀을 속삭이는 소리",
    recommendedStyle: "emotional-handwrite",
    recommendedColor: "#e2e8f0",
    strokeColor: "#64748b",
    defaultSizePt: 26,
    tags: ["속삭임", "귓속말", "비밀", "소문", "배경"],
  },
  {
    id: "sfx-jeongjeok",
    text: "……",
    category: "whisper-silence",
    categoryLabel: "속삭임/정적",
    meaning: "말문이 막히거나 충격으로 주변의 모든 소리가 사라진 정적",
    recommendedStyle: "tension-sharp-serif",
    recommendedColor: "#94a3b8",
    strokeColor: "#0f172a",
    defaultSizePt: 40,
    tags: ["정적", "침묵", "충격", "망연자실", "말문막힘"],
  },
];

export class WebtoonSfxLexiconEngine {
  /**
   * Searches and filters sound effects by query text, tag, or category.
   */
  public search(query: string, category?: SfxCategory): readonly SfxLexiconItem[] {
    const q = query.trim().toLowerCase();

    return SFX_LEXICON_DATABASE.filter((item) => {
      if (category && item.category !== category) {
        return false;
      }
      if (!q) return true;

      return (
        item.text.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }

  /**
   * Retrieves an item by its exact ID.
   */
  public getById(id: string): SfxLexiconItem | undefined {
    return SFX_LEXICON_DATABASE.find((item) => item.id === id);
  }

  /**
   * Lists available categories with Korean labels.
   */
  public listCategories(): readonly { id: SfxCategory; label: string }[] {
    return [
      { id: "impact", label: "타격/충돌" },
      { id: "movement", label: "속도/이동" },
      { id: "emotion", label: "심리/감정" },
      { id: "atmosphere", label: "날씨/환경" },
      { id: "destruction", label: "파괴/폭발" },
      { id: "daily", label: "일상/사물" },
      { id: "magic-scifi", label: "특수/SF" },
      { id: "whisper-silence", label: "속삭임/정적" },
    ];
  }
}
