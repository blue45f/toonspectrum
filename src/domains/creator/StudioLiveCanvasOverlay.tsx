import { Check, MessageCircle, MousePointer2, Radio, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  onCommentPinClick: (anchor: StudioCommentAnchor) => void;
}

export interface StudioLivePresenceDockProps {
  connected: boolean;
  /** Magma always-on: show while connecting/ready even with zero peers. */
  alwaysOn?: boolean;
  peers: readonly StudioLivePeer[];
  followingSessionId: string | null;
  onOpenTeam: () => void;
  onToggleFollow: (sessionId: string) => void;
}

export interface StudioRemoteCursorOverlayProps {
  pageId: string;
  canvasWidth: number;
  canvasHeight: number;
  hidden?: boolean;
  commentPins: readonly StudioCanvasCommentPin[];
  onCommentPinClick: (anchor: StudioCommentAnchor) => void;
}

export interface StudioLivePresenceDockConnectedProps {
  followingSessionId: string | null;
  onOpenTeam: () => void;
  onToggleFollow: (sessionId: string) => void;
  onFollowPage: (pageId: string) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
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

export function StudioLiveCanvasOverlay({
  canvasWidth,
  canvasHeight,
  cursors,
  commentPins,
  onCommentPinClick,
}: StudioLiveCanvasOverlayProps) {
  return (
    <div
      aria-label="공동작업 캔버스 오버레이"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      data-studio-live-canvas-overlay
    >
      {commentPins.map((pin) => (
        <button
          key={pin.key}
          type="button"
          aria-label={`${pin.label}, 열림 댓글 ${pin.count}개`}
          className="pointer-events-auto absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-accent text-[0.65rem] font-black tabular-nums text-on-accent shadow-[0_4px_14px_oklch(0.12_0.03_270/0.38)] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{
            left: `${(pin.x / canvasWidth) * 100}%`,
            top: `${(pin.y / canvasHeight) * 100}%`,
          }}
          title={`${pin.label} · 열림 ${pin.count}개`}
          onClick={() => onCommentPinClick(pin.anchor)}
        >
          {pin.count > 1 ? pin.count : <MessageCircle size={14} aria-hidden />}
        </button>
      ))}

      {cursors.map(({ participant, cursor }) => {
        const color = studioLiveParticipantColor(participant.sessionId);
        return (
          <div
            key={participant.sessionId}
            className="absolute left-0 top-0 motion-safe:transition-[left,top] motion-safe:duration-75"
            style={{
              left: `${clamp(cursor.x, 0, 1) * 100}%`,
              top: `${clamp(cursor.y, 0, 1) * 100}%`,
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
    />
  );
}

export function StudioLivePresenceDock({
  connected,
  alwaysOn = false,
  peers,
  followingSessionId,
  onOpenTeam,
  onToggleFollow,
}: StudioLivePresenceDockProps) {
  // Always-on collab chrome: parent passes alwaysOn while connecting/ready (Magma presence strip).
  if (!alwaysOn && !connected && peers.length === 0) return null;
  const visibleCount = studioPresenceVisiblePeerCount(peers.length, 5);
  const visiblePeers = peers.slice(0, visibleCount);
  const mobileHiddenPeerCount = Math.max(0, peers.length - 2);
  const desktopHiddenPeerCount = Math.max(0, peers.length - visiblePeers.length);
  const mobileOverflow = studioPresenceOverflowLabel(mobileHiddenPeerCount);
  const desktopOverflow = studioPresenceOverflowLabel(desktopHiddenPeerCount);
  const connectionLabel = studioPresenceConnectionLabel(connected);
  const followedPeer = peers.find((peer) => peer.sessionId === followingSessionId) ?? null;

  return (
    <div
      data-studio-presence-dock="true"
      className="pointer-events-auto flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-1 rounded-xl border border-line/80 bg-panel/95 p-1.5 shadow-xl backdrop-blur-md"
    >
      <button
        type="button"
        aria-label="팀 작업 공간 열기"
        title="팀"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-line/60 bg-card/80 text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        onClick={onOpenTeam}
      >
        <UsersRound size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <span
        aria-label={connectionLabel}
        title={connectionLabel}
        data-studio-presence-link={connected ? "ready" : "retry"}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-1.5",
          connected
            ? "border-good/40 bg-good/10 text-good"
            : "animate-pulse border-warn/40 bg-warn/10 text-warn motion-reduce:animate-none"
        )}
        role="status"
      >
        <Radio size={12} aria-hidden />
        <span className="sr-only">{connectionLabel}</span>
      </span>

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
                "relative grid size-9 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
          className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-raised text-[0.65rem] font-bold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:hidden"
          onClick={onOpenTeam}
        >
          {mobileOverflow}
        </button>
      ) : null}

      {desktopOverflow ? (
        <button
          type="button"
          aria-label={`추가 팀원 ${desktopHiddenPeerCount}명, 팀 작업 공간 열기`}
          className="hidden size-9 shrink-0 place-items-center rounded-full border border-line bg-raised text-[0.65rem] font-bold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:grid"
          onClick={onOpenTeam}
        >
          {desktopOverflow}
        </button>
      ) : null}

      {followedPeer ? (
        <button
          type="button"
          aria-label={`${followedPeer.displayName} 따라가기 중지`}
          className="order-last ml-auto inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft px-2.5 text-[0.68rem] font-bold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:ml-1 sm:max-w-40"
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
  followingSessionId,
  onOpenTeam,
  onToggleFollow,
  onFollowPage,
}: StudioLivePresenceDockConnectedProps) {
  const { availability, peers } = useStudioLiveCollaboration();
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
      alwaysOn
      peers={peers}
      followingSessionId={followingSessionId}
      onOpenTeam={onOpenTeam}
      onToggleFollow={onToggleFollow}
    />
  );
}


