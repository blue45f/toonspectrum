from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ROOM = "src/domains/creator/live/studio-live-collaboration-room.ts"
OVERLAY = "src/domains/creator/live/StudioLiveCanvasOverlay.tsx"
STAGE_HOST = "src/domains/creator/canvas/StudioCanvasViewportStageHost.tsx"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str, *, guard: str | None = None) -> None:
    content = read(path)
    if (guard and guard in content) or new in content:
        return
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


def replace_section(
    path: str,
    start: str,
    end: str,
    replacement: str,
    *,
    guard: str | None = None,
) -> None:
    content = read(path)
    if guard and guard in content:
        return
    start_index = content.find(start)
    if start_index < 0:
        raise RuntimeError(f"{path}: section start not found: {start!r}")
    end_index = content.find(end, start_index + len(start))
    if end_index < 0:
        raise RuntimeError(f"{path}: section end not found: {end!r}")
    write(path, content[:start_index] + replacement + content[end_index:])


# ---------------------------------------------------------------------------
# Room: rolling-deploy-safe cursor chat and attention requests.
# ---------------------------------------------------------------------------
replace_once(
    ROOM,
    '''} from "../studio-team-comment-live-event";

import {
  STUDIO_LIVE_LOCK_MAX_LEASE_MS,''',
    '''} from "../studio-team-comment-live-event";

import {
  STUDIO_LIVE_ATTENTION_FALLBACK_TEXT,
  STUDIO_LIVE_ATTENTION_VISIBLE_MS,
  STUDIO_LIVE_CURSOR_CHAT_MAX_LENGTH,
  createStudioLiveAttentionMessageId,
  createStudioLiveCursorChatMessageId,
  isStudioLiveChatControlMessageId,
  parseStudioLiveChatControl,
} from "./studio-live-chat-control";

import {
  STUDIO_LIVE_LOCK_MAX_LEASE_MS,''',
    guard='from "./studio-live-chat-control"',
)

replace_once(
    ROOM,
    '''export interface StudioLiveChatMessage {
  id: string;
  participant: StudioLiveParticipant;
  text: string;
  sentAt: number;
  self: boolean;
}

export type StudioLiveRoomEvent =''',
    '''export interface StudioLiveChatMessage {
  id: string;
  participant: StudioLiveParticipant;
  text: string;
  sentAt: number;
  self: boolean;
}

/** One transient Figma-style message rendered beside the author's current cursor. */
export interface StudioLiveCursorChatMessage {
  id: string;
  participant: StudioLiveParticipant;
  text: string;
  sentAt: number;
  expiresAt: number;
}

/** A short-lived Miro-style invitation to follow the sender's current page and future moves. */
export interface StudioLiveAttentionRequest {
  requestId: string;
  participant: StudioLiveParticipant;
  pageId: string | null;
  sentAt: number;
  expiresAt: number;
}

export type StudioLiveRoomEvent =''',
    guard="export interface StudioLiveCursorChatMessage",
)

replace_once(
    ROOM,
    '''  | { type: "locks"; locks: StudioLiveLock[] }
  | { type: "chat"; message: StudioLiveChatMessage }
  | {
      type: "gesture-preview";''',
    '''  | { type: "locks"; locks: StudioLiveLock[] }
  | { type: "chat"; message: StudioLiveChatMessage }
  | { type: "cursor-chat"; message: StudioLiveCursorChatMessage }
  | { type: "attention"; request: StudioLiveAttentionRequest }
  | {
      type: "gesture-preview";''',
    guard='type: "cursor-chat"',
)

replace_once(
    ROOM,
    '''    return { ...message, participant: copyParticipant(message.participant) };
  }

  updatePresence(patch: Partial<StudioLivePresencePayload>): void {''',
    '''    return { ...message, participant: copyParticipant(message.participant) };
  }

  /** Sends a five-second cursor-anchored note without adding it to session chat history. */
  sendCursorChat(text: string): boolean {
    if (!this.ready || this.participant.role === "viewer") return false;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > STUDIO_LIVE_CURSOR_CHAT_MAX_LENGTH) return false;
    try {
      return this.post("chat:message", {
        messageId: createStudioLiveCursorChatMessageId(this.randomId()),
        text: trimmed,
      });
    } catch {
      return false;
    }
  }

  /** Broadcasts a short-lived invitation to follow this editor's current page. */
  requestAttention(): boolean {
    if (
      !this.ready ||
      !canEditStudioLiveGesturePreview(this.participant) ||
      !this.presence.pageId
    ) {
      return false;
    }
    const now = this.now();
    try {
      // Ordered transports deliver this presence refresh first, so the accept action can navigate
      // immediately. If it arrives later, the existing follow effect moves on the next heartbeat.
      this.sendPresence("presence:heartbeat");
      return this.post(
        "chat:message",
        {
          messageId: createStudioLiveAttentionMessageId(
            this.randomId(),
            now + STUDIO_LIVE_ATTENTION_VISIBLE_MS
          ),
          text: STUDIO_LIVE_ATTENTION_FALLBACK_TEXT,
        },
        null,
        now
      );
    } catch {
      return false;
    }
  }

  updatePresence(patch: Partial<StudioLivePresencePayload>): void {''',
    guard="sendCursorChat(text: string)",
)

replace_section(
    ROOM,
    '      case "chat:message": {\n',
    '      case "screen:announce": {\n',
    '''      case "chat:message": {
        const payload = envelope.payload as StudioLiveChatMessagePayload;
        const control = parseStudioLiveChatControl({
          messageId: payload.messageId,
          text: payload.text,
          receivedAt,
        });
        if (control?.kind === "cursor-chat") {
          if (envelope.sender.role === "viewer") return;
          this.emit({
            type: "cursor-chat",
            message: {
              id: payload.messageId,
              participant: copyParticipant(envelope.sender),
              text: control.text,
              sentAt: envelope.sentAt,
              expiresAt: control.expiresAt,
            },
          });
          return;
        }
        if (control?.kind === "attention") {
          if (!canEditStudioLiveGesturePreview(envelope.sender)) return;
          this.emit({
            type: "attention",
            request: {
              requestId: control.requestId,
              participant: copyParticipant(envelope.sender),
              pageId: this.peers.get(envelope.sender.sessionId)?.pageId ?? null,
              sentAt: envelope.sentAt,
              expiresAt: control.expiresAt,
            },
          });
          return;
        }
        // A malformed reserved id is never downgraded into a visible chat line.
        if (isStudioLiveChatControlMessageId(payload.messageId)) return;
        const message: StudioLiveChatMessage = {
          id: payload.messageId,
          participant: copyParticipant(envelope.sender),
          text: payload.text,
          sentAt: envelope.sentAt,
          self: false,
        };
        this.appendChatMessage(message);
        this.emit({
          type: "chat",
          message: { ...message, participant: copyParticipant(message.participant) },
        });
        return;
      }
''',
    guard='type: "cursor-chat",\n            message:',
)

# ---------------------------------------------------------------------------
# Canvas: cursor-chat bubbles, priority admission, and quick collaboration chrome.
# ---------------------------------------------------------------------------
replace_once(
    OVERLAY,
    '''  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,''',
    '''  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,''',
    guard="  useMemo,",
)

replace_once(
    OVERLAY,
    '''} from "../studio-commercial-residuals";

import {
  presentStudioLiveCursorQuality,''',
    '''} from "../studio-commercial-residuals";

import { StudioLiveQuickCollaborationControls } from "./StudioLiveQuickCollaborationControls";
import {
  presentStudioLiveCursorQuality,''',
    guard='from "./StudioLiveQuickCollaborationControls"',
)

replace_once(
    OVERLAY,
    '''} from "./studio-live-canvas-overlay-model";
import { useStudioLiveCollaboration } from "./studio-live-collaboration-context";''',
    '''} from "./studio-live-canvas-overlay-model";
import { useStudioLiveCollaboration } from "./studio-live-collaboration-context";
import { selectStudioLivePresentedCursors } from "./studio-live-cursor-presentation";''',
    guard='from "./studio-live-cursor-presentation"',
)

replace_once(
    OVERLAY,
    '''import { useStudioRemoteCursors } from "./studio-live-remote-cursor-store";
import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";''',
    '''import { useStudioRemoteCursors } from "./studio-live-remote-cursor-store";
import { useStudioLiveCursorChatBubbles } from "./use-studio-live-cursor-chat-bubbles";
import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";''',
    guard='from "./use-studio-live-cursor-chat-bubbles"',
)

replace_once(
    OVERLAY,
    '''export interface StudioLiveCanvasCursor {
  participant: StudioLiveParticipant;
  cursor: StudioLiveCursorPayload;
  updatedAt: number;
}''',
    '''export interface StudioLiveCanvasCursor {
  participant: StudioLiveParticipant;
  cursor: StudioLiveCursorPayload;
  updatedAt: number;
  chatText?: string;
}''',
    guard="  chatText?: string;",
)

replace_once(
    OVERLAY,
    '''export interface StudioRemoteCursorOverlayProps {
  pageId: string;
  canvasWidth: number;''',
    '''export interface StudioRemoteCursorOverlayProps {
  pageId: string;
  followingSessionId?: string | null;
  canvasWidth: number;''',
    guard='''export interface StudioRemoteCursorOverlayProps {
  pageId: string;
  followingSessionId?: string | null;''',
)

replace_once(
    OVERLAY,
    '''      {cursors.map(({ participant, cursor }) => {''',
    '''      {cursors.map(({ participant, cursor, chatText }) => {''',
    guard="cursors.map(({ participant, cursor, chatText })",
)

replace_once(
    OVERLAY,
    '''                <span
                  className="ml-3 -mt-0.5 block max-w-40 truncate rounded-md px-2 py-1 text-[0.65rem] font-bold leading-none text-white shadow-lg"
                  style={{ backgroundColor: color }}
                >''',
    '''                {chatText ? (
                  <span
                    aria-live="polite"
                    className="absolute left-5 top-6 z-30 block w-max max-w-56 rounded-xl border border-line-strong bg-panel/98 px-3 py-2 text-xs font-semibold leading-relaxed text-fg shadow-[0_10px_30px_oklch(0.06_0.02_70/0.5)] backdrop-blur-md"
                    data-studio-live-cursor-chat="true"
                    role="status"
                  >
                    {chatText}
                  </span>
                ) : null}
                <span
                  className="ml-3 -mt-0.5 block max-w-40 truncate rounded-md px-2 py-1 text-[0.65rem] font-bold leading-none text-white shadow-lg"
                  style={{ backgroundColor: color }}
                >''',
    guard='data-studio-live-cursor-chat="true"',
)

replace_section(
    OVERLAY,
    "export function StudioRemoteCursorOverlay({\n",
    "export function StudioLivePresenceDock({\n",
    '''export function StudioRemoteCursorOverlay({
  pageId,
  followingSessionId = null,
  canvasWidth,
  canvasHeight,
  trailSuppressedSessionIds,
  hidden = false,
  commentPins,
  onCommentPinClick,
  onCommentPinReanchor,
  commentPinReanchorableThreadIds,
  commentPinReanchorDisabledReason,
  onCommentQuickReplyPreload,
  commentQuickReplyActive = false,
  flipX = false,
  rotation = 0,
}: StudioRemoteCursorOverlayProps) {
  const { room, peers } = useStudioLiveCollaboration();
  const { remoteCursorsVisible } = useStudioLiveViewPreferences();
  const cursorQualityTier = useStudioLiveCursorQuality(room?.workId ?? null)?.tier ?? null;
  const cursors = useStudioRemoteCursors(room);
  const cursorChats = useStudioLiveCursorChatBubbles(room);
  const chatTextBySession = useMemo(
    () => new Map(cursorChats.map((message) => [message.participant.sessionId, message.text] as const)),
    [cursorChats]
  );
  const cursorChatSessionIds = useMemo(
    () => new Set(cursorChats.map((message) => message.participant.sessionId)),
    [cursorChats]
  );
  const presentedCursors = useMemo(
    () => selectStudioLivePresentedCursors({
      cursors,
      peers,
      pageId,
      followingSessionId,
      pinnedSessionIds: cursorChatSessionIds,
      visible: remoteCursorsVisible,
      qualityTier: cursorQualityTier,
    }),
    [
      cursorChatSessionIds,
      cursorQualityTier,
      cursors,
      followingSessionId,
      pageId,
      peers,
      remoteCursorsVisible,
    ]
  );

  // Export/hydration boundaries hide every overlay. The user's cursor preference hides only
  // remote pointers; anchored review comments remain available.
  if (hidden) return null;
  return (
    <StudioLiveCanvasOverlay
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      cursors={presentedCursors.map((value) => {
        const chatText = chatTextBySession.get(value.participant.sessionId);
        return {
          ...value,
          ...(chatText ? { chatText } : {}),
          cursor: trailSuppressedSessionIds?.has(value.participant.sessionId)
            ? { ...value.cursor, points: undefined }
            : value.cursor,
        };
      })}
      commentPins={commentPins}
      onCommentPinClick={onCommentPinClick}
      onCommentPinReanchor={onCommentPinReanchor}
      commentPinReanchorableThreadIds={commentPinReanchorableThreadIds}
      commentPinReanchorDisabledReason={commentPinReanchorDisabledReason}
      onCommentQuickReplyPreload={onCommentQuickReplyPreload}
      commentQuickReplyActive={commentQuickReplyActive}
      flipX={flipX}
      rotation={rotation}
    />
  );
}

''',
    guard="const cursorChats = useStudioLiveCursorChatBubbles(room);",
)

replace_once(
    OVERLAY,
    '''      cursorQuality={cursorQuality}
      syncSnapshot={sync}
    />''',
    '''      cursorQuality={cursorQuality}
      syncSnapshot={sync}
      voiceControls={
        room ? (
          <StudioLiveQuickCollaborationControls
            room={room}
            peers={peers}
            followingSessionId={followingSessionId}
            onToggleFollow={onToggleFollow}
          />
        ) : null
      }
    />''',
    guard="<StudioLiveQuickCollaborationControls",
)

# Keep the followed collaborator above large-room cursor admission limits.
replace_once(
    STAGE_HOST,
    '''    editing,
    effScale,
    elementById,''',
    '''    editing,
    effScale,
    elementById,
    followingStudioSessionId,''',
    guard="    followingStudioSessionId,",
)

replace_once(
    STAGE_HOST,
    '''              <StudioRemoteCursorOverlay
                pageId={activePage.id}
                canvasWidth={CANVAS_W}''',
    '''              <StudioRemoteCursorOverlay
                pageId={activePage.id}
                followingSessionId={followingStudioSessionId}
                canvasWidth={CANVAS_W}''',
    guard="                followingSessionId={followingStudioSessionId}",
)

print("Applied realtime collaboration V19 cursor chat and attention integration.")
