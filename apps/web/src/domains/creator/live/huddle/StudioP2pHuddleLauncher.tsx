import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { MessageCircle, Mic, MicOff, Video, MonitorUp, PhoneOff, Hand, VolumeX, X } from "lucide-react";
import { formatI18nTemplate, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioLiveCollaboration } from "../studio-live-collaboration-context";
import { StudioP2pCreativeHuddleController as StudioP2pHuddleController, type CreativeHuddleSnapshot as HuddleSnapshot } from "./studio-p2p-creative-huddle-controller";
import { HUDDLE_REACTIONS, HUDDLE_TEXT_LIMIT } from "./studio-p2p-huddle-protocol";
import { STUDIO_P2P_HUDDLE_OPEN_EVENT, type StudioP2pHuddleOpenDetail } from "./studio-p2p-huddle-events";
import { StudioP2pMediaTile as MediaTile, P2P_CONTROL_CLASS as controlClass } from "./StudioP2pMediaTile";
import { StudioP2pActivitiesPanel } from "./StudioP2pActivitiesPanel";
import { StudioP2pVirtualStudio } from "./StudioP2pVirtualStudio";
import { studioStrokeFocusActivitySnapshot, subscribeStudioStrokeFocusActivity } from "../../studio-stroke-focus-activity";

export default function StudioP2pHuddleLauncher() {
  const live = useStudioLiveCollaboration();
  const strokeFocusPhase = useSyncExternalStore(
    subscribeStudioStrokeFocusActivity,
    studioStrokeFocusActivitySnapshot,
    () => "idle",
  );
  const controller = useRef<StudioP2pHuddleController | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const proximityPeerIds = useRef<Set<string> | null>(null);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HuddleSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [deafened, setDeafened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proximityMedia, setProximityMedia] = useState(true);
  const [nearbyPeerIds, setNearbyPeerIds] = useState<string[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const active = snapshot !== null && !snapshot.closed;
  const room = live.room;
  const handleNearbyChange = useCallback((sessionIds: string[]) => {
    setNearbyPeerIds((current) => current.length === sessionIds.length
      && current.every((id, index) => id === sessionIds[index]) ? current : sessionIds);
  }, []);
  useEffect(() => {
    proximityPeerIds.current = null;
    setSnapshot(null); setDraft(""); setBusy(false); setNearbyPeerIds([]); setProximityMedia(true);
    return () => {
      cleanup.current?.(); cleanup.current = null;
      controller.current?.close(); controller.current = null;
    };
  }, [room, live.availability, live.canChat]);
  useEffect(() => {
    if (strokeFocusPhase === "drawing") setOpen(false);
  }, [strokeFocusPhase]);
  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<StudioP2pHuddleOpenDetail>).detail;
      const requestedIds = detail?.peerIds ? [...detail.peerIds] : null;
      proximityPeerIds.current = requestedIds ? new Set(requestedIds) : null;
      if (requestedIds) {
        setNearbyPeerIds(requestedIds);
        setProximityMedia(true);
        controller.current?.setMediaPeerScope(requestedIds);
      } else {
        setProximityMedia(false);
        controller.current?.setMediaPeerScope(null);
      }
      controller.current?.refreshPeers();
      setOpen(true);
    };
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, handleOpen);
    return () => globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, handleOpen);
  }, []);
  useEffect(() => {
    if (!active) return;
    controller.current?.setMediaPeerScope(proximityMedia ? nearbyPeerIds : null);
  }, [active, nearbyPeerIds, proximityMedia]);
  useEffect(() => {
    if (!active) return undefined;
    const resume = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) {
        controller.current?.resume();
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [active]);
  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<StudioP2pHuddleOpenDetail>).detail;
      proximityPeerIds.current = detail?.peerIds ? new Set(detail.peerIds) : null;
      controller.current?.refreshPeers();
      setOpen(true);
    };
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, handleOpen);
    return () => globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, handleOpen);
  }, []);
  useEffect(() => {
    const element = log.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 160)
      element.scrollTop = element.scrollHeight;
  }, [snapshot?.messages.length]);
  function leave() {
    cleanup.current?.(); cleanup.current = null;
    controller.current?.close(); controller.current = null;
    proximityPeerIds.current = null;
    setSnapshot(null); setDraft(""); setBusy(false); setDeafened(false); setNearbyPeerIds([]); setProximityMedia(true);
  }
  function join() {
    if (!room?.direct || live.availability !== "ready" || !live.canChat || controller.current) return;
    const next = new StudioP2pHuddleController(room.participant, room.direct, {
      peerFilter: (peer) => proximityPeerIds.current?.has(peer.sessionId) ?? true,
    });
    controller.current = next;
    const unsubscribe = next.subscribe(() => setSnapshot(next.snapshot()));
    const terminate = () => {
      if (controller.current !== next) return;
      leave(); setNotice("작업실 연결이 종료되어 카메라와 마이크를 해제했습니다. 연결이 복구되면 다시 참여할 수 있습니다.");
    };
    const offRoom = room.subscribe((event) => {
      if (event.type === "transport-status" && (!room.ready || !event.status.recoverable)) terminate();
    });
    const offTerminal = room.subscribeVoice((event) => { if (event.type === "terminal") terminate(); });
    cleanup.current = () => { unsubscribe(); offRoom(); offTerminal(); };
    setNotice(null); next.start(); setSnapshot(next.snapshot());
  }
  async function capture(action: () => Promise<void>) {
    const owner = controller.current; setBusy(true);
    try { await action(); } finally { if (controller.current === owner) setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (controller.current?.sendChat(draft)) { setDraft(""); setNotice(null); }
    else setNotice("전송하지 못했습니다. 상대의 P2P 참여와 연결 상태를 확인해 주세요.");
  }
  if (!room || !live.canChat) return null;
  const canJoin = Boolean(room.direct && live.availability === "ready");
  const mediaAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
  return <aside
    className="studio-p2p-huddle-dock fixed bottom-[calc(var(--studio-canvas-bottom-inset,5rem)+0.75rem)] right-3 z-[65] max-w-[calc(100vw-1.5rem)] sm:bottom-3"
    aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "협업 대화")}
    data-studio-shell-floating-target="collaboration"
    data-studio-shell-force-visible={active ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "en", "true") : undefined}
  >
    <section hidden={!open} className="studio-p2p-huddle-panel mb-2 w-[min(760px,calc(100vw-1.5rem))] max-w-full overflow-hidden rounded-2xl border border-accent/40 bg-panel text-fg shadow-2xl"
      aria-labelledby="studio-p2p-huddle-heading" data-studio-p2p-huddle="true">
      <header className="flex items-center justify-between border-b border-line p-3">
        <div><h3 id="studio-p2p-huddle-heading" className="text-sm font-bold">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "Virtual Studio · Huddle")}</h3>
          <p className="text-[11px] text-fg-3">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "근접 P2P 우선 · 카메라·마이크는 직접 켤 때만 사용")}</p></div>
        <button type="button" className={controlClass} aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "대화 패널 접기")} onClick={() => setOpen(false)}><X size={16} /></button>
      </header>
      <div className="max-h-[68dvh] space-y-3 overflow-y-auto p-3">
        {!active ? <div className="space-y-3 text-xs leading-relaxed text-fg-2">
          <p>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "참여하면 채팅만 시작됩니다. 마이크·카메라는 직접 켜기 전까지 사용하지 않습니다.")}</p>
          <p>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "대화·통화는 브라우저 간 직접 전송하며 기록을 저장하지 않습니다. 상대에게 네트워크 주소가 노출될 수 있으니 신뢰하는 작업자와 사용해 주세요.")}</p>
          <p>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "회사망·일부 모바일망에서는 연결되지 않을 수 있습니다. 실패 시 서버 중계로 전환하지 않습니다. 상대방의 녹화·캡처까지 막지는 못합니다.")}</p>
          {!canJoin && <p role="status" className="text-warn">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "서버에 연결된 공동작업 원고와 WebRTC 지원 브라우저가 필요합니다. 로컬 탭 연결만으로 원격 통화를 시작하지 않습니다.")}</p>}
          <button className={controlClass} type="button" disabled={!canJoin} onClick={join}>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "동의하고 P2P 채팅 참여")}</button>
        </div> : <>
          <p className="text-xs text-fg-2" role="status">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "나 포함 ")}{(snapshot?.peers.length ?? 0) + 1}{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "명 참여 · 연결 가능 ")}{snapshot?.availablePeers ?? 0}{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "명")}</p>
          {proximityPeerIds.current ? <p className="rounded-lg bg-accent-soft px-2 py-1.5 text-[11px] font-semibold text-accent" data-studio-p2p-proximity-scope="true">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "가상 스튜디오 근처 대화 · 가까운 팀원만 직접 연결")}</p> : null}
          {!mediaAvailable && <p role="status" className="text-xs text-warn">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "이 브라우저는 카메라·마이크를 지원하지 않습니다. 지원하는 브라우저에서 같은 작업실을 열어 주세요. 채팅·활동은 계속 사용할 수 있습니다.")}</p>}
          <div className="grid grid-cols-3 gap-1.5">
            <button className={controlClass} type="button" disabled={busy || !mediaAvailable} aria-pressed={!snapshot?.muted}
              onClick={() => void capture(() => controller.current?.setMicrophone(Boolean(snapshot?.muted)) ?? Promise.resolve())}>
              {snapshot?.muted ? <MicOff size={14} /> : <Mic size={14} />}{snapshot?.muted ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "마이크 켜기") : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "마이크 끄기")}</button>
            <button className={controlClass} type="button" disabled={busy || !mediaAvailable} aria-pressed={snapshot?.camera}
              onClick={() => void capture(() => controller.current?.setVideo(snapshot?.camera ? null : "camera") ?? Promise.resolve())}>
              <Video size={14} />{snapshot?.camera ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "카메라 끄기") : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "카메라 켜기")}</button>
            {snapshot?.camera ? <button className={controlClass} type="button" disabled={busy || !mediaAvailable}
              aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "전·후면 카메라 전환")}
              onClick={() => void capture(() => controller.current?.setVideo(
                "camera",
                snapshot.cameraFacing === "user" ? "environment" : "user",
              ) ?? Promise.resolve())}>
              <Video size={14} />{snapshot.cameraFacing === "user"
                ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "후면 카메라")
                : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "전면 카메라")}
            </button> : null}
            <button className={controlClass} type="button" disabled={busy || !navigator.mediaDevices?.getDisplayMedia} aria-pressed={snapshot?.sharing}
              onClick={() => void capture(() => controller.current?.setVideo(snapshot?.sharing ? null : "screen") ?? Promise.resolve())}>
              <MonitorUp size={14} />{snapshot?.sharing ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "공유 중지") : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "화면 공유")}</button>
            <button className={controlClass} type="button" aria-pressed={deafened} onClick={() => setDeafened((v) => !v)}>
              <VolumeX size={14} />{deafened ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "소리 켜기") : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "소리 끄기")}</button>
            <button className={controlClass} type="button" aria-pressed={snapshot?.hand} onClick={() => controller.current?.setHand(!snapshot?.hand)}>
              <Hand size={14} />{snapshot?.hand ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "손 내리기") : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "손들기")}</button>
            <button className={controlClass} type="button" onClick={leave}><PhoneOff size={14} />{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "나가기")}</button>
          </div>
          {room.direct && <StudioP2pVirtualStudio
            self={room.participant}
            port={room.direct}
            proximityMedia={proximityMedia}
            onProximityMediaChange={setProximityMedia}
            onNearbyChange={handleNearbyChange}
          />}
          <div className="grid grid-cols-2 gap-2">
            <MediaTile name={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "나 · 미리보기")} stream={snapshot?.localStream ?? null} muted visual={Boolean(snapshot?.camera || snapshot?.sharing)} />
            {snapshot?.peers.map((peer) => <div key={peer.participant.sessionId}>
              <MediaTile name={peer.participant.displayName} stream={peer.stream} muted={deafened} visual={peer.camera || peer.sharing} />
              <p className="mt-1 text-[11px] text-fg-3">{peer.muted ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "마이크 꺼짐") : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "마이크 켜짐")} {peer.hand ? "✋" : ""} {peer.reaction ?? ""}
                {peer.connection === "failed" ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", " · 연결 실패") : peer.connection === "connected" ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", " · 직접 연결") : ""}</p>
              <button type="button" className="min-h-11 text-[11px] text-fg-3 underline" onClick={() => controller.current?.block(peer.participant.sessionId)}>
                {peer.participant.displayName} {translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "이 세션에서 차단")}</button>
            </div>)}
          </div>
          <div className="flex gap-2" aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "빠른 리액션")}>{HUDDLE_REACTIONS.map((emoji) =>
            <button key={emoji} className={controlClass} type="button" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "{v0} 리액션 보내기"), { v0: String(emoji) })}
              onClick={() => controller.current?.react(emoji)}>{emoji}</button>)}</div>
          {!snapshot?.peers.length && <p className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "같은 공동작업 원고에서 상대도 P2P 채팅에 참여해야 연결됩니다. 연결되지 않으면 네트워크를 확인해 주세요.")}</p>}
          {controller.current && <StudioP2pActivitiesPanel controller={controller.current} />}
          <div ref={log} role="log" aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "P2P 대화 기록")} aria-live="polite" aria-relevant="additions" className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-card p-2 text-xs">
            {snapshot?.messages.map((message) => <div key={message.id} className="break-words">
              <strong>{message.self ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "나") : message.name}</strong><p className="whitespace-pre-wrap">{message.text}</p>
              {message.self && <span className="text-[10px] text-fg-3">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "전송 ")}{message.sent.length}/{message.targets.length} {translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "· 수신 확인 ")}{message.received.length}/{message.targets.length}</span>}
            </div>)}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <label className="sr-only" htmlFor="studio-p2p-message">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "P2P 메시지")}</label>
            <input id="studio-p2p-message" value={draft} maxLength={HUDDLE_TEXT_LIMIT} autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-xs"
              placeholder={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "P2P 메시지 · 기록 저장 안 함")} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} />
            <button type="submit" className={controlClass} disabled={!draft.trim() || !snapshot?.peers.length}>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "전송")}</button>
          </form>
          <p className="text-[10px] leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "이 대화는 기존 세션 채팅과 분리되어 있습니다. 수신 확인은 상대 브라우저 도착을 뜻하며 읽음 확인이 아닙니다. 나가면 기록이 지워집니다.")}</p>
        </>}
        {(notice || snapshot?.error) && <p role="status" className="text-xs leading-relaxed text-warn">{notice ?? snapshot?.error}</p>}
      </div>
    </section>
    <button type="button" aria-expanded={open} className="ml-auto flex min-h-11 items-center gap-2 rounded-full border border-accent/40 bg-panel px-4 text-xs font-bold text-fg shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      onClick={() => setOpen((value) => {
        if (!value) {
          proximityPeerIds.current = null;
          controller.current?.refreshPeers();
        }
        return !value;
      })}>
      <MessageCircle size={16} />{active ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "P2P 대화 중 · {v0}명"), { v0: String((snapshot?.peers.length ?? 0) + 1) }) : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "채팅·통화")}
      {active && <span className="size-2 rounded-full bg-good" aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "대화 참여 중")} />}
    </button>
  </aside>;
}
