import { isStudioLiveCursorCleared } from "./studio-live-collaboration-protocol";
import { resolveStudioLiveCursorLimit } from "./studio-live-collaboration-preferences";

import type {
  StudioLiveCollaborationPreferences,
  StudioLiveNetworkHints,
} from "./studio-live-collaboration-preferences";
import type {
  StudioLivePeer,
  StudioLivePeerCursor,
} from "./studio-live-collaboration-room";

export interface StudioLiveCursorPresentationOptions {
  cursors: readonly StudioLivePeerCursor[];
  peers: readonly StudioLivePeer[];
  pageId: string;
  followingSessionId?: string | null;
  pinnedSessionIds?: ReadonlySet<string>;
  preferences: Readonly<StudioLiveCollaborationPreferences>;
  networkHints?: StudioLiveNetworkHints;
}

function activityScore(
  cursor: StudioLivePeerCursor,
  peer: StudioLivePeer | undefined,
  followingSessionId: string | null,
  pinnedSessionIds: ReadonlySet<string>
): number {
  if (pinnedSessionIds.has(cursor.participant.sessionId)) return 5;
  if (cursor.participant.sessionId === followingSessionId) return 4;
  if (cursor.cursor.drawing) return 3;
  if (peer?.visibility === "active") return 2;
  return 1;
}

/**
 * Figma-style cursor admission: cursor-chat authors, the followed collaborator, active strokes and
 * active editors win before idle pointers. The local visibility preference is presentation-only
 * and never affects CRDT, locks, presence or another participant's cursor.
 */
export function selectStudioLivePresentedCursors({
  cursors,
  peers,
  pageId,
  followingSessionId = null,
  pinnedSessionIds = new Set<string>(),
  preferences,
  networkHints,
}: StudioLiveCursorPresentationOptions): StudioLivePeerCursor[] {
  if (preferences.cursorVisibility === "hidden") return [];
  const peerBySession = new Map(peers.map((peer) => [peer.sessionId, peer] as const));
  const eligible = cursors.filter((entry) => {
    if (isStudioLiveCursorCleared(entry.cursor) || entry.cursor.pageId !== pageId) return false;
    const sessionId = entry.participant.sessionId;
    if (pinnedSessionIds.has(sessionId) || sessionId === followingSessionId) return true;
    if (preferences.cursorVisibility === "drawing") return entry.cursor.drawing === true;
    if (preferences.cursorVisibility === "active") {
      return (
        entry.cursor.drawing === true ||
        peerBySession.get(sessionId)?.visibility === "active"
      );
    }
    return true;
  });

  eligible.sort((left, right) => {
    const scoreDelta =
      activityScore(
        right,
        peerBySession.get(right.participant.sessionId),
        followingSessionId,
        pinnedSessionIds
      ) -
      activityScore(
        left,
        peerBySession.get(left.participant.sessionId),
        followingSessionId,
        pinnedSessionIds
      );
    if (scoreDelta !== 0) return scoreDelta;
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    return left.participant.sessionId.localeCompare(right.participant.sessionId);
  });

  return eligible.slice(
    0,
    resolveStudioLiveCursorLimit(preferences.cursorQuality, networkHints)
  );
}
