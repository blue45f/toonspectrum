/**
 * App shell → Studio command-search bridge.
 *
 * The global command palette lives in the shared shell while the registry-backed search
 * lives in the creator domain. Importing the creator domain from shared UI would invert the
 * dependency graph, so the shell publishes a request through this tiny synchronous channel.
 *
 * Requests are intentionally not replayed. When Studio has not mounted a listener yet the
 * caller receives `false` and can keep the existing global-palette fallback.
 */

export type StudioCommandSearchBridgeScope =
  | "all"
  | "inspector"
  | "command"
  | "help";

export interface StudioCommandSearchBridgeRequest {
  readonly scope?: StudioCommandSearchBridgeScope;
}

type StudioCommandSearchBridgeListener = (
  request: StudioCommandSearchBridgeRequest,
) => void;

const listeners = new Set<StudioCommandSearchBridgeListener>();

/**
 * Ask the currently mounted Studio search host to open.
 *
 * @returns `true` when at least one Studio host accepted the request; otherwise `false`.
 */
export function requestStudioCommandSearchFromAppShell(
  request: StudioCommandSearchBridgeRequest = {},
): boolean {
  if (listeners.size === 0) return false;
  for (const listener of [...listeners]) listener(request);
  return true;
}

export function subscribeStudioCommandSearchFromAppShell(
  listener: StudioCommandSearchBridgeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only observability for bridge lifecycle contracts. */
export function studioCommandSearchBridgeListenerCount(): number {
  return listeners.size;
}

/** Test-only reset for isolated jsdom suites. */
export function resetStudioCommandSearchBridgeForTests(): void {
  listeners.clear();
}
