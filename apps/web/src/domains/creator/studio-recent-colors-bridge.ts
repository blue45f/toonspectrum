import {
  normalizeHexColor,
  normalizeRecentColors,
  pushRecentColor,
} from "./studio-color-utils";

export interface StudioRecentColorsOwner {
  readonly ensureRecentColorsLoaded: () => void;
  readonly rememberColor: (color: string) => void;
  readonly clearRecentColors: () => void;
}

type StudioRecentColorsIntent =
  | Readonly<{ type: "load" }>
  | Readonly<{ type: "remember"; color: string }>
  | Readonly<{ type: "clear" }>;

const EMPTY_RECENT_COLORS: readonly string[] = Object.freeze([]);
const listeners = new Set<() => void>();
let snapshot: readonly string[] = EMPTY_RECENT_COLORS;
let owner: Readonly<{
  token: symbol;
  value: StudioRecentColorsOwner;
}> | null = null;
let pendingIntents: StudioRecentColorsIntent[] = [];

function sameColors(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((color, index) => color === right[index]);
}

function setSnapshot(colors: readonly string[]): void {
  const next = Object.freeze(normalizeRecentColors([...colors]));
  if (sameColors(snapshot, next)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function dispatchIntent(
  target: StudioRecentColorsOwner,
  intent: StudioRecentColorsIntent,
): void {
  if (intent.type === "load") target.ensureRecentColorsLoaded();
  else if (intent.type === "remember") target.rememberColor(intent.color);
  else target.clearRecentColors();
}

/**
 * Registers the page-level SQLite owner without forcing colour consumers to prop-drill through the
 * entire inspector graph. The newest mounted owner wins, and only its own cleanup may release it.
 */
export function registerStudioRecentColorsOwner(
  value: StudioRecentColorsOwner,
): () => void {
  const token = Symbol("studio-recent-colors-owner");
  owner = Object.freeze({ token, value });
  const queued = pendingIntents;
  pendingIntents = [];
  for (const intent of queued) dispatchIntent(value, intent);
  return () => {
    if (owner?.token === token) owner = null;
  };
}

/** Publishes the canonical SQLite owner's latest bounded list to all lightweight consumers. */
export function publishStudioRecentColorsSnapshot(colors: readonly string[]): void {
  setSnapshot(colors);
}

export function subscribeStudioRecentColors(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStudioRecentColorsSnapshot(): readonly string[] {
  return snapshot;
}

/** SSR never exposes another request's module snapshot. The bridge hydrates after client mount. */
export function getStudioRecentColorsServerSnapshot(): readonly string[] {
  return EMPTY_RECENT_COLORS;
}

export function ensureSharedStudioRecentColorsLoaded(): void {
  if (owner) {
    owner.value.ensureRecentColorsLoaded();
    return;
  }
  if (!pendingIntents.some((intent) => intent.type === "load")) {
    pendingIntents.push(Object.freeze({ type: "load" } as const));
  }
}

/**
 * Optimistically updates the colour strip, then routes persistence through the one SQLite owner.
 * An intent emitted just before the owner mounts is queued and replayed after registration.
 */
export function rememberSharedStudioRecentColor(rawColor: string): void {
  const color = normalizeHexColor(rawColor);
  if (!color) return;
  setSnapshot(pushRecentColor([...snapshot], color));
  const intent = Object.freeze({ type: "remember", color } as const);
  if (owner) dispatchIntent(owner.value, intent);
  else pendingIntents.push(intent);
}

export function clearSharedStudioRecentColors(): void {
  setSnapshot(EMPTY_RECENT_COLORS);
  const intent = Object.freeze({ type: "clear" } as const);
  if (owner) dispatchIntent(owner.value, intent);
  else pendingIntents.push(intent);
}

/** Test-only isolation for module state shared by multiple jsdom hook/component suites. */
export function resetStudioRecentColorsBridgeForTests(): void {
  snapshot = EMPTY_RECENT_COLORS;
  owner = null;
  pendingIntents = [];
  listeners.clear();
}
