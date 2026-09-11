import { useCallback, useEffect, useState } from "react";

import {
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  parseStudioProjectDiagnosticSource,
} from "../studio-project-diagnostic-source-store";
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
    ? "이 기기에서 프로젝트 상태를 불러오거나 저장하지 못했습니다. 편집 중인 원고는 닫지 말아 주세요."
    : "Project state could not be loaded or saved on this device. Keep the current document open.";
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

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const parsed = parseStudioProjectDiagnosticSource(detail, projectId);
      if (!parsed) return;
      setState(parsed);
      setError(null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === null || event.key.includes(encodeURIComponent(projectId))) reload();
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
