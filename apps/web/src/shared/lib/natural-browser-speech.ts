/**
 * Zero-cost browser speech direction.
 *
 * Text preparation, voice ranking and prosody planning run locally. Playback uses
 * the browser/OS Web Speech implementation and never calls a ToonSpectrum AI API.
 * Optional recording captures the user-selected current tab audio so the same
 * system voice can be attached to a video without a paid TTS provider.
 */

export type NaturalSpeechStyle =
  | "fortune"
  | "dialogue"
  | "promo-natural"
  | "promo-cinematic"
  | "calm"
  | "energetic"
  | "guide";

export type NaturalVoiceGender = "female" | "male" | "neutral";

export type NaturalSpeechVoice = {
  name: string;
  lang: string;
  voiceURI?: string;
  default?: boolean;
  localService?: boolean;
};

export type NaturalPronunciation = {
  source: string;
  spoken: string;
};

export type NaturalSpeechSegment = {
  sourceText: string;
  spokenText: string;
  sourceStart: number;
  sourceEnd: number;
  rate: number;
  pitch: number;
  volume: number;
  pauseAfterMs: number;
  estimatedSpeechMs: number;
};

export type NaturalSpeechPlanOptions = {
  style?: NaturalSpeechStyle;
  rate?: number;
  pitch?: number;
  volume?: number;
  maxSegmentChars?: number;
  pronunciations?: readonly NaturalPronunciation[];
};

export type NaturalVoicePreference = {
  gender?: NaturalVoiceGender;
  localOnly?: boolean;
  preferLocal?: boolean;
  preferredVoiceURI?: string | null;
};

export type NaturalBrowserSpeechRequest = NaturalSpeechPlanOptions & {
  text: string;
  voice?: SpeechSynthesisVoice | null;
  plan?: readonly NaturalSpeechSegment[];
  onProgress?: (sourceCharacters: number, totalCharacters: number) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
};

export type NaturalBrowserSpeechSession = {
  readonly plan: readonly NaturalSpeechSegment[];
  pause: () => boolean;
  resume: () => boolean;
  cancel: () => void;
};

export type NaturalSpeechRecordingRequest = NaturalBrowserSpeechRequest & {
  signal?: AbortSignal;
  leadInMs?: number;
  tailMs?: number;
};

type SpeechBoundaryKind = "soft" | "sentence" | "paragraph" | "forced" | "end";

type SpeechRange = {
  start: number;
  end: number;
  boundary: SpeechBoundaryKind;
};

type NaturalSpeechProfile = {
  rate: number;
  pitch: number;
  softPauseMs: number;
  sentencePauseMs: number;
  paragraphPauseMs: number;
};

const STYLE_PROFILES: Record<NaturalSpeechStyle, NaturalSpeechProfile> = {
  fortune: { rate: 0.91, pitch: 1, softPauseMs: 170, sentencePauseMs: 380, paragraphPauseMs: 540 },
  dialogue: { rate: 0.97, pitch: 1, softPauseMs: 125, sentencePauseMs: 270, paragraphPauseMs: 410 },
  "promo-natural": { rate: 0.96, pitch: 1.01, softPauseMs: 150, sentencePauseMs: 300, paragraphPauseMs: 460 },
  "promo-cinematic": { rate: 0.86, pitch: 0.96, softPauseMs: 210, sentencePauseMs: 440, paragraphPauseMs: 620 },
  calm: { rate: 0.9, pitch: 0.98, softPauseMs: 190, sentencePauseMs: 370, paragraphPauseMs: 540 },
  energetic: { rate: 1.06, pitch: 1.04, softPauseMs: 105, sentencePauseMs: 230, paragraphPauseMs: 350 },
  guide: { rate: 0.98, pitch: 1, softPauseMs: 135, sentencePauseMs: 285, paragraphPauseMs: 420 },
};

export const DEFAULT_KOREAN_PRONUNCIATIONS: readonly NaturalPronunciation[] = [
  { source: "ToonSpectrum", spoken: "툰 스펙트럼" },
  { source: "ToonStudio", spoken: "툰 스튜디오" },
  { source: "UI/UX", spoken: "유 아이, 유 엑스" },
  { source: "WebM", spoken: "웹 엠" },
  { source: "JPEG", spoken: "제이펙" },
  { source: "BGM", spoken: "비 지 엠" },
  { source: "TTS", spoken: "티 티 에스" },
  { source: "API", spoken: "에이 피 아이" },
  { source: "GPT", spoken: "지 피 티" },
  { source: "SNS", spoken: "에스 엔 에스" },
  { source: "URL", spoken: "유 알 엘" },
  { source: "PNG", spoken: "피 엔 지" },
  { source: "MP4", spoken: "엠 피 포" },
  { source: "3D", spoken: "쓰리 디" },
  { source: "2D", spoken: "투 디" },
  { source: "AI", spoken: "에이 아이" },
  { source: "UI", spoken: "유 아이" },
  { source: "UX", spoken: "유 엑스" },
  { source: "QR", spoken: "큐 알" },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function pronunciationPattern(source: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(source)}(?=$|[^A-Za-z0-9])`, "giu");
}

/** Converts display copy into speech-friendly Korean while preserving the source copy itself. */
export function normalizeNaturalSpeechText(
  value: string,
  pronunciations: readonly NaturalPronunciation[] = []
): string {
  let text = value
    .normalize("NFC")
    .replace(/https?:\/\/\S+/giu, " 링크 ")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, " ")
    .replace(/[*_`#~]+/gu, " ")
    .replace(/[•·▪◦]+/gu, ", ");

  for (const entry of [...DEFAULT_KOREAN_PRONUNCIATIONS, ...pronunciations]) {
    const source = entry.source.trim();
    const spoken = entry.spoken.trim();
    if (!source || !spoken) continue;
    text = text.replace(pronunciationPattern(source), (_match, prefix: string) => `${prefix}${spoken}`);
  }

  return text
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n+ */gu, " ")
    .replace(/\s+([,.;:!?…])/gu, "$1")
    .replace(/([,.;:!?…])(?=[^\s,.;:!?…])/gu, "$1 ")
    .trim();
}

function trimRange(text: string, start: number, end: number): { start: number; end: number } | null {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/u.test(text[nextStart] ?? "")) nextStart += 1;
  while (nextEnd > nextStart && /\s/u.test(text[nextEnd - 1] ?? "")) nextEnd -= 1;
  return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : null;
}

function pushSpeechRange(
  ranges: SpeechRange[],
  text: string,
  start: number,
  end: number,
  boundary: SpeechBoundaryKind
): number {
  const trimmed = trimRange(text, start, end);
  if (trimmed) ranges.push({ ...trimmed, boundary });
  return end;
}

function findForcedBreak(text: string, start: number, end: number, lastSoftBreak: number): number {
  if (lastSoftBreak > start + 6) return lastSoftBreak;
  const minimum = start + Math.floor((end - start) * 0.55);
  for (let cursor = end; cursor >= minimum; cursor -= 1) {
    if (/\s/u.test(text[cursor] ?? "")) return cursor + 1;
  }
  return end + 1;
}

function splitSpeechRanges(text: string, maxSegmentChars: number): SpeechRange[] {
  const ranges: SpeechRange[] = [];
  let start = 0;
  let lastSoftBreak = -1;
  let index = 0;

  while (index < text.length) {
    const char = text[index] ?? "";
    const currentLength = index - start + 1;

    if (char === "\n") {
      let next = index + 1;
      while (text[next] === "\n") next += 1;
      pushSpeechRange(ranges, text, start, index, next > index + 1 ? "paragraph" : "sentence");
      start = next;
      index = next;
      lastSoftBreak = -1;
      continue;
    }

    if (/[.!?。！？…]/u.test(char)) {
      let end = index + 1;
      while (/[.!?。！？…'”’」』)]/u.test(text[end] ?? "")) end += 1;
      start = pushSpeechRange(ranges, text, start, end, "sentence");
      index = end;
      lastSoftBreak = -1;
      continue;
    }

    if (/[,;:，、]/u.test(char) && currentLength >= 12) lastSoftBreak = index + 1;

    if (currentLength >= maxSegmentChars) {
      const end = findForcedBreak(text, start, index, lastSoftBreak);
      start = pushSpeechRange(ranges, text, start, end, lastSoftBreak === end ? "soft" : "forced");
      index = end;
      lastSoftBreak = -1;
      continue;
    }

    if (lastSoftBreak > start && currentLength >= 28) {
      start = pushSpeechRange(ranges, text, start, lastSoftBreak, "soft");
      index = lastSoftBreak;
      lastSoftBreak = -1;
      continue;
    }

    index += 1;
  }

  const tail = trimRange(text, start, text.length);
  if (tail) ranges.push({ ...tail, boundary: "end" });
  if (ranges.length > 0) ranges[ranges.length - 1] = { ...ranges[ranges.length - 1]!, boundary: "end" };
  return ranges;
}

function stableJitter(text: string, index: number): number {
  let hash = 2166136261 ^ index;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    hash ^= text.charCodeAt(cursor);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 2001) / 1000 - 1;
}

function pauseForBoundary(profile: NaturalSpeechProfile, boundary: SpeechBoundaryKind): number {
  if (boundary === "paragraph") return profile.paragraphPauseMs;
  if (boundary === "sentence") return profile.sentencePauseMs;
  if (boundary === "soft") return profile.softPauseMs;
  if (boundary === "forced") return Math.round(profile.softPauseMs * 0.75);
  return 0;
}

/** Creates deterministic phrase-sized utterances so the voice breathes instead of reading one long block. */
export function buildNaturalSpeechPlan(
  sourceText: string,
  options: NaturalSpeechPlanOptions = {}
): NaturalSpeechSegment[] {
  const style = options.style ?? "guide";
  const profile = STYLE_PROFILES[style];
  const maxSegmentChars = Math.round(clamp(options.maxSegmentChars ?? 72, 30, 120));
  const rateMultiplier = clamp(options.rate ?? 1, 0.65, 1.55);
  const pitchMultiplier = clamp(options.pitch ?? 1, 0.7, 1.35);
  const volume = clamp(options.volume ?? 1, 0, 1);

  return splitSpeechRanges(sourceText, maxSegmentChars).flatMap((range, index) => {
    const source = sourceText.slice(range.start, range.end);
    const spoken = normalizeNaturalSpeechText(source, options.pronunciations);
    if (!spoken) return [];

    const jitter = stableJitter(spoken, index);
    const punctuationRate = /[!?！？]$/u.test(spoken) ? 0.025 : /[,;:，、]$/u.test(spoken) ? -0.012 : 0;
    const questionPitch = /[?？]$/u.test(spoken) ? 0.035 : /[!！]$/u.test(spoken) ? 0.018 : 0;
    const rate = clamp(profile.rate * rateMultiplier + jitter * 0.018 + punctuationRate, 0.6, 1.6);
    const pitch = clamp(profile.pitch * pitchMultiplier + jitter * 0.018 + questionPitch, 0.6, 1.45);
    const visibleCharacters = Array.from(spoken.replace(/\s/gu, "")).length;
    const estimatedSpeechMs = Math.max(360, Math.round((visibleCharacters / (8.15 * rate)) * 1000));

    return [{
      sourceText: source,
      spokenText: spoken,
      sourceStart: range.start,
      sourceEnd: range.end,
      rate: Math.round(rate * 1000) / 1000,
      pitch: Math.round(pitch * 1000) / 1000,
      volume,
      pauseAfterMs: pauseForBoundary(profile, range.boundary),
      estimatedSpeechMs,
    }];
  });
}

export function estimateNaturalSpeechDurationMs(plan: readonly NaturalSpeechSegment[]): number {
  return plan.reduce((total, segment) => total + segment.estimatedSpeechMs + segment.pauseAfterMs, 0);
}

function voiceIdentity(voice: NaturalSpeechVoice): string {
  return `${voice.name} ${voice.voiceURI ?? ""}`.toLowerCase();
}

function languageRoot(value: string): string {
  return value.trim().toLowerCase().split(/[-_]/u, 1)[0] ?? "";
}

function inferredVoiceGender(voice: NaturalSpeechVoice): NaturalVoiceGender {
  const identity = voiceIdentity(voice);
  const explicitMale = /(?:^|[^a-z])(?:male|man)(?:$|[^a-z])/u.test(identity);
  const explicitFemale = /(?:^|[^a-z])(?:female|woman)(?:$|[^a-z])/u.test(identity);
  if (explicitMale || /injoon|인준|bongjin|봉진|gookmin|국민|hyunsu|현수|남성|남자/u.test(identity)) return "male";
  if (explicitFemale || /sunhi|선희|seohyeon|서현|jimin|지민|yujin|유진|soonbok|순복|yuna|유나|sora|소라|heami|혜미|여성|여자/u.test(identity)) return "female";
  return "neutral";
}

/** Scores voices by Korean support, neural-quality hints, locality and a soft gender preference. */
export function naturalKoreanVoiceScore(
  voice: NaturalSpeechVoice,
  preference: NaturalVoicePreference = {}
): number {
  const identity = voiceIdentity(voice);
  const language = voice.lang.trim().toLowerCase();
  let score = language === "ko-kr" ? 420 : languageRoot(language) === "ko" ? 350 : -300;

  if (/natural|neural/u.test(identity)) score += 145;
  if (/enhanced|premium|high quality/u.test(identity)) score += 90;
  if (/google/u.test(identity)) score += 72;
  if (/microsoft|azure/u.test(identity)) score += 58;
  if (/online|cloud/u.test(identity)) score += 42;
  if (/yuna|유나|sunhi|선희|injoon|인준|sora|소라|heami|혜미/u.test(identity)) score += 26;
  if (voice.localService === true) score += preference.preferLocal === false ? 8 : 36;
  if (voice.localService === false) score += preference.preferLocal === false ? 20 : 0;
  if (voice.default) score += 4;

  const wantedGender = preference.gender ?? "neutral";
  const actualGender = inferredVoiceGender(voice);
  if (wantedGender !== "neutral") {
    if (actualGender === wantedGender) score += 48;
    else if (actualGender !== "neutral") score -= 24;
  }
  if (preference.preferredVoiceURI && voice.voiceURI === preference.preferredVoiceURI) score += 1_000;
  return score;
}

export function rankNaturalKoreanVoices<T extends NaturalSpeechVoice>(
  voices: readonly T[],
  preference: NaturalVoicePreference = {}
): T[] {
  const candidates = voices.filter((voice) => languageRoot(voice.lang) === "ko");
  const localFiltered = preference.localOnly
    ? candidates.filter((voice) => voice.localService === true)
    : candidates;
  return localFiltered
    .map((voice, index) => ({ voice, index, score: naturalKoreanVoiceScore(voice, preference) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ voice }) => voice);
}

export function chooseNaturalKoreanVoice<T extends NaturalSpeechVoice>(
  voices: readonly T[],
  preference: NaturalVoicePreference = {}
): T | null {
  return rankNaturalKoreanVoices(voices, preference)[0] ?? null;
}

export function naturalSpeechVoiceKey(voice: NaturalSpeechVoice): string {
  return `${voice.voiceURI || voice.name}\u0000${voice.lang}`;
}

type BrowserSpeechScope = {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  requestAnimationFrame?: typeof requestAnimationFrame;
  cancelAnimationFrame?: typeof cancelAnimationFrame;
  performance?: Pick<Performance, "now">;
};

function browserSpeechScope(): BrowserSpeechScope | undefined {
  return typeof window === "undefined" ? undefined : window;
}

export function isNaturalBrowserSpeechSupported(scope = browserSpeechScope()): boolean {
  return Boolean(scope?.speechSynthesis && typeof scope.SpeechSynthesisUtterance === "function");
}

export function listNaturalBrowserSpeechVoices(scope = browserSpeechScope()): SpeechSynthesisVoice[] {
  if (!scope?.speechSynthesis) return [];
  try {
    return Array.from(scope.speechSynthesis.getVoices());
  } catch {
    return [];
  }
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

/** Plays a phrase plan sequentially and supplies time-based progress when boundary events are absent. */
export function speakNaturalBrowserSpeech(
  request: NaturalBrowserSpeechRequest,
  injectedScope = browserSpeechScope()
): NaturalBrowserSpeechSession | null {
  const synthesis = injectedScope?.speechSynthesis;
  const Utterance = injectedScope?.SpeechSynthesisUtterance;
  if (!synthesis || typeof Utterance !== "function" || !request.text.trim()) return null;

  const plan = request.plan ? Array.from(request.plan) : buildNaturalSpeechPlan(request.text, request);
  if (plan.length === 0) return null;

  const now = () => injectedScope?.performance?.now() ?? Date.now();
  const raf = injectedScope?.requestAnimationFrame?.bind(injectedScope) ?? ((callback: FrameRequestCallback) => setTimeout(() => callback(now()), 16) as unknown as number);
  const cancelRaf = injectedScope?.cancelAnimationFrame?.bind(injectedScope) ?? ((id: number) => clearTimeout(id));

  let cancelled = false;
  let completed = false;
  let paused = false;
  let segmentIndex = -1;
  let currentUtterance: SpeechSynthesisUtterance | null = null;
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;
  let pauseTimerStartedAt = 0;
  let pendingPauseMs = 0;
  let pendingPauseCallback: (() => void) | null = null;
  let progressFrame: number | null = null;
  let segmentStartedAt = 0;
  let segmentPausedAt = 0;
  let segmentPausedMs = 0;
  let boundarySeen = false;

  const clearProgressFrame = () => {
    if (progressFrame != null) cancelRaf(progressFrame);
    progressFrame = null;
  };

  const clearPauseTimer = () => {
    if (pauseTimer != null) clearTimeout(pauseTimer);
    pauseTimer = null;
  };

  const discardPendingPause = () => {
    clearPauseTimer();
    pendingPauseMs = 0;
    pendingPauseCallback = null;
  };

  const fail = (reason: unknown) => {
    if (cancelled || completed) return;
    cancelled = true;
    discardPendingPause();
    clearProgressFrame();
    try { synthesis.cancel(); } catch { /* capability disappeared */ }
    request.onError?.(asError(reason, "시스템 음성을 재생하지 못했어요."));
  };

  const finish = () => {
    if (cancelled || completed) return;
    completed = true;
    discardPendingPause();
    clearProgressFrame();
    currentUtterance = null;
    request.onProgress?.(request.text.length, request.text.length);
    request.onEnd?.();
  };

  const scheduleNext = (delayMs: number, callback: () => void) => {
    clearPauseTimer();
    pendingPauseMs = Math.max(0, delayMs);
    pendingPauseCallback = callback;
    if (paused) return;
    pauseTimerStartedAt = now();
    pauseTimer = setTimeout(() => {
      pauseTimer = null;
      pendingPauseMs = 0;
      const next = pendingPauseCallback;
      pendingPauseCallback = null;
      next?.();
    }, pendingPauseMs);
  };

  const startProgressFallback = (segment: NaturalSpeechSegment, reset = true) => {
    clearProgressFrame();
    if (reset) {
      segmentStartedAt = now();
      segmentPausedMs = 0;
      segmentPausedAt = 0;
      boundarySeen = false;
    }
    const tick = () => {
      if (cancelled || completed || paused || segmentIndex < 0) return;
      if (!boundarySeen) {
        const elapsed = Math.max(0, now() - segmentStartedAt - segmentPausedMs);
        const ratio = Math.min(0.94, elapsed / Math.max(1, segment.estimatedSpeechMs));
        const sourceProgress = segment.sourceStart + Math.floor((segment.sourceEnd - segment.sourceStart) * ratio);
        request.onProgress?.(sourceProgress, request.text.length);
      }
      progressFrame = raf(tick);
    };
    progressFrame = raf(tick);
  };

  const speakAt = (index: number) => {
    if (cancelled || completed) return;
    const segment = plan[index];
    if (!segment) {
      finish();
      return;
    }
    segmentIndex = index;
    const utterance = new Utterance(segment.spokenText);
    currentUtterance = utterance;
    utterance.lang = request.voice?.lang || "ko-KR";
    utterance.rate = segment.rate;
    utterance.pitch = segment.pitch;
    utterance.volume = segment.volume;
    if (request.voice) utterance.voice = request.voice;
    utterance.onboundary = (event) => {
      boundarySeen = true;
      const length = (event as SpeechSynthesisEvent & { charLength?: number }).charLength ?? 1;
      const spokenProgress = Math.min(segment.spokenText.length, (event.charIndex ?? 0) + length);
      const ratio = spokenProgress / Math.max(1, segment.spokenText.length);
      const sourceProgress = segment.sourceStart + Math.round((segment.sourceEnd - segment.sourceStart) * ratio);
      request.onProgress?.(sourceProgress, request.text.length);
    };
    utterance.onend = () => {
      if (cancelled || completed || currentUtterance !== utterance) return;
      clearProgressFrame();
      request.onProgress?.(segment.sourceEnd, request.text.length);
      currentUtterance = null;
      scheduleNext(segment.pauseAfterMs, () => speakAt(index + 1));
    };
    utterance.onerror = (event) => {
      const code = (event as SpeechSynthesisErrorEvent).error;
      if (cancelled || code === "canceled" || code === "interrupted") return;
      fail(new Error(`시스템 음성 오류: ${code || "unknown"}`));
    };

    startProgressFallback(segment);
    try {
      synthesis.speak(utterance);
    } catch (error) {
      fail(error);
    }
  };

  try { synthesis.cancel(); } catch { /* no active utterance */ }
  speakAt(0);

  return {
    plan,
    pause: () => {
      if (cancelled || completed || paused) return false;
      paused = true;
      if (pauseTimer != null) {
        pendingPauseMs = Math.max(0, pendingPauseMs - (now() - pauseTimerStartedAt));
        clearPauseTimer();
      }
      if (segmentIndex >= 0) segmentPausedAt = now();
      clearProgressFrame();
      try {
        synthesis.pause();
        return true;
      } catch {
        paused = false;
        return false;
      }
    },
    resume: () => {
      if (cancelled || completed || !paused) return false;
      paused = false;
      if (segmentPausedAt > 0) {
        segmentPausedMs += now() - segmentPausedAt;
        segmentPausedAt = 0;
      }
      try { synthesis.resume(); }
      catch {
        paused = true;
        return false;
      }
      const current = plan[segmentIndex];
      if (currentUtterance && current) startProgressFallback(current, false);
      else if (pendingPauseCallback) scheduleNext(pendingPauseMs, pendingPauseCallback);
      return true;
    },
    cancel: () => {
      if (cancelled || completed) return;
      cancelled = true;
      discardPendingPause();
      clearProgressFrame();
      currentUtterance = null;
      try { synthesis.cancel(); } catch { /* capability disappeared */ }
    },
  };
}

function recorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function isNaturalSpeechRecordingSupported(): boolean {
  const getDisplayMedia = typeof navigator === "undefined"
    ? undefined
    : (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: MediaDevices["getDisplayMedia"];
      }).getDisplayMedia;
  return Boolean(
    isNaturalBrowserSpeechSupported()
      && typeof getDisplayMedia === "function"
      && typeof MediaRecorder !== "undefined"
      && typeof MediaStream !== "undefined"
  );
}

function abortError(): DOMException {
  return new DOMException("음성 파일 만들기를 취소했어요.", "AbortError");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const aborted = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener("abort", aborted, { once: true });
  });
}


async function assertRecordedSpeechIsAudible(blob: Blob): Promise<void> {
  if (typeof AudioContext === "undefined") return;
  const context = new AudioContext();
  try {
    let buffer: AudioBuffer;
    try {
      buffer = await context.decodeAudioData(await blob.arrayBuffer());
    } catch {
      // 일부 브라우저는 자신이 MediaRecorder로 만든 WebM/Opus도 AudioContext에서
      // 디코딩하지 못한다. 이 경우에는 크기/오디오 트랙 검사를 통과한 파일을 유지한다.
      return;
    }
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      const stride = Math.max(1, Math.floor(samples.length / 120_000));
      for (let index = 0; index < samples.length; index += stride) {
        peak = Math.max(peak, Math.abs(samples[index] ?? 0));
        if (peak >= 0.003) return;
      }
    }
    throw new Error("녹음된 탭 오디오에서 음성을 찾지 못했어요. 현재 탭과 ‘탭 오디오 공유’를 선택한 뒤 다시 시도해 주세요.");
  } finally {
    if (context.state !== "closed") await context.close().catch(() => undefined);
  }
}

/**
 * Records system TTS from a user-selected browser tab. The browser share picker
 * is mandatory: the user must choose the current tab and enable tab audio.
 */
export async function recordNaturalBrowserSpeech(
  request: NaturalSpeechRecordingRequest
): Promise<Blob> {
  if (!isNaturalSpeechRecordingSupported()) {
    throw new Error("이 브라우저는 시스템 음성 파일 만들기를 지원하지 않아요. 미리듣기 후 음성 파일 업로드를 이용해 주세요.");
  }
  if (request.signal?.aborted) throw abortError();

  const displayOptions = {
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    systemAudio: "include",
  } as unknown as DisplayMediaStreamOptions;

  const displayStream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
  const speechSession = { current: null as NaturalBrowserSpeechSession | null };
  let recorder: MediaRecorder | null = null;
  let abortHandler: (() => void) | null = null;
  const stopTracks = () => displayStream.getTracks().forEach((track) => track.stop());

  try {
    if (request.signal?.aborted) throw abortError();
    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("공유한 화면에 오디오 트랙이 없어요. 현재 탭을 선택하고 ‘탭 오디오 공유’를 켜 주세요.");
    }

    const audioStream = new MediaStream(audioTracks);
    const mimeType = recorderMimeType();
    recorder = new MediaRecorder(audioStream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 128_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const stopped = new Promise<Blob>((resolve, reject) => {
      if (!recorder) { reject(new Error("오디오 녹음기를 시작하지 못했어요.")); return; }
      recorder.onerror = () => reject(new Error("시스템 음성 오디오를 기록하지 못했어요."));
      recorder.onstop = () => {
        const type = recorder?.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size === 0) reject(new Error("녹음된 음성이 비어 있어요. 탭 오디오 공유 설정을 확인해 주세요."));
        else resolve(blob);
      };
    });

    abortHandler = () => {
      speechSession.current?.cancel();
      if (recorder?.state === "recording" || recorder?.state === "paused") recorder.stop();
      stopTracks();
    };
    request.signal?.addEventListener("abort", abortHandler, { once: true });

    recorder.start(100);
    await delay(request.leadInMs ?? 260, request.signal);
    await new Promise<void>((resolve, reject) => {
      const rejectOnAbort = () => reject(abortError());
      const complete = () => {
        request.signal?.removeEventListener("abort", rejectOnAbort);
        resolve();
      };
      const fail = (error: Error) => {
        request.signal?.removeEventListener("abort", rejectOnAbort);
        reject(error);
      };
      speechSession.current = speakNaturalBrowserSpeech({
        ...request,
        onEnd: complete,
        onError: fail,
      });
      if (!speechSession.current) {
        fail(new Error("시스템 음성을 시작하지 못했어요."));
        return;
      }
      request.signal?.addEventListener("abort", rejectOnAbort, { once: true });
    });
    await delay(request.tailMs ?? 360, request.signal);
    if (recorder.state === "recording" || recorder.state === "paused") recorder.stop();
    const blob = await stopped;
    await assertRecordedSpeechIsAudible(blob);
    return blob;
  } finally {
    if (abortHandler) request.signal?.removeEventListener("abort", abortHandler);
    speechSession.current?.cancel();
    if (recorder?.state === "recording" || recorder?.state === "paused") recorder.stop();
    stopTracks();
  }
}
