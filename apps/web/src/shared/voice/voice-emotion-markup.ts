/**
 * 음성 감정 마크업 파서.
 *
 * Web Speech API는 SSML을 지원하지 않으므로, 텍스트에 감정 마커를 직접
 * 표기하고 파서가 발화 세그먼트로 분해한다. 각 세그먼트는 rate/pitch/쉼을
 * 가지며, 엔진이 순차 발화하면서 성우 같은 억양을 재현한다.
 *
 * 마크업 예:
 *   "별들이 [신비]속삭이는[/신비] 오늘의 운세[쉼]를 [강조]전해 드립니다.[/강조]"
 *
 * 지원하는 감정 태그:
 *   [강조] [신비] [기쁨] [슬픔] [긴장] [놀람] [빠르게] [느리게]
 *   [쉼] — 해당 위치에 쉼 세그먼트 삽입 (닫는 태그 불필요)
 */

import type { VoiceCharacterPreset } from "./voice-character-presets";

/** 감정 종류. */
export type VoiceEmotion =
  | "neutral"
  | "emphasis"
  | "mystic"
  | "joy"
  | "sorrow"
  | "tension"
  | "surprise"
  | "fast"
  | "slow";

export interface VoiceSegment {
  /** 발화할 순수 텍스트 (쉼 세그먼트는 빈 문자열). */
  readonly text: string;
  /** 읽기 속도 (0.5~1.5, 절대값). */
  readonly rate: number;
  /** 높낮이 (0~2, 절대값). */
  readonly pitch: number;
  /** 이 세그먼트 재생 전 쉼 (ms). */
  readonly pauseBeforeMs: number;
  /** 이 세그먼트 재생 후 쉼 (ms). */
  readonly pauseAfterMs: number;
  readonly emotion: VoiceEmotion;
}

/** 감정별 rate 배율 / pitch 변화량 (프리셋 기준값에 곱/합). */
const EMOTION_TUNING: Record<VoiceEmotion, { rateScale: number; pitchShift: number }> = {
  neutral: { rateScale: 1, pitchShift: 0 },
  emphasis: { rateScale: 0.88, pitchShift: -0.06 },
  mystic: { rateScale: 0.85, pitchShift: -0.12 },
  joy: { rateScale: 1.08, pitchShift: 0.12 },
  sorrow: { rateScale: 0.82, pitchShift: -0.1 },
  tension: { rateScale: 1.05, pitchShift: -0.04 },
  surprise: { rateScale: 1.12, pitchShift: 0.18 },
  fast: { rateScale: 1.15, pitchShift: 0.05 },
  slow: { rateScale: 0.8, pitchShift: -0.05 },
};

const OPEN_TAG_TO_EMOTION: Record<string, VoiceEmotion> = {
  강조: "emphasis",
  강조하다: "emphasis",
  emphasis: "emphasis",
  신비: "mystic",
  mystic: "mystic",
  기쁨: "joy",
  joy: "joy",
  슬픔: "sorrow",
  sorrow: "sorrow",
  긴장: "tension",
  tension: "tension",
  놀람: "surprise",
  surprise: "surprise",
  빠르게: "fast",
  fast: "fast",
  느리게: "slow",
  slow: "slow",
};

/** 문장 종결 패턴 — 한국어/영어 문장 부호 기준. */
const SENTENCE_END_RE = /([.!?…。！？]+["'”’）)]?\s*)/u;
/** 단락 구분 (빈 줄). */
const PARAGRAPH_BREAK_RE = /\n\s*\n/;

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1.5, Math.max(0.5, rate));
}

function clampPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return 1;
  return Math.min(2, Math.max(0, pitch));
}

interface RawSpan {
  text: string;
  emotion: VoiceEmotion;
  pauseBeforeMs: number;
}

/** 마크업을 감정 span으로 1차 분해한다. */
function tokenize(input: string): RawSpan[] {
  const spans: RawSpan[] = [];
  const tagRe = /\[([^\]]+)\]/g;
  let cursor = 0;
  let current: VoiceEmotion = "neutral";
  let pendingPauseBefore = 0;

  const pushText = (text: string) => {
    if (!text) return;
    spans.push({ text, emotion: current, pauseBeforeMs: pendingPauseBefore });
    pendingPauseBefore = 0;
  };

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(input)) !== null) {
    pushText(input.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const tag = match[1].trim();
    if (tag === "쉼" || tag.toLowerCase() === "pause" || tag.toLowerCase() === "break") {
      // 쉼 세그먼트: 텍스트 없이 pauseBefore만 전달.
      pendingPauseBefore += 450;
      continue;
    }
    if (tag.startsWith("/")) {
      // 닫는 태그 — 감정을 neutral로 복귀.
      current = "neutral";
      continue;
    }
    const emotion = OPEN_TAG_TO_EMOTION[tag] ?? OPEN_TAG_TO_EMOTION[tag.toLowerCase()];
    if (emotion) {
      current = emotion;
    }
    // 알 수 없는 태그는 무시 (텍스트에서 제거됨).
  }
  pushText(input.slice(cursor));
  return spans;
}

/**
 * 감정 마크업 텍스트를 발화 세그먼트 배열로 변환한다.
 * 문장·단락 경계에서 프리셋의 쉼을 적용한다.
 */
export function parseEmotionMarkup(input: string, preset: VoiceCharacterPreset): VoiceSegment[] {
  const spans = tokenize(input);
  const segments: VoiceSegment[] = [];

  for (const span of spans) {
    // 단락 분리 후 문장 분리.
    const paragraphs = span.text.split(PARAGRAPH_BREAK_RE);
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const sentences = paragraph.split(SENTENCE_END_RE).filter((part) => part.trim().length > 0);
      // 분리자가 홀수 위치에 오므로 문장+종결부호를 재결합.
      const combined: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        combined.push((sentences[i] ?? "") + (sentences[i + 1] ?? ""));
      }
      if (combined.length === 0 && paragraph.trim().length > 0) {
        combined.push(paragraph);
      }
      combined.forEach((sentence, sentenceIndex) => {
        const text = sentence.trim();
        if (!text) return;
        const tuning = EMOTION_TUNING[span.emotion];
        const isFirst = segments.length === 0 && sentenceIndex === 0 && paragraphIndex === 0;
        const isLastInParagraph = sentenceIndex === combined.length - 1;
        const pauseBeforeMs = isFirst ? span.pauseBeforeMs : paragraphIndex > 0 && sentenceIndex === 0 ? preset.paragraphPauseMs : span.pauseBeforeMs;
        segments.push({
          text,
          rate: clampRate(preset.rate * tuning.rateScale),
          pitch: clampPitch(preset.pitch + tuning.pitchShift),
          pauseBeforeMs,
          pauseAfterMs: isLastInParagraph ? preset.paragraphPauseMs : preset.sentencePauseMs,
          emotion: span.emotion,
        });
      });
    });
  }

  // 마지막 세그먼트의 후행 쉼은 불필요.
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    segments[segments.length - 1] = { ...last, pauseAfterMs: 0 };
  }
  return segments;
}

/** 마크업을 제거한 순수 텍스트 (자막 표시용). */
export function stripEmotionMarkup(input: string): string {
  return input
    .replace(/\[(?:\/)?[^\]]+\]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** 텍스트에 감정 마크업이 포함되어 있는지. */
export function hasEmotionMarkup(input: string): boolean {
  return /\[[^\]]+\]/.test(input);
}
