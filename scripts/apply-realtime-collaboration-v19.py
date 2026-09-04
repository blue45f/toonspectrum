from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if new in content:
        return
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:80]!r}")
    write(path, content.replace(old, new, 1))


def replace_section(path: str, start: str, end: str, replacement: str) -> None:
    content = read(path)
    if replacement in content:
        return
    start_index = content.find(start)
    if start_index < 0:
        raise RuntimeError(f"{path}: section start not found: {start!r}")
    end_index = content.find(end, start_index + len(start))
    if end_index < 0:
        raise RuntimeError(f"{path}: section end not found: {end!r}")
    write(path, content[:start_index] + replacement + content[end_index:])


ROOM = "src/domains/creator/live/studio-live-collaboration-room.ts"
OVERLAY = "src/domains/creator/live/StudioLiveCanvasOverlay.tsx"
STAGE_HOST = "src/domains/creator/canvas/StudioCanvasViewportStageHost.tsx"
PANEL = "src/domains/creator/live/StudioLiveCollaborationPanel.tsx"

# Room protocol integration: reuse the already authenticated, bounded and rate-limited ephemeral
# chat lane. The message id carries a rolling-deploy-safe control discriminator while its text
# remains human readable to older clients.
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
)

replace_once(
    ROOM,
    '''  | { type: "chat"; message: StudioLiveChatMessage }
  | {
      type: "gesture-preview";''',
    '''  | { type: "chat"; message: StudioLiveChatMessage }
  | { type: "cursor-chat"; message: StudioLiveCursorChatMessage }
  | { type: "attention"; request: StudioLiveAttentionRequest }
  | {
      type: "gesture-preview";''',
)

replace_once(
    ROOM,
    "  private readonly cursorIntervalMs: number;",
    "  private cursorIntervalMs: number;",
)

replace_once(
    ROOM,
    '''    return { ...message, participant: copyParticipant(message.participant) };
  }

  updatePresence(patch: Partial<StudioLivePresencePayload>): void {''',
    '''    return { ...message, participant: copyParticipant(message.participant) };
  }

  getCursorIntervalMs(): number {
    return this.cursorIntervalMs;
  }

  /** Applies an in-session cursor cadence without recreating the CRDT or transport generation. */
  setCursorIntervalMs(value: number): number {
    this.cursorIntervalMs = boundedTiming(value, this.cursorIntervalMs, 16, 1_000);
    return this.cursorIntervalMs;
  }

  /** Sends a five-second cursor-anchored note without adding it to the session chat history. */
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
      // Refresh page/tool state first so a receiver can accept immediately after a reconnect.
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
)

# High-frequency overlay integration stays isolated from the giant editor owner. Admission and
# sorting happen in the existing external-store subscriber, not in StudioPage state.
replace_once(
    OVERLAY,
    '''  useEffect,
  useLayoutEffect,
  useRef,''',
    '''  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,''',
)

replace_once(
    OVERLAY,
    '''import { useStudioLiveCollaboration } from "./studio-live-collaboration-context";
import { openStudioLiveCompanionTab } from "./studio-live-jam-session";''',
    '''import { StudioLiveQuickCollaborationControls } from "./StudioLiveQuickCollaborationControls";
import { useStudioLiveCollaboration } from "./studio-live-collaboration-context";
import { useStudioLiveCollaborationPreferences } from "./studio-live-collaboration-preferences";
import { selectStudioLivePresentedCursors } from "./studio-live-cursor-presentation";
import { openStudioLiveCompanionTab } from "./studio-live-jam-session";''',
)

replace_once(
    OVERLAY,
    '''import { useStudioRemoteCursors } from "./studio-live-remote-cursor-store";
import {''',
    '''import { useStudioRemoteCursors } from "./studio-live-remote-cursor-store";
import { useStudioLiveCursorChatBubbles } from "./use-studio-live-cursor-chat-bubbles";
import {''',
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
)

replace_once(
    OVERLAY,
    '''  cursors: readonly StudioLiveCanvasCursor[];
  commentPins: readonly StudioCanvasCommentPin[];''',
    '''  cursors: readonly StudioLiveCanvasCursor[];
  showCursorLabels?: boolean;
  commentPins: readonly StudioCanvasCommentPin[];''',
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
)

replace_once(
    OVERLAY,
    '''  cursors,
  commentPins,
  onCommentPinClick,''',
    '''  cursors,
  showCursorLabels = true,
  commentPins,
  onCommentPinClick,''',
)

replace_once(
    OVERLAY,
    '''      {cursors.map(({ participant, cursor }) => {''',
    '''      {cursors.map(({ participant, cursor, chatText }) => {''',
)

replace_once(
    OVERLAY,
    '''                <span
                  className="ml-3 -mt-0.5 block max-w-40 truncate rounded-md px-2 py-1 text-[0.65rem] font-bold leading-none text-white shadow-lg"
                  style={{ backgroundColor: color }}
                >
                  {participant.displayName}
                  {toolLabel ? <span className="ml-1 font-medium opacity-80">· {toolLabel}</span> : null}
                  {activityLabel ? (
                    <span className="ml-1 text-[0.6rem] font-bold animate-pulse">
                      {activityLabel === "그리는 중" ? `✏️ ${activityLabel}` : activityLabel}
                    </span>
                  ) : null}
                </span>''',
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
                {showCursorLabels ? (
                  <span
                    className="ml-3 -mt-0.5 block max-w-40 truncate rounded-md px-2 py-1 text-[0.65rem] font-bold leading-none text-white shadow-lg"
                    style={{ backgroundColor: color }}
                  >
                    {participant.displayName}
                    {toolLabel ? <span className="ml-1 font-medium opacity-80">· {toolLabel}</span> : null}
                    {activityLabel ? (
                      <span className="ml-1 text-[0.6rem] font-bold animate-pulse">
                        {activityLabel === "그리는 중" ? `✏️ ${activityLabel}` : activityLabel}
                      </span>
                    ) : null}
                  </span>
                ) : null}''',
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
  const cursors = useStudioRemoteCursors(room);
  const preferences = useStudioLiveCollaborationPreferences();
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
    () =>
      selectStudioLivePresentedCursors({
        cursors,
        peers,
        pageId,
        followingSessionId,
        pinnedSessionIds: cursorChatSessionIds,
        preferences,
      }),
    [cursors, cursorChatSessionIds, followingSessionId, pageId, peers, preferences]
  );

  if (hidden) return null;
  return (
    <StudioLiveCanvasOverlay
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      cursors={presentedCursors.map((value) => ({
        ...value,
        chatText: chatTextBySession.get(value.participant.sessionId),
        cursor: trailSuppressedSessionIds?.has(value.participant.sessionId)
          ? { ...value.cursor, points: undefined }
          : value.cursor,
      }))}
      showCursorLabels={preferences.showCursorLabels}
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
)

replace_once(
    OVERLAY,
    '''      onToggleFollow={onToggleFollow}
      syncSnapshot={sync}
    />''',
    '''      onToggleFollow={onToggleFollow}
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
)

# Keep the current follow target available to cursor admission so it is never culled under load.
replace_once(
    STAGE_HOST,
    '''    editing,
    effScale,
    elementById,''',
    '''    editing,
    effScale,
    elementById,
    followingStudioSessionId,''',
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
)

# Advanced local display/quality controls live with the collaboration panel, while the always-on
# dock applies them even when the panel is closed.
replace_once(
    PANEL,
    '''import {
  useStudioLiveCollaboration,
  type StudioLiveAvailability,''',
    '''import { StudioLiveCollaborationPreferences } from "./StudioLiveCollaborationPreferences";
import {
  useStudioLiveCollaboration,
  type StudioLiveAvailability,''',
)

replace_once(
    PANEL,
    '''      <div
        aria-labelledby="studio-live-chat-title"''',
    '''      <StudioLiveCollaborationPreferences />

      <div
        aria-labelledby="studio-live-chat-title"''',
)

print("Applied realtime collaboration v19 integration.")
