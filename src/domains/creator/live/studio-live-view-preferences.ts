import { useSyncExternalStore } from "react";

export interface StudioLiveViewPreferences {
  readonly remoteCursorsVisible: boolean;
}

export const STUDIO_LIVE_VIEW_PREFERENCES_STORAGE_KEY =
  "toonspectrum:studio-live:view-preferences:v1";

const DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES: StudioLiveViewPreferences = Object.freeze({
  remoteCursorsVisible: true,
});

let snapshot: StudioLiveViewPreferences = DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES;
let initialized = false;
let storageListenerInstalled = false;
const listeners = new Set<() => void>();

function parseStudioLiveViewPreferences(value: string | null): StudioLiveViewPreferences {
  if (!value) return DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as { remoteCursorsVisible?: unknown };
    return Object.freeze({
      remoteCursorsVisible: parsed.remoteCursorsVisible !== false,
    });
  } catch {
    return DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES;
  }
}

function readStoredPreferences(): StudioLiveViewPreferences {
  if (typeof window === "undefined") return DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES;
  try {
    return parseStudioLiveViewPreferences(
      window.localStorage.getItem(STUDIO_LIVE_VIEW_PREFERENCES_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES;
  }
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== STUDIO_LIVE_VIEW_PREFERENCES_STORAGE_KEY) return;
    const next = parseStudioLiveViewPreferences(event.newValue);
    if (next.remoteCursorsVisible === snapshot.remoteCursorsVisible) return;
    snapshot = next;
    initialized = true;
    notify();
  });
}

function ensureInitialized(): void {
  if (!initialized) {
    initialized = true;
    snapshot = readStoredPreferences();
  }
  installStorageListener();
}

function getSnapshot(): StudioLiveViewPreferences {
  ensureInitialized();
  return snapshot;
}

function getServerSnapshot(): StudioLiveViewPreferences {
  return DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES;
}

function subscribe(listener: () => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist(next: StudioLiveViewPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STUDIO_LIVE_VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Private/embedded browsers may deny localStorage. The in-memory preference still works.
  }
}

export function setStudioLiveRemoteCursorsVisible(visible: boolean): void {
  ensureInitialized();
  if (snapshot.remoteCursorsVisible === visible) return;
  snapshot = Object.freeze({ remoteCursorsVisible: visible });
  persist(snapshot);
  notify();
}

export function toggleStudioLiveRemoteCursors(): void {
  setStudioLiveRemoteCursorsVisible(!getSnapshot().remoteCursorsVisible);
}

export function useStudioLiveViewPreferences(): StudioLiveViewPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function isStudioLiveCursorVisibilityShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">,
): boolean {
  return (
    event.key === "\\"
    && event.altKey
    && !event.shiftKey
    && (event.metaKey || event.ctrlKey)
  );
}

export function isStudioLiveShortcutTextTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]',
    ),
  );
}

/** Test isolation seam for localStorage and module singleton state. */
export function resetStudioLiveViewPreferencesForTests(): void {
  initialized = false;
  snapshot = DEFAULT_STUDIO_LIVE_VIEW_PREFERENCES;
  notify();
}
