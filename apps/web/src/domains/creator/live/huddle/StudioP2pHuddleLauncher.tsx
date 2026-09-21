import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { MessageCircle, Mic, MicOff, Video, MonitorUp, PhoneOff, Hand, VolumeX, X } from "lucide-react";
import { formatI18nTemplate, translateCurrentStaticSourceText, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioLiveCollaboration } from "../studio-live-collaboration-context";
import { StudioP2pCreativeHuddleController as StudioP2pHuddleController, type CreativeHuddleSnapshot as HuddleSnapshot } from "./studio-p2p-creative-huddle-controller";
import { HUDDLE_REACTIONS, HUDDLE_TEXT_LIMIT } from "./studio-p2p-huddle-protocol";
import { STUDIO_P2P_HUDDLE_OPEN_EVENT, STUDIO_P2P_HUDDLE_CLOSE_EVENT, notifyStudioP2pHuddleClosed, normalizeStudioP2pHuddleOpenDetail, type StudioP2pHuddleOpenDetail, type StudioP2pHuddleCloseDetail } from "./studio-p2p-huddle-events";
import { StudioP2pMediaTile as MediaTile, P2P_CONTROL_CLASS as controlClass } from "./StudioP2pMediaTile";
import { StudioP2pActivitiesPanel } from "./StudioP2pActivitiesPanel";
import { StudioP2pVirtualStudio } from "./StudioP2pVirtualStudio";
import { studioStrokeFocusActivitySnapshot, subscribeStudioStrokeFocusActivity } from "../../studio-stroke-focus-activity";
import { acquireStudioHuddleAudioFocus } from "./studio-p2p-huddle-audio-focus";
import { resolveStudioHuddleAuthority, type StudioHuddleAuthority } from "./studio-p2p-huddle-authority";
import { canRetryStudioHuddleConnection, resolveStudioHuddleAvailability, STUDIO_HUDDLE_AVAILABILITY_COPY } from "./studio-p2p-huddle-availability";

export default function StudioP2pHuddleLauncher({ placement = "floating" }: { readonly placement?: "floating" | "inline" } = {}) {
  const live = useStudioLiveCollaboration();
  const bt = useBilingual("domains.creator.live.huddle.StudioP2pHuddleLauncher");
  const strokeFocusPhase = useSyncExternalStore(
    subscribeStudioStrokeFocusActivity,
    studioStrokeFocusActivitySnapshot,
    () => "idle",
  );
  const controller = useRef<StudioP2pHuddleController | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const authority = useRef<StudioHuddleAuthority | null>(null);
  const offAuthority = useRef<(() => void) | null>(null);
  const proximityPeerIds = useRef<Set<string> | null>(null);
  const conversation = useRef<{ id: string; peerIds: readonly string[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HuddleSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [deafened, setDeafened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proximityMedia, setProximityMedia] = useState(true);
  const nearbyPeerIdsRef = useRef<string[]>([]);
  const proximityMediaRef = useRef(true);
  const log = useRef<HTMLDivElement>(null);
  const active = snapshot !== null && !snapshot.closed;
  useEffect(() => active ? acquireStudioHuddleAudioFocus() : undefined, [active]);
  const room = live.room;
  // The room is mutable: subscribe to its capability rather than memoizing room.direct
  // from context identity or the document's unrelated durability availability.
  const subscribeRoom = useCallback((onChange: () => void) => room?.subscribe((event) => {
    if (event.type === "transport-status") onChange();
  }) ?? (() => undefined), [room]);
  const readDirect = useCallback(() => room?.direct ?? null, [room]);
  const direct = useSyncExternalStore(subscribeRoom, readDirect, () => null);
  const availability = resolveStudioHuddleAvailability(live, direct);
  const canJoin = availability === "ready" && direct !== null;
  const canRetry = canRetryStudioHuddleConnection(availability, live.serverAvailable);
  const handleNearbyChange = useCallback((sessionIds: string[]) => {
    if (conversation.current) return;
    nearbyPeerIdsRef.current = sessionIds;
    if (proximityMediaRef.current) controller.current?.setMediaPeerScope(sessionIds);
  }, []);
  const handleProximityMediaChange = useCallback((enabled: boolean) => {
    if (conversation.current) return;
    proximityMediaRef.current = enabled;
    setProximityMedia(enabled);
    controller.current?.setMediaPeerScope(enabled ? nearbyPeerIdsRef.current : null);
  }, []);
  const disposeSession = useCallback(() => {
    const conversationId = conversation.current?.id;
    conversation.current = null;
    authority.current = null;
    offAuthority.current?.(); offAuthority.current = null;
    const previous = controller.current;
    controller.current = null;
    cleanup.current?.(); cleanup.current = null;
    previous?.close();
    proximityPeerIds.current = null;
    nearbyPeerIdsRef.current = [];
    proximityMediaRef.current = true;
    if (conversationId) notifyStudioP2pHuddleClosed({ conversationId });
  }, []);
  const leave = useCallback(() => {
    disposeSession();
    setSnapshot(null); setDraft(""); setBusy(false); setDeafened(false); setProximityMedia(true);
  }, [disposeSession]);
  useEffect(() => {
    proximityPeerIds.current = null;
    conversation.current = null;
    nearbyPeerIdsRef.current = [];
    proximityMediaRef.current = true;
    setSnapshot(null); setDraft(""); setBusy(false); setProximityMedia(true);
    return disposeSession;
  }, [disposeSession, room, direct, canJoin, live.canChat]);
  useEffect(() => {
    if (strokeFocusPhase === "drawing") setOpen(false);
  }, [strokeFocusPhase]);
  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = normalizeStudioP2pHuddleOpenDetail((event as CustomEvent<StudioP2pHuddleOpenDetail>).detail ?? {});
      if (!detail) return;
      const requestedIds = detail.peerIds ? [...detail.peerIds].sort() : null;
      const nextConversation = detail.conversationId && requestedIds
        ? { id: detail.conversationId, peerIds: requestedIds } : null;
      const nextAuthority = detail.authorityToken && nextConversation
        ? resolveStudioHuddleAuthority(detail.authorityToken,nextConversation.id,nextConversation.peerIds) : null;
      if (detail.authorityToken && !nextAuthority) return;
      const current = conversation.current;
      const changed = current?.id !== nextConversation?.id
        || JSON.stringify(current?.peerIds ?? null) !== JSON.stringify(nextConversation?.peerIds ?? null)
        || authority.current !== nextAuthority;
      // Capture consent belongs to this exact audience. Never carry enabled devices into another conversation.
      if (changed) leave();
      conversation.current = nextConversation;
      authority.current = nextAuthority;
      if (changed && nextAuthority) offAuthority.current = nextAuthority.subscribe(() => {
        if (authority.current !== nextAuthority || nextAuthority.valid()) return;
        leave(); setOpen(false);
      });
      proximityPeerIds.current = requestedIds ? new Set(requestedIds) : null;
      nearbyPeerIdsRef.current = requestedIds ?? [];
      proximityMediaRef.current = requestedIds !== null;
      setProximityMedia(requestedIds !== null);
      controller.current?.setMediaPeerScope(requestedIds);
      controller.current?.refreshPeers();
      setOpen(true);
    };
    const handleClose = (event: Event) => {
      const detail = (event as CustomEvent<StudioP2pHuddleCloseDetail>).detail;
      if ((detail?.conversationId ?? null) !== (conversation.current?.id ?? null)) return;
      leave(); setOpen(false);
    };
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, handleOpen);
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, handleClose);
    return () => {
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, handleOpen);
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, handleClose);
    };
  }, [leave]);
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
    const element = log.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 160)
      element.scrollTop = element.scrollHeight;
  }, [snapshot?.messages.length]);
  function join() {
    if (!room?.direct || resolveStudioHuddleAvailability(live) !== "ready" || controller.current || (authority.current && !authority.current.valid())) return;
    const scopeAuthority = authority.current;
    const next = new StudioP2pHuddleController(room.participant, room.direct, {
      peerFilter: (peer) => proximityPeerIds.current?.has(peer.sessionId) ?? true,
      conversation: conversation.current ?? undefined,
      ...(scopeAuthority ? {authorityValid:()=>authority.current===scopeAuthority&&scopeAuthority.valid(),captureRevision:scopeAuthority.captureRevision} : {}),
    });
    next.setMediaPeerScope(conversation.current?.peerIds ?? (proximityMediaRef.current ? nearbyPeerIdsRef.current : null));
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
    if (resolveStudioHuddleAvailability(live) !== "ready" || (authority.current && !authority.current.valid())) { leave(); setOpen(false); return; }
    const owner = controller.current; setBusy(true);
    try { await action(); } finally { if (controller.current === owner) setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (controller.current?.sendChat(draft)) { setDraft(""); setNotice(null); }
    else setNotice("메시지를 보내지 못했습니다. 연결이 복구되면 다시 보낼 수 있습니다.");
  }
  if (!live.canChat) return null;
  const mediaAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
  return <aside
    className={placement === "inline" ? "studio-p2p-huddle-dock pointer-events-none relative ml-auto flex shrink-0 flex-col items-end" : "studio-p2p-huddle-dock pointer-events-none fixed bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4.25rem)] right-3 z-[65] flex max-h-[calc(100dvh-var(--studio-canvas-bottom-inset,7rem)-5rem)] max-w-[calc(100vw-1.5rem)] flex-col items-end sm:bottom-3 sm:max-h-[calc(100dvh-1.5rem)]"}
    data-studio-huddle-placement={placement}
    aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "협업 대화")}
    data-studio-shell-floating-target={placement === "floating" ? "collaboration" : undefined}
    data-studio-shell-force-visible={active ? translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "en", "true") : undefined}
  >
    <section id="studio-p2p-huddle-panel" hidden={!open} style={{ display: open ? "flex" : undefined, ...(placement === "inline" ? { position: "absolute", bottom: "100%", right: 0, zIndex: 65, maxWidth: "calc(100vw - 2.25rem)", maxHeight: "min(680px, calc(100dvh - 10rem))" } as const : {}) }} className="studio-p2p-huddle-panel pointer-events-auto mb-2 min-h-0 w-[min(760px,calc(100vw-1.5rem))] max-w-full flex-col overflow-hidden rounded-2xl border border-accent/40 bg-panel text-fg shadow-2xl"
      aria-labelledby="studio-p2p-huddle-heading" data-studio-p2p-huddle="true">
      <header className="flex shrink-0 items-center justify-between border-b border-line p-3">
        <div><h3 id="studio-p2p-huddle-heading" className="text-sm font-bold">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "Virtual Studio · Huddle")}</h3>
          <p className="text-[11px] text-fg-3">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "근접 P2P 우선 · 카메라·마이크는 직접 켤 때만 사용")}</p></div>
        <button type="button" className={`${controlClass} min-w-11 shrink-0`} aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "대화 패널 접기")} onClick={() => setOpen(false)}><X size={16} /></button>
      </header>
      <div className="min-h-0 max-h-[68dvh] space-y-3 overflow-y-auto overscroll-contain p-3">
        {!active ? <div className="space-y-3 text-xs leading-relaxed text-fg-2">
          <p>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "참여하면 채팅만 시작됩니다. 마이크·카메라는 직접 켜기 전까지 사용하지 않습니다.")}</p>
          <p>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "대화·통화는 브라우저 간 직접 전송하며 기록을 저장하지 않습니다. 상대에게 네트워크 주소가 노출될 수 있으니 신뢰하는 작업자와 사용해 주세요.")}</p>
          <p>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "회사망·일부 모바일망에서는 연결되지 않을 수 있습니다. 실패 시 서버 중계로 전환하지 않습니다. 상대방의 녹화·캡처까지 막지는 못합니다.")}</p>
          {availability !== "ready" && <div className="space-y-2" data-studio-huddle-availability={availability}>
            <p id="studio-huddle-unavailable" role="status" className="text-warn">{live.connectionRecovery === "waiting" || live.connectionRecovery === "retrying" ? bt("채팅·통화 연결을 자동으로 복구하고 있습니다.", "Reconnecting chat and calls automatically.") : bt(...STUDIO_HUDDLE_AVAILABILITY_COPY[availability])}</p>
            {canRetry && live.connectionRecovery !== "waiting" && live.connectionRecovery !== "retrying" && <button type="button" className={controlClass} onClick={live.retryServer}>
              {bt("다시 시도", "Try again")}
            </button>}
          </div>}
          <button className={controlClass} type="button" disabled={!canJoin} aria-describedby={!canJoin ? "studio-huddle-unavailable" : undefined} onClick={join}>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "동의하고 P2P 채팅 참여")}</button>
        </div> : <>
          <p className="text-xs text-fg-2" role="status">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "나 포함 ")}{(snapshot?.peers.length ?? 0) + 1}{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "명 참여 · 연결 가능 ")}{snapshot?.availablePeers ?? 0}{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "명")}</p>
          {proximityPeerIds.current ? <p className="rounded-lg bg-accent-soft px-2 py-1.5 text-[11px] font-semibold text-accent" data-studio-p2p-proximity-scope="true" data-studio-p2p-conversation={conversation.current?.id}>{conversation.current ? bt("수락한 대화 참여자에게만 연결합니다.", "Only accepted conversation members are connected.") : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "가상 스튜디오 근처 대화 · 가까운 팀원만 직접 연결")}</p> : null}
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
          {room?.direct && !conversation.current && <StudioP2pVirtualStudio
            self={room.participant}
            port={room.direct}
            proximityMedia={proximityMedia}
            onProximityMediaChange={handleProximityMediaChange}
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
          {!snapshot?.peers.length && <p className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "아직 참여한 팀원이 없습니다. 같은 작업실에서 팀원이 채팅에 참여하면 자동으로 연결됩니다.")}</p>}
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
    <button type="button" aria-controls="studio-p2p-huddle-panel" aria-expanded={open} className="pointer-events-auto ml-auto flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-accent/40 bg-panel px-4 text-xs font-bold text-fg shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      onClick={() => {
        const nextOpen = !open;
        if (nextOpen) {
          proximityPeerIds.current = null;
          controller.current?.refreshPeers();
        }
        setOpen(nextOpen);
      }}>
      <MessageCircle size={16} />{active ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "P2P 대화 중 · {v0}명"), { v0: String((snapshot?.peers.length ?? 0) + 1) }) : translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "채팅·통화")}
      {active && <span className="size-2 rounded-full bg-good" aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pHuddleLauncher", "ko", "대화 참여 중")} />}
    </button>
  </aside>;
}
