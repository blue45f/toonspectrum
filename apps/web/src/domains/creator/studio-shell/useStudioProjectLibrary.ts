import { useCallback, useEffect, useMemo, useState } from "react";

import {
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
  activateStudioProject,
  archiveStudioProject,
  duplicateStudioProject,
  markStudioProjectOpened,
  permanentlyDeleteStudioProject,
  readStudioProjectLibrary,
  renameStudioProject,
  restoreStudioProject,
  trashStudioProject,
  type StudioProjectLibraryEntry,
  type StudioProjectLibraryState,
  type StudioProjectStatus,
} from "../studio-project-library-store";

type Locale = "ko" | "en";

export interface StudioProjectLibraryController {
  readonly state: StudioProjectLibraryState | null;
  readonly error: string | null;
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly reload: () => void;
  readonly rename: (projectId: string, title: string) => StudioProjectLibraryEntry | null;
  readonly duplicate: (projectId: string) => StudioProjectLibraryEntry | null;
  readonly archive: (projectId: string) => StudioProjectLibraryEntry | null;
  readonly activate: (projectId: string) => StudioProjectLibraryEntry | null;
  readonly trash: (projectId: string) => StudioProjectLibraryEntry | null;
  readonly restore: (projectId: string) => StudioProjectLibraryEntry | null;
  readonly removePermanently: (projectId: string) => boolean;
  readonly touch: (projectId: string, documentId?: string | null) => StudioProjectLibraryEntry | null;
}

function storageError(locale: Locale): string {
  return locale === "ko"
    ? "이 기기에서 프로젝트 목록을 저장하지 못했습니다. 브라우저 저장 공간과 개인정보 보호 설정을 확인해 주세요."
    : "The project list could not be stored on this device. Check browser storage and privacy settings.";
}

function eventState(value: unknown): StudioProjectLibraryState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudioProjectLibraryState>;
  return candidate.schemaVersion === 1 && Array.isArray(candidate.projects)
    ? candidate as StudioProjectLibraryState
    : null;
}

export function useStudioProjectLibrary(
  locale: Locale,
  status?: StudioProjectStatus,
): StudioProjectLibraryController {
  const [state, setState] = useState<StudioProjectLibraryState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setState(readStudioProjectLibrary(window.localStorage));
      setError(null);
    } catch {
      setError(storageError(locale));
    }
  }, [locale]);

  useEffect(() => {
    reload();
    if (typeof window === "undefined") return undefined;
    const handleProjectUpdate = (event: Event) => {
      const next = eventState((event as CustomEvent<unknown>).detail);
      if (!next) return;
      setState(next);
      setError(null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && event.key === STUDIO_PROJECT_LIBRARY_STORAGE_KEY) {
        reload();
      }
    };
    window.addEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, handleProjectUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, handleProjectUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [reload]);

  const run = useCallback(<T,>(operation: () => T): T | null => {
    if (typeof window === "undefined") return null;
    try {
      const value = operation();
      setError(null);
      return value;
    } catch {
      setError(storageError(locale));
      return null;
    }
  }, [locale]);

  const rename = useCallback((projectId: string, title: string) => run(() => (
    renameStudioProject(window.localStorage, projectId, title, { target: window })
  )), [run]);
  const duplicate = useCallback((projectId: string) => run(() => (
    duplicateStudioProject(window.localStorage, projectId, { target: window })
  )), [run]);
  const archive = useCallback((projectId: string) => run(() => (
    archiveStudioProject(window.localStorage, projectId, { target: window })
  )), [run]);
  const activate = useCallback((projectId: string) => run(() => (
    activateStudioProject(window.localStorage, projectId, { target: window })
  )), [run]);
  const trash = useCallback((projectId: string) => run(() => (
    trashStudioProject(window.localStorage, projectId, { target: window })
  )), [run]);
  const restore = useCallback((projectId: string) => run(() => (
    restoreStudioProject(window.localStorage, projectId, { target: window })
  )), [run]);
  const removePermanently = useCallback((projectId: string) => run(() => {
    permanentlyDeleteStudioProject(window.localStorage, projectId, { target: window });
    return true;
  }) ?? false, [run]);
  const touch = useCallback((projectId: string, documentId: string | null = null) => run(() => (
    markStudioProjectOpened(window.localStorage, projectId, documentId, { target: window })
  )), [run]);

  const projects = useMemo(() => {
    const values = state?.projects ?? [];
    return status ? values.filter((project) => project.status === status) : values;
  }, [state, status]);

  return Object.freeze({
    state,
    error,
    projects,
    reload,
    rename,
    duplicate,
    archive,
    activate,
    trash,
    restore,
    removePermanently,
    touch,
  });
}
