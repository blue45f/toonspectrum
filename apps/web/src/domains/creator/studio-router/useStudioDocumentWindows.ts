import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  createStudioDocumentWindowCoordinator,
  type StudioDocumentWindowCoordinator,
  type StudioDocumentWindowSnapshot,
} from "../studio-document-window-coordination";
import type { StudioDocumentWorkspaceId } from "../studio-document-workspace";

interface CoordinatorRef {
  readonly documentKey: string;
  readonly coordinator: StudioDocumentWindowCoordinator;
}

function focusRequestedStudioWindow(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const previousTitle = document.title;
  const attentionTitle = `● ${previousTitle.replace(/^●\s*/u, "")}`;
  const restoreTitle = () => {
    if (document.title === attentionTitle) document.title = previousTitle;
  };
  if (!document.hasFocus()) {
    document.title = attentionTitle;
    window.addEventListener("focus", restoreTitle, { once: true });
  }
  try {
    window.focus();
  } catch {
    // Background-focus policy can reject activation; the title remains the fallback cue.
  }
  globalThis.setTimeout(restoreTitle, 4_500);
}

export function useStudioDocumentWindows(input: {
  readonly documentKey: string;
  readonly workspace: StudioDocumentWorkspaceId;
}): {
  readonly snapshot: StudioDocumentWindowSnapshot;
  readonly requestFocus: (instanceId: string) => boolean;
} {
  const coordinatorRef = useRef<CoordinatorRef | null>(null);
  if (coordinatorRef.current?.documentKey !== input.documentKey) {
    coordinatorRef.current = {
      documentKey: input.documentKey,
      coordinator: createStudioDocumentWindowCoordinator({
        documentKey: input.documentKey,
        workspace: input.workspace,
        focusWindow: focusRequestedStudioWindow,
      }),
    };
  }
  const coordinator = coordinatorRef.current.coordinator;
  const snapshot = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getServerSnapshot,
  );
  useEffect(() => coordinator.start(), [coordinator]);
  useEffect(() => coordinator.updateWorkspace(input.workspace), [coordinator, input.workspace]);
  return {
    snapshot,
    requestFocus: (instanceId) => coordinator.requestFocus(instanceId),
  };
}
