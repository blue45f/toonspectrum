// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuestMigrationBridge } from "./guest-migration-bridge";
import {
  SessionContext,
  type SessionContextValue,
} from "@/domains/auth/public/session/auth-session-store";
import {
  GUEST_DATA_PREFIX,
  USER_DATA_PREFIX,
  guestDataKey,
} from "@/domains/auth/public/session/guest-data-migration";
import {
  endGuestSession,
  getGuestIdentity,
  startGuestSession,
} from "@/domains/auth/public/session/guest-session";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  endGuestSession();
  vi.restoreAllMocks();
});

const signedOut: SessionContextValue = {
  data: null,
  ready: true,
  status: "unauthenticated",
  update: async () => null,
};

function signedInAs(userId: string): SessionContextValue {
  return {
    data: { user: { id: userId } },
    ready: true,
    status: "authenticated",
    update: async () => null,
  } as SessionContextValue;
}

describe("guest-migration-bridge", () => {
  it("migrates guest data to the new account and ends the guest session", () => {
    const guest = startGuestSession();
    window.localStorage.setItem(guestDataKey(guest.id, "draft-1"), '{"title":"t"}');

    render(
      <SessionContext.Provider value={signedInAs("user-42")}>
        <GuestMigrationBridge />
      </SessionContext.Provider>,
    );

    expect(
      window.localStorage.getItem(`${USER_DATA_PREFIX}user-42:draft-1`),
    ).toBe('{"title":"t"}');
    expect(
      window.localStorage.getItem(`${GUEST_DATA_PREFIX}${guest.id}:draft-1`),
    ).toBeNull();
    expect(getGuestIdentity()).toBeNull();
  });

  it("does nothing when there is no guest session", () => {
    render(
      <SessionContext.Provider value={signedInAs("user-42")}>
        <GuestMigrationBridge />
      </SessionContext.Provider>,
    );
    // No guest data, no user data, no crash.
    expect(window.localStorage.length).toBe(0);
  });

  it("keeps the guest session while still unauthenticated", () => {
    const guest = startGuestSession();
    window.localStorage.setItem(guestDataKey(guest.id, "draft-1"), "x");

    render(
      <SessionContext.Provider value={signedOut}>
        <GuestMigrationBridge />
      </SessionContext.Provider>,
    );

    expect(getGuestIdentity()?.id).toBe(guest.id);
    expect(
      window.localStorage.getItem(`${GUEST_DATA_PREFIX}${guest.id}:draft-1`),
    ).toBe("x");
  });

  it("migrates only once even if the session value re-renders", () => {
    const guest = startGuestSession();
    window.localStorage.setItem(guestDataKey(guest.id, "draft-1"), "x");

    const { rerender } = render(
      <SessionContext.Provider value={signedInAs("user-42")}>
        <GuestMigrationBridge />
      </SessionContext.Provider>,
    );
    rerender(
      <SessionContext.Provider value={signedInAs("user-42")}>
        <GuestMigrationBridge />
      </SessionContext.Provider>,
    );

    expect(
      window.localStorage.getItem(`${USER_DATA_PREFIX}user-42:draft-1`),
    ).toBe("x");
    expect(getGuestIdentity()).toBeNull();
  });
});
