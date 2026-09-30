/**
 * studio-timelapse.ts
 *
 * 드로잉 타임랩스 녹화·재생 모델 (DRAWING-BENCHMARK.md §4 설계 구현).
 * ibisPaint/CSP/Procreate의 타임랩스 원리를 재해석: 실제 캔버스 캡처·인코딩은
 * UI 레이어(훅/MediaRecorder)에서 연결하고, 이 모듈은 DOM 무관 세션 모델과
 * 타임라인·메타데이터(크기 추정, 가이드)만 제공한다.
 *
 * 모델:
 * - TimelapseStroke: id + 색상/굵기 + 샘플(시간·좌표·필압) + 시작/종료 시각
 * - 세션: 불변 스냅샷 (record/end 로 새 스냅샷 반환)
 * - 재생: 속도 배율 1x/2x/4x/8x, 스크럽(getVisibleStrokes), 일시정지/시크는 UI 상태
 * - 기본 최대 5분 (ibisPaint와 동일), 설정 가능
 */

export interface TimelapseStrokeSample {
  /** 세션 시작 기준 ms. */
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  /** 0..1, 선택. */
  readonly pressure?: number;
}

export interface TimelapseStroke {
  readonly id: string;
  /** CSS 색상 문자열 (예: "#1a1a2e"). */
  readonly color: string;
  /** px. */
  readonly width: number;
  /** 세션 시작 기준 ms. */
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly samples: ReadonlyArray<TimelapseStrokeSample>;
}

export type TimelapsePlaybackRate = 1 | 2 | 4 | 8;

export const TIMELAPSE_PLAYBACK_RATES: ReadonlyArray<TimelapsePlaybackRate> =
  Object.freeze([1, 2, 4, 8]);

/** 기본 최대 녹화 길이 5분 (ibisPaint와 동일). */
export const TIMELAPSE_DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;

export const TIMELAPSE_LIMITS = {
  maxStrokes: 20000,
  maxSamplesPerStroke: 5000,
  minSampleIntervalMs: 1,
} as const;

export interface TimelapseSessionOptions {
  readonly maxDurationMs?: number;
  /** 세션 시작 기준시각. 기본 0 (상대 시각). */
  readonly startedAtMs?: number;
}

export interface TimelapseSession {
  readonly strokes: ReadonlyArray<TimelapseStroke>;
  readonly startedAtMs: number;
  readonly maxDurationMs: number;
  /** endTimelapseSession 호출 후 설정. */
  readonly endedAtMs: number | null;
}

/* ------------------------------------------------------------------ */
/* 생성·기록                                                             */
/* ------------------------------------------------------------------ */

export function createTimelapseSession(
  options: TimelapseSessionOptions = {},
): TimelapseSession {
  const maxDurationMs = Math.max(
    10_000,
    Math.floor(options.maxDurationMs ?? TIMELAPSE_DEFAULT_MAX_DURATION_MS),
  );
  return {
    strokes: Object.freeze([]),
    startedAtMs: options.startedAtMs ?? 0,
    maxDurationMs,
    endedAtMs: null,
  };
}

export function validateTimelapseStroke(
  stroke: TimelapseStroke,
): { readonly ok: boolean; readonly errors: ReadonlyArray<string> } {
  const errors: string[] = [];
  if (!stroke.id || stroke.id.trim().length === 0) {
    errors.push("스트로크 id가 필요합니다.");
  }
  if (!Number.isFinite(stroke.width) || stroke.width <= 0) {
    errors.push("스트로크 굵기는 0보다 커야 합니다.");
  }
  if (stroke.samples.length === 0) {
    errors.push("샘플이 비어 있습니다.");
  }
  if (stroke.samples.length > TIMELAPSE_LIMITS.maxSamplesPerStroke) {
    errors.push(`샘플이 너무 많습니다 (최대 ${TIMELAPSE_LIMITS.maxSamplesPerStroke}).`);
  }
  if (stroke.startedAtMs > stroke.endedAtMs) {
    errors.push("시작 시각이 종료 시각보다 늦습니다.");
  }
  let prev = -Infinity;
  for (const s of stroke.samples) {
    if (!Number.isFinite(s.timeMs) || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      errors.push("샘플 좌표/시각이 유효하지 않습니다.");
      break;
    }
    if (s.timeMs < prev) {
      errors.push("샘플 시각이 단조 증가하지 않습니다.");
      break;
    }
    prev = s.timeMs;
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/**
 * 스트로크를 기록한다. 최대 길이를 초과한 샘플은 잘리고, 세션이 끝났으면 그대로 반환.
 * 유효하지 않은 스트로크는 무시하고 원본 세션을 반환한다.
 */
export function recordStroke(
  session: TimelapseSession,
  stroke: TimelapseStroke,
): TimelapseSession {
  if (session.endedAtMs !== null) return session;
  if (session.strokes.length >= TIMELAPSE_LIMITS.maxStrokes) return session;
  const validation = validateTimelapseStroke(stroke);
  if (!validation.ok) return session;
  if (stroke.startedAtMs > session.maxDurationMs) return session;

  const clamped: TimelapseStroke = {
    ...stroke,
    endedAtMs: Math.min(stroke.endedAtMs, session.maxDurationMs),
    samples: Object.freeze(
      stroke.samples.filter((s) => s.timeMs <= session.maxDurationMs),
    ),
  };
  if (clamped.samples.length === 0) return session;
  return {
    ...session,
    strokes: Object.freeze([...session.strokes, clamped]),
  };
}

export function endTimelapseSession(
  session: TimelapseSession,
  endedAtMs: number,
): TimelapseSession {
  if (session.endedAtMs !== null) return session;
  const clamped = Math.max(0, Math.min(session.maxDurationMs, endedAtMs));
  return { ...session, endedAtMs: clamped };
}

/** 녹화 길이(ms). 종료 전이면 마지막 스트로크 종료 시각. */
export function getTimelapseDurationMs(session: TimelapseSession): number {
  if (session.endedAtMs !== null) return session.endedAtMs;
  let last = 0;
  for (const s of session.strokes) {
    if (s.endedAtMs > last) last = s.endedAtMs;
  }
  return last;
}

/* ------------------------------------------------------------------ */
/* 재생 모델                                                              */
/* ------------------------------------------------------------------ */

/**
 * 재생 시각(녹화 시간축 ms)에 표시할 스트로크 목록 — 스크럽/시크용.
 * 진행 중인 스트로크는 해당 시각까지의 샘플만 잘라서 반환한다.
 */
export function getVisibleStrokes(
  session: TimelapseSession,
  playbackTimeMs: number,
): TimelapseStroke[] {
  // 녹화 시작 이전 시각 → 빈 화면
  if (playbackTimeMs < 0) return [];
  const t = playbackTimeMs;
  const visible: TimelapseStroke[] = [];
  for (const stroke of session.strokes) {
    if (stroke.startedAtMs > t) continue;
    if (stroke.endedAtMs <= t) {
      visible.push(stroke);
      continue;
    }
    const samples = stroke.samples.filter((s) => s.timeMs <= t);
    if (samples.length > 0) {
      visible.push({ ...stroke, samples, endedAtMs: t });
    }
  }
  return visible;
}

/** 재생 시각에 그려진 진행률 0..1. */
export function getTimelapseProgress(
  session: TimelapseSession,
  playbackTimeMs: number,
): number {
  const duration = getTimelapseDurationMs(session);
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(1, playbackTimeMs / duration));
}

export interface TimelapsePlaybackTick {
  /** 녹화 시간축 상의 재생 위치(ms). */
  readonly playbackTimeMs: number;
  /** 실제 경과(real) 시간 기준 다음 프레임까지의 대기 ms. */
  readonly frameDelayMs: number;
  readonly finished: boolean;
}

/**
 * 재생 틱 계산: rate 배율로 녹화 시간축을 앞당긴다.
 * UI는 requestAnimationFrame/setInterval로 이 함수를 반복 호출한다.
 */
export function advanceTimelapsePlayback(
  session: TimelapseSession,
  currentPlaybackMs: number,
  rate: TimelapsePlaybackRate,
  realDeltaMs: number,
): TimelapsePlaybackTick {
  const duration = getTimelapseDurationMs(session);
  const next = Math.min(duration, currentPlaybackMs + realDeltaMs * rate);
  return {
    playbackTimeMs: next,
    frameDelayMs: Math.max(1, Math.round(1000 / 30 / rate)),
    finished: next >= duration,
  };
}

/* ------------------------------------------------------------------ */
/* 메타데이터: 크기 추정·내보내기 가이드                                    */
/* ------------------------------------------------------------------ */

export interface TimelapseExportEstimateOptions {
  readonly fps?: number;
  readonly width?: number;
  readonly height?: number;
  /** WebM(VP9) 가정 초당 비트레이트. 기본 2.5Mbps. */
  readonly bitsPerSecond?: number;
}

export interface TimelapseExportEstimate {
  readonly bytes: number;
  readonly humanReadable: string;
  readonly durationMs: number;
  readonly frameCount: number;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/**
 * WebM 내보내기 파일 크기 추정.
 * 프레임 수 × 해상도가 아니라 비트레이트 기반 (인코딩 결과에 가까움).
 */
export function estimateTimelapseExportSize(
  session: TimelapseSession,
  options: TimelapseExportEstimateOptions = {},
): TimelapseExportEstimate {
  const fps = Math.max(1, Math.min(60, Math.floor(options.fps ?? 30)));
  const durationMs = getTimelapseDurationMs(session);
  const durationSec = durationMs / 1000;
  const frameCount = Math.ceil(durationSec * fps);
  const bitsPerSecond = options.bitsPerSecond ?? 2_500_000;
  const bytes = Math.round((durationSec * bitsPerSecond) / 8);
  return {
    bytes,
    humanReadable: formatBytes(bytes),
    durationMs,
    frameCount,
  };
}

/** 세션 통계 (UI 표시용). */
export function getTimelapseStats(session: TimelapseSession): {
  readonly strokeCount: number;
  readonly sampleCount: number;
  readonly durationMs: number;
  readonly isEnded: boolean;
} {
  let sampleCount = 0;
  for (const s of session.strokes) sampleCount += s.samples.length;
  return {
    strokeCount: session.strokes.length,
    sampleCount,
    durationMs: getTimelapseDurationMs(session),
    isEnded: session.endedAtMs !== null,
  };
}

/**
 * MediaRecorder 기반 WebM 내보내기 가이드 (단계별 텍스트).
 * 실제 인코딩 구현은 UI 레이어에서 이 가이드를 따라 연결한다.
 * locale: "ko" | "en".
 */
export function getMediaRecorderExportGuide(locale: "ko" | "en"): ReadonlyArray<string> {
  if (locale === "en") {
    return Object.freeze([
      "1. Create an offscreen canvas at the export resolution (e.g. 1080x1920 for webtoon).",
      "2. Replay the session with getVisibleStrokes() at the target fps, drawing each frame to the canvas.",
      "3. const stream = canvas.captureStream(fps); const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 2_500_000 });",
      "4. Collect chunks via rec.ondataavailable, then rec.start() before replay and rec.stop() after the last frame.",
      "5. Assemble chunks into a Blob with type 'video/webm' and offer it as a download or share it.",
      "6. Tip: pause real-time drawing during export so captureStream frames stay in sync with the timeline.",
    ]);
  }
  return Object.freeze([
    "1. 내보내기 해상도(예: 웹툰용 1080x1920)의 오프스크린 캔버스를 만든다.",
    "2. 목표 fps로 getVisibleStrokes()를 호출해 세션을 재생하며 매 프레임을 캔버스에 그린다.",
    "3. const stream = canvas.captureStream(fps); const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 2_500_000 });",
    "4. rec.ondataavailable으로 청크를 모으고, 재생 시작 전 rec.start(), 마지막 프레임 후 rec.stop()을 호출한다.",
    "5. 청크를 type 'video/webm' Blob으로 합쳐 다운로드·공유한다.",
    "6. 팁: 내보내기 중에는 실시간 그리기를 멈춰 captureStream 프레임과 타임라인을 동기화한다.",
  ]);
}

/** mm:ss.mmm 형태의 시각 표기. */
export function formatTimelapseTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}
