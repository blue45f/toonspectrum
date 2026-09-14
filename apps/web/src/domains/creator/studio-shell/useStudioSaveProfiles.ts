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
  upsertStudioStorageBinding,
  type StudioAccessMode,
  type StudioSaveProfile,
  type StudioSaveProfileState,
  type StudioStorageProvider,
} from "../save-first/studio-save-profile";

export interface StudioSaveProfilesController {
  readonly state: StudioSaveProfileState | null;
  readonly error: string | null;
  readonly profileFor: (projectId: string) => StudioSaveProfile;
  readonly ensure: (
    projectId: string,
    options?: { readonly provider?: StudioStorageProvider; readonly autoSave?: boolean; readonly createVersions?: boolean },
  ) => StudioSaveProfile | null;
  readonly setPreferences: (
    projectId: string,
    input: { readonly autoSave?: boolean; readonly createVersions?: boolean; readonly accessMode?: StudioAccessMode },
  ) => StudioSaveProfile | null;
  readonly addProvider: (projectId: string, provider: StudioStorageProvider) => StudioSaveProfile | null;
  readonly removeProvider: (projectId: string, bindingId: string) => StudioSaveProfile | null;
  readonly markSynced: (
    projectId: string,
    bindingId: string,
    input?: { readonly remotePath?: string | null; readonly revision?: number },
  ) => StudioSaveProfile | null;
  readonly recordSave: (projectId: string) => StudioSaveProfile | null;
  readonly recordExport: (projectId: string) => StudioSaveProfile | null;
  readonly recordSubmission: (projectId: string) => StudioSaveProfile | null;
  readonly recordPublication: (projectId: string, published: boolean) => StudioSaveProfile | null;
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

  return Object.freeze({
    state,
    error,
    profileFor,
    ensure: (projectId, options = {}) => run(() => ensureStudioSaveProfile(
      window.localStorage,
      projectId,
      { ...options, target: window },
    )),
    setPreferences: (projectId, input) => run(() => setStudioSavePreferences(
      window.localStorage,
      projectId,
      input,
      { target: window },
    )),
    addProvider: (projectId, provider) => run(() => upsertStudioStorageBinding(
      window.localStorage,
      projectId,
      { provider, role: provider === "browser" ? "working-copy" : "backup" },
      { target: window },
    )),
    removeProvider: (projectId, bindingId) => run(() => removeStudioStorageBinding(
      window.localStorage,
      projectId,
      bindingId,
      { target: window },
    )),
    markSynced: (projectId, bindingId, input = {}) => run(() => markStudioStorageBindingSynced(
      window.localStorage,
      projectId,
      bindingId,
      input,
      { target: window },
    )),
    recordSave: (projectId) => run(() => recordStudioManualSave(
      window.localStorage,
      projectId,
      { target: window },
    )),
    recordExport: (projectId) => run(() => recordStudioExport(
      window.localStorage,
      projectId,
      { target: window },
    )),
    recordSubmission: (projectId) => run(() => recordStudioSubmission(
      window.localStorage,
      projectId,
      { target: window },
    )),
    recordPublication: (projectId, published) => run(() => recordStudioPublication(
      window.localStorage,
      projectId,
      published,
      { target: window },
    )),
    remove: (projectId) => {
      run(() => removeStudioSaveProfile(window.localStorage, projectId, { target: window }));
    },
    reload,
  });
}
