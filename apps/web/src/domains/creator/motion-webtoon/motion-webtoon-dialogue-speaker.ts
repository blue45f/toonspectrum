/**
 * 모션 웹툰 대사 음성 스피커.
 *
 * 캐릭터별 보이스 프리셋(rate/pitch/호흡) + 감정 마크업을 합성해
 * Web Speech API로 대사를 순차 발화한다. 외부 TTS·비용 없음.
 * 테스트를 위해 speechSynthesis·딜레이를 주입할 수 있다.
 */

import {
  getVoiceCharacterPreset,
  type VoiceCharacterPresetId,
} from "@/shared/voice/voice-character-presets";
import {
  parseEmotionMarkup,
  stripEmotionMarkup,
} from "@/shared/voice/voice-emotion-markup";
import {
  pickKoreanVoice,
  type VoiceCandidate,
} from "@/shared/voice/voice-guide";

/** speak 요청. */
export interface DialogueSpeakRequest {
  readonly text: string;
  readonly presetId: VoiceCharacterPresetId;
  readonly lang?: string;
}

/** 최소 speechSynthesis 포트 (테스트 주입용). getVoices는 원본 음성 객체를 그대로 반환한다. */
export interface SpeechSynthPort {
  speak(utterance: SpeechSynthesisUtteranceLike): void;
  cancel(): void;
  getVoices(): readonly unknown[];
}

export interface SpeechSynthesisUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  /** 실제 브라우저 음성 객체를 그대로 전달한다 (가짜 객체를 만들지 않는다). */
  voice: unknown;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface DialogueSpeakerDeps {
  readonly synth: SpeechSynthPort | null;
  readonly createUtterance: (text: string) => SpeechSynthesisUtteranceLike;
  readonly delay: (ms: number) => Promise<void>;
}

function defaultDeps(): DialogueSpeakerDeps | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;
  return {
    synth: {
      speak: (u) => synth.speak(u as SpeechSynthesisUtterance),
      cancel: () => synth.cancel(),
      getVoices: () => synth.getVoices(),
    },
    createUtterance: (text) => {
      const utterance = new SpeechSynthesisUtterance(text);
      return utterance as unknown as SpeechSynthesisUtteranceLike;
    },
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** 발화 취소 토큰. */
export class DialogueSpeakHandle {
  private cancelled = false;
  private done: Promise<void>;
  private resolveDone!: () => void;

  constructor() {
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  cancel(): void {
    this.cancelled = true;
  }

  /** 발화가 끝나거나 취소될 때 resolve. */
  get finished(): Promise<void> {
    return this.done;
  }

  finish(): void {
    this.resolveDone();
  }
}

/**
 * 대사 한 줄을 발화한다. 감정 마크업이 있으면 세그먼트별로
 * rate/pitch를 바꿔가며 순차 발화한다.
 */
export function speakDialogueLine(
  request: DialogueSpeakRequest,
  deps: DialogueSpeakerDeps | null = defaultDeps(),
  externalHandle?: DialogueSpeakHandle,
): DialogueSpeakHandle {
  const handle = externalHandle ?? new DialogueSpeakHandle();
  if (!deps?.synth) {
    handle.finish();
    return handle;
  }
  const preset = getVoiceCharacterPreset(request.presetId);
  const segments = parseEmotionMarkup(request.text, preset);
  const plainFallback = stripEmotionMarkup(request.text);
  const lang = request.lang ?? "ko-KR";

  void (async () => {
    try {
      deps.synth!.cancel();
      // getVoices()가 돌려준 원본 음성 객체를 그대로 사용한다.
      const voices = deps.synth!.getVoices() as VoiceCandidate[];
      const voice = pickKoreanVoice(voices);
      const plan = segments.length > 0 ? segments : [{
        text: plainFallback,
        rate: preset.rate,
        pitch: preset.pitch,
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        emotion: "neutral" as const,
      }];
      for (const segment of plan) {
        if (handle.isCancelled) break;
        if (segment.pauseBeforeMs > 0) await deps.delay(segment.pauseBeforeMs);
        if (handle.isCancelled) break;
        if (!segment.text) continue;
        await speakUtterance(deps, {
          text: segment.text,
          lang,
          rate: segment.rate,
          pitch: segment.pitch,
          voice: voice,
          isCancelled: () => handle.isCancelled,
        });
        if (handle.isCancelled) break;
        if (segment.pauseAfterMs > 0) await deps.delay(segment.pauseAfterMs);
      }
    } finally {
      handle.finish();
    }
  })();
  return handle;
}

interface UtterancePlan {
  readonly text: string;
  readonly lang: string;
  readonly rate: number;
  readonly pitch: number;
  /** 브라우저 원본 음성 객체 (없으면 null). */
  readonly voice: unknown;
  readonly isCancelled: () => boolean;
}

function speakUtterance(
  deps: DialogueSpeakerDeps,
  plan: UtterancePlan,
): Promise<void> {
  return new Promise((resolve) => {
    if (plan.isCancelled()) {
      resolve();
      return;
    }
    const utterance = deps.createUtterance(plan.text);
    utterance.lang = plan.lang;
    utterance.rate = plan.rate;
    utterance.pitch = plan.pitch;
    utterance.voice = plan.voice ?? null;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    utterance.onend = settle;
    utterance.onerror = settle;
    deps.synth!.speak(utterance);
    // 안전장치: 콜백이 오지 않으면 텍스트 길이 기반으로 타임아웃.
    const fallbackMs = Math.max(1500, plan.text.length * 120);
    void deps.delay(fallbackMs).then(settle);
  });
}

/** 진행 중인 대사를 중단한다. */
export function stopDialogue(deps: DialogueSpeakerDeps | null = defaultDeps()): void {
  deps?.synth?.cancel();
}
