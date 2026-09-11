import { createContext, useContext } from "react";

import type { StudioDocumentWorkspaceId } from "../studio-document-workspace";

/**
 * Document-identity-scoped runtime published by `StudioDocumentLayout`.
 *
 * `StudioDocumentRuntimeContext` (sibling module) answers "which document instance am I?" for the
 * boundary itself. This one answers "which canonical project/document/workspace and live session
 * does that instance own?" and is the single owner of the `?room=` query for the editor tree.
 */
export interface StudioDocumentLayoutRuntime {
  /** Boundary key of the enclosing `StudioDocumentRuntimeBoundary` (identity + auth + epoch). */
  readonly documentKey: string;
  /** Canonical project identity; null for drafts, remixes, and legacy routes. */
  readonly projectId: string | null;
  /** Canonical document identity inside a project; null for drafts and legacy routes. */
  readonly documentId: string | null;
  /** Canonical draft identity; null for project documents and legacy routes. */
  readonly draftId: string | null;
  /** User-facing workspace projection. It never participates in the document runtime key. */
  readonly documentWorkspace: StudioDocumentWorkspaceId | null;
  /** Guest-draft adoption epoch. A bump rotates `documentKey` and remounts this layout. */
  readonly draftSessionEpoch: number;
  /**
   * Per-identity id for an unsaved instant jam. Stable for the life of the boundary, so it survives
   * canvas ↔ comic ↔ animation ↔ dcc surface switches and only rotates with the document identity.
   */
  readonly instantWorkId: string;
  /** `?room=` live-jam identity. The layout is the only reader of this query. */
  readonly liveRoomParam: string | null;
  /** Canonical remix source identity from the route. */
  readonly remixId: string | null;
  /** Canonical saved-work identity from the route. `null` for new drafts and remixes. */
  readonly workId: string | null;
}

export const StudioDocumentLayoutContext =
  createContext<StudioDocumentLayoutRuntime | null>(null);

export function useStudioDocumentLayout(): StudioDocumentLayoutRuntime {
  const runtime = useContext(StudioDocumentLayoutContext);
  if (runtime === null) {
    throw new Error(
      "useStudioDocumentLayout must run inside StudioDocumentLayout.",
    );
  }
  return runtime;
}
