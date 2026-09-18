const EVENT_SEEN_STORAGE_PREFIX = "toonspectrum:marketing-event-seen:v1";

type SeenStorage = Pick<Storage, "getItem" | "setItem">;

function identityHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function eventSeenStorageKey(eventId: string, userId?: string | null): string {
  const normalizedUserId = userId?.trim();
  const identity = normalizedUserId ? `account-${identityHash(normalizedUserId)}` : "guest";
  return `${EVENT_SEEN_STORAGE_PREFIX}:${eventId}:${identity}`;
}

function browserStorage(): SeenStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenMarketingEvent(
  eventId: string,
  userId?: string | null,
  storage: SeenStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(eventSeenStorageKey(eventId, userId)) === "1";
  } catch {
    return false;
  }
}

export function markMarketingEventSeen(
  eventId: string,
  userId?: string | null,
  storage: SeenStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(eventSeenStorageKey(eventId, userId), "1");
  } catch {
    // Embedded/private contexts may block storage; in-memory dismissal still works.
  }
}

export function hasSeenMarketingEventForIdentity(
  eventId: string,
  userId?: string | null,
  storage: SeenStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  if (!userId) return hasSeenMarketingEvent(eventId, null, storage);
  if (hasSeenMarketingEvent(eventId, userId, storage)) return true;
  if (!hasSeenMarketingEvent(eventId, null, storage)) return false;
  markMarketingEventSeen(eventId, userId, storage);
  return true;
}
