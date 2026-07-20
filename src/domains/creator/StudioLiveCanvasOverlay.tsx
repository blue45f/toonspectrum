import {
  Check,
  CloudOff,
  LoaderCircle,
  MessageCircle,
  MousePointer2,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  studioLivePresenceAlwaysVisible,
  studioPresenceConnectionLabel,
  studioPresenceOverflowLabel,
  studioPresenceVisiblePeerCount,
} from "./studio-commercial-residuals";
import {
  studioLiveParticipantColor,
  type StudioCanvasCommentPin,
} from "./studio-live-canvas-overlay-model";
import { useStudioLiveCollaboration } from "./studio-live-collaboration-context";
import {
  INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
  formatStudioLiveLastAck,
  presentStudioLiveSyncSnapshot,
  type StudioLiveSyncPhase,
  type StudioLiveSyncSnapshot,
} from "./studio-live-sync-safety";

import type { StudioCommentAnchor } from "./studio-comments";
import type {
  StudioLiveCursorPayload,
  StudioLiveParticipant,
} from "./studio-live-collaboration-protocol";
import type { StudioLivePeer } from "./studio-live-collaboration-room";

import { cn } from "@/lib/utils";

export interface StudioLiveCanvasCursor {
  participant: StudioLiveParticipant;
  cursor: StudioLiveCursorPayload;
  updatedAt: number;
}

export interface StudioLiveCanvasOverlayProps {
  canvasWidth: number;
  canvasHeight: number;
  cursors: readonly StudioLiveCanvasCursor[];
  commentPins: readonly StudioCanvasCommentPin[];
  onCommentPinClick: (
    anchor: StudioCommentAnchor,
    newestThreadId?: string,
    threadIds?: readonly string[]
  ) => void;
  flipX?: boolean;
  /** View-only clockwise quarter turn; horizontal flip remains relative to the visible screen. */
  rotation?: 0 | 90 | 180 | 270;
}

export interface StudioLivePresenceDockProps {
  connected: boolean;
  operationSyncReady?: boolean;
  /** Always-on collab: show while connecting/ready even with zero peers. */
  alwaysOn?: boolean;
  peers: readonly StudioLivePeer[];
  followingSessionId: string | null;
  onOpenTeam: () => void;
  onToggleFollow: (sessionId: string) => void;
  syncSnapshot?: StudioLiveSyncSnapshot;
  voiceControls?: ReactNode;
}

export interface StudioRemoteCursorOverlayProps {
  pageId: string;
  canvasWidth: number;
  canvasHeight: number;
  hidden?: boolean;
  commentPins: readonly StudioCanvasCommentPin[];
  onCommentPinClick: (
    anchor: StudioCommentAnchor,
    newestThreadId?: string,
    threadIds?: readonly string[]
  ) => void;
  flipX?: boolean;
  /** View-only clockwise quarter turn; horizontal flip remains relative to the visible screen. */
  rotation?: 0 | 90 | 180 | 270;
}

export interface StudioLivePresenceDockConnectedProps {
  operationSyncReady?: boolean;
  followingSessionId: string | null;
  onOpenTeam: () => void;
  onToggleFollow: (sessionId: string) => void;
  onFollowPage: (pageId: string) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface StudioLiveOverlayProjection {
  x: number;
  y: number;
  screenOffsetX: number;
  screenOffsetY: number;
}

/** Project document-local coordinates into the axis-aligned quarter-turned view box. */
function projectStudioLiveOverlayPoint(
  x: number,
  y: number,
  screenOffsetX: number,
  screenOffsetY: number,
  flipX: boolean,
  rotation: 0 | 90 | 180 | 270
): StudioLiveOverlayProjection {
  let projected: StudioLiveOverlayProjection;
  if (rotation === 90) {
    projected = {
      x: 1 - y,
      y: x,
      screenOffsetX: -screenOffsetY,
      screenOffsetY: screenOffsetX,
    };
  } else if (rotation === 180) {
    projected = {
      x: 1 - x,
      y: 1 - y,
      screenOffsetX: -screenOffsetX,
      screenOffsetY: -screenOffsetY,
    };
  } else if (rotation === 270) {
    projected = {
      x: y,
      y: 1 - x,
      screenOffsetX: screenOffsetY,
      screenOffsetY: -screenOffsetX,
    };
  } else {
    projected = {
      x,
      y,
      screenOffsetX,
      screenOffsetY,
    };
  }

  return flipX
    ? {
        ...projected,
        x: 1 - projected.x,
        screenOffsetX: -projected.screenOffsetX,
      }
    : projected;
}

function initial(value: string): string {
  return Array.from(value.trim())[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}

function roleLabel(role: StudioLiveParticipant["role"]): string {
  if (role === "owner") return "소유자";
  if (role === "admin") return "관리자";
  if (role === "editor") return "편집자";
  if (role === "commenter") return "검토자";
  return "열람자";
}

function syncToneClass(tone: ReturnType<typeof presentStudioLiveSyncSnapshot>["tone"]): string {
  if (tone === "good") return "border-good/40 bg-good/10 text-good";
  if (tone === "warn") return "border-warn/45 bg-warn/10 text-warn";
  if (tone === "bad") return "border-bad/50 bg-bad/12 text-bad";
  if (tone === "cool") return "border-cool/40 bg-cool/10 text-cool";
  return "border-line bg-card text-fg-2";
}

function StudioSyncStatusIcon({ phase }: { phase: StudioLiveSyncPhase }) {
  if (phase === "synced") return <ShieldCheck size={14} aria-hidden />;
  if (phase === "offline-queued") return <CloudOff size={14} aria-hidden />;
  if (phase === "repairing") return <Wrench size={14} aria-hidden />;
  if (phase === "durability-risk" || phase === "revoked" || phase === "recovery-required") {
    return <ShieldAlert size={14} aria-hidden />;
  }
  if (phase === "retrying") {
    return (
      <RefreshCw
        className="animate-spin [animation-duration:1.4s] motion-reduce:animate-none"
        size={14}
        aria-hidden
      />
    );
  }
  if (phase === "syncing" || phase === "initializing") {
    return (
      <LoaderCircle
        className="animate-spin [animation-duration:1.2s] motion-reduce:animate-none"
        size={14}
        aria-hidden
      />
    );
  }
  return <Radio size={14} aria-hidden />;
}

export function StudioLiveCanvasOverlay({
  canvasWidth,
  canvasHeight,
  cursors,
  commentPins,
  onCommentPinClick,
  flipX = false,
  rotation = 0,
}: StudioLiveCanvasOverlayProps) {
  return (
    <div
      aria-label="공동작업 캔버스 오버레이"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      data-studio-live-canvas-overlay
    >
      {commentPins.map((pin) => {
        const projected = projectStudioLiveOverlayPoint(
          pin.x / canvasWidth,
          pin.y / canvasHeight,
          pin.screenOffsetX ?? 0,
          pin.screenOffsetY ?? 0,
          flipX,
          rotation
        );
        return (
          <button
            key={pin.key}
            type="button"
            aria-haspopup="dialog"
            aria-label={`${pin.label}, ${pin.unreadCount ? `읽지 않은 댓글 ${pin.unreadCount}개, ` : ""}열림 댓글 ${pin.count}개`}
            data-studio-comment-pin="true"
            className={cn(
              "pointer-events-auto absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[0.65rem] font-black tabular-nums text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              "[&>span]:transition-transform [&>span]:duration-200 motion-reduce:[&>span]:transition-none hover:[&>span]:scale-110",
              pin.unreadCount ? "[&>span]:ring-4 [&>span]:ring-accent/30" : null
            )}
            style={{
              left: `clamp(1.375rem, calc(${(projected.x * 100).toFixed(4)}% + ${projected.screenOffsetX}px), calc(100% - 1.375rem))`,
              top: `clamp(1.375rem, calc(${(projected.y * 100).toFixed(4)}% + ${projected.screenOffsetY}px), calc(100% - 1.375rem))`,
            }}
            title={`${pin.label} · ${pin.unreadCount ? `읽지 않음 ${pin.unreadCount}개 · ` : ""}열림 ${pin.count}개`}
            onClick={() => onCommentPinClick(
              pin.anchor,
              pin.newestUnreadThreadId ?? pin.newestThreadId,
              pin.threadIds
            )}
          >
            <span className="relative grid size-8 place-items-center rounded-full border-2 border-panel bg-accent shadow-[0_4px_14px_oklch(0.10_0.02_70/0.42)]">
              {pin.count > 1 ? pin.count : <MessageCircle size={14} aria-hidden />}
              {pin.unreadCount ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-panel bg-warn shadow-sm"
                />
              ) : null}
            </span>
          </button>
        );
      })}

      {cursors.map(({ participant, cursor }) => {
        const color = studioLiveParticipantColor(participant.sessionId);
        const projected = projectStudioLiveOverlayPoint(
          clamp(cursor.x, 0, 1),
          clamp(cursor.y, 0, 1),
          0,
          0,
          flipX,
          rotation
        );
        return (
          <div
            key={participant.sessionId}
            className="absolute left-0 top-0 motion-safe:transition-[left,top] motion-safe:duration-75"
            style={{
              left: `${projected.x * 100}%`,
              top: `${projected.y * 100}%`,
            }}
          >
            <MousePointer2
              aria-hidden
              className="drop-shadow-[0_2px_2px_rgb(0_0_0/0.35)]"
              fill={color}
              size={22}
              stroke="white"
              strokeWidth={2}
            />
            <span
              className="ml-3 -mt-0.5 block max-w-40 truncate rounded-md px-2 py-1 text-[0.65rem] font-bold leading-none text-white shadow-lg"
              style={{ backgroundColor: color }}
            >
              {participant.displayName}
              {cursor.tool ? <span className="ml-1 font-medium opacity-80">· {cursor.tool}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const REMOTE_CURSOR_TTL_MS = 3_000;
const REMOTE_CURSOR_LIMIT = 64;

/** Isolated high-frequency subscriber so cursor traffic never rerenders the giant Studio editor. */
export function StudioRemoteCursorOverlay({
  pageId,
  canvasWidth,
  canvasHeight,
  hidden = false,
  commentPins,
  onCommentPinClick,
  flipX = false,
  rotation = 0,
}: StudioRemoteCursorOverlayProps) {
  const { room } = useStudioLiveCollaboration();
  const cursorMapRef = useRef(new Map<string, StudioLiveCanvasCursor>());
  const frameRef = useRef<number | null>(null);
  const [cursors, setCursors] = useState<StudioLiveCanvasCursor[]>([]);

  useEffect(() => {
    const cursorMap = cursorMapRef.current;
    cursorMap.clear();
    setCursors([]);
    if (!room) return;

    let pendingRender = false;
    const flush = () => {
      frameRef.current = null;
      const now = Date.now();
      let expired = false;
      for (const [sessionId, value] of cursorMap) {
        if (now - value.updatedAt <= REMOTE_CURSOR_TTL_MS) continue;
        cursorMap.delete(sessionId);
        expired = true;
      }
      if (pendingRender || expired) setCursors(Array.from(cursorMap.values()));
      pendingRender = false;
    };
    const scheduleFlush = (renderChanged = true) => {
      if (renderChanged) pendingRender = true;
      if (frameRef.current !== null) return;
      frameRef.current = globalThis.requestAnimationFrame(flush);
    };
    const clear = () => {
      const changed = cursorMap.size > 0;
      cursorMap.clear();
      scheduleFlush(changed);
    };

    const unsubscribe = room.subscribe((event) => {
      if (event.type === "cursor") {
        const sessionId = event.participant.sessionId;
        if (
          !cursorMap.has(sessionId) &&
          cursorMap.size >= REMOTE_CURSOR_LIMIT
        ) {
          const oldest = Array.from(cursorMap.entries()).sort(
            (left, right) => left[1].updatedAt - right[1].updatedAt
          )[0];
          if (oldest) cursorMap.delete(oldest[0]);
        }
        cursorMap.set(sessionId, {
          participant: event.participant,
          cursor: event.cursor,
          updatedAt: Date.now(),
        });
        scheduleFlush();
        return;
      }
      if (event.type === "presence") {
        const activeSessions = new Set(event.peers.map((peer) => peer.sessionId));
        let changed = false;
        for (const sessionId of cursorMap.keys()) {
          if (activeSessions.has(sessionId)) continue;
          cursorMap.delete(sessionId);
          changed = true;
        }
        scheduleFlush(changed);
        return;
      }
      if (
        event.type === "transport-status" &&
        event.status.state !== "ready" &&
        !(event.status.state === "error" && room.ready)
      ) {
        clear();
      }
    });
    const pruneTimer = globalThis.setInterval(() => scheduleFlush(false), 1_000);

    return () => {
      unsubscribe();
      globalThis.clearInterval(pruneTimer);
      if (frameRef.current !== null) globalThis.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      cursorMap.clear();
    };
  }, [room]);

  if (hidden) return null;
  return (
    <StudioLiveCanvasOverlay
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      cursors={cursors.filter((value) => value.cursor.pageId === pageId)}
      commentPins={commentPins}
      onCommentPinClick={onCommentPinClick}
      flipX={flipX}
      rotation={rotation}
    />
  );
}

export function StudioLivePresenceDock({
  connected,
  operationSyncReady = false,
  alwaysOn = false,
  peers,
  followingSessionId,
  onOpenTeam,
  onToggleFollow,
  syncSnapshot,
  voiceControls,
}: StudioLivePresenceDockProps) {
  // Always-on collab chrome: parent passes alwaysOn while connecting/ready (presence strip).
  if (!alwaysOn && !connected && peers.length === 0) return null;
  const visibleCount = studioPresenceVisiblePeerCount(peers.length, 5);
  const visiblePeers = peers.slice(0, visibleCount);
  const mobileHiddenPeerCount = Math.max(0, peers.length - 2);
  const desktopHiddenPeerCount = Math.max(0, peers.length - visiblePeers.length);
  const mobileOverflow = studioPresenceOverflowLabel(mobileHiddenPeerCount);
  const desktopOverflow = studioPresenceOverflowLabel(desktopHiddenPeerCount);
  const connectionLabel = studioPresenceConnectionLabel(connected);
  const resolvedSync = syncSnapshot ?? {
    ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
    phase: connected && operationSyncReady ? "syncing" : connected ? "syncing" : "retrying",
    transportReady: connected,
    operationSyncReady,
    message: connected
      ? operationSyncReady
        ? "원고 보존 경로를 확인하는 중입니다."
        : "원고 연산 동기화를 준비하는 중입니다."
      : connectionLabel,
  };
  const syncPresentation = presentStudioLiveSyncSnapshot(resolvedSync);
  const lastAckLabel = formatStudioLiveLastAck(resolvedSync.lastAckAt);
  const syncAnnouncement = `${syncPresentation.shortLabel}. ${syncPresentation.detail}`;
  const collaborationLabel = `${syncAnnouncement} ${lastAckLabel}.`;
  const followedPeer = peers.find((peer) => peer.sessionId === followingSessionId) ?? null;

  return (
    <div
      data-studio-presence-dock="true"
      data-studio-sync-phase={resolvedSync.phase}
      className="pointer-events-auto flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-1.5 rounded-xl border border-line/80 bg-panel/95 p-1.5 shadow-xl backdrop-blur-md"
    >
      {syncPresentation.assertive ? (
        <span aria-atomic="true" aria-live="assertive" className="sr-only" role="alert">
          {syncAnnouncement}
        </span>
      ) : (
        <span aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {syncAnnouncement}
        </span>
      )}
      <button
        type="button"
        aria-label="팀 작업 공간 열기"
        title="팀"
        className="grid size-11 shrink-0 place-items-center rounded-lg border border-line/60 bg-card/80 text-fg-2 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        onClick={onOpenTeam}
      >
        <UsersRound size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`${collaborationLabel} 팀 작업 공간 열기`}
        title={`${syncPresentation.detail} · ${lastAckLabel}`}
        data-studio-presence-link={resolvedSync.phase}
        className={cn(
          "inline-flex min-h-11 min-w-0 shrink items-center gap-1.5 rounded-full border px-3 text-[0.7rem] font-bold transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
          syncToneClass(syncPresentation.tone)
        )}
        onClick={onOpenTeam}
      >
        <StudioSyncStatusIcon phase={resolvedSync.phase} />
        <span className="max-w-40 truncate sm:max-w-56">{syncPresentation.shortLabel}</span>
      </button>

      {voiceControls}

      <div
        className="flex items-center -space-x-1.5 pl-0.5"
        role="group"
        aria-label="참여자"
        data-studio-presence-stack="true"
      >
        {visiblePeers.map((peer, index) => {
          const following = peer.sessionId === followingSessionId;
          const color = studioLiveParticipantColor(peer.sessionId);
          return (
            <button
              key={peer.sessionId}
              type="button"
              aria-label={
                following
                  ? `${peer.displayName} 따라가기 중지`
                  : `${peer.displayName} 작업 페이지 따라가기`
              }
              aria-pressed={following}
              className={cn(
                "relative grid size-11 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none",
                // Peer hue is data color; cream ink for contrast (DESIGN: no raw white on accent surfaces).
                "text-[oklch(0.96_0.01_85)]",
                following ? "z-10 border-accent ring-2 ring-accent/30" : "border-panel",
                index >= 2 && "hidden sm:grid"
              )}
              style={{ backgroundColor: color, zIndex: following ? 20 : 10 - index }}
              title={`${peer.displayName} · ${roleLabel(peer.role)}${peer.pageId ? " · 클릭해 따라가기" : ""}`}
              onClick={() => onToggleFollow(peer.sessionId)}
            >
              {initial(peer.displayName)}
              <span
                aria-label={peer.visibility === "active" ? "활성" : "자리 비움"}
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel",
                  peer.visibility === "active" ? "bg-good" : "bg-fg-3"
                )}
              />
              {following ? (
                <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-accent text-on-accent">
                  <Check size={10} aria-hidden />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {mobileOverflow ? (
        <button
          type="button"
          aria-label={`추가 팀원 ${mobileHiddenPeerCount}명, 팀 작업 공간 열기`}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-raised text-[0.65rem] font-bold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:hidden"
          onClick={onOpenTeam}
        >
          {mobileOverflow}
        </button>
      ) : null}

      {desktopOverflow ? (
        <button
          type="button"
          aria-label={`추가 팀원 ${desktopHiddenPeerCount}명, 팀 작업 공간 열기`}
          className="hidden size-11 shrink-0 place-items-center rounded-full border border-line bg-raised text-[0.65rem] font-bold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:grid"
          onClick={onOpenTeam}
        >
          {desktopOverflow}
        </button>
      ) : null}

      {followedPeer ? (
        <button
          type="button"
          aria-label={`${followedPeer.displayName} 따라가기 중지`}
          className="order-last ml-auto inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft px-2.5 text-[0.68rem] font-bold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:ml-1 sm:max-w-40"
          onClick={() => onToggleFollow(followedPeer.sessionId)}
        >
          <span className="truncate">{followedPeer.displayName} 따라가기</span>
          <X size={12} className="shrink-0" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function StudioLivePresenceDockConnected({
  operationSyncReady,
  followingSessionId,
  onOpenTeam,
  onToggleFollow,
  onFollowPage,
}: StudioLivePresenceDockConnectedProps) {
  const live = useStudioLiveCollaboration();
  const { availability, peers, sync } = live;
  const followedPeer = peers.find((peer) => peer.sessionId === followingSessionId) ?? null;
  const alwaysOn = studioLivePresenceAlwaysVisible(availability, peers.length);

  useEffect(() => {
    if (followedPeer?.pageId) onFollowPage(followedPeer.pageId);
  }, [followedPeer?.pageId, onFollowPage]);

  useEffect(() => {
    if (followingSessionId && !followedPeer) onToggleFollow(followingSessionId);
  }, [followedPeer, followingSessionId, onToggleFollow]);

  if (!alwaysOn) return null;

  return (
    <StudioLivePresenceDock
      connected={availability === "ready"}
      operationSyncReady={operationSyncReady}
      alwaysOn
      peers={peers}
      followingSessionId={followingSessionId}
      onOpenTeam={onOpenTeam}
      onToggleFollow={onToggleFollow}
      syncSnapshot={sync}
    />
  );
}
