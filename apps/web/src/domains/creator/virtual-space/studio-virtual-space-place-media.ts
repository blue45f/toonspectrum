/**
 * 장소 미디어 세션 (Track 6).
 *
 * 회의실·스테이지·휴게실 세션의 로컬 미디어를 담당한다. 프레임워크에 닿지 않는
 * 순수 클래스라 React·Phaser 양쪽에서 쓸 수 있다.
 *
 * - join(kind): getUserMedia로 마이크·카메라를 연다 (의존성 주입이라 테스트 가능).
 * - 로컬 말하기 감지: AnalyserNode RMS → speaking 플래그 (발언자 스포트라이트용).
 *   Spatial의 실시간 표정 기대치를 2D에서 흉내 내는 최소 구현이다 (벤치마크 T1-3 연계).
 * - 화면 공유: getDisplayMedia 진입점 (책상 모드).
 * - 시뮬레이션 피어: 시그널링 없이 좌석 배치·스포트라이트 UI를 개발·검증한다.
 * - PlaceSignalingAdapter: 실제 미디어 서버/P2P 연결은 이 인터페이스로 확장한다.
 *   저장소에는 StudioP2pCreativeHuddleController
 *   (domains/creator/live/huddle/studio-p2p-creative-huddle-controller.ts)가 이미
 *   있으므로, 후속 작업에서 어댑터로 감싸 연결한다 — 실제 서버 연동은 후속 작업.
 *
 * 무료 라이선스만 사용한다 (WebRTC/getUserMedia는 브라우저 내장).
 */

import {
  resolveStudioShareBandwidthHint,
  type StudioShareBandwidth,
  type StudioShareRoute,
} from "./studio-virtual-space-bubble-share";

export type PlaceMediaKind = "conference" | "stage" | "lounge";

export type PlaceMediaErrorKind = "permission-denied" | "no-devices" | "not-supported" | "unknown";

export interface PlaceMediaError {
  readonly kind: PlaceMediaErrorKind;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface PlaceMediaPeer {
  readonly sessionId: string;
  readonly displayName: string;
  readonly audio: boolean;
  readonly video: boolean;
  readonly speaking: boolean;
  /** 시뮬레이션 피어면 true (실제 시그널링 피어가 아님을 UI에 표시). */
  readonly simulated: boolean;
}

export interface PlaceMediaSnapshot {
  readonly active: boolean;
  readonly kind: PlaceMediaKind | null;
  readonly localStream: MediaStream | null;
  readonly microphone: boolean;
  readonly camera: boolean;
  readonly speaking: boolean;
  readonly screenSharing: boolean;
  readonly screenStream: MediaStream | null;
  /** 화면 공유 경로. bubble=근접 그룹, broadcast=스포트라이트/메가폰 방송. */
  readonly screenShareScope: StudioShareRoute | null;
  /** 화면 공유 대역폭 스로틀 (송출 힌트). */
  readonly screenShareBandwidth: StudioShareBandwidth;
  readonly peers: readonly PlaceMediaPeer[];
  /** 발언자/발표자 스포트라이트 대상 (없으면 null). */
  readonly spotlightSessionId: string | null;
  readonly error: PlaceMediaError | null;
}

export interface PlaceMediaSessionDependencies {
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly getDisplayMedia?: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;
  readonly now?: () => number;
  readonly onSnapshot?: (snapshot: PlaceMediaSnapshot) => void;
  /** 말하기 감지 주기 (ms). 기본 200. */
  readonly speakingPollMs?: number;
  readonly setInterval?: (handler: () => void, delayMs: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

/**
 * 실제 P2P/미디어 서버 연결용 확장 인터페이스 (후속 작업).
 * 구현체는 StudioP2pCreativeHuddleController를 감싸면 된다.
 */
export interface PlaceSignalingAdapter {
  /** 어댑터 이름 (진단 로그용). */
  readonly name: string;
  /** 로컬 스트림을 들고 세션에 참여한다. */
  join(kind: PlaceMediaKind, localStream: MediaStream | null): Promise<void>;
  /** 세션을 떠난다. */
  leave(): Promise<void>;
  /** 원격 피어 변경 콜백. */
  onPeersChanged?: (peers: readonly PlaceMediaPeer[]) => void;
  /** 발언자 변경 콜백 (스포트라이트). */
  onSpotlightChanged?: (sessionId: string | null) => void;
}

const SPEAKING_RMS_THRESHOLD = 0.02;

function mediaErrorFor(kind: PlaceMediaErrorKind): PlaceMediaError {
  switch (kind) {
    case "permission-denied":
      return {
        kind,
        messageKo: "마이크·카메라 권한이 거부됐어요. 브라우저 주소창의 자물쇠 아이콘에서 허용으로 바꿔 주세요.",
        messageEn: "Mic/camera permission was denied. Allow access from the lock icon in the address bar.",
      };
    case "no-devices":
      return {
        kind,
        messageKo: "사용할 수 있는 마이크나 카메라를 찾지 못했어요.",
        messageEn: "No usable microphone or camera was found.",
      };
    case "not-supported":
      return {
        kind,
        messageKo: "이 브라우저에서는 화상 기능을 지원하지 않아요.",
        messageEn: "Video features are not supported in this browser.",
      };
    case "unknown":
      return {
        kind,
        messageKo: "미디어 장치를 여는 중 알 수 없는 오류가 났어요.",
        messageEn: "An unknown error occurred while opening media devices.",
      };
  }
}

function toMediaError(error: unknown): PlaceMediaError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return mediaErrorFor("permission-denied");
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") return mediaErrorFor("no-devices");
    if (error.name === "NotSupportedError") return mediaErrorFor("not-supported");
  }
  if (error instanceof Error && /denied|permission/i.test(error.message)) return mediaErrorFor("permission-denied");
  return mediaErrorFor("unknown");
}

export interface PlaceMediaJoinOptions {
  readonly microphone?: boolean;
  readonly camera?: boolean;
}

/**
 * 장소 미디어 세션.
 *
 * 사용법:
 *   const session = new PlaceMediaSession();
 *   await session.join("conference");      // 권한 UX는 호출 측이 snapshot.error로 표시
 *   session.setMicrophone(false);          // 음소거
 *   session.leave();                       // 정리 (트랙 정지)
 */
export class PlaceMediaSession {
  private active = false;
  private kind: PlaceMediaKind | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private microphone = true;
  private camera = true;
  private screenSharing = false;
  private screenShareScope: StudioShareRoute | null = null;
  private screenShareBandwidth: StudioShareBandwidth = "balanced";
  private speaking = false;
  private error: PlaceMediaError | null = null;
  private readonly peers = new Map<string, PlaceMediaPeer>();
  private spotlightSessionId: string | null = null;
  private adapter: PlaceSignalingAdapter | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Float32Array<ArrayBuffer> | null = null;
  private pollTimer: unknown | null = null;
  private readonly listeners = new Set<(snapshot: PlaceMediaSnapshot) => void>();
  private audioContext: AudioContext | null = null;

  constructor(private readonly dependencies: PlaceMediaSessionDependencies = {}) {}

  private getUserMedia(): ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null {
    if (this.dependencies.getUserMedia) return this.dependencies.getUserMedia;
    const mediaDevices = globalThis.navigator?.mediaDevices;
    return mediaDevices?.getUserMedia ? mediaDevices.getUserMedia.bind(mediaDevices) : null;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.dependencies.onSnapshot?.(snapshot);
    for (const listener of this.listeners) listener(snapshot);
  }

  subscribe(listener: (snapshot: PlaceMediaSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): PlaceMediaSnapshot {
    return Object.freeze({
      active: this.active,
      kind: this.kind,
      localStream: this.localStream,
      microphone: this.microphone,
      camera: this.camera,
      speaking: this.speaking,
      screenSharing: this.screenSharing,
      screenStream: this.screenStream,
      screenShareScope: this.screenShareScope,
      screenShareBandwidth: this.screenShareBandwidth,
      peers: Object.freeze([...this.peers.values()].map((peer) => Object.freeze({ ...peer }))),
      spotlightSessionId: this.spotlightSessionId,
      error: this.error,
    });
  }

  /**
   * 세션 참여. 스테이지는 발표자만 카메라를 켜고, 청중은 기본 음소거다
   * (Zoom focus mode처럼 청중은 발표자만 본다).
   * microphone·camera를 둘 다 끄면 장치 없이 참여한다 (화면 공유 전용 세션).
   */
  async join(kind: PlaceMediaKind, joinOptions: PlaceMediaJoinOptions = {}): Promise<void> {
    if (this.active) return;
    const wantMicrophone = joinOptions.microphone ?? true;
    const wantCamera = joinOptions.camera ?? true;
    if (!wantMicrophone && !wantCamera) {
      // 장치 없는 참여: 화면 공유 진입점용.
      this.active = true;
      this.kind = kind;
      this.microphone = false;
      this.camera = false;
      this.error = null;
      if (this.adapter) {
        try {
          await this.adapter.join(kind, null);
        } catch {
          // 시그널링 실패는 로컬 미리보기와 별개로 둔다 — 세션 자체는 유지한다.
        }
      }
      this.emit();
      return;
    }
    const getUserMedia = this.getUserMedia();
    if (!getUserMedia) {
      this.error = mediaErrorFor("not-supported");
      this.emit();
      return;
    }
    try {
      const stream = await getUserMedia({ audio: wantMicrophone, video: wantCamera });
      this.localStream = stream;
      this.microphone = wantMicrophone && stream.getAudioTracks().length > 0;
      this.camera = wantCamera && stream.getVideoTracks().length > 0;
      if (!this.microphone) this.applyTrackEnabled("audio", false);
      if (!this.camera) this.applyTrackEnabled("video", false);
      this.active = true;
      this.kind = kind;
      this.error = null;
      this.startSpeakingPoll();
      if (this.adapter) {
        try {
          await this.adapter.join(kind, stream);
        } catch {
          // 시그널링 실패는 로컬 미리보기와 별개로 둔다 — 세션 자체는 유지한다.
        }
      }
      this.emit();
    } catch (error) {
      this.error = toMediaError(error);
      this.emit();
    }
  }

  /** 세션 이탈: 모든 트랙을 정지하고 정리한다. */
  leave(): void {
    this.stopSpeakingPoll();
    if (this.adapter) {
      const adapter = this.adapter;
      this.adapter = null;
      void adapter.leave().catch(() => {
        // 정리 중 시그널링 오류는 무시한다.
      });
    }
    this.stopTracks(this.localStream);
    this.localStream = null;
    this.stopTracks(this.screenStream);
    this.screenStream = null;
    this.active = false;
    this.kind = null;
    this.microphone = true;
    this.camera = true;
    this.speaking = false;
    this.screenSharing = false;
    this.screenShareScope = null;
    this.spotlightSessionId = null;
    this.error = null;
    this.peers.clear();
    this.emit();
  }

  setMicrophone(on: boolean): void {
    if (!this.active) return;
    this.microphone = on;
    this.applyTrackEnabled("audio", on);
    if (!on && this.speaking) {
      this.speaking = false;
    }
    this.emit();
  }

  setCamera(on: boolean): void {
    if (!this.active) return;
    this.camera = on;
    this.applyTrackEnabled("video", on);
    this.emit();
  }

  /** 화면 공유 시작 (책상 모드 진입점). getDisplayMedia 권한 UX 포함. */
  async startScreenShare(options: {
    readonly scope?: StudioShareRoute;
    readonly bandwidth?: StudioShareBandwidth;
  } = {}): Promise<void> {
    if (!this.active || this.screenSharing) return;
    const getDisplayMedia = this.dependencies.getDisplayMedia
      ?? globalThis.navigator?.mediaDevices?.getDisplayMedia?.bind(globalThis.navigator.mediaDevices)
      ?? null;
    if (!getDisplayMedia) {
      this.error = mediaErrorFor("not-supported");
      this.emit();
      return;
    }
    const bandwidth = options.bandwidth ?? "balanced";
    const hint = resolveStudioShareBandwidthHint(bandwidth);
    try {
      const stream = await getDisplayMedia({
        video: { width: { max: hint.maxWidth }, frameRate: { max: hint.maxFps } },
        audio: false,
      });
      this.screenStream = stream;
      this.screenSharing = true;
      this.screenShareScope = options.scope ?? "bubble";
      this.screenShareBandwidth = hint.id;
      this.error = null;
      const [videoTrack] = stream.getVideoTracks();
      videoTrack?.addEventListener("ended", () => this.stopScreenShare());
      this.emit();
    } catch (error) {
      this.error = toMediaError(error);
      this.emit();
    }
  }

  stopScreenShare(): void {
    if (!this.screenSharing) return;
    this.stopTracks(this.screenStream);
    this.screenStream = null;
    this.screenSharing = false;
    this.screenShareScope = null;
    this.emit();
  }

  /** 시그널링 어댑터 연결 (실제 P2P/서버 연동 시). */
  attachSignaling(adapter: PlaceSignalingAdapter): void {
    this.adapter = adapter;
    adapter.onPeersChanged = (peers) => {
      this.peers.clear();
      for (const peer of peers) this.peers.set(peer.sessionId, peer);
      this.emit();
    };
    adapter.onSpotlightChanged = (sessionId) => {
      this.spotlightSessionId = sessionId;
      this.emit();
    };
  }

  detachSignaling(): void {
    this.adapter = null;
  }

  /**
   * 시뮬레이션 피어 추가 — 시그널링 없이 좌석 배치·스포트라이트 UI를 검증한다.
   * simulated: true 로 표시되며 실제 미디어와 연결되지 않는다.
   */
  addSimulatedPeer(sessionId: string, displayName: string): void {
    this.peers.set(sessionId, Object.freeze({
      sessionId, displayName, audio: true, video: true, speaking: false, simulated: true,
    }));
    this.emit();
  }

  removeSimulatedPeer(sessionId: string): void {
    if (this.peers.delete(sessionId)) {
      if (this.spotlightSessionId === sessionId) this.spotlightSessionId = null;
      this.emit();
    }
  }

  /** 시뮬레이션/어댑터에서 발언자를 알린다 — 스포트라이트 대상이 된다. */
  markSpeaking(sessionId: string | null): void {
    if (sessionId && !this.peers.has(sessionId)) return;
    this.spotlightSessionId = sessionId;
    for (const [id, peer] of this.peers) {
      this.peers.set(id, Object.freeze({ ...peer, speaking: id === sessionId }));
    }
    this.emit();
  }

  private applyTrackEnabled(kind: "audio" | "video", enabled: boolean): void {
    const tracks = kind === "audio" ? this.localStream?.getAudioTracks() : this.localStream?.getVideoTracks();
    for (const track of tracks ?? []) track.enabled = enabled;
  }

  private stopTracks(stream: MediaStream | null): void {
    for (const track of stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // 이미 정지된 트랙은 무시한다.
      }
    }
  }

  private startSpeakingPoll(): void {
    this.stopSpeakingPoll();
    const stream = this.localStream;
    const AudioContextCtor = globalThis.AudioContext;
    if (!stream || typeof AudioContextCtor !== "function") return;
    try {
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      this.audioContext = context;
      this.analyser = analyser;
      this.analyserData = new Float32Array(analyser.frequencyBinCount);
      const pollMs = this.dependencies.speakingPollMs ?? 200;
      const schedule = this.dependencies.setInterval ?? ((handler: () => void, ms: number) => globalThis.setInterval(handler, ms));
      this.pollTimer = schedule(() => this.pollSpeaking(), pollMs);
    } catch {
      // Analyser를 못 만들면 말하기 감지만 비활성화한다.
      this.analyser = null;
    }
  }

  private pollSpeaking(): void {
    if (!this.analyser || !this.analyserData || !this.microphone) return;
    this.analyser.getFloatTimeDomainData(this.analyserData);
    let sum = 0;
    for (let i = 0; i < this.analyserData.length; i += 1) {
      const sample = this.analyserData[i] ?? 0;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / this.analyserData.length);
    const speaking = rms >= SPEAKING_RMS_THRESHOLD;
    if (speaking !== this.speaking) {
      this.speaking = speaking;
      this.emit();
    }
  }

  private stopSpeakingPoll(): void {
    if (this.pollTimer !== null) {
      if (this.dependencies.clearInterval) this.dependencies.clearInterval(this.pollTimer);
      else globalThis.clearInterval(this.pollTimer as ReturnType<typeof setInterval>);
      this.pollTimer = null;
    }
    this.analyser = null;
    this.analyserData = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }
}

/**
 * 좌석 기반 타일 배치 (Zoom tiled view식).
 * 존 영역 안에 좌석을 격자 링으로 배치해 화상 타일 위치를 잡는다.
 * 발표자(spotlight)는 첫 번째 좌석에 둔다.
 */
export function placeMediaSeatLayout(
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  participantCount: number,
): readonly { readonly x: number; readonly y: number }[] {
  const count = Math.max(0, Math.floor(participantCount));
  if (count === 0) return Object.freeze([]);
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * (bounds.width / Math.max(1, bounds.height)))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const seats: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const seatsInRow = Math.min(columns, count - row * columns);
    // 행마다 가운데 정렬. 첫 번째 좌석은 스포트라이트(발표자/발언자) 자리다.
    const offsetX = ((columns - seatsInRow) / 2) * (bounds.width / columns);
    seats.push({
      x: bounds.x + offsetX + ((column + 0.5) / columns) * bounds.width,
      y: bounds.y + ((row + 0.5) / rows) * bounds.height,
    });
  }
  return Object.freeze(seats);
}

/** 미디어 권한 안내 문구 (호출 측이 버튼 옆에 표시). */
export function placeMediaPermissionHint(locale: "ko" | "en" = "ko"): string {
  return locale === "ko"
    ? "참여하면 마이크·카메라 권한을 요청해요. 거부해도 걷기는 계속할 수 있어요."
    : "Joining requests mic/camera permission. You can keep walking even if you decline.";
}
