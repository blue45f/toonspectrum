import { describe, expect, it } from "vitest";

import {
  eventSeenStorageKey,
  hasSeenMarketingEvent,
  hasSeenMarketingEventForIdentity,
  markMarketingEventSeen,
} from "./event-seen";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("marketing event seen state", () => {
  it("stores guest and account state without exposing the raw identity", () => {
    const guestKey = eventSeenStorageKey("beta-open-2026");
    const userKey = eventSeenStorageKey("beta-open-2026", "user@example.test");

    expect(guestKey).not.toBe(userKey);
    expect(userKey).not.toContain("user@example.test");
  });

  it("marks and reads dismissal state", () => {
    const storage = createMemoryStorage();
    expect(hasSeenMarketingEvent("beta-open-2026", null, storage)).toBe(false);
    markMarketingEventSeen("beta-open-2026", null, storage);
    expect(hasSeenMarketingEvent("beta-open-2026", null, storage)).toBe(true);
  });

  it("inherits a guest dismissal when the browser later authenticates", () => {
    const storage = createMemoryStorage();
    markMarketingEventSeen("beta-open-2026", null, storage);

    expect(
      hasSeenMarketingEventForIdentity("beta-open-2026", "account-123", storage),
    ).toBe(true);
    expect(hasSeenMarketingEvent("beta-open-2026", "account-123", storage)).toBe(true);
  });
});
