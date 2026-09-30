/**
 * Web Speech API 기반 음성 안내 엔진.
 *
 * - 브라우저 내장 TTS(`speechSynthesis`)만 사용: 외부 API·비용 없음.
 * - 한국어 음성을 자동 선택하고, 없으면 브라우저 기본 음성으로 폴백.
 * - 한 번에 하나의 안내만 재생하고, 중복 재생을 방지한다.
 * - `speakWithCharacter()`는 감정 마크업을 세그먼트로 나눠 성우처럼
 *   순차 재생한다 (캐릭터 프리셋 + 고품질 음성 우선 선택).
 */

import {
  DEFAULT_VOICE_CHARACTER_PRESET_ID,
  getVoiceCharacterPreset,
  readVoiceCharacterPreset,
  type VoiceCharacterPreset,
  type VoiceCharacterPresetId,
} from "./voice-character-presets";
import {
  parseEmotionMarkup,
  type VoiceEmotion,
  type VoiceSegment,
} from "./voice-emotion-markup";
import { pickBestVoice } from "./voice-quality";

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

/** 세그먼트 진행 상황 — 자막 하이라이트 동기화용. */
export interface VoiceSegmentProgress {
  readonly segmentIndex: number;
  readonly totalSegments: number;
  readonly text: string;
  readonly emotion: VoiceEmotion;
}

type SegmentListener = (progress: VoiceSegmentProgress | null) => void;

export interface SpeakWithCharacterOptions {
  /** 음성 캐릭터 프리셋. 기본값은 설정에 저장된 프리셋. */
  readonly presetId?: VoiceCharacterPresetId;
  readonly lang?: string;
}

export interface SpeakSegmentsOptions {
  /** 발화 파라미터의 기준 프리셋 (rate/pitch·쉼·음성 힌트). */
  readonly preset?: VoiceCharacterPreset;
  readonly lang?: string;
}

/**
 * 음성 안내 싱글톤 엔진.
 * - speak(): 진행 중 안내를 중단하고 새 안내를 재생 (큐 대신 교체 — 최신 안내 우선).
 * - 같은 텍스트가 이미 재생 중이면 무시 (중복 방지).
 */
export class VoiceGuideEngine {
  private listeners = new Set<StateListener>();
  private segmentListeners = new Set<SegmentListener>();
  private state: VoiceGuideState = "idle";
  private currentText: string | null = null;
  private voices: readonly SpeechSynthesisVoice[] = [];
  private voicesReady = false;
  /** 순차 발화 체인 무효화 토큰 — stop/speak 호출 시 증가한다. */
  private chainToken = 0;

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

  /**
   * 세그먼트 진행 상황을 구독한다 (자막 하이라이트 동기화용).
   * 발화 시작/세그먼트 전환 시 진행 상황을, 종료·중단 시 null을 받는다.
   */
  onSegmentChange(listener: SegmentListener): () => void {
    this.segmentListeners.add(listener);
    return () => {
      this.segmentListeners.delete(listener);
    };
  }

  private emitSegment(progress: VoiceSegmentProgress | null): void {
    for (const listener of this.segmentListeners) {
      listener(progress);
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
    // 진행 중인 세그먼트 체인이 있으면 무효화한다.
    this.chainToken += 1;
    this.emitSegment(null);

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
    this.chainToken += 1;
    this.emitSegment(null);
    this.setIdle();
  }

  /**
   * 감정 마크업 텍스트를 캐릭터 프리셋으로 성우처럼 읽는다.
   * 마크업을 세그먼트로 나눠 순차 재생하며, 세그먼트마다
   * rate/pitch/쉼이 달라진다. 자막 동기화는 onSegmentChange로 받는다.
   */
  speakWithCharacter(text: string, options: SpeakWithCharacterOptions = {}): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const preset = getVoiceCharacterPreset(
      options.presetId ?? readVoiceCharacterPreset(),
    );
    const segments = parseEmotionMarkup(trimmed, preset);
    return this.speakSegments(segments, { preset, lang: options.lang });
  }

  /**
   * 발화 세그먼트 배열을 순차 재생한다.
   * 프리셋의 음성 힌트로 고품질(neural/natural) 음성을 우선 선택한다.
   */
  speakSegments(
    segments: readonly VoiceSegment[],
    options: SpeakSegmentsOptions = {},
  ): boolean {
    if (!isVoiceGuideSupported()) return false;
    if (segments.length === 0) return false;
    const prefs = readVoiceGuidePreferences();
    if (!prefs.enabled) return false;

    const token = ++this.chainToken;
    const synth = window.speechSynthesis;
    synth.cancel();

    const preset =
      options.preset ??
      getVoiceCharacterPreset(DEFAULT_VOICE_CHARACTER_PRESET_ID);
    const lang = options.lang ?? "ko-KR";
    const voice = pickBestVoice(this.voices, lang, { hints: preset.voiceHints });

    this.state = "speaking";
    this.currentText = segments.map((segment) => segment.text).join(" ");
    this.emit();

    const playAt = (index: number): void => {
      if (token !== this.chainToken) return;
      if (index >= segments.length) {
        this.emitSegment(null);
        this.setIdle();
        return;
      }
      const segment = segments[index];
      const begin = (): void => {
        if (token !== this.chainToken) return;
        const utterance = new window.SpeechSynthesisUtterance(segment.text);
        utterance.lang = lang;
        utterance.rate = clampVoiceGuideRate(segment.rate);
        utterance.pitch = segment.pitch;
        if (voice) utterance.voice = voice;
        utterance.onend = () => {
          if (token !== this.chainToken) return;
          if (segment.pauseAfterMs > 0) {
            window.setTimeout(() => playAt(index + 1), segment.pauseAfterMs);
          } else {
            playAt(index + 1);
          }
        };
        utterance.onerror = () => {
          if (token !== this.chainToken) return;
          // 오류 시 체인을 무효화하고 중단한다.
          this.chainToken += 1;
          this.emitSegment(null);
          this.setIdle();
        };
        this.emitSegment({
          segmentIndex: index,
          totalSegments: segments.length,
          text: segment.text,
          emotion: segment.emotion,
        });
        synth.speak(utterance);
      };
      if (segment.pauseBeforeMs > 0) {
        window.setTimeout(begin, segment.pauseBeforeMs);
      } else {
        begin();
      }
    };

    playAt(0);
    return true;
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
