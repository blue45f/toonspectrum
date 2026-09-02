/**
 * webtoon-color-harmony-assistant.ts
 *
 * Webtoon Skin Tone & Shadow Harmony Assistant.
 * Benchmarks Naver Webtoon AI Painter, Clip Studio Color Swatches, and professional webtoon coloring studios.
 *
 * - 5 Archetypal webtoon character skin tone palettes (4 steps: Highlight, Base, 1st Cel Shadow, 2nd Deep Shadow).
 * - Algorithmic Comic Hue-Shift Shadow Generator: prevents "muddy dirty gray" shadows by shifting hue toward cooler tones,
 *   raising saturation, and lowering value.
 * - 4 Genre lighting mood color palettes (Romance Golden Sunset, Fresh Academy, Dark Noir, Cyberpunk Neon).
 */

export type SkinToneId =
  | "warm-fair" // 아이보리 웜톤 (주인공 표준)
  | "cool-pale" // 쿨톤 창백 (로판 남주/뱀파이어)
  | "blush-peach" // 생기 피치 홍조 (히로인/소녀)
  | "sun-kissed-tan" // 건강한 웜 베이지/구릿빛 태닝
  | "dark-rich"; // 딥 브라운 / 다크 엘프

export interface SkinTonePalette {
  readonly id: SkinToneId;
  readonly name: string;
  readonly description: string;
  readonly highlight: string; // #fff...
  readonly base: string;
  readonly shadow1: string; // 1차 셀 음영
  readonly shadow2: string; // 2차 딥 음영
  readonly blushTint: string; // 볼터치/입술 틴트
}

export interface SceneMoodPalette {
  readonly id: string;
  readonly name: string;
  readonly genre: string;
  readonly skyTint: string;
  readonly ambientLight: string;
  readonly directSun: string;
  readonly shadowCast: string;
  readonly rimLight: string;
}

export const WEBTOON_SKIN_PALETTES: Record<SkinToneId, SkinTonePalette> = {
  "warm-fair": {
    id: "warm-fair",
    name: "아이보리 웜톤 (주인공 표준)",
    description: "가장 널리 쓰이는 밝고 화사한 주인공 표준 살구빛 피부톤",
    highlight: "#fffbf5",
    base: "#ffedd5",
    shadow1: "#fbcfe8",
    shadow2: "#e0b0d5",
    blushTint: "#fb7185",
  },
  "cool-pale": {
    id: "cool-pale",
    name: "쿨톤 창백 (로판 남주/뱀파이어)",
    description: "로맨스 판타지 미남, 냉혹한 북부대공, 뱀파이어용 창백한 쿨톤",
    highlight: "#f8fafc",
    base: "#f1f5f9",
    shadow1: "#cbd5e1",
    shadow2: "#94a3b8",
    blushTint: "#f472b6",
  },
  "blush-peach": {
    id: "blush-peach",
    name: "생기 피치 홍조 (히로인/소녀)",
    description: "생기 넘치고 뺨에 자연스러운 붉은 기가 도는 청순 히로인 톤",
    highlight: "#fff1f2",
    base: "#ffe4e6",
    shadow1: "#fecdd3",
    shadow2: "#fda4af",
    blushTint: "#f43f5e",
  },
  "sun-kissed-tan": {
    id: "sun-kissed-tan",
    name: "건강한 구릿빛 태닝 (액션/스포츠)",
    description: "야외 훈련이나 햇살에 그을린 건강미 넘치는 스포츠·액션 캐릭터",
    highlight: "#fed7aa",
    base: "#f97316",
    shadow1: "#c2410c",
    shadow2: "#7c2d12",
    blushTint: "#ea580c",
  },
  "dark-rich": {
    id: "dark-rich",
    name: "딥 브라운 / 다크 엘프 (판타지)",
    description: "이국적인 매력이나 판타지 다크 엘프를 위한 깊고 윤기 있는 갈색톤",
    highlight: "#a8a29e",
    base: "#78716c",
    shadow1: "#44403c",
    shadow2: "#1c1917",
    blushTint: "#991b1b",
  },
};

export const SCENE_MOOD_PALETTES: readonly SceneMoodPalette[] = [
  {
    id: "romance-golden-sunset",
    name: "골든아워 노을 (로맨스 판타지)",
    genre: "로맨스 / 드라마",
    skyTint: "#fde047",
    ambientLight: "#fb923c",
    directSun: "#ffedd5",
    shadowCast: "#831843",
    rimLight: "#fef08a",
  },
  {
    id: "fresh-academy-sky",
    name: "청량한 대낮 햇살 (학원물)",
    genre: "학원물 / 일상",
    skyTint: "#38bdf8",
    ambientLight: "#bae6fd",
    directSun: "#ffffff",
    shadowCast: "#64748b",
    rimLight: "#e0f2fe",
  },
  {
    id: "dark-fantasy-noir",
    name: "다크 판타지 누아르 (액션/스릴러)",
    genre: "액션 / 스릴러",
    skyTint: "#0f172a",
    ambientLight: "#1e293b",
    directSun: "#64748b",
    shadowCast: "#020617",
    rimLight: "#38bdf8",
  },
  {
    id: "cyberpunk-neon-night",
    name: "사이버펑크 네온야경 (SF)",
    genre: "SF / 사이버펑크",
    skyTint: "#09090b",
    ambientLight: "#3b0764",
    directSun: "#f43f5e",
    shadowCast: "#18181b",
    rimLight: "#06b6d4",
  },
];

export class WebtoonColorHarmonyAssistant {
  /**
   * Retrieves a skin tone palette by id.
   */
  public getSkinPalette(id: SkinToneId): SkinTonePalette {
    return WEBTOON_SKIN_PALETTES[id] ?? WEBTOON_SKIN_PALETTES["warm-fair"];
  }

  /**
   * Generates a 2-step comic hue-shifted shadow from any base hex color.
   *
   * In professional webtoon coloring:
   * - Shadows are NOT simple black overlays (which look muddy).
   * - Hue shifts towards purple/blue (+20~35 degrees in hue angle).
   * - Saturation increases slightly (+10~15%).
   * - Brightness/Lightness decreases (-20~30%).
   */
  public generateHueShiftShadow(baseHex: string): {
    shadow1: string;
    shadow2: string;
    highlight: string;
  } {
    const rgb = this.hexToRgb(baseHex);
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);

    // 1st Cel Shadow: shift hue toward cool (around 240-280 deg blue-violet), bump sat, lower light
    const h1 = (hsl.h + 25) % 360;
    const s1 = Math.min(1.0, hsl.s * 1.15);
    const l1 = Math.max(0.15, hsl.l * 0.72);
    const rgb1 = this.hslToRgb(h1, s1, l1);

    // 2nd Deep Shadow: further shift and deepen
    const h2 = (hsl.h + 40) % 360;
    const s2 = Math.min(1.0, hsl.s * 1.25);
    const l2 = Math.max(0.08, hsl.l * 0.5);
    const rgb2 = this.hslToRgb(h2, s2, l2);

    // Highlight: shift hue slightly toward warm yellow/sun, lower sat, boost light
    const hh = (hsl.h - 10 + 360) % 360;
    const sh = Math.max(0.05, hsl.s * 0.7);
    const lh = Math.min(0.98, hsl.l * 1.25 + 0.1);
    const rgbH = this.hslToRgb(hh, sh, lh);

    return {
      shadow1: this.rgbToHex(rgb1.r, rgb1.g, rgb1.b),
      shadow2: this.rgbToHex(rgb2.r, rgb2.g, rgb2.b),
      highlight: this.rgbToHex(rgbH.r, rgbH.g, rgbH.b),
    };
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "");
    const parsed = parseInt(clean, 16);
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255,
    };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn:
          h = (gn - bn) / d + (gn < bn ? 6 : 0);
          break;
        case gn:
          h = (bn - rn) / d + 2;
          break;
        case bn:
          h = (rn - gn) / d + 4;
          break;
      }
      h *= 60;
    }

    return { h, s, l };
  }

  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        let tc = t;
        if (tc < 0) tc += 1;
        if (tc > 1) tc -= 1;
        if (tc < 1 / 6) return p + (q - p) * 6 * tc;
        if (tc < 1 / 2) return q;
        if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const hn = h / 360;

      r = hue2rgb(p, q, hn + 1 / 3);
      g = hue2rgb(p, q, hn);
      b = hue2rgb(p, q, hn - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }
}
