export const STUDIO_BETA_NOTICE_STORAGE_KEY =
  "toonspectrum-studio-beta-notice-acknowledged";

/**
 * Bump this value whenever the beta operating notice materially changes.
 * A new revision is shown again even when an earlier notice was acknowledged.
 */
export const STUDIO_BETA_NOTICE_REVISION = "2026-09-24-data-and-policy-v1";

interface StudioBetaNoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type StorageProvider = () => StudioBetaNoticeStorage | null;

function browserLocalStorage(): StudioBetaNoticeStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasAcknowledgedStudioBetaNotice(
  getStorage: StorageProvider = browserLocalStorage,
): boolean {
  try {
    return getStorage()?.getItem(STUDIO_BETA_NOTICE_STORAGE_KEY)
      === STUDIO_BETA_NOTICE_REVISION;
  } catch {
    return false;
  }
}

export function acknowledgeStudioBetaNotice(
  getStorage: StorageProvider = browserLocalStorage,
): void {
  try {
    getStorage()?.setItem(
      STUDIO_BETA_NOTICE_STORAGE_KEY,
      STUDIO_BETA_NOTICE_REVISION,
    );
  } catch {
    // Storage may be blocked or full. The notice can still close for this visit.
  }
}
