import { useCallback, useEffect, useState } from "react";

import {
  STUDIO_SAVE_PROFILE_STORAGE_KEY,
  STUDIO_SAVE_PROFILE_UPDATED_EVENT,
  createDefaultStudioSaveProfile,
  ensureStudioSaveProfile,
  markStudioStorageBindingSynced,
  readStudioSaveProfiles,
  recordStudioExport,
  recordStudioManualSave,
  recordStudioPublication,
  recordStudioSubmission,
  removeStudioSaveProfile,
  removeStudioStorageBinding,
  setStudioSavePreferences,
  updateStudioStorageBindingStatus,
  upsertStudioStorageBinding,
  type StudioAccessMode,
  type StudioSaveProfile,
  type StudioSaveProfileState,
  type StudioStorageBindingStatusUpdate,
  type StudioStorageProvider,
} from "../save-first/studio-save-profile";

interface EnsureOptions {
  readonly provider?: StudioStorageProvider;
  readonly autoSave?: boolean;
  readonly createVersions?: boolean;
}
type SyncedInput = Omit<
  StudioStorageBindingStatusUpdate,
  "syncState" | "connectionRequired" | "lastSyncedAt" | "lastSyncedRevision" | "error"
> & { readonly revision?: number };

export interface StudioSaveProfilesController {
  readonly state: StudioSaveProfileState | null;
  readonly error: string | null;
  readonly profileFor: (projectId: string) => StudioSaveProfile;
  readonly ensure: (projectId: string, options?: EnsureOptions) => StudioSaveProfile | null;
  readonly setPreferences: (
    projectId: string,
    input: {
      readonly autoSave?: boolean;
      readonly createVersions?: boolean;
      readonly accessMode?: StudioAccessMode;
    },
  ) => StudioSaveProfile | null;
  readonly addProvider: (
    projectId: string,
    provider: StudioStorageProvider,
  ) => StudioSaveProfile | null;
  readonly removeProvider: (
    projectId: string,
    bindingId: string,
  ) => StudioSaveProfile | null;
  readonly markSynced: (
    projectId: string,
    bindingId: string,
    input?: SyncedInput,
  ) => StudioSaveProfile | null;
  readonly updateBindingStatus: (
    projectId: string,
    bindingId: string,
    input: StudioStorageBindingStatusUpdate,
  ) => StudioSaveProfile | null;
  readonly recordSave: (projectId: string) => StudioSaveProfile | null;
  readonly recordExport: (projectId: string) => StudioSaveProfile | null;
  readonly recordSubmission: (projectId: string) => StudioSaveProfile | null;
  readonly recordPublication: (
    projectId: string,
    published: boolean,
  ) => StudioSaveProfile | null;
  readonly remove: (projectId: string) => void;
  readonly reload: () => void;
}

export function useStudioSaveProfiles(): StudioSaveProfilesController {
  const [state, setState] = useState<StudioSaveProfileState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setState(readStudioSaveProfiles(window.localStorage));
      setError(null);
    } catch {
      setError("저장 위치 정보를 읽지 못했습니다.");
    }
  }, []);
  useEffect(() => {
    reload();
    if (typeof window === "undefined") return undefined;
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<StudioSaveProfileState>).detail;
      if (detail?.schemaVersion === 1) setState(detail);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STUDIO_SAVE_PROFILE_STORAGE_KEY) reload();
    };
    window.addEventListener(STUDIO_SAVE_PROFILE_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(STUDIO_SAVE_PROFILE_UPDATED_EVENT, handleUpdate);
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
      setError("저장 위치 정보를 갱신하지 못했습니다.");
      return null;
    }
  }, []);
  const profileFor = useCallback((projectId: string) => (
    state?.profiles[projectId]
    ?? createDefaultStudioSaveProfile(projectId, { now: new Date(0).toISOString() })
  ), [state]);

  const controller: StudioSaveProfilesController = {
    state,
    error,
    profileFor,
    ensure: (projectId: string, options: EnsureOptions = {}) => run(() => (
      ensureStudioSaveProfile(window.localStorage, projectId, {
        ...options,
        target: window,
      })
    )),
    setPreferences: (
      projectId: string,
      input: Parameters<StudioSaveProfilesController["setPreferences"]>[1],
    ) => run(() => setStudioSavePreferences(
      window.localStorage,
      projectId,
      input,
      { target: window },
    )),
    addProvider: (projectId: string, provider: StudioStorageProvider) => run(() => (
      upsertStudioStorageBinding(window.localStorage, projectId, {
        provider,
        role: provider === "browser" ? "working-copy" : "backup",
      }, { target: window })
    )),
    removeProvider: (projectId: string, bindingId: string) => run(() => (
      removeStudioStorageBinding(
        window.localStorage,
        projectId,
        bindingId,
        { target: window },
      )
    )),
    markSynced: (
      projectId: string,
      bindingId: string,
      input: SyncedInput = {},
    ) => run(() => markStudioStorageBindingSynced(
      window.localStorage,
      projectId,
      bindingId,
      input,
      { target: window },
    )),
    updateBindingStatus: (
      projectId: string,
      bindingId: string,
      input: StudioStorageBindingStatusUpdate,
    ) => run(() => updateStudioStorageBindingStatus(
      window.localStorage,
      projectId,
      bindingId,
      input,
      { target: window },
    )),
    recordSave: (projectId: string) => run(() => recordStudioManualSave(
      window.localStorage,
      projectId,
      { target: window },
    )),
    recordExport: (projectId: string) => run(() => recordStudioExport(
      window.localStorage,
      projectId,
      { target: window },
    )),
    recordSubmission: (projectId: string) => run(() => recordStudioSubmission(
      window.localStorage,
      projectId,
      { target: window },
    )),
    recordPublication: (projectId: string, published: boolean) => run(() => (
      recordStudioPublication(
        window.localStorage,
        projectId,
        published,
        { target: window },
      )
    )),
    remove: (projectId: string) => {
      run(() => removeStudioSaveProfile(
        window.localStorage,
        projectId,
        { target: window },
      ));
    },
    reload,
  };
  return Object.freeze(controller);
}
