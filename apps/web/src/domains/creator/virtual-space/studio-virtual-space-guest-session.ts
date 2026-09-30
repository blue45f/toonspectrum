import { parseStudioSpatialInviteFragment } from "./studio-spatial-invite-context";

export interface StudioGuestInviteSpawn {
  readonly x: number;
  readonly y: number;
}

export interface ParsedStudioGuestInvite {
  readonly token: string | null;
  /** Inviter-chosen spawn point from the invite fragment (`spawn=x,y`). Null when absent. */
  readonly spawn: StudioGuestInviteSpawn | null;
}

export interface StudioGuestSession {
  readonly sessionId: string;
  readonly inviteToken: string;
  readonly spaceId: string;
  readonly nickname: string;
  readonly spawn: StudioGuestInviteSpawn | null;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly maxUses: number;
  readonly uses: number;
}

export type StudioGuestCapability = "move" | "voice" | "author" | "invite" | "moderate";

const CAPABILITIES: Record<StudioGuestCapability, boolean> = {
  move: true,
  voice: true,
  author: false,
  invite: false,
  moderate: false,
};

/** Guest capability fence. Authoring, inviting and moderation stay member-only. */
export function studioGuestCan(capability: StudioGuestCapability): boolean {
  return CAPABILITIES[capability] ?? false;
}

export const STUDIO_GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const STUDIO_GUEST_SESSION_STORAGE_KEY = "toonspectrum:virtual-space-guest:v1";
const SESSION_ID = /^[A-Za-z0-9_-]{16}$/u;

function randomSessionId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let id = "";
  try {
    const values = new Uint32Array(16);
    globalThis.crypto.getRandomValues(values);
    for (const value of values) id += alphabet[value % alphabet.length];
    return id;
  } catch {
    for (let index = 0; index < 16; index++) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return id;
  }
}

function parseSpawn(raw: string | null): StudioGuestInviteSpawn | null {
  if (!raw) return null;
  const match = /^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/u.exec(raw.trim());
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 100_000 || y > 100_000) return null;
  return { x, y };
}

/**
 * Parse an invite fragment for guest entry. Reuses the shared invite token
 * format; `spawn=x,y` is an optional inviter-chosen spawn point.
 */
export function parseStudioGuestInviteFragment(hash: string): ParsedStudioGuestInvite {
  const { token } = parseStudioSpatialInviteFragment(hash);
  const fragment = new URLSearchParams(hash.replace(/^#/u, ""));
  return { token, spawn: parseSpawn(fragment.get("spawn")) };
}

export function createStudioGuestSession(input: {
  readonly token: string;
  readonly spaceId: string;
  readonly nickname: string;
  readonly spawn?: StudioGuestInviteSpawn | null;
  readonly now?: number;
}): StudioGuestSession {
  const now = input.now ?? Date.now();
  return Object.freeze({
    sessionId: randomSessionId(),
    inviteToken: input.token,
    spaceId: input.spaceId,
    nickname: input.nickname,
    spawn: input.spawn ?? null,
    issuedAt: now,
    expiresAt: now + STUDIO_GUEST_SESSION_TTL_MS,
    // One-time redemption: a single session per invite open. A server adapter
    // must enforce this authoritatively; the client record is a UX guard.
    maxUses: 1,
    uses: 1,
  });
}

export function isStudioGuestSessionValid(session: unknown, now: number = Date.now()): session is StudioGuestSession {
  if (!session || typeof session !== "object") return false;
  const candidate = session as Record<string, unknown>;
  return (
    typeof candidate.sessionId === "string" &&
    SESSION_ID.test(candidate.sessionId) &&
    typeof candidate.inviteToken === "string" &&
    candidate.inviteToken.length > 0 &&
    typeof candidate.spaceId === "string" &&
    candidate.spaceId.length > 0 &&
    typeof candidate.nickname === "string" &&
    candidate.nickname.length > 0 &&
    typeof candidate.issuedAt === "number" &&
    Number.isFinite(candidate.issuedAt) &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    (candidate.issuedAt as number) <= now &&
    (candidate.expiresAt as number) > now
  );
}

export type StudioGuestSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserGuestStorage(): StudioGuestSessionStorage | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readStudioGuestSession(
  now?: number,
  storage: StudioGuestSessionStorage | null = browserGuestStorage(),
): StudioGuestSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STUDIO_GUEST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session: unknown = JSON.parse(raw);
    return isStudioGuestSessionValid(session, now ?? Date.now()) ? (session as StudioGuestSession) : null;
  } catch {
    return null;
  }
}

export function writeStudioGuestSession(
  session: StudioGuestSession,
  storage: StudioGuestSessionStorage | null = browserGuestStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STUDIO_GUEST_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in privacy-constrained browsers; the session stays in memory.
  }
}

export function clearStudioGuestSession(
  storage: StudioGuestSessionStorage | null = browserGuestStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(STUDIO_GUEST_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-constrained browsers.
  }
}
