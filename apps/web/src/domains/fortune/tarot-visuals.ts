// 메이저 아르카나 22장 각각의 고유 비주얼 — 이미지 자산 없이 카드별 색상환 hue +
// 모티프 글리프로 22종을 시각적으로 구분한다. 카드 페이스는 content-art 맥락이라
// 따뜻한 잉크 중립축을 벗어나 풍부한 색을 쓰되, OKLCH로만 표현한다.

export interface TarotVisual {
  motif: number; // product-owned vector motif index
  hue: number; // OKLCH hue (카드별 고유 색)
  roman: string; // 로마 숫자 표기
}

export const TAROT_VISUALS: Record<number, TarotVisual> = Object.fromEntries(
  [
    [0, 82, "0"], [1, 300, "I"], [2, 255, "II"], [3, 150, "III"],
    [4, 32, "IV"], [5, 64, "V"], [6, 350, "VI"], [7, 238, "VII"],
    [8, 44, "VIII"], [9, 72, "IX"], [10, 128, "X"], [11, 205, "XI"],
    [12, 192, "XII"], [13, 322, "XIII"], [14, 172, "XIV"], [15, 18, "XV"],
    [16, 8, "XVI"], [17, 228, "XVII"], [18, 272, "XVIII"], [19, 88, "XIX"],
    [20, 52, "XX"], [21, 142, "XXI"],
  ].map(([motif, hue, roman]) => [motif, { motif, hue, roman }]),
) as Record<number, TarotVisual>;

export function getTarotVisual(id: number): TarotVisual {
  if (Number.isInteger(id) && id >= 22 && id < 78) {
    const suit = Math.floor((id - 22) / 14), rank = (id - 22) % 14;
    const labels = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "P", "Kn", "Q", "K"];
    return { motif: [1, 14, 11, 21][suit], hue: [38, 235, 305, 142][suit], roman: `${["WANDS", "CUPS", "SWORDS", "PENTACLES"][suit]} · ${labels[rank]}` };
  }
  return TAROT_VISUALS[id] ?? { motif: 17, hue: 42, roman: String(id) };
}

// 카드 페이스 그라디언트(어두운 카드 바탕)
export function tarotFaceGradient(hue: number): string {
  return `linear-gradient(160deg, oklch(0.42 0.13 ${hue}) 0%, oklch(0.26 0.08 ${hue}) 52%, oklch(0.17 0.04 ${hue}) 100%)`;
}

// 카드 글로/테두리·글리프 강조색
export function tarotAccent(hue: number): string {
  return `oklch(0.82 0.13 ${hue})`;
}
