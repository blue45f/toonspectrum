/**
 * Guest → account data migration.
 *
 * While in guest mode, guest-owned local data (drafts, preferences, …) lives
 * under keys namespaced as `toonstudio-guest-data:<guestId>:<name>`. When the
 * guest later signs up or logs in, this module moves those entries into the
 * account namespace `toonstudio-user-data:<userId>:<name>` so nothing the
 * guest made is lost.
 *
 * Security boundaries:
 * - Migration only ever moves data **out of the current browser's own guest
 *   namespace into the freshly authenticated user's namespace**. It never
 *   reads another user's keys and never grants anything server-side.
 * - `userId` must be a real account id (never a `guest_*` id); `guestId` must
 *   be a `guest_*` id. Mixed-up arguments are rejected instead of applied.
 */

export const GUEST_DATA_PREFIX = "toonstudio-guest-data:";
export const USER_DATA_PREFIX = "toonstudio-user-data:";
const GUEST_ID_PREFIX = "guest_";

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GuestDataItem {
  /** Full storage key. */
  readonly key: string;
  /** Name without the namespace prefix. */
  readonly name: string;
  readonly bytes: number;
}

export interface GuestMigrationResult {
  readonly moved: number;
  /** Names that were skipped because the destination already had data. */
  readonly skipped: readonly string[];
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isValidGuestId(guestId: string): boolean {
  return guestId.startsWith(GUEST_ID_PREFIX) && guestId.length > GUEST_ID_PREFIX.length;
}

function isValidUserId(userId: string): boolean {
  return userId.length > 0 && !userId.startsWith(GUEST_ID_PREFIX);
}

function isValidName(name: string): boolean {
  return name.length > 0 && name.length <= 256 && !name.includes(":");
}

/** Storage key for one guest-owned datum. */
export function guestDataKey(guestId: string, name: string): string {
  if (!isValidGuestId(guestId)) throw new Error("guestDataKey: invalid guest id");
  if (!isValidName(name)) throw new Error("guestDataKey: invalid name");
  return `${GUEST_DATA_PREFIX}${guestId}:${name}`;
}

/** Lists the guest-owned data entries stored on this browser. */
export function listGuestData(
  guestId: string,
  storage: StorageLike | null = defaultStorage(),
): GuestDataItem[] {
  if (!storage || !isValidGuestId(guestId)) return [];
  const prefix = `${GUEST_DATA_PREFIX}${guestId}:`;
  const items: GuestDataItem[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(prefix)) continue;
    const name = key.slice(prefix.length);
    if (!isValidName(name)) continue;
    const value = storage.getItem(key) ?? "";
    items.push({ key, name, bytes: value.length });
  }
  return items.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Moves this browser's guest data into the authenticated user's namespace.
 * Destination keys that already exist are left untouched and reported as
 * skipped — migration never overwrites account data.
 */
export function migrateGuestDataToAccount(options: {
  readonly guestId: string;
  readonly userId: string;
  readonly storage?: StorageLike | null;
}): GuestMigrationResult {
  const { guestId, userId, storage = defaultStorage() } = options;
  if (!isValidGuestId(guestId)) throw new Error("migrateGuestDataToAccount: invalid guest id");
  if (!isValidUserId(userId)) throw new Error("migrateGuestDataToAccount: invalid user id");
  if (!storage) return { moved: 0, skipped: [] };

  const items = listGuestData(guestId, storage);
  let moved = 0;
  const skipped: string[] = [];
  for (const item of items) {
    const destination = `${USER_DATA_PREFIX}${userId}:${item.name}`;
    if (storage.getItem(destination) !== null) {
      skipped.push(item.name);
      continue;
    }
    const value = storage.getItem(item.key);
    if (value === null) continue;
    storage.setItem(destination, value);
    storage.removeItem(item.key);
    moved += 1;
  }
  return { moved, skipped };
}

/** Removes all guest-owned data for the given guest id. Returns removed count. */
export function clearGuestData(
  guestId: string,
  storage: StorageLike | null = defaultStorage(),
): number {
  if (!storage || !isValidGuestId(guestId)) return 0;
  const items = listGuestData(guestId, storage);
  for (const item of items) storage.removeItem(item.key);
  return items.length;
}
