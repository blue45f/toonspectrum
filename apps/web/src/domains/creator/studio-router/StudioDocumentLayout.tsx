import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import {
  readStudioLiveRoomQuery,
  resolveStudioLiveInstantWorkIdForTab,
  shouldPublishStudioLiveJamRoom,
  withStudioLiveJamRoom,
} from "../live/studio-live-jam-session";
import { StudioDocumentWorkspaceSwitcher } from "../studio-shell/StudioDocumentWorkspaceSwitcher";

import {
  StudioDocumentLayoutContext,
  type StudioDocumentLayoutRuntime,
} from "./studio-document-layout-context";
import { useStudioDocumentRuntime } from "./studio-document-runtime-context";

import type { StudioWorkspaceRoute } from "../studio-workspace-route";

interface StudioDocumentLayoutProps {
  readonly children: ReactNode;
  /** Guest-draft adoption epoch owned by `StudioRouter`; part of the boundary key above. */
  readonly draftSessionEpoch: number;
  readonly studioRoute: StudioWorkspaceRoute;
}

function currentStudioSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Parent layout for one Studio document instance.
 *
 * It renders INSIDE `StudioDocumentRuntimeBoundary` on purpose. The boundary keys by
 * `studioEditorInstanceKey` (identity + auth + draft epoch) and `RouteStage` keys by the route
 * `lifecycleKey` (identity + presentation, no auth/epoch); collapsing those two layers breaks
 * guest-draft adoption. Sitting inside the boundary means this layout — and everything it owns —
 * tears down before the next identity mounts, while surviving every workspace switch within one
 * identity. Canonical document routes expose their workspace selector here, inside that preserved
 * boundary, instead of redirecting through another editor URL.
 */
export function StudioDocumentLayout({
  children,
  draftSessionEpoch,
  studioRoute,
}: StudioDocumentLayoutProps) {
  const { documentKey } = useStudioDocumentRuntime();
  const [params, setSearchParams] = useSearchParams();
  const liveRoomParam = readStudioLiveRoomQuery(params);
  const workId = studioRoute.workId;
  const remixId = studioRoute.remixSourceWorkId;
  // Keep the owner room stable for this tab across reloads and boundary remounts. A companion tab
  // receives the room URL but not this tab's sessionStorage ownership receipt, so it still gets a
  // distinct instant id and remains fail-closed until CRDT convergence.
  const [instantWorkId] = useState(() => resolveStudioLiveInstantWorkIdForTab({
    workId,
    remixId,
    roomId: liveRoomParam,
    storage: currentStudioSessionStorage(),
  }));
  useEffect(() => {
    if (!shouldPublishStudioLiveJamRoom({
      remixId,
      roomId: liveRoomParam,
      workId,
    })) return;
    // The published id is always the per-tab instant id, never the local draft-collaboration id.
    // That guard holds because the draft identity is `null` on the first commit (it is provisioned
    // asynchronously) and is force-cleared the moment `?room=` exists — so it can never reach the
    // one frame in which this publish runs. Keeping the draft id out of the layout is what lets the
    // room query move up here without dragging the draft-provisioning state out of StudioPage.
    setSearchParams((current) => {
      if (readStudioLiveRoomQuery(current) === instantWorkId) return current;
      return withStudioLiveJamRoom(current, instantWorkId);
    }, { replace: true });
  }, [instantWorkId, liveRoomParam, remixId, setSearchParams, workId]);

  const runtime: StudioDocumentLayoutRuntime = {
    documentKey,
    documentId: studioRoute.documentId,
    documentWorkspace: studioRoute.documentWorkspace,
    draftId: studioRoute.draftId,
    draftSessionEpoch,
    instantWorkId,
    liveRoomParam,
    projectId: studioRoute.projectId,
    remixId,
    workId,
  };

  return (
    <StudioDocumentLayoutContext value={runtime}>
      <StudioDocumentWorkspaceSwitcher />
      {children}
    </StudioDocumentLayoutContext>
  );
}
