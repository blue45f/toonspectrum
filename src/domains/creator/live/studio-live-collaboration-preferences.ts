import { useSyncExternalStore } from "react";

export type StudioLiveCursorVisibility = "all" | "active" | "drawing" | "hidden";
export type StudioLiveCursorQuality = "auto" | "smooth" | "balanced" | "data-saver";

export interface StudioLiveCollaborationPreferences {
  cursorVisibility: StudioLiveCursorVisibility;
  cursorQuality: StudioLiveCursorQuality;
  showCursorLabels: boolean;
}

export interface StudioLiveNetworkHints {
  saveData?: boolean;
  effectiveType?: string | null;
  reducedMotion?: boolean;
}

export const STUDIO_LIVE_COLLABORATION_PREFERENCES_KEY =
  "toonspectrum:studio-live:preferences:v1";
const STUDIO_LIVE_COLLABORATION_PREFERENCES_EVENT =
  "toonspectrum:studio-live:preferences-changed";

export const DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES:
  Readonly<StudioLiveCollaborationPreferences> = Object.freeze({
    cursorVisibility: "all",
    cursorQuality: "auto",
    showCursorLabels: true,
  });

let cachedPreferences: Readonly<StudioLiveCollaborationPreferences> =
  DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES;
let storageHydrated = false;

function isCursorVisibility(value: unknown): value is StudioLiveCursorVisibility {
  return value === "all" || value === "active" || value === "drawing" || value === "hidden";
}

function isCursorQuality(value: unknown): value is StudioLiveCursorQuality {
  return value === "auto" || value === "smooth" || value === "balanced" || value === "data-saver";
}

function sanitizePreferences(value: unknown): Readonly<StudioLiveCollaborationPreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES;
  }
  const record = value as Record<string, unknown>;
  return Object.freeze({
    cursorVisibility: isCursorVisibility(record.cursorVisibility)
      ? record.cursorVisibility
      : DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES.cursorVisibility,
    cursorQuality: isCursorQuality(record.cursorQuality)
      ? record.cursorQuality
      : DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES.cursorQuality,
    showCursorLabels:
      typeof record.showCursorLabels === "boolean"
        ? record.showCursorLabels
        : DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES.showCursorLabels,
  });
}

function readStorageSnapshot(): Readonly<StudioLiveCollaborationPreferences> {
  if (typeof globalThis.localStorage === "undefined") {
    return DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES;
  }
  try {
    const serialized = globalThis.localStorage.getItem(
      STUDIO_LIVE_COLLABORATION_PREFERENCES_KEY
    );
    return serialized
      ? sanitizePreferences(JSON.parse(serialized) as unknown)
      : DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES;
  } catch {
    return DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES;
  }
}

export function readStudioLiveCollaborationPreferences(): Readonly<StudioLiveCollaborationPreferences> {
  if (!storageHydrated) {
    cachedPreferences = readStorageSnapshot();
    storageHydrated = true;
  }
  return cachedPreferences;
}

export function updateStudioLiveCollaborationPreferences(
  patch: Partial<StudioLiveCollaborationPreferences>
): Readonly<StudioLiveCollaborationPreferences> {
  const current = readStudioLiveCollaborationPreferences();
  const next = sanitizePreferences({ ...current, ...patch });
  cachedPreferences = next;
  storageHydrated = true;
  try {
    globalThis.localStorage?.setItem(
      STUDIO_LIVE_COLLABORATION_PREFERENCES_KEY,
      JSON.stringify(next)
    );
  } catch {
    // The in-memory preference still applies when an embedded browser blocks storage.
  }
  if (typeof globalThis.dispatchEvent === "function") {
    globalThis.dispatchEvent(new Event(STUDIO_LIVE_COLLABORATION_PREFERENCES_EVENT));
  }
  return next;
}

function subscribeStudioLiveCollaborationPreferences(listener: () => void): () => void {
  if (typeof globalThis.addEventListener !== "function") return () => undefined;
  const onLocalChange = () => listener();
  const onStorage = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (
      storageEvent.key !== null &&
      storageEvent.key !== STUDIO_LIVE_COLLABORATION_PREFERENCES_KEY
    ) {
      return;
    }
    cachedPreferences = readStorageSnapshot();
    storageHydrated = true;
    listener();
  };
  globalThis.addEventListener(STUDIO_LIVE_COLLABORATION_PREFERENCES_EVENT, onLocalChange);
  globalThis.addEventListener("storage", onStorage);
  return () => {
    globalThis.removeEventListener(STUDIO_LIVE_COLLABORATION_PREFERENCES_EVENT, onLocalChange);
    globalThis.removeEventListener("storage", onStorage);
  };
}

export function useStudioLiveCollaborationPreferences(): Readonly<StudioLiveCollaborationPreferences> {
  return useSyncExternalStore(
    subscribeStudioLiveCollaborationPreferences,
    readStudioLiveCollaborationPreferences,
    () => DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES
  );
}

function globalNetworkHints(): StudioLiveNetworkHints {
  const navigatorLike = typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      });
  const connection = navigatorLike?.connection;
  return {
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType ?? null,
    reducedMotion:
      typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

export function resolveStudioLiveCursorIntervalMs(
  quality: StudioLiveCursorQuality,
  hints: StudioLiveNetworkHints = globalNetworkHints()
): number {
  if (quality === "smooth") return 16;
  if (quality === "balanced") return 40;
  if (quality === "data-saver") return 96;
  if (hints.saveData || hints.effectiveType === "slow-2g" || hints.effectiveType === "2g") {
    return 96;
  }
  if (hints.effectiveType === "3g") return 64;
  return hints.reducedMotion ? 48 : 32;
}

export function resolveStudioLiveCursorLimit(
  quality: StudioLiveCursorQuality,
  hints: StudioLiveNetworkHints = globalNetworkHints()
): number {
  if (quality === "smooth") return 64;
  if (quality === "balanced") return 32;
  if (quality === "data-saver") return 12;
  if (hints.saveData || hints.effectiveType === "slow-2g" || hints.effectiveType === "2g") {
    return 12;
  }
  if (hints.effectiveType === "3g") return 24;
  return 48;
}

/** Test seam; production callers should update through updateStudioLiveCollaborationPreferences. */
export function resetStudioLiveCollaborationPreferencesForTests(): void {
  cachedPreferences = DEFAULT_STUDIO_LIVE_COLLABORATION_PREFERENCES;
  storageHydrated = false;
}
