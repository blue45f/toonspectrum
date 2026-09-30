// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  endGuestSession,
  getGuestIdentity,
  GUEST_SESSION_KEY,
  guestShortId,
  startGuestSession,
  subscribeGuestSession,
  useGuestSession,
} from "./guest-session";

beforeEach(() => {
  window.localStorage.clear();
  // Reset the module-level cache by ending any session.
  endGuestSession();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
  endGuestSession();
});

describe("guest-session", () => {
  it("starts with no guest identity", () => {
    expect(getGuestIdentity()).toBeNull();
  });

  it("startGuestSession creates a random, unguessable guest id", () => {
    const first = startGuestSession();
    expect(first.id).toMatch(/^guest_/);
    expect(first.id.length).toBeGreaterThan(10);
    expect(typeof first.createdAt).toBe("number");

    endGuestSession();
    const second = startGuestSession();
    expect(second.id).not.toBe(first.id);
  });

  it("reuses the existing guest identity while in guest mode", () => {
    const first = startGuestSession();
    const second = startGuestSession();
    expect(second.id).toBe(first.id);
  });

  it("persists the guest identity in localStorage under its own key", () => {
    const guest = startGuestSession();
    const raw = window.localStorage.getItem(GUEST_SESSION_KEY);
    expect(raw).toContain(guest.id);
    // Must not collide with the real auth session key.
    expect(GUEST_SESSION_KEY).not.toBe("toonstudio-auth-session");
    expect(window.localStorage.getItem("toonstudio-auth-session")).toBeNull();
  });

  it("endGuestSession clears the guest identity but nothing else", () => {
    window.localStorage.setItem("unrelated-key", "keep-me");
    startGuestSession();
    endGuestSession();
    expect(getGuestIdentity()).toBeNull();
    expect(window.localStorage.getItem(GUEST_SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem("unrelated-key")).toBe("keep-me");
  });

  it("rejects malformed stored values instead of trusting them", () => {
    window.localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({ id: "user-1" }));
    // Force a fresh read by simulating a new tab load.
    window.dispatchEvent(new StorageEvent("storage", { key: GUEST_SESSION_KEY }));
    expect(getGuestIdentity()).toBeNull();
  });

  it("notifies subscribers on start and end", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGuestSession(listener);
    startGuestSession();
    expect(listener).toHaveBeenCalledTimes(1);
    endGuestSession();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    startGuestSession();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("guestShortId returns a short display suffix", () => {
    const guest = startGuestSession();
    const short = guestShortId(guest);
    expect(short).toHaveLength(4);
    expect(guest.id.endsWith(short)).toBe(true);
  });

  it("useGuestSession reflects guest mode transitions", () => {
    const { result } = renderHook(() => useGuestSession());
    expect(result.current.isGuest).toBe(false);
    expect(result.current.guest).toBeNull();

    act(() => {
      result.current.startGuest();
    });
    expect(result.current.isGuest).toBe(true);
    expect(result.current.guest?.id).toMatch(/^guest_/);

    act(() => {
      result.current.endGuest();
    });
    expect(result.current.isGuest).toBe(false);
    expect(result.current.guest).toBeNull();
  });
});
