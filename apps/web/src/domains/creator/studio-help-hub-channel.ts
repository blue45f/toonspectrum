/**
 * Help hub request channel.
 *
 * The existing help-center channel owns technical probes (diagnostics, recovery,
 * licenses and bug reports). This channel owns the task-oriented help home and
 * keeps menu data decoupled from the lazy React surface.
 */

export type StudioHelpHubTab =
  | "home"
  | "learn"
  | "shortcuts"
  | "solve"
  | "updates";

export interface StudioHelpHubActions {
  readonly openFeatureTutorial?: () => unknown;
  readonly openShortcuts?: () => unknown;
}

export interface StudioHelpHubRequest {
  readonly initialTab?: StudioHelpHubTab;
  readonly initialQuery?: string;
  readonly toolCommandId?: string;
  readonly actions?: StudioHelpHubActions;
}

type StudioHelpHubListener = (request: StudioHelpHubRequest) => void;

const listeners = new Set<StudioHelpHubListener>();

/** Open the task-oriented help hub. Returns false when its host is not mounted. */
export function openStudioHelpHub(request: StudioHelpHubRequest = {}): boolean {
  if (listeners.size === 0) return false;
  for (const listener of [...listeners]) listener(request);
  return true;
}

export function subscribeStudioHelpHub(listener: StudioHelpHubListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only visibility into host installation. */
export function studioHelpHubListenerCount(): number {
  return listeners.size;
}
