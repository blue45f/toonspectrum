// 창작 스튜디오 "쉽게 만들기" 프리셋 — 컷 레이아웃 템플릿·말풍선 종류·만화 효과·배경.
// 라이선스 이슈 없는 자체 벡터/텍스트 프리셋만 사용(외부 아트 에셋 없음).

export const CANVAS_W = 720;

export interface FrameSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TemplateSpec {
  id: string;
  label: string;
  hint: string;
  canvasH: number;
  frames: FrameSpec[];
}

const M = 24; // 컷 간격/여백

// 세로 스택 N컷(전폭).
function stack(count: number, canvasH: number): FrameSpec[] {
  const h = Math.round((canvasH - M * (count + 1)) / count);
  return Array.from({ length: count }, (_, i) => ({
    x: M,
    y: M + i * (h + M),
    width: CANVAS_W - M * 2,
    height: h,
  }));
}

function grid(cols: number, rows: number, canvasH: number): FrameSpec[] {
  const w = (CANVAS_W - M * (cols + 1)) / cols;
  const h = (canvasH - M * (rows + 1)) / rows;
  return Array.from({ length: rows * cols }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: M + col * (w + M),
      y: M + row * (h + M),
      width: w,
      height: h,
    };
  });
}

export const TEMPLATES: TemplateSpec[] = [
  { id: "blank", label: "빈 캔버스", hint: "처음부터 자유롭게", canvasH: 1080, frames: [] },
  { id: "webtoon3", label: "세로 웹툰 · 3컷", hint: "스크롤 웹툰 기본", canvasH: 1620, frames: stack(3, 1620) },
  { id: "webtoon4", label: "세로 웹툰 · 4컷", hint: "긴 호흡", canvasH: 1920, frames: stack(4, 1920) },
  { id: "webtoon5", label: "세로 웹툰 · 5컷", hint: "긴 스크롤", canvasH: 2400, frames: stack(5, 2400) },
  { id: "webtoon6", label: "세로 웹툰 · 6컷", hint: "연재형 구성", canvasH: 2880, frames: stack(6, 2880) },
  { id: "strip4", label: "4컷 만화", hint: "기승전결", canvasH: 1680, frames: stack(4, 1680) },
  {
    id: "grid4",
    label: "4컷 그리드",
    hint: "2×2 배치",
    canvasH: 1080,
    frames: [
      { x: M, y: M, width: (CANVAS_W - M * 3) / 2, height: (1080 - M * 3) / 2 },
      { x: M * 2 + (CANVAS_W - M * 3) / 2, y: M, width: (CANVAS_W - M * 3) / 2, height: (1080 - M * 3) / 2 },
      { x: M, y: M * 2 + (1080 - M * 3) / 2, width: (CANVAS_W - M * 3) / 2, height: (1080 - M * 3) / 2 },
      {
        x: M * 2 + (CANVAS_W - M * 3) / 2,
        y: M * 2 + (1080 - M * 3) / 2,
        width: (CANVAS_W - M * 3) / 2,
        height: (1080 - M * 3) / 2,
      },
    ],
  },
  { id: "grid6", label: "6컷 그리드(2x3)", hint: "2열 3행", canvasH: 1440, frames: grid(2, 3, 1440) },
  { id: "grid8", label: "8컷(2x4)", hint: "2열 4행", canvasH: 1680, frames: grid(2, 4, 1680) },
  { id: "single", label: "한 컷", hint: "일러스트·표지", canvasH: 900, frames: stack(1, 900) },
];

export type BubbleVariant = "speech" | "thought" | "shout" | "box" | "whisper" | "scared";
export const BUBBLE_VARIANTS: { id: BubbleVariant; label: string; sample: string }[] = [
  { id: "speech", label: "말하기", sample: "💬" },
  { id: "thought", label: "생각", sample: "💭" },
  { id: "shout", label: "외침", sample: "📢" },
  { id: "whisper", label: "속삭임", sample: "🤫" },
  { id: "scared", label: "소심/공포", sample: "😰" },
  { id: "box", label: "내레이션", sample: "▭" },
];

// 만화 효과 이모지(스티커).
export const EFFECT_EMOJIS = [
  "💢", "💦", "✨", "💕", "💥", "😱", "🔥", "⚡", "😤", "💧", "❗", "❓", "💤", "🎶", "👊", "🌀",
];

// 효과음 텍스트(흰 글자 + 검은 외곽선의 만화 SFX).
export const SFX_PRESETS: { text: string; fill: string }[] = [
  { text: "쾅!", fill: "#ffffff" },
  { text: "두근", fill: "#ff5a7a" },
  { text: "헉!", fill: "#ffffff" },
  { text: "팟", fill: "#ffd166" },
  { text: "콰광!", fill: "#ffffff" },
  { text: "반짝", fill: "#7ad7ff" },
];

export interface BgPreset {
  id: string;
  label: string;
  fill?: string;
  grad?: string[]; // 2색 세로 그라디언트 stop 색상
}
export const BG_PRESETS: BgPreset[] = [
  { id: "white", label: "흰색", fill: "#ffffff" },
  { id: "cream", label: "크림", fill: "#fbf3e4" },
  { id: "ink", label: "먹지", fill: "#1a1410" },
  { id: "sky", label: "하늘", grad: ["#bfe6ff", "#eaf7ff"] },
  { id: "sunset", label: "노을", grad: ["#ffd9a0", "#ff9aa2"] },
  { id: "night", label: "밤", grad: ["#2a2350", "#0e0b1f"] },
];
