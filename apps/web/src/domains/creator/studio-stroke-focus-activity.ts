export const STUDIO_STROKE_FOCUS_SETTLE_MS = 700;

export type StudioStrokeFocusOwner = "canvas-stroke";
export type StudioStrokeFocusPhase = "idle" | "drawing" | "settling";

const owners = new Set<StudioStrokeFocusOwner>();
const listeners = new Set<() => void>();
let phase: StudioStrokeFocusPhase = "idle";
let settleTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

function rootElement(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

function syncRootAttribute(): void {
  const root = rootElement();
  if (!root) return;
  if (phase === "idle") root.removeAttribute("data-studio-stroke-focus-phase");
  else root.setAttribute("data-studio-stroke-focus-phase", phase);
}

function publish(next: StudioStrokeFocusPhase): void {
  if (phase === next) {
    syncRootAttribute();
    return;
  }
  phase = next;
  syncRootAttribute();
  for (const listener of listeners) listener();
}

function cancelSettling(): void {
  if (settleTimer === null) return;
  globalThis.clearTimeout(settleTimer);
  settleTimer = null;
}

export function studioStrokeFocusActivitySnapshot(): StudioStrokeFocusPhase {
  return phase;
}

export function subscribeStudioStrokeFocusActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Synchronous stroke-lifetime signal for chrome suppression.
 *
 * The shell deliberately stays outside React's hot drawing path. Beginning a real document stroke
 * updates one root data attribute immediately; ending the last owner keeps the chrome quiet for a
 * short settling window so rapid pen strokes do not make controls flash between contacts.
 */
export function setStudioStrokeFocusActivity(
  owner: StudioStrokeFocusOwner,
  active: boolean,
): void {
  if (active) {
    cancelSettling();
    owners.add(owner);
    publish("drawing");
    return;
  }

  owners.delete(owner);
  if (owners.size > 0) return;
  if (phase === "idle") return;

  cancelSettling();
  publish("settling");
  settleTimer = globalThis.setTimeout(() => {
    settleTimer = null;
    if (owners.size === 0) publish("idle");
  }, STUDIO_STROKE_FOCUS_SETTLE_MS);
}

export function resetStudioStrokeFocusActivityForTests(): void {
  cancelSettling();
  owners.clear();
  publish("idle");
}
