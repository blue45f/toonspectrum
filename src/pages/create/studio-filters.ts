/**
 * Studio Image Adjustment Engine
 * 포토샵급 이미지 보정 — 순수 픽셀 필터(색온도/샤픈/먹선/듀오톤), 원클릭 필터 프리셋,
 * 페이지 전체 컬러 그레이드(CSS filter + 비네트)를 한 모듈에 모았다.
 * Konva/DOM 의존 없음 — StudioPage 캔버스 로직과 단위 테스트가 공유한다.
 */

// ImageData 호환 최소 형태(테스트에서 가짜 객체 사용 가능).
export type StudioImageDataLike = { data: Uint8ClampedArray; width: number; height: number };

// ---------------------------------------------------------------------------
// 색 유틸
// ---------------------------------------------------------------------------

/** #rgb / #rrggbb 헥스 파싱. 실패 시 검정 {0,0,0} 폴백. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (typeof hex === "string") {
    const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (m6) {
      return { r: parseInt(m6[1]!, 16), g: parseInt(m6[2]!, 16), b: parseInt(m6[3]!, 16) };
    }
    const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
    if (m3) {
      // #abc → #aabbcc 와 동일하게 확장.
      return {
        r: parseInt(m3[1]! + m3[1]!, 16),
        g: parseInt(m3[2]! + m3[2]!, 16),
        b: parseInt(m3[3]! + m3[3]!, 16),
      };
    }
  }
  return { r: 0, g: 0, b: 0 };
}

// ---------------------------------------------------------------------------
// 순수 픽셀 필터(제자리 변형) — Uint8ClampedArray가 0-255 클램프/반올림을 보장한다.
// ---------------------------------------------------------------------------

/**
 * 색온도 — amount -100..100. 양수=따뜻하게(r↑ b↓), 음수=차갑게(r↓ b↑).
 * 채널당 약 0.6*amount 쉬프트. amount 0이면 no-op. 알파 보존.
 */
export function applyTemperature(img: StudioImageDataLike, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  const shift = amount * 0.6;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i]! + shift;
    data[i + 2] = data[i + 2]! - shift;
  }
}

/**
 * 샤픈 — amount 0..1. 3x3 언샤프 마스크(중앙 1+4a, 상하좌우 -a).
 * 가장자리 픽셀은 원본 유지, 알파 보존. amount 0이면 no-op.
 */
export function applySharpen(img: StudioImageDataLike, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const a = Math.min(1, amount);
  const { data, width, height } = img;
  if (width < 3 || height < 3) return;

  const src = new Uint8ClampedArray(data);
  const center = 1 + 4 * a;
  const rowStride = width * 4;

  for (let y = 1; y < height - 1; y++) {
    let i = (y * width + 1) * 4;
    for (let x = 1; x < width - 1; x++, i += 4) {
      // r/g/b만 보정, 알파(+3)는 건드리지 않는다.
      data[i] = src[i]! * center - a * (src[i - 4]! + src[i + 4]! + src[i - rowStride]! + src[i + rowStride]!);
      data[i + 1] =
        src[i + 1]! * center - a * (src[i - 3]! + src[i + 5]! + src[i + 1 - rowStride]! + src[i + 1 + rowStride]!);
      data[i + 2] =
        src[i + 2]! * center - a * (src[i - 2]! + src[i + 6]! + src[i + 2 - rowStride]! + src[i + 2 + rowStride]!);
    }
  }
}

/**
 * 먹선 잉크 — level 0..1 (0이면 no-op).
 * 휘도(0.299r+0.587g+0.114b) < level*255 → 순흑, 아니면 순백. 알파 보존.
 */
export function applyInkThreshold(img: StudioImageDataLike, level: number): void {
  if (!Number.isFinite(level) || level <= 0) return;
  const cut = Math.min(1, level) * 255;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    const v = lum < cut ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

/**
 * 듀오톤(그라디언트 맵) — 픽셀 휘도 t(0..1)로 shadow→highlight 색을 선형보간.
 * c = shadow + (highlight - shadow) * t. 알파 보존.
 */
export function applyDuotone(img: StudioImageDataLike, shadow: string, highlight: string): void {
  const lo = hexToRgb(shadow);
  const hi = hexToRgb(highlight);
  const dr = hi.r - lo.r;
  const dg = hi.g - lo.g;
  const db = hi.b - lo.b;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const t = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255;
    data[i] = lo.r + dr * t;
    data[i + 1] = lo.g + dg * t;
    data[i + 2] = lo.b + db * t;
  }
}

// ---------------------------------------------------------------------------
// Konva 등록용 레지스트리 — StudioPage가 Konva.Filters에 부착할 때 fn(imageData, node.attrs)로 호출.
// attrs는 외부 입력이므로 타입 가드 후 범위 클램프, 무효 값은 no-op.
// ---------------------------------------------------------------------------

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const STUDIO_PIXEL_FILTERS: Record<
  string,
  (img: StudioImageDataLike, attrs: Record<string, unknown>) => void
> = {
  Temperature: (img, attrs) => {
    const amount = finiteNumber(attrs.temperature);
    if (amount === null) return;
    applyTemperature(img, Math.max(-100, Math.min(100, amount)));
  },
  Sharpen: (img, attrs) => {
    const amount = finiteNumber(attrs.sharpen);
    if (amount === null) return;
    applySharpen(img, Math.max(0, Math.min(1, amount)));
  },
  InkThreshold: (img, attrs) => {
    const level = finiteNumber(attrs.inkThreshold);
    if (level === null) return;
    applyInkThreshold(img, Math.max(0, Math.min(1, level)));
  },
  Duotone: (img, attrs) => {
    const shadow = attrs.duotoneShadow;
    const highlight = attrs.duotoneHighlight;
    if (typeof shadow !== "string" || typeof highlight !== "string") return;
    applyDuotone(img, shadow, highlight);
  },
};

// ---------------------------------------------------------------------------
// 이미지 보정 범위(인스펙터 슬라이더용)
// ---------------------------------------------------------------------------

export const IMAGE_ADJUSTMENT_RANGES = {
  saturation: { min: -1, max: 1, step: 0.05 }, // Konva HSL 필터에 전달
  hue: { min: -180, max: 180, step: 5 },
  temperature: { min: -100, max: 100, step: 5 },
  sharpen: { min: 0, max: 1, step: 0.05 },
  pixelate: { min: 0, max: 40, step: 1 }, // Konva Pixelate pixelSize
  inkThreshold: { min: 0, max: 1, step: 0.02 },
} as const;

// ---------------------------------------------------------------------------
// 원클릭 필터 프리셋 — 이미지 한 장에 적용할 보정값 묶음(patch)
// ---------------------------------------------------------------------------

export type ImageFilterPatch = {
  blur?: number;
  brightness?: number;
  contrast?: number;
  grayscale?: boolean;
  sepia?: boolean;
  screentone?: boolean;
  lineart?: boolean;
  chromatic?: number;
  posterize?: number;
  noise?: number;
  saturation?: number;
  hue?: number;
  temperature?: number;
  sharpen?: number;
  pixelate?: number;
  invert?: boolean;
  inkThreshold?: number;
  duotoneShadow?: string;
  duotoneHighlight?: string;
};

/** 모든 보정 키를 명시적으로 undefined로 채운 패치 — 기존 보정 제거(원본 복귀)용. */
export function imageFilterResetPatch(): ImageFilterPatch {
  return {
    blur: undefined,
    brightness: undefined,
    contrast: undefined,
    grayscale: undefined,
    sepia: undefined,
    screentone: undefined,
    lineart: undefined,
    chromatic: undefined,
    posterize: undefined,
    noise: undefined,
    saturation: undefined,
    hue: undefined,
    temperature: undefined,
    sharpen: undefined,
    pixelate: undefined,
    invert: undefined,
    inkThreshold: undefined,
    duotoneShadow: undefined,
    duotoneHighlight: undefined,
  };
}

export type ImageFilterPreset = { id: string; label: string; tip: string; patch: ImageFilterPatch };

// 웹툰 연출 중심 원클릭 프리셋. patch 값은 IMAGE_ADJUSTMENT_RANGES와
// 기존 범위(blur 0..30, brightness -0.8..0.8, contrast -80..80, chromatic 0..12, posterize 0..8, noise 0..100) 안.
export const IMAGE_FILTER_PRESETS: ImageFilterPreset[] = [
  { id: "original", label: "원본", tip: "모든 보정을 제거하고 원본으로 되돌립니다.", patch: imageFilterResetPatch() },
  {
    id: "recall",
    label: "회상",
    tip: "세피아 톤과 부드러운 대비로 과거 회상 장면을 연출합니다.",
    patch: { sepia: true, brightness: 0.08, contrast: -12, saturation: -0.15 },
  },
  {
    id: "mono-manuscript",
    label: "흑백 원고",
    tip: "흑백 변환과 대비 강화로 출판 원고 느낌을 냅니다.",
    patch: { grayscale: true, contrast: 25, brightness: 0.05 },
  },
  {
    id: "comic-print",
    label: "만화 인쇄",
    tip: "스크린톤 망점으로 인쇄 만화 질감을 입힙니다.",
    patch: { screentone: true, contrast: 10 },
  },
  {
    id: "night",
    label: "야간",
    tip: "어둡고 차가운 톤으로 밤 장면을 만듭니다.",
    patch: { brightness: -0.25, temperature: -40, saturation: -0.3, contrast: 8 },
  },
  {
    id: "dawn",
    label: "새벽",
    tip: "푸르스름하고 옅은 빛으로 새벽 공기를 표현합니다.",
    patch: { brightness: -0.05, temperature: -25, saturation: -0.2, hue: 10 },
  },
  {
    id: "dusk",
    label: "황혼",
    tip: "따뜻한 주황빛 노을 무드를 더합니다.",
    patch: { temperature: 45, brightness: -0.05, saturation: 0.15, hue: -10 },
  },
  {
    id: "horror",
    label: "호러",
    tip: "저채도·강한 대비·노이즈로 공포 분위기를 만듭니다.",
    patch: { saturation: -0.55, contrast: 30, noise: 35, brightness: -0.15 },
  },
  {
    id: "neon-glitch",
    label: "네온 글리치",
    tip: "색수차와 고채도로 사이버펑크 글리치를 연출합니다.",
    patch: { chromatic: 6, saturation: 0.5, contrast: 15 },
  },
  {
    id: "vintage-film",
    label: "빈티지 필름",
    tip: "세피아·필름 그레인·따뜻한 색온도로 오래된 필름 질감을 냅니다.",
    patch: { sepia: true, noise: 25, temperature: 20, contrast: -10 },
  },
  {
    id: "watercolor-pastel",
    label: "수채 파스텔",
    tip: "낮은 대비와 밝은 톤으로 수채화 같은 파스텔 무드를 만듭니다.",
    patch: { contrast: -25, brightness: 0.18, saturation: -0.35 },
  },
  {
    id: "action",
    label: "강렬 액션",
    tip: "샤픈과 대비·채도 강화로 액션 컷의 임팩트를 키웁니다.",
    patch: { sharpen: 0.6, contrast: 28, saturation: 0.35 },
  },
  {
    id: "ink",
    label: "먹선 잉크",
    tip: "휘도 임계값으로 순흑/순백 먹선 잉크 효과를 만듭니다.",
    patch: { inkThreshold: 0.55 },
  },
  {
    id: "duotone-mood",
    label: "듀오톤 무드",
    tip: "어둠은 남색, 빛은 분홍으로 물들이는 투톤 그라디언트 맵.",
    patch: { duotoneShadow: "#1a1a40", duotoneHighlight: "#ff8fb3" },
  },
  {
    id: "dreamy-soft",
    label: "몽환 소프트",
    tip: "옅은 블러와 밝은 톤으로 꿈결 같은 장면을 연출합니다.",
    patch: { blur: 2, brightness: 0.12, saturation: -0.1 },
  },
];

// ---------------------------------------------------------------------------
// 페이지 전체 컬러 그레이드 — CSS filter 문자열 + 비네트 오버레이/캔버스 합성
// ---------------------------------------------------------------------------

export type PageGrade = {
  brightness: number; // 0.2..2, 기본 1 (CSS brightness())
  contrast: number; // 0.2..2, 기본 1
  saturation: number; // 0..3, 기본 1 (CSS saturate())
  hue: number; // -180..180, 기본 0 (CSS hue-rotate)
  sepia: number; // 0..1, 기본 0
  grayscale: number; // 0..1, 기본 0
  vignette: number; // 0..1, 기본 0 (CSS filter 아님 — 오버레이/캔버스로 그림)
};

export const DEFAULT_PAGE_GRADE: PageGrade = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  vignette: 0,
};

export const PAGE_GRADE_RANGES: Record<keyof PageGrade, { min: number; max: number; step: number }> = {
  brightness: { min: 0.2, max: 2, step: 0.05 },
  contrast: { min: 0.2, max: 2, step: 0.05 },
  saturation: { min: 0, max: 3, step: 0.05 },
  hue: { min: -180, max: 180, step: 5 },
  sepia: { min: 0, max: 1, step: 0.05 },
  grayscale: { min: 0, max: 1, step: 0.05 },
  vignette: { min: 0, max: 1, step: 0.05 },
};

const PAGE_GRADE_KEYS = Object.keys(DEFAULT_PAGE_GRADE) as (keyof PageGrade)[];

/**
 * 과거 저장본 로드 안전장치 — 누락 키는 기본값, 숫자가 아닌 값은 기본값,
 * 범위 밖 숫자는 PAGE_GRADE_RANGES로 클램프한 새 객체를 반환.
 */
export function normalizePageGrade(g?: Partial<PageGrade> | null): PageGrade {
  const out: PageGrade = { ...DEFAULT_PAGE_GRADE };
  if (!g || typeof g !== "object") return out;
  for (const key of PAGE_GRADE_KEYS) {
    const raw = g[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const range = PAGE_GRADE_RANGES[key];
    out[key] = Math.min(range.max, Math.max(range.min, raw));
  }
  return out;
}

/** 모든 항목이 기본값(보정 없음)인지. */
export function isDefaultPageGrade(g: PageGrade): boolean {
  for (const key of PAGE_GRADE_KEYS) {
    if (g[key] !== DEFAULT_PAGE_GRADE[key]) return false;
  }
  return true;
}

// 소수점 둘째 자리까지, 불필요한 0 제거(1.10 → "1.1", 1.00 → "1").
function formatGradeNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// CSS filter 출력 순서 고정: brightness, contrast, saturate, hue-rotate, sepia, grayscale.
const CSS_FILTER_ORDER: { key: Exclude<keyof PageGrade, "vignette">; fn: string; unit: string }[] = [
  { key: "brightness", fn: "brightness", unit: "" },
  { key: "contrast", fn: "contrast", unit: "" },
  { key: "saturation", fn: "saturate", unit: "" },
  { key: "hue", fn: "hue-rotate", unit: "deg" },
  { key: "sepia", fn: "sepia", unit: "" },
  { key: "grayscale", fn: "grayscale", unit: "" },
];

/**
 * 페이지 그레이드 → CSS filter 문자열. 기본값과 같은 항목은 생략, 전부 기본이면 "".
 * 예: "brightness(1.1) saturate(0.8) hue-rotate(-15deg)".
 */
export function pageGradeToCssFilter(g: PageGrade): string {
  const parts: string[] = [];
  for (const { key, fn, unit } of CSS_FILTER_ORDER) {
    const value = g[key];
    if (value === DEFAULT_PAGE_GRADE[key]) continue;
    parts.push(`${fn}(${formatGradeNumber(value)}${unit})`);
  }
  return parts.join(" ");
}

// 비네트 톤 공유 — 미리보기(vignetteCss)와 내보내기(drawVignette)가 같은 값을 쓴다.
function vignetteStops(strength: number): { inner: number; alpha: number } {
  const s = Math.min(1, strength);
  return {
    inner: Math.round(70 - s * 25), // 어두워지기 시작하는 지점(%)
    alpha: Math.round(s * 70) / 100, // 가장자리 최대 어둡기
  };
}

/**
 * 미리보기 오버레이 div용 radial-gradient CSS 값. strength 0 이하면 "none".
 * 강도가 셀수록 더 안쪽에서 시작하고 가장자리가 더 어둡다.
 */
export function vignetteCss(strength: number): string {
  if (!Number.isFinite(strength) || strength <= 0) return "none";
  const { inner, alpha } = vignetteStops(strength);
  return `radial-gradient(ellipse at center, rgba(0,0,0,0) ${inner}%, rgba(0,0,0,${alpha}) 100%)`;
}

export type VignetteCtx = {
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): { addColorStop(offset: number, color: string): void };
  fillStyle: unknown;
  fillRect(x: number, y: number, w: number, h: number): void;
};

/**
 * 내보내기 캔버스에 비네트 합성. strength 0 이하면 아무것도 안 함.
 * vignetteCss 미리보기와 동일한 시작점/어둡기 톤으로 그린다.
 */
export function drawVignette(ctx: VignetteCtx, width: number, height: number, strength: number): void {
  if (!Number.isFinite(strength) || strength <= 0) return;
  if (!(width > 0) || !(height > 0)) return;
  const { inner, alpha } = vignetteStops(strength);
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.sqrt(cx * cx + cy * cy);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(Math.min(1, Math.max(0, inner / 100)), "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export type PageGradePreset = { id: string; label: string; tip: string; grade: PageGrade };

// 웹툰 장면 무드 중심 페이지 그레이드 프리셋. grade 값은 PAGE_GRADE_RANGES 안.
export const PAGE_GRADE_PRESETS: PageGradePreset[] = [
  {
    id: "neutral",
    label: "기본",
    tip: "보정 없는 원본 페이지.",
    grade: { ...DEFAULT_PAGE_GRADE },
  },
  {
    id: "recall",
    label: "회상",
    tip: "빛바랜 세피아와 옅은 비네트로 과거 장면을 감쌉니다.",
    grade: { brightness: 1.05, contrast: 0.95, saturation: 0.7, hue: 0, sepia: 0.45, grayscale: 0, vignette: 0.25 },
  },
  {
    id: "night",
    label: "야간",
    tip: "어둡고 푸른 기운이 도는 밤 장면.",
    grade: { brightness: 0.75, contrast: 1.1, saturation: 0.7, hue: -10, sepia: 0, grayscale: 0, vignette: 0.4 },
  },
  {
    id: "dawn",
    label: "새벽",
    tip: "옅은 푸른빛과 낮은 채도의 새벽 공기.",
    grade: { brightness: 0.95, contrast: 0.95, saturation: 0.75, hue: 15, sepia: 0, grayscale: 0, vignette: 0.15 },
  },
  {
    id: "dusk",
    label: "황혼",
    tip: "노을빛이 스며드는 따뜻한 저녁.",
    grade: { brightness: 1, contrast: 1.05, saturation: 1.2, hue: -20, sepia: 0.2, grayscale: 0, vignette: 0.2 },
  },
  {
    id: "horror",
    label: "호러",
    tip: "핏기 없는 저채도와 짙은 비네트의 공포 무드.",
    grade: { brightness: 0.8, contrast: 1.35, saturation: 0.35, hue: 0, sepia: 0, grayscale: 0.3, vignette: 0.6 },
  },
  {
    id: "dreamy",
    label: "몽환",
    tip: "밝고 부드러운 빛이 번지는 꿈결 장면.",
    grade: { brightness: 1.1, contrast: 0.85, saturation: 0.85, hue: 10, sepia: 0.1, grayscale: 0, vignette: 0.1 },
  },
  {
    id: "mono-manuscript",
    label: "흑백 원고",
    tip: "잉크 대비를 살린 흑백 출판 원고 톤.",
    grade: { brightness: 1.05, contrast: 1.25, saturation: 0, hue: 0, sepia: 0, grayscale: 1, vignette: 0 },
  },
  {
    id: "rainy",
    label: "비 오는 날",
    tip: "채도를 낮춘 잿빛의 우중 장면.",
    grade: { brightness: 0.9, contrast: 0.95, saturation: 0.6, hue: 10, sepia: 0, grayscale: 0.15, vignette: 0.3 },
  },
  {
    id: "warm-afternoon",
    label: "따뜻한 오후",
    tip: "햇살이 내려앉은 포근한 오후의 톤.",
    grade: { brightness: 1.1, contrast: 1, saturation: 1.15, hue: -10, sepia: 0.15, grayscale: 0, vignette: 0 },
  },
];
