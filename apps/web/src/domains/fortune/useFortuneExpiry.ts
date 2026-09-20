import { useCallback, useSyncExternalStore } from "react";

const serverSnapshot = () => false;
/** Rechecks on tab/window restoration; expiry never triggers a network request. */
export function useFortuneExpiry(expiresAt: string | null): boolean {
  const expired = useCallback(() => expiresAt !== null && Date.parse(expiresAt) <= Date.now(), [expiresAt]);
  const subscribe = useCallback((changed: () => void) => {
    if (!expiresAt) return () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (timer !== undefined) clearTimeout(timer);
      changed();
      const remaining = Date.parse(expiresAt) - Date.now();
      if (remaining > 0) timer = setTimeout(check, Math.min(remaining + 1, 2147483647));
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [expiresAt]);
  return useSyncExternalStore(subscribe, expired, serverSnapshot);
}
