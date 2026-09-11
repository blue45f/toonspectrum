import { useCallback, useEffect, useState } from "react";

import {
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  parseStudioProjectDiagnosticSource,
  studioProjectDiagnosticSourceStorageKey,
} from "../studio-project-diagnostic-source-store";
import { matchesStudioProjectStorageEvent } from "../studio-project-storage-event";
import {
  ensureStudioProjectWorkspaceState,
  updateStudioProjectWorkspaceState,
  type StudioProjectWorkspaceState,
  type StudioProjectWorkspaceUpdater,
} from "../studio-project-workspace-store";

export interface StudioProjectWorkspaceController {
  readonly state: StudioProjectWorkspaceState | null;
  readonly error: string | null;
  readonly update: (updater: StudioProjectWorkspaceUpdater) => StudioProjectWorkspaceState | null;
  readonly reload: () => void;
}

function humanStorageError(locale: "ko" | "en"): string {
  return locale === "ko"
    ? "이 기기에서 프로젝트 상태를 불러오거나 저장하지 못했습니다. 변경 내용이 저장되지 않을 수 있으니 브라우저 저장 공간과 권한을 확인해 주세요."
    : "Project state could not be loaded or saved on this device. Changes may not be stored; check browser storage space and permissions.";
}

/**
 * One React projection over the project workspace authority. Feature panels never own separate
 * readiness state; they atomically mutate this snapshot and receive the same update event.
 */
export function useStudioProjectWorkspace(
  projectId: string,
  locale: "ko" | "en",
): StudioProjectWorkspaceController {
  const [state, setState] = useState<StudioProjectWorkspaceState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (typeof window === "undefined" || !projectId.trim()) return;
    try {
      setState(ensureStudioProjectWorkspaceState(window.localStorage, projectId));
      setError(null);
    } catch {
      setError(humanStorageError(locale));
    }
  }, [locale, projectId]);

  useEffect(() => {
    reload();

    let projectStorageKey: string | null = null;
    try {
      projectStorageKey = studioProjectDiagnosticSourceStorageKey(projectId);
    } catch {
      return undefined;
    }

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const parsed = parseStudioProjectDiagnosticSource(detail, projectId);
      if (!parsed) return;
      setState(parsed);
      setError(null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (matchesStudioProjectStorageEvent(event.key, projectStorageKey)) reload();
    };

    window.addEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [projectId, reload]);

  const update = useCallback((updater: StudioProjectWorkspaceUpdater) => {
    if (typeof window === "undefined" || !projectId.trim()) return null;
    try {
      const next = updateStudioProjectWorkspaceState(
        window.localStorage,
        projectId,
        updater,
        { target: window },
      );
      setState(next);
      setError(null);
      return next;
    } catch {
      setError(humanStorageError(locale));
      return null;
    }
  }, [locale, projectId]);

  return Object.freeze({ state, error, update, reload });
}
