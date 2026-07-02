/**
 * Studio Motion FX — "무빙툰/효과툰" 동적 효과 데이터 + 순수 헬퍼.
 *
 * 정적 만화(플랫 PNG 페이지)에 동적인 느낌을 주기 위한 두 축을 정의한다.
 * 1) 스크롤 리빌(reveal): 페이지가 화면에 들어올 때의 등장 애니메이션(페이드업·줌·슬라이드…).
 *    키프레임 CSS 없이, "숨김 상태 스타일 → 보임 상태(원래대로) 전환"으로 구현한다.
 * 2) 분위기 오버레이(ambient): 만화 위에 깔리는 파티클(비·눈·벚꽃·반짝이…). 결정적
 *    시드 PRNG로 입자를 만들고 매 프레임 step으로 전진시킨다(리더의 canvas 루프가 호출).
 *
 * BGM 설정과 함께 작품 doc(Record<string, unknown>)의 `fx` 키에 저장되므로 백엔드
 * 스키마 변경이 필요 없다. 전부 순수·결정적. 사용자 노출 문자열은 한글.
 */

// 컷(페이지)별 효과 — 작품 기본 효과 위에 특정 컷만 다르게 연출한다.
// sfx·bgmShift는 나중에 추가된 옵셔널 필드 — 구버전 doc(필드 없음)·구버전 소비자와 완전 하위호환.
export interface WorkCutFx {
  reveal: string; // "" = 작품 기본 리빌 상속, 그 외 RevealId
  emphasis: string; // EmphasisId — 등장 시 1회 재생되는 강조 애니메이션
  /** 컷 진입 시 1회 재생하는 SE 스팅어(SFX_STINGER_PRESETS id). 없으면 무음. */
  sfx?: { preset: string };
  /** 컷 진입 시 BGM 무드 전환 — BgmMood id 또는 CUT_BGM_SILENCE("silence" = 음악 멈춤).
   *  자동 생성(무드) BGM에서만 동작하고, 커스텀 URL BGM에서는 소비자가 조용히 무시한다. */
  bgmShift?: { mood: string };
}

// ── 작품 doc에 저장되는 효과 설정(BGM 무드/URL은 studio-bgm이 소유, 여기선 문자열로만 보관) ──
export interface WorkFxSettings {
  reveal: string; // RevealId — 작품 전체 기본 등장 효과
  ambient: string; // AmbientId
  bgmMood: string; // BgmMood id ("" = 사용 안 함)
  bgmUrl: string; // 커스텀 오디오 URL ("" = 없음; 있으면 무드보다 우선)
  bgmVolume: number; // 0..1
  cuts: WorkCutFx[]; // 컷별 효과(인덱스 = 페이지 순서). 미지정 컷은 기본 효과를 따른다.
}

export const DEFAULT_WORK_FX: WorkFxSettings = {
  reveal: "none",
  ambient: "none",
  bgmMood: "",
  bgmUrl: "",
  bgmVolume: 0.5,
  cuts: [],
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * 작품 doc(자유 JSON)에서 fx 설정을 안전하게 읽어 정규화한다.
 * 누락·잘못된 값은 기본값으로 채운다(하위호환 — 구버전 작품엔 fx가 없다).
 */
export function readWorkFx(doc: unknown): WorkFxSettings {
  const fx = (doc as { fx?: unknown } | null | undefined)?.fx;
  if (!fx || typeof fx !== "object") return { ...DEFAULT_WORK_FX };
  const o = fx as Record<string, unknown>;
  return {
    reveal: isRevealId(o.reveal) ? o.reveal : DEFAULT_WORK_FX.reveal,
    ambient: isAmbientId(o.ambient) ? o.ambient : DEFAULT_WORK_FX.ambient,
    bgmMood: typeof o.bgmMood === "string" ? o.bgmMood : DEFAULT_WORK_FX.bgmMood,
    bgmUrl: typeof o.bgmUrl === "string" ? o.bgmUrl : DEFAULT_WORK_FX.bgmUrl,
    bgmVolume: typeof o.bgmVolume === "number" ? clamp01(o.bgmVolume) : DEFAULT_WORK_FX.bgmVolume,
    cuts: Array.isArray(o.cuts) ? o.cuts.map(normalizeCutFx) : [],
  };
}

function normalizeCutFx(v: unknown): WorkCutFx {
  if (!v || typeof v !== "object") return { reveal: "", emphasis: "none" };
  const o = v as Record<string, unknown>;
  const cut: WorkCutFx = {
    // 컷별 reveal은 ""(상속) 또는 유효한 RevealId만 허용.
    reveal: o.reveal === "" || isRevealId(o.reveal) ? (o.reveal as string) : "",
    emphasis: isEmphasisId(o.emphasis) ? o.emphasis : "none",
  };
  // 신규 옵셔널 필드 — 유효할 때만 키를 만든다(구버전 doc은 키 없이 그대로 = 직렬화 하위호환).
  const sfx = readCutSfx(o.sfx);
  if (sfx) cut.sfx = sfx;
  const bgmShift = readCutBgmShift(o.bgmShift);
  if (bgmShift) cut.bgmShift = bgmShift;
  return cut;
}

/** 컷 SE 설정 정규화 — 알려진 스팅어 프리셋 id만 통과시킨다. */
function readCutSfx(v: unknown): WorkCutFx["sfx"] {
  if (!v || typeof v !== "object") return undefined;
  const preset = (v as Record<string, unknown>).preset;
  return isSfxStingerId(preset) ? { preset } : undefined;
}

/** 컷 BGM 전환 정규화 — 비어있지 않은 문자열(무드 id 또는 "silence")만 통과.
 *  무드 id 실존 여부는 소비자(findBgmMood)가 판별한다 — 작품 레벨 bgmMood와 같은 관용. */
function readCutBgmShift(v: unknown): WorkCutFx["bgmShift"] {
  if (!v || typeof v !== "object") return undefined;
  const mood = (v as Record<string, unknown>).mood;
  return typeof mood === "string" && mood !== "" ? { mood } : undefined;
}

/** 특정 컷(페이지)의 실효 효과 — 컷별 reveal이 ""면 작품 기본 reveal을 상속. */
export function cutFx(fx: WorkFxSettings, index: number): WorkCutFx {
  const c = fx.cuts[index];
  const out: WorkCutFx = {
    reveal: c && c.reveal ? c.reveal : fx.reveal,
    emphasis: c ? c.emphasis : "none",
  };
  // 오디오 연출은 상속 개념이 없다 — 해당 컷에 지정된 것만 그대로 실어 나른다(불변 복사).
  if (c?.sfx) out.sfx = { preset: c.sfx.preset };
  if (c?.bgmShift) out.bgmShift = { mood: c.bgmShift.mood };
  return out;
}

/** fx 설정이 기본값(아무 효과 없음)인지 — 리더가 효과 레이어를 통째로 생략할 수 있게. */
export function hasAnyFx(fx: WorkFxSettings): boolean {
  return (
    fx.reveal !== "none" ||
    fx.ambient !== "none" ||
    fx.bgmMood !== "" ||
    fx.bgmUrl !== "" ||
    fx.cuts.some(
      (c) => (c.reveal && c.reveal !== "none") || c.emphasis !== "none" || c.sfx != null || c.bgmShift != null
    )
  );
}

/** 컷 오디오 연출(SE 스팅어·BGM 전환)이 하나라도 있는지 — 리더가 사운드 컨트롤 노출을 결정. */
export function hasCutAudioFx(fx: WorkFxSettings): boolean {
  return fx.cuts.some((c) => c.sfx != null || c.bgmShift != null);
}

// ── 스크롤 리빌 ──────────────────────────────────────────────────────
export interface RevealPreset {
  id: string;
  label: string;
  description: string;
}

export const REVEAL_PRESETS: RevealPreset[] = [
  { id: "none", label: "없음", description: "등장 효과 없이 바로 표시" },
  { id: "fade", label: "페이드", description: "은은하게 떠오르듯 나타남" },
  { id: "fade-up", label: "페이드업", description: "아래에서 부드럽게 떠오르며 등장" },
  { id: "zoom-in", label: "줌인", description: "살짝 확대되며 또렷해짐" },
  { id: "zoom-out", label: "줌아웃", description: "크게 다가왔다 제자리로" },
  { id: "slide-in", label: "슬라이드(좌)", description: "왼쪽에서 미끄러지듯 등장" },
  { id: "slide-right", label: "슬라이드(우)", description: "오른쪽에서 미끄러지듯 등장" },
  { id: "drop", label: "드롭", description: "위에서 떨어지듯 등장" },
  { id: "rotate-in", label: "회전", description: "살짝 기울었다 바로 서며 등장" },
  { id: "blur-in", label: "블러", description: "흐릿함에서 선명해지며 등장" },
];

const REVEAL_IDS = new Set(REVEAL_PRESETS.map((p) => p.id));
function isRevealId(v: unknown): v is string {
  return typeof v === "string" && REVEAL_IDS.has(v);
}

export interface RevealStyle {
  opacity: number;
  transform: string;
  filter: string;
}

/** 화면에 들어오기 전(숨김) 상태의 인라인 스타일. 보임 상태는 항상 {1,"none","none"}. */
export function revealHiddenStyle(id: string): RevealStyle {
  switch (id) {
    case "fade":
      return { opacity: 0, transform: "translateY(12px)", filter: "none" };
    case "fade-up":
      return { opacity: 0, transform: "translateY(32px)", filter: "none" };
    case "zoom-in":
      return { opacity: 0, transform: "scale(0.92)", filter: "none" };
    case "zoom-out":
      return { opacity: 0, transform: "scale(1.08)", filter: "none" };
    case "slide-in":
      return { opacity: 0, transform: "translateX(-36px)", filter: "none" };
    case "slide-right":
      return { opacity: 0, transform: "translateX(36px)", filter: "none" };
    case "drop":
      return { opacity: 0, transform: "translateY(-36px)", filter: "none" };
    case "rotate-in":
      return { opacity: 0, transform: "rotate(-4deg) scale(0.94)", filter: "none" };
    case "blur-in":
      return { opacity: 0.25, transform: "none", filter: "blur(10px)" };
    default:
      return { opacity: 1, transform: "none", filter: "none" };
  }
}

export const REVEAL_SHOWN_STYLE: RevealStyle = { opacity: 1, transform: "none", filter: "none" };

// ── 컷 강조 효과(등장 시 1회 재생, Web Animations API) ──────────────
export interface EmphasisPreset {
  id: string;
  label: string;
  description: string;
}

export const EMPHASIS_PRESETS: EmphasisPreset[] = [
  { id: "none", label: "없음", description: "강조 효과 없음" },
  { id: "shake", label: "흔들림", description: "충격·긴장 — 좌우로 부르르 흔들림" },
  { id: "punch", label: "확대 펀치", description: "임팩트 — 확 커졌다 제자리로" },
  { id: "flash", label: "번쩍", description: "섬광 — 밝게 번쩍" },
  { id: "pop", label: "팝", description: "통통 튀며 강조" },
  { id: "tilt", label: "기울임", description: "살짝 흔들리며 기울었다 바로" },
];

const EMPHASIS_IDS = new Set(EMPHASIS_PRESETS.map((p) => p.id));
function isEmphasisId(v: unknown): v is string {
  return typeof v === "string" && EMPHASIS_IDS.has(v);
}

export interface EmphasisAnimation {
  keyframes: Keyframe[];
  options: { duration: number; easing: string };
}

/** 컷이 화면에 들어올 때 1회 재생할 Web Animations 키프레임. none/미지정이면 null. */
export function emphasisAnimation(id: string): EmphasisAnimation | null {
  switch (id) {
    case "shake":
      return {
        keyframes: [
          { transform: "translateX(0)" },
          { transform: "translateX(-9px)" },
          { transform: "translateX(8px)" },
          { transform: "translateX(-5px)" },
          { transform: "translateX(3px)" },
          { transform: "translateX(0)" },
        ],
        options: { duration: 480, easing: "ease-in-out" },
      };
    case "punch":
      return {
        keyframes: [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
        options: { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" },
      };
    case "flash":
      return {
        keyframes: [{ filter: "brightness(1)" }, { filter: "brightness(1.9)" }, { filter: "brightness(1)" }],
        options: { duration: 360, easing: "ease-out" },
      };
    case "pop":
      return {
        keyframes: [
          { transform: "scale(0.9)", offset: 0 },
          { transform: "scale(1.05)", offset: 0.6 },
          { transform: "scale(1)", offset: 1 },
        ],
        options: { duration: 440, easing: "cubic-bezier(.2,.8,.2,1)" },
      };
    case "tilt":
      return {
        keyframes: [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-2.5deg)" },
          { transform: "rotate(1.5deg)" },
          { transform: "rotate(0deg)" },
        ],
        options: { duration: 520, easing: "ease-in-out" },
      };
    default:
      return null;
  }
}

// ── 컷 SE 스팅어(짧은 신스 효과음) ───────────────────────────────────
// 컷 진입 순간 1회 재생되는 0.2~0.7초짜리 효과음. 외부 오디오 파일 없이 소리가 나도록
// studio-bgm 신스와 같은 어휘(파형·주파수·지수 엔벨로프)의 순수 Web Audio 파라미터로
// 기술한다. 실제 노트 예약은 studio-bgm.scheduleSfxStinger가 맡는다(이 모듈은 데이터만).

/** Web Audio OscillatorType과 동일한 파형 리터럴(모듈 무의존을 위해 재선언). */
export type SfxWave = "sine" | "triangle" | "square" | "sawtooth";

/** 스팅어 노트 하나 — 시간은 초, 주파수는 Hz. attack 상승 후 duration 끝까지 지수 감쇠한다. */
export interface SfxStingerNote {
  at: number; // 스팅어 시작 기준 오프셋(초)
  duration: number; // 노트 길이(초)
  freq: number; // 시작 주파수(Hz)
  freqEnd?: number; // 피치 슬라이드 목표(Hz) — 생략하면 고정음
  wave: SfxWave;
  gain: number; // 피크 게인(0..1) — 재생 시 마스터 볼륨이 다시 곱해진다
  attack: number; // 어택(초) — 무음(0.0001)에서 gain까지 지수 상승 구간
}

export interface SfxStingerPreset {
  id: string;
  label: string;
  description: string;
  duration: number; // 총 길이(초) — 모든 노트(at+duration)를 덮는다. 리더 쿨다운 참고용.
  notes: SfxStingerNote[];
}

// 8종 스팅어 — 만화 연출 관용구(두근/쿵/휙/반짝/긴장/타격/또르르/빰)를 신스로 근사. 결정적.
export const SFX_STINGER_PRESETS: SfxStingerPreset[] = [
  {
    id: "heartbeat",
    label: "두근",
    description: "설렘·불안 — 낮게 울리는 두 번의 심장 박동",
    duration: 0.45,
    notes: [
      { at: 0, duration: 0.14, freq: 72, freqEnd: 52, wave: "sine", gain: 0.85, attack: 0.006 },
      { at: 0.22, duration: 0.16, freq: 68, freqEnd: 48, wave: "sine", gain: 1, attack: 0.006 },
    ],
  },
  {
    id: "thud",
    label: "쿵",
    description: "충격 — 깊게 떨어지는 저음 낙하",
    duration: 0.5,
    notes: [
      { at: 0, duration: 0.4, freq: 130, freqEnd: 38, wave: "sine", gain: 1, attack: 0.004 },
      { at: 0, duration: 0.09, freq: 300, freqEnd: 90, wave: "triangle", gain: 0.5, attack: 0.002 },
    ],
  },
  {
    id: "whoosh",
    label: "휙",
    description: "스침 — 빠르게 지나가는 바람",
    duration: 0.3,
    notes: [
      { at: 0, duration: 0.22, freq: 1500, freqEnd: 220, wave: "triangle", gain: 0.45, attack: 0.02 },
      { at: 0.02, duration: 0.2, freq: 1150, freqEnd: 170, wave: "sawtooth", gain: 0.18, attack: 0.03 },
    ],
  },
  {
    id: "sparkle",
    label: "반짝",
    description: "반짝임 — 맑게 올라가는 세 음",
    duration: 0.45,
    notes: [
      { at: 0, duration: 0.16, freq: 1567.98, wave: "triangle", gain: 0.32, attack: 0.008 },
      { at: 0.07, duration: 0.16, freq: 2093, wave: "triangle", gain: 0.3, attack: 0.008 },
      { at: 0.14, duration: 0.24, freq: 2637.02, wave: "sine", gain: 0.34, attack: 0.008 },
    ],
  },
  {
    id: "tension",
    label: "긴장",
    description: "긴장 — 맞부딪히는 단2도와 낮은 울림",
    duration: 0.65,
    notes: [
      { at: 0, duration: 0.55, freq: 220, wave: "sawtooth", gain: 0.22, attack: 0.09 },
      { at: 0, duration: 0.55, freq: 233.08, wave: "sawtooth", gain: 0.22, attack: 0.09 },
      { at: 0, duration: 0.55, freq: 55, wave: "sine", gain: 0.5, attack: 0.12 },
    ],
  },
  {
    id: "hit",
    label: "타격",
    description: "타격 — 짧고 단단한 펀치",
    duration: 0.2,
    notes: [
      { at: 0, duration: 0.12, freq: 190, freqEnd: 55, wave: "square", gain: 0.8, attack: 0.002 },
      { at: 0, duration: 0.05, freq: 900, freqEnd: 320, wave: "triangle", gain: 0.35, attack: 0.001 },
    ],
  },
  {
    id: "droplet",
    label: "또르르",
    description: "굴러감·허탈 — 또르르 내려가는 네 음",
    duration: 0.45,
    notes: [
      { at: 0, duration: 0.1, freq: 880, wave: "sine", gain: 0.4, attack: 0.006 },
      { at: 0.09, duration: 0.1, freq: 739.99, wave: "sine", gain: 0.38, attack: 0.006 },
      { at: 0.18, duration: 0.1, freq: 622.25, wave: "sine", gain: 0.36, attack: 0.006 },
      { at: 0.27, duration: 0.14, freq: 523.25, wave: "sine", gain: 0.34, attack: 0.006 },
    ],
  },
  {
    id: "fanfare",
    label: "빰",
    description: "등장·반전 — 밝게 터지는 장3화음 스탭",
    duration: 0.6,
    notes: [
      { at: 0, duration: 0.5, freq: 261.63, wave: "sawtooth", gain: 0.3, attack: 0.012 },
      { at: 0, duration: 0.5, freq: 329.63, wave: "sawtooth", gain: 0.26, attack: 0.012 },
      { at: 0, duration: 0.5, freq: 392, wave: "sawtooth", gain: 0.26, attack: 0.012 },
      { at: 0, duration: 0.5, freq: 523.25, wave: "triangle", gain: 0.3, attack: 0.012 },
    ],
  },
];

const SFX_STINGER_IDS = new Set(SFX_STINGER_PRESETS.map((p) => p.id));
function isSfxStingerId(v: unknown): v is string {
  return typeof v === "string" && SFX_STINGER_IDS.has(v);
}

export function findSfxStingerPreset(id: string): SfxStingerPreset | undefined {
  return SFX_STINGER_PRESETS.find((p) => p.id === id);
}

/** 컷 BGM 전환(bgmShift.mood)에서 "음악 멈춤(침묵)"을 뜻하는 예약 id. */
export const CUT_BGM_SILENCE = "silence";

// ── 분위기 오버레이(파티클) ──────────────────────────────────────────
export type AmbientShape = "line" | "dot" | "petal" | "spark" | "blob";

export interface AmbientPreset {
  id: string;
  label: string;
  description: string;
  shape: AmbientShape;
  density: number; // 권장 입자 수(가로폭 720 기준)
  color: string; // 기본 색(rgba/hex)
  minSize: number;
  maxSize: number;
  speedY: number; // 기준 낙하/부유 속도(px/s)
  drift: number; // 좌우 흔들림 진폭(px/s)
  twinkle: boolean; // 알파 반짝임 여부
}

export const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: "none", label: "없음", description: "오버레이 없음", shape: "dot", density: 0, color: "#fff", minSize: 0, maxSize: 0, speedY: 0, drift: 0, twinkle: false },
  { id: "rain", label: "비", description: "차분·우울한 빗줄기", shape: "line", density: 90, color: "rgba(174,200,235,0.55)", minSize: 8, maxSize: 18, speedY: 900, drift: 30, twinkle: false },
  { id: "snow", label: "눈", description: "포근·겨울 눈송이", shape: "dot", density: 70, color: "rgba(255,255,255,0.85)", minSize: 2, maxSize: 5, speedY: 60, drift: 40, twinkle: false },
  { id: "petals", label: "벚꽃", description: "설렘·봄 꽃잎", shape: "petal", density: 36, color: "rgba(255,183,206,0.9)", minSize: 6, maxSize: 12, speedY: 55, drift: 70, twinkle: false },
  { id: "sparkle", label: "반짝이", description: "두근·반짝이는 입자", shape: "spark", density: 48, color: "rgba(255,236,150,0.95)", minSize: 2, maxSize: 6, speedY: 18, drift: 22, twinkle: true },
  { id: "embers", label: "불씨", description: "긴장·떠오르는 불티", shape: "spark", density: 40, color: "rgba(255,150,70,0.9)", minSize: 2, maxSize: 5, speedY: -70, drift: 30, twinkle: true },
  { id: "bokeh", label: "보케", description: "몽환·부드러운 빛망울", shape: "blob", density: 24, color: "rgba(180,200,255,0.4)", minSize: 12, maxSize: 40, speedY: -16, drift: 18, twinkle: true },
  { id: "leaves", label: "단풍", description: "가을·쓸쓸한 낙엽", shape: "petal", density: 30, color: "rgba(214,124,54,0.9)", minSize: 7, maxSize: 14, speedY: 70, drift: 80, twinkle: false },
  { id: "pollen", label: "꽃가루", description: "따스한·황금빛 가루", shape: "spark", density: 50, color: "rgba(255,214,120,0.85)", minSize: 2, maxSize: 5, speedY: 24, drift: 34, twinkle: true },
  { id: "stars", label: "별빛", description: "밤하늘·반짝이는 별", shape: "spark", density: 60, color: "rgba(235,240,255,0.95)", minSize: 1.5, maxSize: 4, speedY: -8, drift: 6, twinkle: true },
  { id: "dust", label: "먼지", description: "고요·떠다니는 먼지", shape: "dot", density: 44, color: "rgba(220,220,210,0.4)", minSize: 1.5, maxSize: 4, speedY: 10, drift: 16, twinkle: true },
];

const AMBIENT_IDS = new Set(AMBIENT_PRESETS.map((p) => p.id));
function isAmbientId(v: unknown): v is string {
  return typeof v === "string" && AMBIENT_IDS.has(v);
}

export function findAmbientPreset(id: string): AmbientPreset | undefined {
  return AMBIENT_PRESETS.find((p) => p.id === id);
}

export interface AmbientParticle {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  phase: number; // 반짝임 위상(0..2π)
}

// 결정적 PRNG(mulberry32) — 시드만 같으면 항상 같은 입자 배치. 모듈 스코프 Math.random 금지.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 캔버스 크기에 맞춰 분위기 입자들을 결정적으로 생성. density는 폭 720 기준이라 폭에 비례 보정. */
export function buildAmbientParticles(
  preset: AmbientPreset,
  width: number,
  height: number,
  seed: number = 1
): AmbientParticle[] {
  if (preset.density <= 0 || width <= 0 || height <= 0) return [];
  const rand = mulberry32(seed);
  const count = Math.max(1, Math.round((preset.density * width) / 720));
  const particles: AmbientParticle[] = [];
  for (let i = 0; i < count; i++) {
    const size = preset.minSize + rand() * (preset.maxSize - preset.minSize);
    particles.push({
      x: rand() * width,
      y: rand() * height,
      size,
      vx: (rand() * 2 - 1) * preset.drift,
      vy: preset.speedY * (0.7 + rand() * 0.6),
      rot: rand() * Math.PI * 2,
      vr: (rand() * 2 - 1) * 1.5,
      phase: rand() * Math.PI * 2,
    });
  }
  return particles;
}

/**
 * 입자 하나를 dt(초)만큼 전진시켜 새 입자를 돌려준다(불변). 화면 밖으로 나가면 반대편에서 재진입.
 * 좌우 흔들림은 위상 기반 사인으로 — drift를 속도가 아니라 진폭처럼 자연스럽게.
 */
export function stepAmbientParticle(
  p: AmbientParticle,
  width: number,
  height: number,
  dt: number
): AmbientParticle {
  let ny = p.y + p.vy * dt;
  let nx = p.x + Math.sin(p.phase + ny * 0.01) * p.vx * dt + p.vx * dt * 0.2;
  const nrot = p.rot + p.vr * dt;
  // 세로 래핑(위로 떠오르는 효과는 음수 속도라 위에서 빠지면 아래로 재진입)
  if (ny > height + p.size) ny = -p.size;
  else if (ny < -p.size) ny = height + p.size;
  // 가로 래핑
  if (nx > width + p.size) nx = -p.size;
  else if (nx < -p.size) nx = width + p.size;
  return { ...p, x: nx, y: ny, rot: nrot };
}
