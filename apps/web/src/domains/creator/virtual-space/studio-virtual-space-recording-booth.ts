/**
 * 녹음부스 (Track 4 · 벤치마크 gap 2, 웹툰 특화)
 *
 * 웹툰 스튜디오의 성우 녹음 공간 개념. 부스 구역 = silent zone(트랙6) +
 * 예약 독점(트랙2) 조합이라는 벤치마크 구현방향을 따르되, 이 모듈은
 * 녹음 설정·반향 프리셋·세션 인터페이스까지만 다룬다.
 *
 * 범위 명시:
 * - MediaRecorder 실제 캡처: `studio-virtual-space-recording-booth-media-driver.ts`가
 *   이 모듈의 드라이버 계약으로 구현한다(WebM·반향 컨볼버·권한 오류 코드).
 * - silent zone 자동 음소·예약 독점 게이트:
 *   `studio-virtual-space-recording-booth-entry.ts`가 부스 구역+예약+조용한 구역을
 *   조합한 순수 판정을 제공하고, 패널 훅이 실제 마이크 적용을 호출자에게 위임한다.
 * - 성우 디렉팅용 메가폰 청취 모드: 트랙7 메가폰 연동 필요(미구현).
 * - WebM → 프로젝트 에셋 실제 업로드: 에셋 파이프라인 연동 필요.
 *   여기서는 에셋 기술자(descriptor)까지만 만들고, Blob과 함께 콜백으로 넘긴다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 반향 프리셋. */
export const STUDIO_REVERB_PRESETS = ["dry", "room", "hall"] as const;
export type StudioReverbPreset = (typeof STUDIO_REVERB_PRESETS)[number];

export interface StudioReverbPresetSpec {
  readonly preset: StudioReverbPreset;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 잔향 감쇠 시간(초). */
  readonly decaySec: number;
  /** wet 신호 비율 0~1. */
  readonly wetLevel: number;
}

export const STUDIO_REVERB_PRESET_SPECS: Readonly<Record<StudioReverbPreset, StudioReverbPresetSpec>> = Object.freeze({
  dry: {
    preset: "dry", labelKo: "드라이", labelEn: "Dry",
    descriptionKo: "반향 없는 깔끔한 녹음이에요.", descriptionEn: "Clean recording with no reverb.",
    decaySec: 0.1, wetLevel: 0,
  },
  room: {
    preset: "room", labelKo: "룸", labelEn: "Room",
    descriptionKo: "작은 방의 자연스러운 울림이에요.", descriptionEn: "Natural small-room ambience.",
    decaySec: 0.6, wetLevel: 0.25,
  },
  hall: {
    preset: "hall", labelKo: "홀", labelEn: "Hall",
    descriptionKo: "넓은 홀의 풍부한 울림이에요.", descriptionEn: "Rich large-hall reverb.",
    decaySec: 2.2, wetLevel: 0.45,
  },
});

/** 녹음부스 설정. */
export interface StudioRecordingBoothConfig {
  readonly boothId: string;
  readonly roomId: string;
  /** 부스 구역 (월드 좌표 px). */
  readonly zone: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly reverb: StudioReverbPreset;
  /** 최대 녹음 시간(초). */
  readonly maxDurationSec: number;
  /** 독점 사용 여부 (예약 연동 시 강제). */
  readonly exclusive: boolean;
}

/** 부스 설정 검증. */
export function validateStudioRecordingBoothConfig(config: StudioRecordingBoothConfig): readonly string[] {
  const errors: string[] = [];
  if (!config.boothId.trim()) errors.push("boothId가 비었다");
  if (!config.roomId.trim()) errors.push("roomId가 비었다");
  const zone = config.zone;
  if (![zone.x, zone.y, zone.width, zone.height].every(Number.isFinite) || zone.width <= 0 || zone.height <= 0) {
    errors.push("zone이 올바르지 않다");
  }
  if (!(STUDIO_REVERB_PRESETS as readonly string[]).includes(config.reverb)) errors.push("알 수 없는 reverb 프리셋");
  if (!Number.isFinite(config.maxDurationSec) || config.maxDurationSec <= 0 || config.maxDurationSec > 3600) {
    errors.push("maxDurationSec은 1~3600초 사이여야 한다");
  }
  return Object.freeze(errors);
}

/** 녹음 세션. */
export interface StudioRecordingSession {
  readonly id: string;
  readonly boothId: string;
  readonly reverb: StudioReverbPreset;
  readonly startedAtMs: number;
  readonly maxDurationSec: number;
}

/** 녹음 테이크 (WebM). */
export interface StudioRecordingTake {
  readonly id: string;
  readonly sessionId: string;
  readonly boothId: string;
  readonly durationSec: number;
  readonly mimeType: "audio/webm";
  readonly recordedAtMs: number;
  /** 실제 바이트는 드라이버가 보관. 모의 드라이버에서는 추정치. */
  readonly estimatedBytes: number;
}

/**
 * 녹음부스 드라이버 (플러그형).
 *
 * 실제 구현 확장 포인트:
 * - `media-recorder` 드라이버: navigator.mediaDevices.getUserMedia + MediaRecorder로
 *   WebM을 캡처. 마이크 권한·HTTPS·브라우저 호환 처리가 필요하다.
 * - `server` 드라이버: SFU/서버 녹화로 위임.
 */
export interface StudioRecordingBoothDriver {
  readonly id: string;
  startBoothSession(config: StudioRecordingBoothConfig): Promise<StudioRecordingSession> | StudioRecordingSession;
  stopBoothSession(sessionId: string): Promise<StudioRecordingTake> | StudioRecordingTake;
  cancelBoothSession(sessionId: string): Promise<void> | void;
}

let scriptedSessionCounter = 0;

/**
 * 스크립트/모의 드라이버. 실제 캡처 없이 세션 흐름을 시뮬레이션한다.
 * 결정적이지 않은 시간은 주입받은 now()로만 읽는다.
 */
export function createScriptedRecordingBoothDriver(now: () => number = () => Date.now()): StudioRecordingBoothDriver {
  const sessions = new Map<string, StudioRecordingSession>();
  return {
    id: "scripted",
    startBoothSession(config: StudioRecordingBoothConfig): StudioRecordingSession {
      const errors = validateStudioRecordingBoothConfig(config);
      if (errors.length > 0) throw new Error(`부스 설정 오류: ${errors.join(", ")}`);
      scriptedSessionCounter += 1;
      const session: StudioRecordingSession = {
        id: `booth-session-${scriptedSessionCounter}`,
        boothId: config.boothId,
        reverb: config.reverb,
        startedAtMs: now(),
        maxDurationSec: config.maxDurationSec,
      };
      sessions.set(session.id, session);
      return session;
    },
    stopBoothSession(sessionId: string): StudioRecordingTake {
      const session = sessions.get(sessionId);
      if (!session) throw new Error(`세션을 찾을 수 없다: ${sessionId}`);
      sessions.delete(sessionId);
      const stoppedAt = now();
      const durationSec = Math.max(1, Math.round((stoppedAt - session.startedAtMs) / 1000));
      return {
        id: `take-${session.id}`,
        sessionId: session.id,
        boothId: session.boothId,
        durationSec: Math.min(durationSec, session.maxDurationSec),
        mimeType: "audio/webm",
        recordedAtMs: stoppedAt,
        estimatedBytes: durationSec * 16000,
      };
    },
    cancelBoothSession(sessionId: string): void {
      sessions.delete(sessionId);
    },
  };
}

/** 프로젝트 에셋 기술자 (실제 업로드는 에셋 파이프라인 연동이 필요). */
export interface StudioProjectAudioAssetDescriptor {
  readonly kind: "audio";
  readonly projectId: string;
  readonly takeId: string;
  readonly boothId: string;
  readonly name: string;
  readonly mimeType: "audio/webm";
  readonly durationSec: number;
  readonly source: "recording-booth";
}

/** 테이크를 프로젝트 에셋 기술자로 변환한다. */
export function studioRecordingTakeToProjectAsset(
  take: StudioRecordingTake,
  projectId: string,
): StudioProjectAudioAssetDescriptor {
  if (!projectId.trim()) throw new Error("projectId가 비었다");
  const date = new Date(take.recordedAtMs);
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return {
    kind: "audio",
    projectId,
    takeId: take.id,
    boothId: take.boothId,
    name: `녹음부스 테이크 ${stamp}`,
    mimeType: "audio/webm",
    durationSec: take.durationSec,
    source: "recording-booth",
  };
}

/** 점이 부스 구역 안에 있는지. */
export function studioRecordingBoothContains(
  config: StudioRecordingBoothConfig,
  point: StudioVirtualSpacePoint,
): boolean {
  const zone = config.zone;
  return point.x >= zone.x && point.x <= zone.x + zone.width
    && point.y >= zone.y && point.y <= zone.y + zone.height;
}
