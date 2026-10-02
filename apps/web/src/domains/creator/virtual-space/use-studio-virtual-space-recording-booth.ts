/**
 * 녹음부스 React 바인딩 (트랙 B 고도화).
 *
 * 입장 게이트(조용한 구역+예약 독점) · 반향 프리셋 · MediaRecorder 세션 ·
 * 프로젝트 에셋 편입을 하나의 상태로 묶는다.
 *
 * - 부스 안에서는 `useStudioVirtualSpaceSilentZone`으로 음성 채팅 마이크
 *   자동 음소를 계산하고, 실제 장치 적용은 `onEffectiveMicMuted` 콜백으로
 *   호출자(페이지)에게 위임한다. 녹음 자체는 드라이버의 별도 스트림이라
 *   채팅 음소와 충돌하지 않는다.
 * - 게스트도 둘러보기·녹음이 가능하다. 프로젝트 에셋 편입만 로그인
 *   nudge(`onRequireLogin`)로 분기한다 — 저장 시점 로그인 유도 원칙.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  studioRecordingTakeToProjectAsset,
  type StudioProjectAudioAssetDescriptor,
  type StudioRecordingBoothConfig,
  type StudioRecordingBoothDriver,
  type StudioRecordingSession,
  type StudioRecordingTake,
  type StudioReverbPreset,
} from "./studio-virtual-space-recording-booth";
import {
  recordingBoothSilentZone,
  resolveStudioRecordingBoothAccess,
  type StudioRecordingBoothAccess,
} from "./studio-virtual-space-recording-booth-entry";
import {
  createMediaRecorderBoothDriver,
  StudioBoothMediaError,
  type StudioRecordingBoothMediaDriver,
} from "./studio-virtual-space-recording-booth-media-driver";
import type { StudioSilentZone } from "./studio-virtual-space-silent-zone";
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";
import { useStudioVirtualSpaceSilentZone } from "./use-studio-virtual-space-silent-zone";

const EMPTY_OFFICE_ZONES: readonly never[] = Object.freeze([]);
/** 예약 상태가 바뀌는 경계(시작·종료)를 놓치지 않기 위한 게이트 재평가 주기. */
const GATE_TICK_MS = 30_000;

export interface StudioVirtualSpaceRecordedTake {
  readonly take: StudioRecordingTake;
  /** 실제 녹음 Blob. 모의 드라이버처럼 Blob이 없으면 null. */
  readonly blob: Blob | null;
  readonly addedToProject: boolean;
}

export interface UseStudioVirtualSpaceRecordingBoothInput {
  readonly config: StudioRecordingBoothConfig;
  readonly bookings: readonly StudioSpaceBooking[];
  readonly position: StudioVirtualSpacePoint | null;
  /** 예약자 명단과 대조할 현재 사용자 표시 이름. */
  readonly userName?: string | null;
  /** 호출자가 알고 있는 사용자 마이크 음소 상태. */
  readonly micMutedByUser: boolean;
  /** 에셋 편입 대상 프로젝트. 없으면 편입 대신 안내만 한다. */
  readonly projectId?: string | null;
  readonly isGuest?: boolean;
  /** 테스트·특수 환경용 드라이버 주입. 기본은 MediaRecorder 드라이버. */
  readonly driver?: StudioRecordingBoothDriver;
  /** 테스트용 현재 시각 고정. */
  readonly nowMs?: number;
  readonly onRequireLogin?: () => void;
  readonly onProjectAsset?: (descriptor: StudioProjectAudioAssetDescriptor, blob: Blob | null) => void;
  /** 실제 마이크에 적용할 음소 값. 호출자가 장치 제어를 수행한다. */
  readonly onEffectiveMicMuted?: (muted: boolean) => void;
}

export interface StudioVirtualSpaceRecordingBoothBinding {
  readonly access: StudioRecordingBoothAccess;
  readonly silentZone: StudioSilentZone;
  /** 부스 조용한 구역 안에 있어 채팅 마이크가 음소돼야 하는지. */
  readonly mutedByZone: boolean;
  readonly effectiveMuted: boolean;
  readonly reverb: StudioReverbPreset;
  readonly setReverb: (preset: StudioReverbPreset) => void;
  readonly recording: boolean;
  readonly elapsedSec: number;
  readonly takes: readonly StudioVirtualSpaceRecordedTake[];
  /** 오류 코드(드라이버 코드·게이트 상태·project-required·unknown). */
  readonly error: string | null;
  /** 게스트가 에셋 편입을 눌러 로그인 안내가 필요한 상태. */
  readonly loginNudge: boolean;
  readonly startRecording: () => Promise<void>;
  readonly stopRecording: () => Promise<void>;
  readonly cancelRecording: () => Promise<void>;
  readonly addTakeToProject: (takeId: string) => void;
}

function isMediaDriver(driver: StudioRecordingBoothDriver): driver is StudioRecordingBoothMediaDriver {
  return (driver as StudioRecordingBoothMediaDriver).capture === true;
}

function errorCodeOf(reason: unknown): string {
  if (reason instanceof StudioBoothMediaError) return reason.code;
  if (reason instanceof Error && reason.message.includes("찾을 수 없다")) return "session-not-found";
  return "unknown";
}

export function useStudioVirtualSpaceRecordingBooth(
  input: UseStudioVirtualSpaceRecordingBoothInput,
): StudioVirtualSpaceRecordingBoothBinding {
  const {
    config, bookings, position, userName, micMutedByUser,
    projectId, isGuest = false, onRequireLogin, onProjectAsset, onEffectiveMicMuted,
  } = input;

  const driver = useMemo<StudioRecordingBoothDriver>(
    () => input.driver ?? createMediaRecorderBoothDriver(),
    [input.driver],
  );

  const silentZone = useMemo(() => recordingBoothSilentZone(config), [config]);
  const tileZones = useMemo(() => [silentZone], [silentZone]);
  const silent = useStudioVirtualSpaceSilentZone({
    officeZones: EMPTY_OFFICE_ZONES,
    tileZones,
    position,
    micMutedByUser,
  });

  const [nowMs, setNowMs] = useState(() => input.nowMs ?? Date.now());
  useEffect(() => {
    if (input.nowMs !== undefined) return;
    const timer = setInterval(() => setNowMs(Date.now()), GATE_TICK_MS);
    return () => clearInterval(timer);
  }, [input.nowMs]);

  const access = useMemo(
    () => resolveStudioRecordingBoothAccess({ config, bookings, position, atMs: nowMs, userName }),
    [config, bookings, position, nowMs, userName],
  );

  const [reverb, setReverb] = useState<StudioReverbPreset>(config.reverb);
  const [session, setSession] = useState<StudioRecordingSession | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [takes, setTakes] = useState<readonly StudioVirtualSpaceRecordedTake[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loginNudge, setLoginNudge] = useState(false);

  const sessionRef = useRef<StudioRecordingSession | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const driverRef = useRef(driver);
  driverRef.current = driver;

  // 언마운트 시 녹음 중이면 장치를 정리한다.
  useEffect(() => () => {
    const current = sessionRef.current;
    if (current) void driverRef.current.cancelBoothSession(current.id);
  }, []);

  // 구역 음소를 실제 마이크 적용 콜백으로 전달(값이 바뀔 때만).
  const lastMutedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastMutedRef.current === silent.effectiveMuted) return;
    lastMutedRef.current = silent.effectiveMuted;
    onEffectiveMicMuted?.(silent.effectiveMuted);
  }, [silent.effectiveMuted, onEffectiveMicMuted]);

  const stopRecording = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      if (isMediaDriver(driver)) {
        const { take, blob } = await driver.stopBoothSessionWithBlob(current.id);
        setTakes((previous) => [...previous, { take, blob, addedToProject: false }]);
      } else {
        const take = await driver.stopBoothSession(current.id);
        setTakes((previous) => [...previous, { take, blob: null, addedToProject: false }]);
      }
    } catch (reason) {
      setError(errorCodeOf(reason));
    } finally {
      setSession(null);
      setElapsedSec(0);
    }
  }, [driver]);

  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  // 경과 시간 표시 + 최대 시간 도달 시 자동 종료.
  useEffect(() => {
    if (!session) return;
    const update = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - session.startedAtMs) / 1000));
      setElapsedSec(elapsed);
      if (elapsed >= session.maxDurationSec) void stopRecordingRef.current();
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [session]);

  const startRecording = useCallback(async () => {
    if (sessionRef.current) return;
    setError(null);
    setLoginNudge(false);
    if (!access.canRecord) {
      setError(access.state);
      return;
    }
    try {
      const next = await driver.startBoothSession({ ...config, reverb });
      setSession(next);
      setElapsedSec(0);
    } catch (reason) {
      setError(errorCodeOf(reason));
    }
  }, [access, config, driver, reverb]);

  const cancelRecording = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      await driver.cancelBoothSession(current.id);
    } catch {
      // 취소 실패는 세션 정리로 간주한다(장치는 드라이버가 정리).
    }
    setSession(null);
    setElapsedSec(0);
  }, [driver]);

  const addTakeToProject = useCallback((takeId: string) => {
    const entry = takes.find((item) => item.take.id === takeId);
    if (!entry || entry.addedToProject) return;
    if (isGuest) {
      setLoginNudge(true);
      onRequireLogin?.();
      return;
    }
    if (!projectId) {
      setError("project-required");
      return;
    }
    const descriptor = studioRecordingTakeToProjectAsset(entry.take, projectId);
    onProjectAsset?.(descriptor, entry.blob);
    setTakes((previous) => previous.map((item) =>
      item.take.id === takeId ? { ...item, addedToProject: true } : item));
  }, [takes, isGuest, onRequireLogin, onProjectAsset, projectId]);

  return {
    access,
    silentZone,
    mutedByZone: silent.mutedByZone,
    effectiveMuted: silent.effectiveMuted,
    reverb,
    setReverb,
    recording: session !== null,
    elapsedSec,
    takes,
    error,
    loginNudge,
    startRecording,
    stopRecording,
    cancelRecording,
    addTakeToProject,
  };
}
