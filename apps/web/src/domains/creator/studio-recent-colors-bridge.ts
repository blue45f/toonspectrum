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

export type StudioRecentColorsOwnerToken = symbol;

type StudioRecentColorsIntent =
  | Readonly<{ type: "load" }>
  | Readonly<{ type: "remember"; color: string }>
  | Readonly<{ type: "clear" }>;

const EMPTY_RECENT_COLORS: readonly string[] = Object.freeze([]);
const listeners = new Set<() => void>();
let snapshot: readonly string[] = EMPTY_RECENT_COLORS;
let owner: Readonly<{
  token: StudioRecentColorsOwnerToken;
  value: StudioRecentColorsOwner;
}> | null = null;
let pendingIntents: StudioRecentColorsIntent[] = [];
let persistenceTail: Promise<void> = Promise.resolve();

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

/** Creates a stable generation token for one mounted recent-colors owner. */
export function createStudioRecentColorsOwnerToken(): StudioRecentColorsOwnerToken {
  return Symbol("studio-recent-colors-owner");
}

/** Returns whether a generation still owns the shared recent-colors bridge. */
export function isStudioRecentColorsOwnerActive(
  token: StudioRecentColorsOwnerToken,
): boolean {
  return owner?.token === token;
}

/**
 * Registers the page-level SQLite owner without forcing colour consumers to prop-drill through the
 * inspector graph. The newest mounted generation wins; stale cleanup cannot release a newer owner.
 */
export function registerStudioRecentColorsOwner(
  token: StudioRecentColorsOwnerToken,
  value: StudioRecentColorsOwner,
): () => void {
  owner = Object.freeze({ token, value });
  const queued = pendingIntents;
  pendingIntents = [];
  for (const intent of queued) dispatchIntent(value, intent);
  return () => {
    if (owner?.token === token) owner = null;
  };
}

/** Publishes a bounded snapshot only while its originating generation remains active. */
export function publishStudioRecentColorsSnapshot(
  token: StudioRecentColorsOwnerToken,
  colors: readonly string[],
): boolean {
  if (!isStudioRecentColorsOwnerActive(token)) return false;
  setSnapshot(colors);
  return true;
}

/**
 * Serializes writes across owner generations. A stale queued write is skipped, while a write that
 * already reached storage must finish before the new owner's write, preserving newest-writer wins.
 */
export function enqueueStudioRecentColorsWrite(
  token: StudioRecentColorsOwnerToken,
  write: () => Promise<void>,
): Promise<void> {
  const run = persistenceTail.then(async () => {
    if (!isStudioRecentColorsOwnerActive(token)) return;
    await write();
  });
  persistenceTail = run.catch(() => undefined);
  return run;
}

/** Waits for any write that already reached durable storage before a replacement owner hydrates. */
export async function waitForStudioRecentColorsPersistenceIdle(): Promise<void> {
  await persistenceTail;
}

/** Subscribes a lightweight colour surface to immutable shared snapshot changes. */
export function subscribeStudioRecentColors(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns the current immutable client snapshot. */
export function getStudioRecentColorsSnapshot(): readonly string[] {
  return snapshot;
}

/** SSR never exposes another request's module snapshot. The bridge hydrates after client mount. */
export function getStudioRecentColorsServerSnapshot(): readonly string[] {
  return EMPTY_RECENT_COLORS;
}

/** Requests hydration now or queues one request for the next registered owner. */
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
 * Optimistically updates the colour strip, then routes persistence through the canonical owner.
 * An intent emitted just before owner mount is queued and replayed after registration.
 */
export function rememberSharedStudioRecentColor(rawColor: string): void {
  const color = normalizeHexColor(rawColor);
  if (!color) return;
  setSnapshot(pushRecentColor([...snapshot], color));
  const intent = Object.freeze({ type: "remember", color } as const);
  if (owner) dispatchIntent(owner.value, intent);
  else pendingIntents.push(intent);
}

/** Clears the optimistic snapshot and routes durable clearing through the canonical owner. */
export function clearSharedStudioRecentColors(): void {
  setSnapshot(EMPTY_RECENT_COLORS);
  const intent = Object.freeze({ type: "clear" } as const);
  if (owner) dispatchIntent(owner.value, intent);
  else pendingIntents.push(intent);
}

/** Test-only isolation for shared module state and queued persistence. */
export function resetStudioRecentColorsBridgeForTests(): void {
  snapshot = EMPTY_RECENT_COLORS;
  owner = null;
  pendingIntents = [];
  persistenceTail = Promise.resolve();
  listeners.clear();
}
