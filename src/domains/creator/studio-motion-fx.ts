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

// ── 작품 doc에 저장되는 효과 설정(BGM 무드/URL은 studio-bgm이 소유, 여기선 문자열로만 보관) ──
export interface WorkFxSettings {
  reveal: string; // RevealId
  ambient: string; // AmbientId
  bgmMood: string; // BgmMood id ("" = 사용 안 함)
  bgmUrl: string; // 커스텀 오디오 URL ("" = 없음; 있으면 무드보다 우선)
  bgmVolume: number; // 0..1
}

export const DEFAULT_WORK_FX: WorkFxSettings = {
  reveal: "none",
  ambient: "none",
  bgmMood: "",
  bgmUrl: "",
  bgmVolume: 0.5,
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
  };
}

/** fx 설정이 기본값(아무 효과 없음)인지 — 리더가 효과 레이어를 통째로 생략할 수 있게. */
export function hasAnyFx(fx: WorkFxSettings): boolean {
  return fx.reveal !== "none" || fx.ambient !== "none" || fx.bgmMood !== "" || fx.bgmUrl !== "";
}

// ── 스크롤 리빌 ──────────────────────────────────────────────────────
export interface RevealPreset {
  id: string;
  label: string;
  description: string;
}

export const REVEAL_PRESETS: RevealPreset[] = [
  { id: "none", label: "없음", description: "등장 효과 없이 바로 표시" },
  { id: "fade-up", label: "페이드업", description: "아래에서 부드럽게 떠오르며 등장" },
  { id: "zoom-in", label: "줌인", description: "살짝 확대되며 또렷해짐" },
  { id: "slide-in", label: "슬라이드", description: "옆에서 미끄러지듯 등장" },
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
    case "fade-up":
      return { opacity: 0, transform: "translateY(32px)", filter: "none" };
    case "zoom-in":
      return { opacity: 0, transform: "scale(0.92)", filter: "none" };
    case "slide-in":
      return { opacity: 0, transform: "translateX(-36px)", filter: "none" };
    case "blur-in":
      return { opacity: 0.25, transform: "none", filter: "blur(10px)" };
    default:
      return { opacity: 1, transform: "none", filter: "none" };
  }
}

export const REVEAL_SHOWN_STYLE: RevealStyle = { opacity: 1, transform: "none", filter: "none" };

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
