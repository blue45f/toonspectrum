/**
 * Bot 시점 녹화 상태 기계 (D-6).
 *
 * 회의실·검수실 등 특정 구역에 고정 배치된 Bot 아바타의 시점에서
 * 그 구역의 화면+음성을 녹화한다는 개념의 순수 상태 기계다.
 *
 * 범위 주의: 이 모듈은 "클라이언트 녹화 준비" 수준만 다룬다. MediaRecorder 기반
 * 실제 캡처 스트림 연결은 후속 작업에서 연동하며, 서버 녹화는 비용 이슈로
 * 1차 범위에서 제외한다. 상태 전이·세션 메타·매니페스트 생성까지만 제공한다.
 */

export type StudioBotRecordingStatus = "idle" | "recording" | "paused";

export type StudioBotRecordingQuality = "low" | "medium" | "high";

export const STUDIO_BOT_RECORDING_QUALITIES: readonly StudioBotRecordingQuality[] = ["low", "medium", "high"];

export interface StudioBotRecordingZone {
  readonly id: string;
  readonly name: string;
}

export interface StudioBotRecorderOptions {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly quality: StudioBotRecordingQuality;
}

export interface StudioBotRecordingState {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly quality: StudioBotRecordingQuality;
  readonly status: StudioBotRecordingStatus;
  readonly startedAt: number | null;
  readonly pausedAt: number | null;
  /** 일시정지 누적 시간(ms). 최종 길이는 녹화 구간에서 제외한다. */
  readonly pausedMs: number;
  readonly participantCount: number;
}

export interface StudioBotRecording {
  readonly id: string;
  readonly title: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly quality: StudioBotRecordingQuality;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly participantCount: number;
  readonly createdAt: number;
}

export interface StudioBotRecordingManifestEntry {
  readonly title: string;
  readonly zoneName: string;
  readonly durationMs: number;
  readonly createdAt: number;
}

const ZONE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/iu;

function isValidZoneId(value: string): boolean {
  return ZONE_ID_PATTERN.test(value);
}

function isValidQuality(value: string): value is StudioBotRecordingQuality {
  return (STUDIO_BOT_RECORDING_QUALITIES as readonly string[]).includes(value);
}

function isValidEpoch(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function normalizeParticipantCount(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 0) return 0;
  return value;
}

/**
 * Bot 녹화기를 생성한다. 구역 id/이름이 유효하지 않으면 RangeError를 던진다
 * (녹화물 id·매니페스트의 식별자를 오염시키지 않기 위함).
 */
export function createBotRecorder(options: StudioBotRecorderOptions): StudioBotRecordingState {
  if (!isValidZoneId(options.zoneId)) {
    throw new RangeError(`Invalid bot recording zone id: ${options.zoneId}`);
  }
  const zoneName = options.zoneName.trim();
  if (zoneName.length === 0) {
    throw new RangeError("Bot recording zone name must not be empty");
  }
  if (!isValidQuality(options.quality)) {
    throw new RangeError(`Invalid bot recording quality: ${options.quality}`);
  }
  return Object.freeze({
    zoneId: options.zoneId,
    zoneName,
    quality: options.quality,
    status: "idle" as const,
    startedAt: null,
    pausedAt: null,
    pausedMs: 0,
    participantCount: 0,
  });
}

/** 녹화를 시작한다. idle에서만 허용되며, 그 외 상태에서는 현재 상태를 그대로 반환한다. */
export function startBotRecording(
  state: StudioBotRecordingState,
  options: { readonly startedAt: number; readonly participantCount?: number },
): StudioBotRecordingState {
  if (state.status !== "idle") return state;
  if (!isValidEpoch(options.startedAt)) return state;
  return Object.freeze({
    ...state,
    status: "recording" as const,
    startedAt: options.startedAt,
    pausedAt: null,
    pausedMs: 0,
    participantCount: normalizeParticipantCount(options.participantCount),
  });
}

/** 녹화를 일시정지한다. recording에서만 허용되며, 그 외 상태에서는 현재 상태를 그대로 반환한다. */
export function pauseBotRecording(
  state: StudioBotRecordingState,
  options: { readonly pausedAt: number },
): StudioBotRecordingState {
  if (state.status !== "recording" || state.startedAt === null) return state;
  if (!isValidEpoch(options.pausedAt) || options.pausedAt < state.startedAt) return state;
  return Object.freeze({ ...state, status: "paused" as const, pausedAt: options.pausedAt });
}

/** 녹화를 재개한다. paused에서만 허용되며, 그 외 상태에서는 현재 상태를 그대로 반환한다. */
export function resumeBotRecording(
  state: StudioBotRecordingState,
  options: { readonly resumedAt: number },
): StudioBotRecordingState {
  if (state.status !== "paused" || state.pausedAt === null) return state;
  if (!isValidEpoch(options.resumedAt) || options.resumedAt < state.pausedAt) return state;
  return Object.freeze({
    ...state,
    status: "recording" as const,
    pausedAt: null,
    pausedMs: state.pausedMs + (options.resumedAt - state.pausedAt),
  });
}

export interface StudioBotRecordingStopResult {
  readonly state: StudioBotRecordingState;
  /** idle에서 중지하면 세션이 생성되지 않으므로 null이다. */
  readonly session: StudioBotRecording | null;
}

/**
 * 녹화를 중지하고 녹화물 세션 메타를 생성한다. recording/paused에서만 허용되며,
 * idle에서는 현재 상태를 그대로 반환하고 세션을 만들지 않는다.
 * 중지된 녹화기는 같은 구역 설정으로 idle로 되돌아가 다음 녹화를 준비한다.
 */
export function stopBotRecording(
  state: StudioBotRecordingState,
  options: { readonly stoppedAt: number; readonly title: string },
): StudioBotRecordingStopResult {
  if (state.status === "idle" || state.startedAt === null) {
    return { state, session: null };
  }
  if (!isValidEpoch(options.stoppedAt)) return { state, session: null };
  // 일시정지 상태에서 중지하면 마지막 일시정지 시점을 유효 종료 시점으로 본다.
  const effectiveEnd = state.status === "paused" && state.pausedAt !== null ? state.pausedAt : options.stoppedAt;
  if (effectiveEnd < state.startedAt) return { state, session: null };
  const durationMs = Math.max(0, effectiveEnd - state.startedAt - state.pausedMs);
  const title = options.title.trim();
  const session: StudioBotRecording = Object.freeze({
    id: `bot-recording-${state.zoneId}-${state.startedAt}`,
    title: title.length > 0 ? title : state.zoneName,
    zoneId: state.zoneId,
    zoneName: state.zoneName,
    quality: state.quality,
    startedAt: state.startedAt,
    durationMs,
    participantCount: state.participantCount,
    createdAt: options.stoppedAt,
  });
  const nextState: StudioBotRecordingState = Object.freeze({
    ...state,
    status: "idle" as const,
    startedAt: null,
    pausedAt: null,
    pausedMs: 0,
    participantCount: 0,
  });
  return { state: nextState, session };
}

/**
 * 녹화물 매니페스트를 만든다. 목록 UI에 필요한 제목/구역/길이/생성 시각만 추린다.
 */
export function buildBotRecordingManifest(
  recordings: readonly StudioBotRecording[],
): readonly StudioBotRecordingManifestEntry[] {
  return recordings.map((recording) =>
    Object.freeze({
      title: recording.title,
      zoneName: recording.zoneName,
      durationMs: recording.durationMs,
      createdAt: recording.createdAt,
    }),
  );
}

/** 녹화 길이를 사람이 읽기 쉬운 형태로 포맷한다 (예: "01:23", "1:02:03"). */
export function formatBotRecordingDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
