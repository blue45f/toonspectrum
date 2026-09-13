import { dismissBrowserCompat, isBrowserCompatDismissed } from "./browser-compat-dismissal";

/** Compatibility aliases share one guarded storage contract rather than disagreeing on values. */
export function hasDismissedBrowserCompatibility(): boolean {
  return isBrowserCompatDismissed(() => window.sessionStorage);
}

export function dismissBrowserCompatibility(): void {
  dismissBrowserCompat(() => window.sessionStorage);
}
