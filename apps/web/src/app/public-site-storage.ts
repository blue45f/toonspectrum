const COMPAT_DISMISSED = "toonspectrum-compat-dismissed";

/** WebViews/private browsing may throw even when accessing sessionStorage. */
export function hasDismissedBrowserCompatibility(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem(COMPAT_DISMISSED));
  } catch {
    return false;
  }
}

export function dismissBrowserCompatibility(): void {
  try {
    window.sessionStorage.setItem(COMPAT_DISMISSED, "true");
  } catch {
    // The React modal state still closes; persistence is optional.
  }
}
