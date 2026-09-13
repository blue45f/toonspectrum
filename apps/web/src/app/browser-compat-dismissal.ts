const KEY = "toonspectrum-compat-dismissed";
type SessionStore = Pick<Storage, "getItem" | "setItem">;

/** Storage getters themselves can throw in private or embedded browser contexts. */
export function isBrowserCompatDismissed(getStorage: () => SessionStore = () => globalThis.sessionStorage): boolean {
  try {
    return getStorage().getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function dismissBrowserCompat(getStorage: () => SessionStore = () => globalThis.sessionStorage): void {
  try {
    getStorage().setItem(KEY, "true");
  } catch {
    // Dismissing the current modal must work even when persistence is unavailable.
  }
}
