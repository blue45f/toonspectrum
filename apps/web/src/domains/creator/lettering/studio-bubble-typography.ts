/**
 * Studio Bubble Typography — 말풍선 타이포그래피 고도화 순수 코어.
 *
 * 기존 `studio-bubble-text-fit.ts`가 "맞춤(상자에 들어가게)"의 단일 소스라면,
 * 이 모듈은 "표현(어떻게 보이게)"의 고도화를 담당한다:
 *
 *  1. 강조 탐지: Comic Chat(SIGGRAPH '96, §4.1)의 규칙 테이블 아이디어를 차용.
 *     원본은 ALL CAPS/!!!를 외침으로 판정했다. 여기서는 텍스트 안에서 강조 구간을
 *     찾아 볼드/확대 렌더 힌트를 만든다.
 *  2. 감정 기반 글자 크기: Yang et al.(TOMM 2021)의 emotion-aware word size.
 *     감정 강도에 따라 폰트 스케일을 조절한다.
 *  3. 금칙 처리: 기존 `studio-kinsoku-line-break.ts`를 재사용 (중복 구현 금지).
 *
 * 전부 순수·결정적. DOM/Konva 의존성 없음.
 */

import { clamp01 } from "./studio-bubble-math";

export interface EmphasisSpan {
  /** 원본 텍스트에서의 시작 인덱스 (UTF-16 코드 유닛). */
  start: number;
  /** 끝 인덱스 (exclusive). */
  end: number;
  /** 강조 종류. */
  kind: "shout" | "emphasis" | "question" | "whisper";
  /** 렌더 힌트: 폰트 크기 배율. */
  fontScale: number;
  /** 렌더 힌트: 볼드 여부. */
  bold: boolean;
}

/** 문장 끝 강조 패턴 판정 결과. */
interface SentenceEmphasis {
  kind: EmphasisSpan["kind"];
  fontScale: number;
  bold: boolean;
}

const hasDoubleExclamation = (s: string): boolean => /[!！]{2,}/.test(s);
/** 물음표와 느낌표가 섞여 있으면 question (?!, !? 등). */
const hasQuestionExclamation = (s: string): boolean =>
  /[?？]/.test(s) && /[!！]/.test(s);
const endsWithTilde = (s: string): boolean => /[~～]$/.test(s);
const endsWithExclamation = (s: string): boolean => /[!！]$/.test(s);

/**
 * 문장 하나를 끝맺음 패턴으로 분류한다 (우선순위 순).
 * Comic Chat(SIGGRAPH '96, §4.1)의 ALL CAPS/!!! 외침 판정 규칙을 차용.
 */
function classifySentence(trimmed: string): SentenceEmphasis | null {
  if (hasDoubleExclamation(trimmed)) {
    return { kind: "shout", fontScale: 1.18, bold: true };
  }
  if (hasQuestionExclamation(trimmed)) {
    return { kind: "question", fontScale: 1.1, bold: true };
  }
  if (endsWithTilde(trimmed) && trimmed.length > 2) {
    return { kind: "whisper", fontScale: 0.92, bold: false };
  }
  if (endsWithExclamation(trimmed)) {
    return { kind: "emphasis", fontScale: 1.08, bold: true };
  }
  return null;
}
/**
 * 텍스트에서 강조 구간을 탐지한다 (Comic Chat식 규칙 테이블).
 *
 * 규칙 (우선순위 순):
 *  1. `*강조*` 마크다운 → emphasis
 *  2. 문장 끝 패턴 (`classifySentence`): `!!`→shout, `?!`→question, `~`→whisper, `!`→emphasis
 *  3. 전체 대문자(한글 제외, 3자 이상) → shout
 */
export function detectEmphasisSpans(text: string): EmphasisSpan[] {
  const spans: EmphasisSpan[] = [];
  if (!text) return spans;

  // *강조* 마크다운.
  const mdRe = /\*([^*]+)\*/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    spans.push({
      start: m.index + 1,
      end: m.index + 1 + m[1].length,
      kind: "emphasis",
      fontScale: 1.12,
      bold: true,
    });
  }

  // 문장 단위 분석.
  const sentenceRe = /[^.!?~…]+[.!?~…]+|[^.!?~…]+$/g;
  let s: RegExpExecArray | null;
  while ((s = sentenceRe.exec(text)) !== null) {
    const sentence = s[0];
    const start = s.index;
    const end = start + sentence.length;
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // 이미 마크다운 강조가 있으면 건너뛴다.
    const overlapped = spans.some(
      (sp) => sp.start < end && sp.end > start
    );
    if (overlapped) continue;

    const classified = classifySentence(trimmed);
    if (classified) {
      spans.push({ start, end, ...classified });
    }
  }

  // 전체 대문자 (영문 3자 이상, 소문자 없음).
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && letters === letters.toUpperCase()) {
    const hasSpan = spans.length > 0;
    if (!hasSpan) {
      spans.push({ start: 0, end: text.length, kind: "shout", fontScale: 1.15, bold: true });
    }
  }

  // 시작 인덱스 순으로 정렬.
  spans.sort((a, b) => a.start - b.start);
  return spans;
}

/**
 * 강조 구간을 제외한 나머지 텍스트를 plain span으로 채워 전체를 커버한다.
 * 렌더러가 순서대로 그릴 수 있게 한다.
 */
export interface TypographySpan extends EmphasisSpan {
  kind: "plain" | "shout" | "emphasis" | "question" | "whisper";
}

export function buildTypographySpans(text: string): TypographySpan[] {
  const emphasis = detectEmphasisSpans(text);
  const out: TypographySpan[] = [];
  let cursor = 0;
  for (const sp of emphasis) {
    if (sp.start > cursor) {
      out.push({
        start: cursor,
        end: sp.start,
        kind: "plain",
        fontScale: 1,
        bold: false,
      });
    }
    out.push({ ...sp });
    cursor = Math.max(cursor, sp.end);
  }
  if (cursor < text.length) {
    out.push({
      start: cursor,
      end: text.length,
      kind: "plain",
      fontScale: 1,
      bold: false,
    });
  }
  // 빈 텍스트면 plain 하나.
  if (out.length === 0 && text.length === 0) {
    out.push({ start: 0, end: 0, kind: "plain", fontScale: 1, bold: false });
  }
  return out;
}

/**
 * 감정 강도(0..1)에 따른 폰트 스케일 (Yang et al.의 emotion-aware word size).
 * 강한 감정일수록 글자가 커진다.
 */
export function emotionFontScale(
  emotionKind: "rage" | "shock" | "whisper" | "thought" | "neutral",
  intensity: number
): number {
  const t = clamp01(intensity);
  switch (emotionKind) {
    case "rage":
      return 1 + 0.3 * t;
    case "shock":
      return 1 + 0.2 * t;
    case "whisper":
      return 1 - 0.15 * t;
    case "thought":
      return 1 - 0.05 * t;
    case "neutral":
      return 1;
  }
}

/**
 * 말풍선에 권장되는 자간(레터 스페이싱) — 강조 구간은 자간을 넓힌다.
 * 반환값: em 단위.
 */
export function letterSpacingForKind(
  kind: TypographySpan["kind"]
): number {
  switch (kind) {
    case "shout":
      return 0.06;
    case "emphasis":
      return 0.03;
    case "whisper":
      return 0.02;
    case "question":
      return 0.04;
    case "plain":
      return 0;
  }
}
