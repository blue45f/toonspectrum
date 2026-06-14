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

// 템플릿을 유형별로 묶어 메뉴에서 일관된 우선순위로 보여준다.
export const TEMPLATE_GROUP_ORDER = ["세로 웹툰", "컷만화·그리드", "기본"] as const;
function templateGroupOf(id: string): string {
  if (id.startsWith("webtoon")) return "세로 웹툰";
  if (id === "strip4" || id.startsWith("grid")) return "컷만화·그리드";
  return "기본"; // blank, single
}
export function groupTemplates(templates: TemplateSpec[]): { group: string; templates: TemplateSpec[] }[] {
  return TEMPLATE_GROUP_ORDER.map((group) => ({
    group,
    templates: templates.filter((t) => templateGroupOf(t.id) === group),
  })).filter((g) => g.templates.length > 0);
}

export type BubbleVariant = "speech" | "thought" | "shout" | "box" | "whisper" | "scared" | "system" | "heart" | "phone" | "angry";
export const BUBBLE_VARIANTS: { id: BubbleVariant; label: string; sample: string }[] = [
  { id: "speech", label: "말하기", sample: "💬" },
  { id: "thought", label: "생각", sample: "💭" },
  { id: "shout", label: "외침", sample: "📢" },
  { id: "whisper", label: "속삭임", sample: "🤫" },
  { id: "scared", label: "소심/공포", sample: "😰" },
  { id: "system", label: "상태창/퀘스트", sample: "⚙️" },
  { id: "heart", label: "사랑/러블리", sample: "🩷" },
  { id: "phone", label: "폰 메신저", sample: "📱" },
  { id: "angry", label: "분노/격앙", sample: "⚡" },
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

// ── 에셋 피커 검색(효과·배경 씬 메뉴) ──────────────────────────
// 라벨 부분일치(대소문자 무시·공백 트림)로 에셋 목록을 거른다. 빈 검색어는 원본 그대로.
export function filterAssetsByLabel<T extends { label: string }>(assets: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return assets;
  return assets.filter((asset) => asset.label.toLowerCase().includes(q));
}

// 장르 섹션 배열을 같은 규칙으로 거르고, 결과가 빈 섹션은 숨긴다(배경 씬 메뉴용).
export function filterBgSceneSections<T extends { label: string }>(
  sections: { genre: string; scenes: T[] }[],
  query: string
): { genre: string; scenes: T[] }[] {
  if (!query.trim()) return sections;
  return sections
    .map((section) => ({ ...section, scenes: filterAssetsByLabel(section.scenes, query) }))
    .filter((section) => section.scenes.length > 0);
}

export interface BubbleStylePreset {
  id: string;
  label: string;
  description: string;
  fill: string;
  textFill: string;
  stroke?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  font?: string;
}

export const BUBBLE_STYLE_PRESETS: BubbleStylePreset[] = [
  {
    id: "classic_white",
    label: "기본 흰색",
    description: "보편적인 웹툰 말풍선",
    fill: "#ffffff",
    textFill: "#16100c",
    stroke: "#16100c",
    strokeWidth: 3,
  },
  {
    id: "classic_black",
    label: "속마음/독백",
    description: "어두운 분위기 또는 독백",
    fill: "#16100c",
    textFill: "#ffffff",
    stroke: "#71717a",
    strokeWidth: 2,
    shadowColor: "#000000",
    shadowBlur: 6,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowOpacity: 0.2,
  },
  {
    id: "warm_cream",
    label: "따뜻한 크림",
    description: "아늑한 일상과 일상 대화",
    fill: "#fdf8e6",
    textFill: "#2b221a",
    stroke: "#544338",
    strokeWidth: 2.5,
  },
  {
    id: "pastel_pink",
    label: "설렘 핑크",
    description: "사랑스럽고 두근거리는 로맨스 씬",
    fill: "#fff0f5",
    textFill: "#d81b60",
    stroke: "#f48fb1",
    strokeWidth: 2.5,
    shadowColor: "#f48fb1",
    shadowBlur: 5,
    shadowOffsetX: 1,
    shadowOffsetY: 1,
    shadowOpacity: 0.2,
  },
  {
    id: "action_red",
    label: "격앙 레드",
    description: "화남, 분노, 외침 씬",
    fill: "#ffebee",
    textFill: "#b71c1c",
    stroke: "#b71c1c",
    strokeWidth: 4,
    shadowColor: "#b71c1c",
    shadowBlur: 8,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowOpacity: 0.25,
  },
  {
    id: "horror_purple",
    label: "공포 퍼플",
    description: "기괴하고 오싹한 공포/미스터리 씬",
    fill: "#241335",
    textFill: "#cfd8dc",
    stroke: "#8e24aa",
    strokeWidth: 3,
    shadowColor: "#000000",
    shadowBlur: 8,
    shadowOffsetX: 0,
    shadowOffsetY: 3,
    shadowOpacity: 0.35,
    font: "'East Sea Dokdo', cursive",
  },
  {
    id: "cyber_cyan",
    label: "네온 사이언",
    description: "SF, 기계음, 상태창 메신저",
    fill: "#0c0f1d",
    textFill: "#00f0ff",
    stroke: "#00f0ff",
    strokeWidth: 2.5,
    shadowColor: "#00f0ff",
    shadowBlur: 10,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowOpacity: 0.6,
  },
  {
    id: "phone_green",
    label: "모바일 메신저",
    description: "메신저 앱 스타일",
    fill: "#dcf8c6",
    textFill: "#075e54",
    stroke: "#c7e8ad",
    strokeWidth: 1.5,
  },
];

