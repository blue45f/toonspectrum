/**
 * SSML 빌더 — 클라우드 TTS(Google Cloud TTS 등)용.
 *
 * Web Speech API(브라우저 내장)는 SSML을 지원하지 않으므로, 이 모듈은
 * SSML을 지원하는 엔진(Google Cloud TTS의 ko-KR-Wavenet 등)에 전달할
 * 마크업을 생성한다. 감정 마크업(`voice-emotion-markup.ts`)으로 파싱된
 * 세그먼트를 SSML `<prosody>`/`<break>`/`<emphasis>`로 변환한다.
 */

import type { VoiceSegment } from "./voice-emotion-markup";

/** Google Cloud TTS SSML rate 범위: x-slow ~ x-fast 또는 20%~200%. */
function rateToSsml(rate: number): string {
  const percent = Math.round(rate * 100);
  return `${percent}%`;
}

/** Google Cloud TTS SSML pitch 범위: -20st ~ +20st. pitch 1.0 = 기준. */
function pitchToSsml(pitch: number): string {
  const semitones = (pitch - 1) * 12;
  const rounded = Math.round(semitones * 10) / 10;
  if (rounded === 0) return "+0st";
  return `${rounded > 0 ? "+" : ""}${rounded}st`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 발화 세그먼트 배열을 SSML 문자열로 변환한다.
 * Google Cloud TTS `synthesize` 요청의 `input.ssml`에 그대로 넣을 수 있다.
 */
export function buildSsml(segments: readonly VoiceSegment[], lang = "ko-KR"): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.pauseBeforeMs > 0) {
      parts.push(`<break time="${Math.round(segment.pauseBeforeMs)}ms"/>`);
    }
    const text = escapeXml(segment.text);
    const prosody = `<prosody rate="${rateToSsml(segment.rate)}" pitch="${pitchToSsml(segment.pitch)}">`;
    if (segment.emotion === "emphasis") {
      parts.push(`${prosody}<emphasis level="strong">${text}</emphasis></prosody>`);
    } else {
      parts.push(`${prosody}${text}</prosody>`);
    }
    if (segment.pauseAfterMs > 0) {
      parts.push(`<break time="${Math.round(segment.pauseAfterMs)}ms"/>`);
    }
  }
  return `<speak xml:lang="${escapeXml(lang)}">${parts.join("")}</speak>`;
}

/**
 * Web Speech API는 SSML을 지원하지 않는다 — 항상 false.
 * 이 함수는 "왜 브라우저 내장 음성에서는 SSML이 동작하지 않는가"를
 * 코드로 문서화하고, 향후 엔진 분기에서 사용하기 위해 둔다.
 */
export function isSsmlSupportedByWebSpeech(): boolean {
  return false;
}

/** SSML 미지원 엔진에서 마크업 텍스트를 그대로 읽지 않도록 순수 텍스트 추출. */
export function ssmlToPlainText(ssml: string): string {
  // 태그 제거를 문자열이 안정될 때까지 반복 — 한 번만 치환하면
  // `<scr<script>ipt>` 같은 중첩 입력에서 불완전한 살균이 됨
  // (CodeQL js/incomplete-multi-character-sanitization).
  let plain = ssml;
  let previous: string;
  do {
    previous = plain;
    plain = plain.replace(/<[^>]+>/g, "");
  } while (plain !== previous);

  // 엔티티 디코딩: `&amp;`는 반드시 마지막에 — 먼저 디코딩하면
  // `&amp;lt;` → `&lt;` → `<` 이중 디코딩이 발생함
  // (CodeQL js/double-escaping).
  return plain
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
