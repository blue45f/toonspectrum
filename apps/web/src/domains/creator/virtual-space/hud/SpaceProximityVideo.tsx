import { Camera, CameraOff, Mic, MicOff, MonitorUp, PhoneOff, Video } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { HuddlePeer, HuddleSnapshot } from "../../live/huddle/studio-p2p-huddle-controller";
import { SPACE_PROXIMITY_MEDIA_LIMIT } from "./space-proximity-media";
import type { SpaceProximityMediaPhase } from "./use-space-proximity-media";

/** 퇴장한 팀원 카드를 옅어지며 치우는 시간(ms). 등장 전이(450ms)와 같은 감각으로 맞춘다. */
const PROXIMITY_BUBBLE_LEAVE_MS = 420;

function playCurrent(media: HTMLMediaElement | null, reportBlocked: (blocked: boolean) => void): void {
  const source = media?.srcObject;
  if (!media || !source) return;
  void media.play().then(() => { if (media.srcObject === source) reportBlocked(false); })
    .catch(() => { if (media.srcObject === source) reportBlocked(true); });
}

/** 영상 버블 하나. 영상 트랙이 없으면 이름 첫 글자를 보여 주고, 소리는 따로 재생한다. */
function SpaceVideoBubble({ name, stream, visual, muted, self, state, mirrored, gain, leaving }: {
  readonly name: string;
  readonly stream: MediaStream | null;
  readonly visual: boolean;
  readonly muted: boolean;
  readonly self?: boolean;
  /** 연결 상태 문구(없으면 표시 안 함). */
  readonly state?: { readonly ko: string; readonly en: string; readonly tone: "info" | "bad" } | null;
  readonly mirrored?: boolean;
  /** 거리 볼륨 게인(0~1). 피어 소리 크기와 프레임 투명도에 그대로 쓴다. 없으면 최대. */
  readonly gain?: number;
  /** 범위에서 나가 사라지는 중인 카드. */
  readonly leaving?: boolean;
}) {
  const bt = useBilingual("SpaceProximityVideo");
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const tracks = visual ? stream?.getVideoTracks() ?? [] : [];
    video.srcObject = tracks.length ? new MediaStream(tracks) : null;
    playCurrent(video, setBlocked);
    return () => { video.srcObject = null; };
  }, [stream, visual]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || self) return undefined;
    const tracks = stream?.getAudioTracks() ?? [];
    audio.srcObject = tracks.length ? new MediaStream(tracks) : null;
    playCurrent(audio, setBlocked);
    return () => { audio.srcObject = null; };
  }, [stream, self]);
  // 거리 게인을 실제 재생 볼륨에 반영한다. 연결 경계에서 0으로 떨어지지 않아 붙었다 끊기는 느낌이 없다.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || self) return;
    audio.volume = Math.min(1, Math.max(0, gain ?? 1));
  }, [gain, self, stream]);
  const frameOpacity = self || gain === undefined ? undefined : 0.25 + 0.75 * Math.min(1, Math.max(0, gain));
  return <figure className="space-video-bubble" data-self={self || undefined} data-visual={visual || undefined} data-state={state?.tone}
    data-leaving={leaving || undefined} aria-hidden={leaving || undefined}>
    <div className="space-video-bubble__frame" style={frameOpacity === undefined ? undefined : { opacity: frameOpacity }}>
      <video ref={videoRef} autoPlay playsInline muted data-mirrored={mirrored || undefined} aria-label={bt(`${name} 영상`, `${name} video`)} hidden={!visual} />
      {!visual ? <span className="space-video-bubble__initial" aria-hidden>{name.slice(0, 1)}</span> : null}
      {!self ? <audio ref={audioRef} autoPlay muted={muted} aria-label={bt(`${name} 음성`, `${name} audio`)}>
        {/* 실시간 음성이라 자막 파일이 없다. 대화 내용은 채팅으로 보완한다. */}
        <track kind="captions" />
      </audio> : null}
    </div>
    <figcaption>
      <span>{name}</span>
      {state ? <small>{bt(state.ko, state.en)}</small> : null}
    </figcaption>
    {blocked ? <button type="button" className="space-video-bubble__play" onClick={() => {
      playCurrent(videoRef.current, setBlocked);
      playCurrent(audioRef.current, setBlocked);
    }}>{bt("소리·영상 재생", "Play audio & video")}</button> : null}
  </figure>;
}

function peerState(peer: HuddlePeer): { readonly ko: string; readonly en: string; readonly tone: "info" | "bad" } | null {
  if (peer.connection === "failed") return { ko: "직접 연결 실패", en: "Direct link failed", tone: "bad" };
  if (peer.connection === "connected") return peer.camera || peer.sharing ? null : { ko: "카메라 꺼짐", en: "Camera off", tone: "info" };
  if (!peer.camera && !peer.sharing && peer.muted) return { ko: "카메라·마이크 꺼짐", en: "Camera & mic off", tone: "info" };
  return { ko: "연결 중…", en: "Connecting…", tone: "info" };
}

/**
 * 가까이 가면 영상: 근처 팀원과의 영상 버블(나 포함 최대 4)과 내 장치 조작.
 * 연결 실패는 숨기지 않고 이유(회사망·일부 모바일망의 P2P 차단, 유료 중계 서버 미사용)를 그대로 알린다.
 */
export const SpaceProximityVideo = memo(function SpaceProximityVideo({ phase, snapshot, busy, scopeNames, selfName, waitingReason,
  onToggleCamera, onToggleMic, onToggleScreen, onStop }: {
  readonly phase: SpaceProximityMediaPhase;
  readonly snapshot: HuddleSnapshot | null;
  readonly busy: boolean;
  /** 근접 범위 안 팀원(가까운 순) id → 이름·거리 게인. */
  readonly scopeNames: readonly { readonly id: string; readonly name: string; readonly gain?: number }[];
  readonly selfName: string;
  /** 켜 두었지만 지금 연결할 수 없는 이유. */
  readonly waitingReason: string | null;
  readonly onToggleCamera: () => void;
  readonly onToggleMic: () => void;
  readonly onToggleScreen: () => void;
  readonly onStop: () => void;
}) {
  const bt = useBilingual("SpaceProximityVideo");
  const peers = new Map((snapshot?.peers ?? []).map((peer) => [peer.participant.sessionId, peer] as const));
  const shown = scopeNames.slice(0, SPACE_PROXIMITY_MEDIA_LIMIT);
  // 범위에서 나간 카드는 바로 지우지 않고 잠깐 옅어지게 남겨 둔다(퇴장 전이).
  const shownRef = useRef<readonly { readonly id: string; readonly name: string }[]>([]);
  const previousShownRef = useRef<readonly { readonly id: string; readonly name: string }[]>([]);
  const leaveTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [leaving, setLeaving] = useState<readonly { readonly id: string; readonly name: string }[]>([]);
  const shownIdsKey = shown.map((item) => item.id).join("\u0000");
  shownRef.current = shown;
  useEffect(() => {
    const current = shownRef.current;
    const previous = previousShownRef.current;
    previousShownRef.current = current;
    const gone = previous.filter((item) => !current.some((candidate) => candidate.id === item.id));
    const returned = current.filter((item) => !previous.some((candidate) => candidate.id === item.id));
    if (!gone.length && !returned.length) return;
    setLeaving((items) => [
      ...items.filter((item) => !returned.some((candidate) => candidate.id === item.id) && !gone.some((candidate) => candidate.id === item.id)),
      ...gone.map((item) => ({ id: item.id, name: item.name })),
    ]);
    if (!gone.length) return;
    const goneIds = new Set(gone.map((item) => item.id));
    const timer = globalThis.setTimeout(() => {
      leaveTimersRef.current.delete(timer);
      setLeaving((items) => items.filter((item) => !goneIds.has(item.id)));
    }, PROXIMITY_BUBBLE_LEAVE_MS);
    leaveTimersRef.current.add(timer);
  }, [shownIdsKey]);
  useEffect(() => {
    const timers = leaveTimersRef.current;
    return () => { for (const timer of timers) globalThis.clearTimeout(timer); timers.clear(); };
  }, []);
  if (phase === "off") return null;
  const connected = shown.filter((item) => peers.get(item.id)?.connection === "connected").length;
  const failed = shown.some((item) => peers.get(item.id)?.connection === "failed");
  const status = waitingReason
    ?? (shown.length === 0
      ? bt("근처에 연결할 팀원이 없어요. 다가가면 자동으로 연결되고, 멀어지면 끊겨요.", "No teammate nearby. Walk closer to connect automatically; walk away to disconnect.")
      : bt(`근처 ${shown.length}명 · 연결 ${connected}명. 멀어지면 자동으로 끊겨요.`, `${shown.length} nearby · ${connected} connected. Walking away disconnects.`));
  return <section className="space-proximity-video" aria-label={bt("가까이 가면 영상", "Proximity video")} data-space-interactive="true" data-phase={phase}>
    <div className="space-proximity-video__bubbles">
      <SpaceVideoBubble self mirrored={!snapshot?.sharing} name={bt(`${selfName} · 나`, `${selfName} · me`)} stream={snapshot?.localStream ?? null}
        visual={Boolean(snapshot?.camera || snapshot?.sharing)} muted
        state={snapshot?.camera || snapshot?.sharing ? null : { ko: "카메라 꺼짐", en: "Camera off", tone: "info" }} />
      {shown.map((item) => {
        const peer = peers.get(item.id);
        return peer
          ? <SpaceVideoBubble key={item.id} name={item.name} stream={peer.stream} visual={peer.camera || peer.sharing} muted={false} state={peerState(peer)} gain={item.gain} />
          : <SpaceVideoBubble key={item.id} name={item.name} stream={null} visual={false} muted gain={item.gain}
            state={{ ko: "근접 영상을 켜지 않았어요", en: "Hasn't turned on proximity video", tone: "info" }} />;
      })}
      {leaving.map((item) => <SpaceVideoBubble key={`leaving-${item.id}`} name={item.name} stream={null} visual={false} muted gain={0} leaving />)}
    </div>
    <div className="space-proximity-video__bar">
      <p role="status">{status}</p>
      <div className="space-proximity-video__controls">
        <button type="button" className="space-icon-button" aria-pressed={Boolean(snapshot?.camera)} disabled={busy || phase !== "live"}
          aria-label={snapshot?.camera ? bt("카메라 끄기", "Turn camera off") : bt("카메라 켜기", "Turn camera on")} onClick={onToggleCamera}>
          {snapshot?.camera ? <Camera size={17} aria-hidden /> : <CameraOff size={17} aria-hidden />}
        </button>
        <button type="button" className="space-icon-button" aria-pressed={snapshot ? !snapshot.muted : false} disabled={busy || phase !== "live"}
          aria-label={snapshot && !snapshot.muted ? bt("마이크 끄기", "Turn mic off") : bt("마이크 켜기", "Turn mic on")} onClick={onToggleMic}>
          {snapshot && !snapshot.muted ? <Mic size={17} aria-hidden /> : <MicOff size={17} aria-hidden />}
        </button>
        <button type="button" className="space-icon-button" aria-pressed={Boolean(snapshot?.sharing)} disabled={busy || phase !== "live"}
          aria-label={snapshot?.sharing ? bt("화면 공유 중지", "Stop sharing") : bt("근처에 화면 공유", "Share screen nearby")} onClick={onToggleScreen}>
          <MonitorUp size={17} aria-hidden />
        </button>
        <button type="button" className="space-icon-button" data-tone="danger" aria-label={bt("가까이 가면 영상 끄기", "Turn off proximity video")} onClick={onStop}>
          <PhoneOff size={17} aria-hidden />
        </button>
      </div>
    </div>
    {failed || snapshot?.error ? <p className="space-proximity-video__warn" role="alert">{snapshot?.error ?? bt(
      "일부 팀원과 직접 연결하지 못했어요. 회사망·일부 모바일망은 브라우저 간 직접 연결(P2P)을 막을 수 있고, 이 기능은 유료 중계 서버를 쓰지 않아요. 같은 와이파이나 다른 네트워크에서 다시 시도해 주세요.",
      "Some direct links failed. Company or some mobile networks block browser-to-browser (P2P) links, and this feature uses no paid relay server. Try again on the same Wi-Fi or another network.",
    )}</p> : null}
  </section>;
});

/** 근접 영상 동의 카드: 무엇이 언제 켜지고 누구와 연결되는지 먼저 밝히고, 장치는 버튼을 누를 때만 요청한다. */
export function SpaceProximityConsent({ radiusTiles, onStart, onCancel, unavailableReason }: {
  readonly radiusTiles: number;
  readonly onStart: (capture: { readonly camera: boolean; readonly mic: boolean }) => void;
  readonly onCancel: () => void;
  readonly unavailableReason: string | null;
}) {
  const bt = useBilingual("SpaceProximityConsent");
  const mediaSupported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const reason = unavailableReason ?? (mediaSupported ? null : bt(
    "이 브라우저는 카메라·마이크를 지원하지 않아요. 지원하는 브라우저에서 같은 공간을 열어 주세요.",
    "This browser does not support camera or microphone. Open the same space in a supported browser.",
  ));
  return <div className="space-proximity-consent">
    <ul>
      <li>{bt("내 카메라·마이크는 지금 버튼을 누를 때 한 번만 직접 켜요(브라우저 권한 요청).", "Your camera and mic turn on only when you press a button now (browser permission prompt).")}</li>
      <li>{bt(`그 뒤에는 약 ${radiusTiles}칸 안으로 다가온 팀원(최대 3명)과 자동으로 영상이 연결되고, 멀어지면 자동으로 끊겨요.`, `After that, teammates within about ${radiusTiles} tiles (up to 3) connect automatically and disconnect when you walk away.`)}</li>
      <li>{bt("프라이빗 구역 안에서는 같은 구역에 있는 사람끼리만 연결돼요. 상대도 이 기능을 켜야 서로 보여요.", "Inside a private zone you only connect with people in the same zone. Both sides must turn this on to see each other.")}</li>
      <li>{bt("브라우저 간 직접(P2P) 연결이라 상대에게 네트워크 주소가 보일 수 있어요. 회사망·일부 모바일망에서는 연결되지 않을 수 있고, 유료 중계 서버는 쓰지 않아요.", "Links are direct browser-to-browser (P2P), so your network address may be visible to peers. Some company or mobile networks may block them; no paid relay server is used.")}</li>
    </ul>
    {reason ? <p className="space-proximity-consent__reason" role="status">{reason}</p> : null}
    <div className="space-proximity-consent__actions">
      <button type="button" className="space-pill-button space-pill-button--primary" disabled={Boolean(reason)} onClick={() => onStart({ camera: true, mic: true })}>
        <Video size={16} aria-hidden />{bt("카메라·마이크 켜고 시작", "Start with camera & mic")}
      </button>
      <button type="button" className="space-pill-button" disabled={Boolean(reason)} onClick={() => onStart({ camera: true, mic: false })}>
        <Camera size={16} aria-hidden />{bt("카메라만", "Camera only")}
      </button>
      <button type="button" className="space-pill-button" disabled={Boolean(reason)} onClick={() => onStart({ camera: false, mic: true })}>
        <Mic size={16} aria-hidden />{bt("마이크만", "Mic only")}
      </button>
      <button type="button" className="space-pill-button" onClick={onCancel}>{bt("나중에", "Not now")}</button>
    </div>
  </div>;
}
