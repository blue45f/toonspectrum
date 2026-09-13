import { useEffect, useState } from "react";

import { rememberStudioLiveOwnedRoomId } from "../live/studio-live-jam-session";
import { holdStudioLocalDraftOwnership, studioLocalDraftOwnerScope } from "../live/studio-live-local-draft-owner";

/** Reclaims a browser-local origin only; server auth and shared-document gates stay independent. */
export function useStudioLocalDraftOwner(input: {
  initialInstantWorkId: string; roomId: string | null; workId: string | null; remixId: string | null;
  ownerId: string | null; projectId: string | null; documentId: string | null; draftId: string | null;
}): string {
  const { initialInstantWorkId, workId, remixId } = input;
  const scope = studioLocalDraftOwnerScope(input);
  const room = input.roomId ?? initialInstantWorkId;
  const [recovered, setRecovered] = useState<{ scope: string; room: string } | null>(null);
  useEffect(() => {
    let storage: Storage | null = null;
    let locks: LockManager | null = null;
    try { storage = window.localStorage; locks = navigator.locks ?? null; } catch { /* Denied browser storage. */ }
    return holdStudioLocalDraftOwnership({
      scope, room, workId, remixId, storage, locks,
      knownTabOwner: room === initialInstantWorkId,
      onRecovered: () => {
        let session: Storage | null = null;
        try { session = window.sessionStorage; } catch { /* The held lease still protects this mount. */ }
        rememberStudioLiveOwnedRoomId(session, room);
        setRecovered({ scope, room });
      },
    });
  }, [initialInstantWorkId, remixId, room, scope, workId]);
  return !workId && !remixId && recovered?.scope === scope && recovered.room === room
    ? recovered.room : initialInstantWorkId;
}
