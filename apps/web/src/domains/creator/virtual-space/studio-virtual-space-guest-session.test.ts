import { describe, expect, it } from "vitest";

import {
  clearStudioGuestSession,
  createStudioGuestSession,
  isStudioGuestSessionValid,
  parseStudioGuestInviteFragment,
  readStudioGuestSession,
  STUDIO_GUEST_SESSION_STORAGE_KEY,
  STUDIO_GUEST_SESSION_TTL_MS,
  studioGuestCan,
  writeStudioGuestSession,
  type StudioGuestSessionStorage,
} from "./studio-virtual-space-guest-session";

const TOKEN = "a".repeat(43);

function memoryStorage(): StudioGuestSessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("parseStudioGuestInviteFragment", () => {
  it("extracts token and spawn", () => {
    const parsed = parseStudioGuestInviteFragment(`#invite=${TOKEN}&entry=project-space&spawn=120.5,340`);
    expect(parsed.token).toBe(TOKEN);
    expect(parsed.spawn).toEqual({ x: 120.5, y: 340 });
  });

  it("ignores invalid spawn but keeps token", () => {
    const parsed = parseStudioGuestInviteFragment(`#invite=${TOKEN}&spawn=nope`);
    expect(parsed.token).toBe(TOKEN);
    expect(parsed.spawn).toBeNull();
  });

  it("returns null token without invite", () => {
    expect(parseStudioGuestInviteFragment("#entry=team-lobby").token).toBeNull();
  });
});

describe("createStudioGuestSession", () => {
  it("issues a 24h one-time session", () => {
    const now = 1_700_000_000_000;
    const session = createStudioGuestSession({
      token: TOKEN,
      spaceId: "project-1",
      nickname: "게스트",
      spawn: { x: 10, y: 20 },
      now,
    });
    expect(session.expiresAt).toBe(now + STUDIO_GUEST_SESSION_TTL_MS);
    expect(session.maxUses).toBe(1);
    expect(session.spawn).toEqual({ x: 10, y: 20 });
    expect(isStudioGuestSessionValid(session, now)).toBe(true);
  });

  it("rejects expired sessions", () => {
    const session = createStudioGuestSession({ token: TOKEN, spaceId: "p", nickname: "게스트", now: 1000 });
    expect(isStudioGuestSessionValid(session, 1000 + STUDIO_GUEST_SESSION_TTL_MS + 1)).toBe(false);
  });

  it("rejects malformed sessions", () => {
    expect(isStudioGuestSessionValid(null)).toBe(false);
    expect(isStudioGuestSessionValid({})).toBe(false);
    expect(isStudioGuestSessionValid({ sessionId: "x" })).toBe(false);
  });
});

describe("guest session storage", () => {
  it("round-trips a valid session", () => {
    const storage = memoryStorage();
    const session = createStudioGuestSession({ token: TOKEN, spaceId: "p", nickname: "게스트", now: 1000 });
    writeStudioGuestSession(session, storage);
    expect(storage.data.has(STUDIO_GUEST_SESSION_STORAGE_KEY)).toBe(true);
    expect(readStudioGuestSession(2000, storage)?.sessionId).toBe(session.sessionId);
  });

  it("drops expired sessions on read", () => {
    const storage = memoryStorage();
    const session = createStudioGuestSession({ token: TOKEN, spaceId: "p", nickname: "게스트", now: 1000 });
    writeStudioGuestSession(session, storage);
    expect(readStudioGuestSession(1000 + STUDIO_GUEST_SESSION_TTL_MS + 1, storage)).toBeNull();
  });

  it("clears sessions", () => {
    const storage = memoryStorage();
    writeStudioGuestSession(createStudioGuestSession({ token: TOKEN, spaceId: "p", nickname: "게스트", now: 1000 }), storage);
    clearStudioGuestSession(storage);
    expect(readStudioGuestSession(2000, storage)).toBeNull();
  });

  it("tolerates missing storage", () => {
    expect(readStudioGuestSession(Date.now(), null)).toBeNull();
    expect(() => writeStudioGuestSession(
      createStudioGuestSession({ token: TOKEN, spaceId: "p", nickname: "게스트", now: 1 }),
      null,
    )).not.toThrow();
  });
});

describe("studioGuestCan", () => {
  it("allows movement and voice only", () => {
    expect(studioGuestCan("move")).toBe(true);
    expect(studioGuestCan("voice")).toBe(true);
    expect(studioGuestCan("author")).toBe(false);
    expect(studioGuestCan("invite")).toBe(false);
    expect(studioGuestCan("moderate")).toBe(false);
  });
});
