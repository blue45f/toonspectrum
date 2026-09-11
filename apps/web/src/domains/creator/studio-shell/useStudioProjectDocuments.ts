import { useCallback, useEffect, useMemo, useState } from "react";

import {
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
  archiveStudioProjectDocument,
  createStudioProjectDocument,
  duplicateStudioProjectDocument,
  permanentlyDeleteStudioProjectDocument,
  readStudioProjectDocuments,
  renameStudioProjectDocument,
  restoreStudioProjectDocument,
  setStudioProjectDocumentWorkspace,
  studioProjectDocumentStorageKey,
  trashStudioProjectDocument,
  type CreateStudioProjectDocumentInput,
  type StudioDocumentStatus,
  type StudioDocumentWorkspace,
  type StudioProjectDocumentEntry,
  type StudioProjectDocumentState,
} from "../studio-project-document-store";

type Locale = "ko" | "en";

export interface StudioProjectDocumentsController {
  readonly state: StudioProjectDocumentState | null;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly error: string | null;
  readonly reload: () => void;
  readonly create: (input: CreateStudioProjectDocumentInput) => StudioProjectDocumentEntry | null;
  readonly rename: (documentId: string, title: string) => StudioProjectDocumentEntry | null;
  readonly duplicate: (documentId: string) => StudioProjectDocumentEntry | null;
  readonly archive: (documentId: string) => StudioProjectDocumentEntry | null;
  readonly trash: (documentId: string) => StudioProjectDocumentEntry | null;
  readonly restore: (documentId: string) => StudioProjectDocumentEntry | null;
  readonly removePermanently: (documentId: string) => boolean;
  readonly setWorkspace: (
    documentId: string,
    workspace: StudioDocumentWorkspace,
  ) => StudioProjectDocumentEntry | null;
}

function storageError(locale: Locale): string {
  return locale === "ko"
    ? "이 기기에서 문서 목록을 저장하지 못했습니다. 현재 원고는 편집기 복구 기능으로 계속 보호됩니다."
    : "The document list could not be stored on this device. Editor recovery still protects the current manuscript.";
}

function eventState(value: unknown, projectId: string): StudioProjectDocumentState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudioProjectDocumentState>;
  return candidate.schemaVersion === 1
    && candidate.projectId === projectId
    && Array.isArray(candidate.documents)
    ? candidate as StudioProjectDocumentState
    : null;
}

export function useStudioProjectDocuments(
  projectId: string,
  locale: Locale,
  status?: StudioDocumentStatus,
): StudioProjectDocumentsController {
  const [state, setState] = useState<StudioProjectDocumentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (typeof window === "undefined" || !projectId.trim()) return;
    try {
      setState(readStudioProjectDocuments(window.localStorage, projectId));
      setError(null);
    } catch {
      setError(storageError(locale));
    }
  }, [locale, projectId]);

  useEffect(() => {
    reload();
    if (typeof window === "undefined") return undefined;
    const handleUpdate = (event: Event) => {
      const next = eventState((event as CustomEvent<unknown>).detail, projectId);
      if (!next) return;
      setState(next);
      setError(null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea === window.localStorage
        && event.key === studioProjectDocumentStorageKey(projectId)
      ) {
        reload();
      }
    };
    window.addEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [projectId, reload]);

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

  const create = useCallback((input: CreateStudioProjectDocumentInput) => run(() => (
    createStudioProjectDocument(window.localStorage, projectId, input, { target: window })
  )), [projectId, run]);
  const rename = useCallback((documentId: string, title: string) => run(() => (
    renameStudioProjectDocument(window.localStorage, projectId, documentId, title, { target: window })
  )), [projectId, run]);
  const duplicate = useCallback((documentId: string) => run(() => (
    duplicateStudioProjectDocument(window.localStorage, projectId, documentId, { target: window })
  )), [projectId, run]);
  const archive = useCallback((documentId: string) => run(() => (
    archiveStudioProjectDocument(window.localStorage, projectId, documentId, { target: window })
  )), [projectId, run]);
  const trash = useCallback((documentId: string) => run(() => (
    trashStudioProjectDocument(window.localStorage, projectId, documentId, { target: window })
  )), [projectId, run]);
  const restore = useCallback((documentId: string) => run(() => (
    restoreStudioProjectDocument(window.localStorage, projectId, documentId, { target: window })
  )), [projectId, run]);
  const removePermanently = useCallback((documentId: string) => run(() => {
    permanentlyDeleteStudioProjectDocument(window.localStorage, projectId, documentId, { target: window });
    return true;
  }) ?? false, [projectId, run]);
  const setWorkspace = useCallback((documentId: string, workspace: StudioDocumentWorkspace) => run(() => (
    setStudioProjectDocumentWorkspace(
      window.localStorage,
      projectId,
      documentId,
      workspace,
      { target: window },
    )
  )), [projectId, run]);

  const documents = useMemo(() => {
    const values = state?.documents ?? [];
    return status ? values.filter((document) => document.status === status) : values;
  }, [state, status]);

  return Object.freeze({
    state,
    documents,
    error,
    reload,
    create,
    rename,
    duplicate,
    archive,
    trash,
    restore,
    removePermanently,
    setWorkspace,
  });
}
