/**
 * 녹음부스 MediaRecorder 드라이버 (트랙 B 고도화).
 *
 * 기존 `StudioRecordingBoothDriver` 계약을 실제 마이크 캡처로 구현한다.
 * - `getUserMedia({ audio })` + `MediaRecorder`로 WebM을 캡처한다
 *   (`PromoMicrophoneRecorder`와 같은 권한·정리 패턴).
 * - 반향 프리셋은 Web Audio `ConvolverNode`에 절차적으로 생성한 임펄스를
 *   걸어 적용한다(외부 에셋 없음). 드라이(dry)는 wet 0이라 우회한다.
 * - 브라우저가 WebM 녹음을 지원하지 않으면 추측으로 다른 포맷을 만들지 않고
 *   `recorder-unsupported` 코드로 실패한다 — 테이크의 `audio/webm` 계약 유지.
 *
 * 의존성(getUserMedia·MediaRecorder·AudioContext)은 옵션으로 주입할 수 있어
 * 단위 테스트에서 가짜로 대체한다. 기본값은 호출 시점에 전역에서 읽는다.
 */

import {
  STUDIO_REVERB_PRESET_SPECS,
  validateStudioRecordingBoothConfig,
  type StudioRecordingBoothConfig,
  type StudioRecordingBoothDriver,
  type StudioRecordingSession,
  type StudioRecordingTake,
} from "./studio-virtual-space-recording-booth";

export type StudioBoothMediaErrorCode =
  | "recorder-unsupported"
  | "mic-unavailable"
  | "mic-permission-denied"
  | "empty-recording"
  | "already-recording";

/** 코드로 구분되는 녹음 실패. 패널이 코드를 i18n 문구로 바꾼다. */
export class StudioBoothMediaError extends Error {
  readonly code: StudioBoothMediaErrorCode;

  constructor(code: StudioBoothMediaErrorCode, message: string) {
    super(message);
    this.name = "StudioBoothMediaError";
    this.code = code;
  }
}

/** 테이크와 실제 녹음 Blob을 함께 돌려주는 확장 드라이버. */
export interface StudioRecordingBoothMediaDriver extends StudioRecordingBoothDriver {
  readonly capture: true;
  stopBoothSessionWithBlob(sessionId: string): Promise<{ readonly take: StudioRecordingTake; readonly blob: Blob }>;
}

export interface StudioMediaRecorderBoothDriverOptions {
  /** 시각 주입(테스트용). 기본은 Date.now. */
  readonly now?: () => number;
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly isTypeSupported?: (mimeType: string) => boolean;
  readonly createRecorder?: (stream: MediaStream, mimeType: string) => MediaRecorder;
  /** null을 돌려주면 반향 없이 원본 마이크 스트림으로 녹음한다. */
  readonly createAudioContext?: () => AudioContext | null;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm"] as const;

/** WebM 녹음 MIME을 고른다. 지원하지 않으면 null. */
export function pickBoothRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  for (const candidate of MIME_CANDIDATES) {
    if (isTypeSupported(candidate)) return candidate;
  }
  return null;
}

/**
 * 반향 임펄스를 절차적으로 만든다. 화이트 노이즈에 지수 감쇠를 곱한 형태라
 * 길이(sampleRate × decaySec)와 채널 수만으로 결정적으로 검증할 수 있다.
 */
export function createReverbImpulseBuffer(context: BaseAudioContext, decaySec: number): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * Math.max(0.05, decaySec)));
  const buffer = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const envelope = Math.pow(1 - index / length, 2.5);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (!mediaDevices?.getUserMedia) {
    return Promise.reject(new StudioBoothMediaError("mic-unavailable", "마이크를 사용할 수 없어요."));
  }
  return mediaDevices.getUserMedia(constraints);
}

function defaultIsTypeSupported(mimeType: string): boolean {
  return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType);
}

function defaultCreateRecorder(stream: MediaStream, mimeType: string): MediaRecorder {
  if (typeof MediaRecorder === "undefined") {
    throw new StudioBoothMediaError("recorder-unsupported", "이 브라우저는 WebM 녹음을 지원하지 않아요.");
  }
  return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 });
}

function defaultCreateAudioContext(): AudioContext | null {
  const ctor = globalThis.AudioContext
    ?? (globalThis as unknown as { readonly webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) return null;
  try {
    return new ctor();
  } catch {
    return null;
  }
}

interface ActiveCapture {
  readonly session: StudioRecordingSession;
  readonly micStream: MediaStream;
  readonly recorder: MediaRecorder;
  readonly audioContext: AudioContext | null;
  readonly chunks: Blob[];
  cancelled: boolean;
  stopPromise: Promise<{ readonly take: StudioRecordingTake; readonly blob: Blob }> | null;
  resolveStop: ((value: { readonly take: StudioRecordingTake; readonly blob: Blob }) => void) | null;
  rejectStop: ((reason: unknown) => void) | null;
}

let mediaSessionCounter = 0;

/**
 * MediaRecorder 기반 녹음부스 드라이버를 만든다.
 * 한 드라이버는 동시에 하나의 세션만 캡처한다.
 */
export function createMediaRecorderBoothDriver(
  options: StudioMediaRecorderBoothDriverOptions = {},
): StudioRecordingBoothMediaDriver {
  const now = options.now ?? (() => Date.now());
  const getUserMedia = options.getUserMedia ?? defaultGetUserMedia;
  const isTypeSupported = options.isTypeSupported ?? defaultIsTypeSupported;
  const createRecorder = options.createRecorder ?? defaultCreateRecorder;
  const createAudioContext = options.createAudioContext ?? defaultCreateAudioContext;

  let active: ActiveCapture | null = null;

  const cleanup = (capture: ActiveCapture) => {
    capture.micStream.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* 이미 멈춘 트랙은 무시한다. */ }
    });
    if (capture.audioContext) {
      void capture.audioContext.close().catch(() => undefined);
    }
    if (active === capture) active = null;
  };

  /** 반향 프리셋을 건 스트림을 만든다. AudioContext가 없으면 원본 스트림. */
  const buildCaptureStream = (
    config: StudioRecordingBoothConfig,
    micStream: MediaStream,
  ): { readonly stream: MediaStream; readonly audioContext: AudioContext | null } => {
    const spec = STUDIO_REVERB_PRESET_SPECS[config.reverb];
    if (spec.wetLevel <= 0) return { stream: micStream, audioContext: null };
    const context = createAudioContext();
    if (!context) return { stream: micStream, audioContext: null };
    try {
      const source = context.createMediaStreamSource(micStream);
      const destination = context.createMediaStreamDestination();
      const dryGain = context.createGain();
      dryGain.gain.value = 1 - spec.wetLevel;
      const convolver = context.createConvolver();
      convolver.buffer = createReverbImpulseBuffer(context, spec.decaySec);
      const wetGain = context.createGain();
      wetGain.gain.value = spec.wetLevel;
      source.connect(dryGain);
      dryGain.connect(destination);
      source.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(destination);
      return { stream: destination.stream, audioContext: context };
    } catch {
      void context.close().catch(() => undefined);
      return { stream: micStream, audioContext: null };
    }
  };

  const finishCapture = (capture: ActiveCapture) => {
    const resolve = capture.resolveStop;
    const reject = capture.rejectStop;
    capture.resolveStop = null;
    capture.rejectStop = null;
    const wasCancelled = capture.cancelled;
    cleanup(capture);
    if (!resolve || !reject) return;
    if (wasCancelled) {
      reject(new Error(`세션을 찾을 수 없다: ${capture.session.id}`));
      return;
    }
    const blob = new Blob(capture.chunks, { type: capture.recorder.mimeType || "audio/webm" });
    if (blob.size === 0) {
      reject(new StudioBoothMediaError("empty-recording", "녹음된 소리가 없어요. 마이크 입력을 확인해 주세요."));
      return;
    }
    const stoppedAt = now();
    const rawDuration = Math.max(1, Math.round((stoppedAt - capture.session.startedAtMs) / 1000));
    const take: StudioRecordingTake = {
      id: `take-${capture.session.id}`,
      sessionId: capture.session.id,
      boothId: capture.session.boothId,
      durationSec: Math.min(rawDuration, capture.session.maxDurationSec),
      mimeType: "audio/webm",
      recordedAtMs: stoppedAt,
      estimatedBytes: blob.size,
    };
    resolve({ take, blob });
  };

  const stopWithBlob = (sessionId: string): Promise<{ take: StudioRecordingTake; blob: Blob }> => {
    const capture = active;
    if (!capture || capture.session.id !== sessionId) {
      return Promise.reject(new Error(`세션을 찾을 수 없다: ${sessionId}`));
    }
    if (!capture.stopPromise) {
      capture.stopPromise = new Promise((resolve, reject) => {
        capture.resolveStop = resolve;
        capture.rejectStop = reject;
      });
      if (capture.recorder.state !== "inactive") capture.recorder.stop();
      else finishCapture(capture);
    }
    return capture.stopPromise;
  };

  return {
    id: "media-recorder",
    capture: true,

    async startBoothSession(config: StudioRecordingBoothConfig): Promise<StudioRecordingSession> {
      const errors = validateStudioRecordingBoothConfig(config);
      if (errors.length > 0) throw new Error(`부스 설정 오류: ${errors.join(", ")}`);
      if (active) {
        throw new StudioBoothMediaError("already-recording", "이미 녹음 중인 세션이 있어요.");
      }
      let micStream: MediaStream;
      try {
        micStream = await getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (reason) {
        if (reason instanceof StudioBoothMediaError) throw reason;
        if (reason instanceof DOMException && reason.name === "NotAllowedError") {
          throw new StudioBoothMediaError("mic-permission-denied", "마이크 권한이 거부되었어요.");
        }
        throw new StudioBoothMediaError("mic-unavailable", "마이크를 시작하지 못했어요.");
      }
      const mimeType = pickBoothRecordingMimeType(isTypeSupported);
      if (!mimeType) {
        micStream.getTracks().forEach((track) => track.stop());
        throw new StudioBoothMediaError("recorder-unsupported", "이 브라우저는 WebM 녹음을 지원하지 않아요.");
      }
      const { stream, audioContext } = buildCaptureStream(config, micStream);
      let recorder: MediaRecorder;
      try {
        recorder = createRecorder(stream, mimeType);
      } catch (reason) {
        micStream.getTracks().forEach((track) => track.stop());
        if (audioContext) void audioContext.close().catch(() => undefined);
        throw reason;
      }
      mediaSessionCounter += 1;
      const session: StudioRecordingSession = {
        id: `booth-media-session-${mediaSessionCounter}`,
        boothId: config.boothId,
        reverb: config.reverb,
        startedAtMs: now(),
        maxDurationSec: config.maxDurationSec,
      };
      const capture: ActiveCapture = {
        session,
        micStream,
        recorder,
        audioContext,
        chunks: [],
        cancelled: false,
        stopPromise: null,
        resolveStop: null,
        rejectStop: null,
      };
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) capture.chunks.push(event.data);
      };
      recorder.onstop = () => finishCapture(capture);
      active = capture;
      recorder.start(250);
      return session;
    },

    stopBoothSessionWithBlob: stopWithBlob,

    async stopBoothSession(sessionId: string): Promise<StudioRecordingTake> {
      const { take } = await stopWithBlob(sessionId);
      return take;
    },

    async cancelBoothSession(sessionId: string): Promise<void> {
      const capture = active;
      if (!capture || capture.session.id !== sessionId) return;
      capture.cancelled = true;
      if (capture.recorder.state !== "inactive") {
        // onstop에서 취소로 처리한다. 대기 중인 stop이 있으면 그쪽도 취소된다.
        if (!capture.stopPromise) {
          capture.stopPromise = new Promise((resolve, reject) => {
            capture.resolveStop = resolve;
            capture.rejectStop = reject;
          });
          capture.stopPromise.catch(() => undefined);
        }
        capture.recorder.stop();
      } else {
        cleanup(capture);
      }
    },
  };
}
