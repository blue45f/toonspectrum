import { useEffect, useRef, type ReactElement } from "react";

import {
  loadCreatorMarketplaceAuthoringDraft,
  type CreatorMarketplaceAuthoringDraft,
} from "@/lib/creator-marketplace-authoring-workshop";

import {
  MARKETPLACE_BRUSH_SNAPSHOT_REQUEST_EVENT,
  MARKETPLACE_BRUSH_SNAPSHOT_RESPONSE_EVENT,
  MarketplaceBrushPublishShortcut,
} from "./MarketplaceBrushPublishShortcut";

export const MARKETPLACE_BRUSH_STUDIO_IMPORT_EVENT =
  "toonspectrum:brush-studio-market-import";
export const MARKETPLACE_BRUSH_STUDIO_IMPORT_STORAGE_KEY =
  "toonspectrum:brush-studio-market-import:v2";

function snapshotFromDraft(draft: CreatorMarketplaceAuthoringDraft | null): unknown {
  if (!draft || draft.kind !== "brush") return null;
  return draft.brush.originalSnapshot
    ?? draft.source.studioSnapshot
    ?? {
      name: draft.title,
      description: draft.description,
      tags: draft.tags,
      seed: draft.brush.deterministicSeed,
      presetFamily: draft.brush.presetFamily,
      enginePrograms: draft.brush.originalEnginePrograms,
      engineGraph: draft.brush.engineNodes,
    };
}

export function MarketplaceBrushStudioBridge(): ReactElement {
  const latestSnapshotRef = useRef<unknown>(null);

  useEffect(() => {
    const draft = loadCreatorMarketplaceAuthoringDraft();
    const snapshot = snapshotFromDraft(draft);
    if (snapshot !== null) {
      latestSnapshotRef.current = snapshot;
      try {
        window.sessionStorage.setItem(
          MARKETPLACE_BRUSH_STUDIO_IMPORT_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      } catch {
        // Event delivery remains available when session storage is blocked.
      }
      window.dispatchEvent(new CustomEvent(MARKETPLACE_BRUSH_STUDIO_IMPORT_EVENT, {
        detail: { snapshot, resumeToken: draft?.resumeToken ?? null },
      }));
    }

    const respond = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { requestId?: unknown } | null;
      if (!detail || typeof detail.requestId !== "string") return;
      window.dispatchEvent(new CustomEvent(MARKETPLACE_BRUSH_SNAPSHOT_RESPONSE_EVENT, {
        detail: {
          requestId: detail.requestId,
          snapshot: latestSnapshotRef.current,
        },
      }));
    };
    const capture = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { snapshot?: unknown } | null;
      if (detail && detail.snapshot !== undefined) latestSnapshotRef.current = detail.snapshot;
    };

    window.addEventListener(
      MARKETPLACE_BRUSH_SNAPSHOT_REQUEST_EVENT,
      respond as EventListener,
    );
    window.addEventListener(
      MARKETPLACE_BRUSH_STUDIO_IMPORT_EVENT,
      capture as EventListener,
    );
    return () => {
      window.removeEventListener(
        MARKETPLACE_BRUSH_SNAPSHOT_REQUEST_EVENT,
        respond as EventListener,
      );
      window.removeEventListener(
        MARKETPLACE_BRUSH_STUDIO_IMPORT_EVENT,
        capture as EventListener,
      );
    };
  }, []);

  return (
    <MarketplaceBrushPublishShortcut
      snapshotProvider={() => latestSnapshotRef.current}
    />
  );
}
