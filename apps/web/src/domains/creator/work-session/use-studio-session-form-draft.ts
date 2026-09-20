import { useMemo, useSyncExternalStore } from "react";

interface DraftSnapshot { readonly value: string; readonly storageError: boolean }
const SERVER_DRAFT: DraftSnapshot = Object.freeze({ value: "", storageError: false });
const serverSnapshot = () => SERVER_DRAFT;

/** One keyed form field. Reads never rewrite stored text; failed writes retain the live input. */
function createDraftField(key: string, limit: number) {
  let snapshot: DraftSnapshot;
  try { snapshot = { value: (window.sessionStorage.getItem(key) ?? "").slice(0, limit), storageError: false }; }
  catch { snapshot = { value: "", storageError: true }; }
  const listeners = new Set<() => void>();
  const update = (next: string) => {
    const value = next.slice(0, limit); let storageError = false;
    try {
      if (value) window.sessionStorage.setItem(key, value); else window.sessionStorage.removeItem(key);
    } catch { storageError = true; }
    if (snapshot.value === value && snapshot.storageError === storageError) return;
    snapshot = { value, storageError };
    listeners.forEach((listener) => listener());
  };
  return { update, getSnapshot: () => snapshot, subscribe(listener: () => void) {
    listeners.add(listener); return () => { listeners.delete(listener); };
  } };
}

/** Switching actor/work/session keys replaces the field before render, never exposing the old draft. */
export function useStudioSessionFormDraft(key: string, limit: number) {
  const field = useMemo(() => createDraftField(key, limit), [key, limit]);
  const snapshot = useSyncExternalStore(field.subscribe, field.getSnapshot, serverSnapshot);
  return [snapshot.value, field.update, snapshot.storageError] as const;
}
