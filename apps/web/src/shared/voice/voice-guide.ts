/**
 * Web Speech API 기반 음성 안내 엔진.
 *
 * - 브라우저 내장 TTS(`speechSynthesis`)만 사용: 외부 API·비용 없음.
 * - 한국어 음성을 자동 선택하고, 없으면 브라우저 기본 음성으로 폴백.
 * - 한 번에 하나의 안내만 재생하고, 중복 재생을 방지한다.
 */

export interface VoiceGuidePreferences {
  /** 마스터 on/off. 꺼져 있으면 버튼 클릭으로도 재생하지 않는다. */
  readonly enabled: boolean;
  /** 페이지 진입 시 자동 안내. 기본 off (자동재생 정책·사용자 배려). */
  readonly autoGuide: boolean;
  /** 읽기 속도. 0.5 ~ 1.5, 기본 0.95. */
  readonly rate: number;
}

export const VOICE_GUIDE_DEFAULT_RATE = 0.95;
export const VOICE_GUIDE_MIN_RATE = 0.5;
export const VOICE_GUIDE_MAX_RATE = 1.5;
/** 말의 높낮이. 자연스러운 내레이션을 위해 고정. */
export const VOICE_GUIDE_PITCH = 1.0;

const ENABLED_KEY = "ts_voice_guide_enabled";
const AUTO_GUIDE_KEY = "ts_voice_guide_auto";
const RATE_KEY = "ts_voice_guide_rate";
const PROMPT_SEEN_KEY = "ts_voice_guide_prompt_seen";

function readStored(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing — 조용히 무시 */
  }
}

export function clampVoiceGuideRate(rate: number): number {
  if (!Number.isFinite(rate)) return VOICE_GUIDE_DEFAULT_RATE;
  return Math.min(VOICE_GUIDE_MAX_RATE, Math.max(VOICE_GUIDE_MIN_RATE, rate));
}

export function readVoiceGuidePreferences(): VoiceGuidePreferences {
  const storedRate = readStored(RATE_KEY);
  return {
    enabled: readStored(ENABLED_KEY) !== "0",
    autoGuide: readStored(AUTO_GUIDE_KEY) === "1",
    rate: storedRate === null ? VOICE_GUIDE_DEFAULT_RATE : clampVoiceGuideRate(Number(storedRate)),
  };
}

export function writeVoiceGuideEnabled(enabled: boolean): void {
  writeStored(ENABLED_KEY, enabled ? "1" : "0");
}

export function writeVoiceGuideAutoGuide(auto: boolean): void {
  writeStored(AUTO_GUIDE_KEY, auto ? "1" : "0");
}

export function writeVoiceGuideRate(rate: number): void {
  writeStored(RATE_KEY, String(clampVoiceGuideRate(rate)));
}

/** 첫 방문 안내 프롬프트("음성으로 안내 듣기")를 이미 본 적 있는지. */
export function hasSeenVoiceGuidePrompt(): boolean {
  return readStored(PROMPT_SEEN_KEY) === "1";
}

export function markVoiceGuidePromptSeen(): void {
  writeStored(PROMPT_SEEN_KEY, "1");
}

/** 브라우저가 Web Speech TTS를 지원하는지. */
export function isVoiceGuideSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

export interface VoiceCandidate {
  readonly lang: string;
  readonly name: string;
  readonly default: boolean;
}

/**
 * 한국어 음성 선택 (순수 함수 — 테스트 가능).
 * 우선순위: ko-KR 정확 일치 > ko 접두사 > 이름에 한국어 표기 > 기본 음성.
 */
export function pickKoreanVoice<T extends VoiceCandidate>(voices: readonly T[]): T | null {
  if (voices.length === 0) return null;
  const byScore = voices.map((voice) => {
    const lang = voice.lang.toLowerCase();
    const name = voice.name.toLowerCase();
    let score = 0;
    if (lang === "ko-kr" || lang === "ko_kr") score += 100;
    else if (lang.startsWith("ko")) score += 60;
    if (name.includes("한국") || name.includes("korean") || name.includes("korea")) score += 40;
    if (voice.default) score += 5;
    return { voice, score };
  });
  byScore.sort((a, b) => b.score - a.score);
  const best = byScore[0];
  // 한국어 흔적이 전혀 없고 기본 음성도 아니면 null (영어 음성으로 한국어 읽기를 방지).
  if (best && best.score === 0) return null;
  return best ? best.voice : null;
}

export type VoiceGuideState = "idle" | "speaking";

type StateListener = (state: VoiceGuideState, text: string | null) => void;

/**
 * 음성 안내 싱글톤 엔진.
 * - speak(): 진행 중 안내를 중단하고 새 안내를 재생 (큐 대신 교체 — 최신 안내 우선).
 * - 같은 텍스트가 이미 재생 중이면 무시 (중복 방지).
 */
export class VoiceGuideEngine {
  private listeners = new Set<StateListener>();
  private state: VoiceGuideState = "idle";
  private currentText: string | null = null;
  private voices: readonly SpeechSynthesisVoice[] = [];
  private voicesReady = false;

  constructor() {
    if (!isVoiceGuideSupported()) return;
    const synth = window.speechSynthesis;
    const load = () => {
      this.voices = synth.getVoices();
      this.voicesReady = this.voices.length > 0;
    };
    load();
    // Chrome 등은 음성 목록을 비동기로 채운다.
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", load);
    }
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state, this.currentText);
    }
  }

  get speaking(): boolean {
    return this.state === "speaking";
  }

  speak(text: string, options?: { lang?: string; rate?: number }): boolean {
    if (!isVoiceGuideSupported()) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    const prefs = readVoiceGuidePreferences();
    if (!prefs.enabled) return false;
    // 같은 안내가 이미 재생 중이면 중복 재생하지 않는다.
    if (this.state === "speaking" && this.currentText === trimmed) return true;

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new window.SpeechSynthesisUtterance(trimmed);
    const lang = options?.lang ?? "ko-KR";
    utterance.lang = lang;
    utterance.rate = clampVoiceGuideRate(options?.rate ?? prefs.rate);
    utterance.pitch = VOICE_GUIDE_PITCH;
    const voice = pickKoreanVoice(this.voices);
    if (voice) utterance.voice = voice;

    utterance.onend = () => this.setIdle();
    utterance.onerror = () => this.setIdle();

    this.state = "speaking";
    this.currentText = trimmed;
    this.emit();
    synth.speak(utterance);
    return true;
  }

  stop(): void {
    if (!isVoiceGuideSupported()) return;
    window.speechSynthesis.cancel();
    this.setIdle();
  }

  private setIdle(): void {
    if (this.state === "idle") return;
    this.state = "idle";
    this.currentText = null;
    this.emit();
  }
}

/** 앱 전역에서 공유하는 단일 엔진 인스턴스. */
export const voiceGuideEngine = new VoiceGuideEngine();
