/**
 * Guest session — one-click anonymous identity for login-free exploration.
 *
 * Design notes:
 * - A guest identity is **client-local only**. It is never sent to the API as
 *   credentials and never grants access to anyone else's data. Protected APIs
 *   keep rejecting unauthenticated callers with 401; the guest simply lets the
 *   UI treat "anonymous but intentional" visitors better than strangers.
 * - The identity is a random, unguessable `guest_<uuid>` persisted in
 *   localStorage under its own key — deliberately separate from the real auth
 *   session key (`toonstudio-auth-session`) so the two can never be confused.
 * - Starting a guest session never touches the real auth flow; ending it never
 *   signs anyone out.
 */

import { useSyncExternalStore } from "react";

export interface GuestIdentity {
  /** Opaque anonymous id, e.g. `guest_3f9a…`. Never a user id. */
  readonly id: string;
  /** Epoch ms when the guest session was created on this browser. */
  readonly createdAt: number;
}

export const GUEST_SESSION_KEY = "toonstudio-guest-session-v1";

const GUEST_ID_PREFIX = "guest_";
const GUEST_CHANNEL_NAME = "toonstudio-guest-session-v1";
const GUEST_ID_MAX_LENGTH = 128;

type GuestChangeListener = () => void;
const listeners = new Set<GuestChangeListener>();

let cachedGuest: GuestIdentity | null | undefined;
let guestChannel: BroadcastChannel | null = null;

function randomGuestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${GUEST_ID_PREFIX}${uuid}`;
}

function isValidGuestIdentity(value: unknown): value is GuestIdentity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; createdAt?: unknown };
  return (
    typeof candidate.id === "string" &&
    candidate.id.startsWith(GUEST_ID_PREFIX) &&
    candidate.id.length <= GUEST_ID_MAX_LENGTH &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt)
  );
}

function readStoredGuest(): GuestIdentity | null {
  try {
    const raw = globalThis.localStorage?.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidGuestIdentity(parsed) ? parsed : null;
  } catch {
    // Storage may be disabled by browser privacy settings; guest mode then
    // simply degrades to "not a guest" instead of throwing.
    return null;
  }
}

function writeStoredGuest(guest: GuestIdentity | null): void {
  try {
    if (guest === null) {
      globalThis.localStorage?.removeItem(GUEST_SESSION_KEY);
    } else {
      globalThis.localStorage?.setItem(GUEST_SESSION_KEY, JSON.stringify(guest));
    }
  } catch {
    // Best effort only — see readStoredGuest.
  }
}

function emitGuestChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One misbehaving subscriber must not break the rest.
    }
  });
}

function publishGuestChange(): void {
  try {
    guestChannel?.postMessage({ type: "guest-change", version: 1 });
  } catch {
    // BroadcastChannel is optional; the storage event covers other tabs.
  }
}

function reloadGuestFromStorage(): void {
  cachedGuest = readStoredGuest();
  emitGuestChange();
}

function initializeGuestCoordination(): void {
  if (typeof window === "undefined") return;
  if (typeof globalThis.BroadcastChannel === "function") {
    try {
      guestChannel = new globalThis.BroadcastChannel(GUEST_CHANNEL_NAME);
      guestChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
        const data = event.data as { type?: unknown } | null;
        if (data?.type === "guest-change") reloadGuestFromStorage();
      });
    } catch {
      guestChannel = null;
    }
  }
  globalThis.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === GUEST_SESSION_KEY) reloadGuestFromStorage();
  });
}

if (typeof window !== "undefined") {
  initializeGuestCoordination();
}

/** Current guest identity, or null when this browser is not in guest mode. */
export function getGuestIdentity(): GuestIdentity | null {
  if (cachedGuest === undefined) cachedGuest = readStoredGuest();
  return cachedGuest;
}

/**
 * Starts (or reuses) a guest session on this browser and returns it.
 * Safe to call when already a guest — the existing identity is reused so a
 * guest's local work keeps a stable owner.
 */
export function startGuestSession(): GuestIdentity {
  const existing = getGuestIdentity();
  if (existing) return existing;
  const guest: GuestIdentity = { id: randomGuestId(), createdAt: Date.now() };
  cachedGuest = guest;
  writeStoredGuest(guest);
  publishGuestChange();
  emitGuestChange();
  return guest;
}

/** Ends the guest session on this browser. Never affects real auth state. */
export function endGuestSession(): void {
  cachedGuest = null;
  writeStoredGuest(null);
  publishGuestChange();
  emitGuestChange();
}

export function subscribeGuestSession(listener: GuestChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Short, human-friendly suffix of the guest id for display (e.g. `게스트 · 3f9a`). */
export function guestShortId(guest: GuestIdentity): string {
  return guest.id.slice(-4);
}

/**
 * React binding for the guest session. `isGuest` is true only for anonymous
 * guest mode — it never implies authentication.
 */
export function useGuestSession(): {
  readonly guest: GuestIdentity | null;
  readonly isGuest: boolean;
  readonly startGuest: () => GuestIdentity;
  readonly endGuest: () => void;
} {
  const guest = useSyncExternalStore(
    subscribeGuestSession,
    getGuestIdentity,
    () => null,
  );
  return {
    guest,
    isGuest: guest !== null,
    startGuest: startGuestSession,
    endGuest: endGuestSession,
  };
}
