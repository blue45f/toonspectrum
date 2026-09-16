import {
  StudioLiveGuestCredentialSchema,
} from "../../../shared/lib/studio-live-auth-ticket";
import {
  readStudioLivePageNavigationType,
  type StudioLivePageNavigationType,
} from "./studio-live-page-lifecycle";

export const STUDIO_LIVE_GUEST_CREDENTIAL_STORAGE_KEY =
  "toonspectrum-studio-live-guest-credential-v1";
export const STUDIO_LIVE_CLIENT_INSTANCE_STORAGE_PREFIX =
  "toonspectrum-studio-live-client-instance:";

export interface StudioLiveIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createGuestCredential(
  randomUUID: () => string,
): string {
  return StudioLiveGuestCredentialSchema.parse(`guest:v1:${randomUUID()}`);
}

function readStoredGuestCredential(storage: StudioLiveIdentityStorage): string | null {
  try {
    const stored = storage.getItem(STUDIO_LIVE_GUEST_CREDENTIAL_STORAGE_KEY);
    if (!stored) return null;
    const parsed = StudioLiveGuestCredentialSchema.safeParse(stored);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Same browser profile keeps one guest principal across refresh. A new credential on every
 * handshake made reconnects look like extra anonymous users and blocked identity replacement.
 */
export function readOrCreateStudioLiveGuestCredential(
  storage: StudioLiveIdentityStorage | null = defaultLocalStorage(),
  randomUUID: () => string = () => globalThis.crypto.randomUUID(),
): string {
  if (storage) {
    const existing = readStoredGuestCredential(storage);
    if (existing) return existing;
  }
  const created = createGuestCredential(randomUUID);
  if (storage) {
    try {
      storage.setItem(STUDIO_LIVE_GUEST_CREDENTIAL_STORAGE_KEY, created);
    } catch {
      // Private mode may reject writes; the in-memory credential still works for this tab.
    }
  }
  return created;
}

function defaultLocalStorage(): StudioLiveIdentityStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function defaultSessionStorage(): StudioLiveIdentityStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

const runtimeClientInstanceIds = new WeakMap<
  StudioLiveIdentityStorage,
  Map<string, string>
>();
const storageLessRuntimeClientInstanceIds = new Map<string, string>();

function runtimeClientInstances(
  storage: StudioLiveIdentityStorage | null,
): Map<string, string> {
  if (!storage) return storageLessRuntimeClientInstanceIds;
  const current = runtimeClientInstanceIds.get(storage);
  if (current) return current;
  const created = new Map<string, string>();
  runtimeClientInstanceIds.set(storage, created);
  return created;
}

/**
 * Page-instance id for one collaborative work.
 *
 * Reloads reuse the stored id so the server can replace a stale socket. A duplicated tab starts
 * with a cloned sessionStorage snapshot, so every non-reload page lifecycle deliberately mints a
 * new id instead of letting two live pages filter each other's CRDT messages as self-authored.
 */
export function readOrCreateStudioLiveClientInstanceId(
  workId: string,
  storage: StudioLiveIdentityStorage | null = defaultSessionStorage(),
  randomUUID: () => string = () => globalThis.crypto.randomUUID(),
  navigationType: StudioLivePageNavigationType = readStudioLivePageNavigationType(),
): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("안전한 공동작업 세션 식별자를 만들 수 없습니다.");
  }
  const runtime = runtimeClientInstances(storage);
  const current = runtime.get(workId);
  if (current) return current;

  const key = `${STUDIO_LIVE_CLIENT_INSTANCE_STORAGE_PREFIX}${workId}`;
  let stored: string | null = null;
  if (storage) {
    try {
      const candidate = storage.getItem(key);
      if (candidate && isUuid(candidate)) stored = candidate;
    } catch {
      // Fall through and mint a fresh id.
    }
  }
  const selected = stored && navigationType === "reload" ? stored : randomUUID();
  if (!isUuid(selected)) {
    throw new Error("안전한 공동작업 세션 식별자를 만들 수 없습니다.");
  }
  runtime.set(workId, selected);
  if (storage) {
    try {
      storage.setItem(key, selected);
    } catch {
      // Same as guest credential: keep the minted id for this page generation.
    }
  }
  return selected;
}
