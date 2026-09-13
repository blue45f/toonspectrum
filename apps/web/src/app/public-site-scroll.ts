export interface PublicScrollPosition { x: number; y: number }
export const PUBLIC_SCROLL_HISTORY_LIMIT = 80;

export function publicHashTarget(hash: string): string | null {
  if (!hash || hash === "#") return null;
  try {
    return decodeURIComponent(hash.startsWith("#") ? hash.slice(1) : hash);
  } catch {
    return null;
  }
}

/** Memory-only, history-entry keyed. No URLs, artwork or account data are persisted. */
export function rememberPublicScrollPosition(history: Map<string, PublicScrollPosition>, key: string, position: PublicScrollPosition) {
  const finite = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  history.delete(key);
  history.set(key, { x: finite(position.x), y: finite(position.y) });
  while (history.size > PUBLIC_SCROLL_HISTORY_LIMIT) {
    const first = history.keys().next();
    if (first.done) break;
    history.delete(first.value);
  }
}
