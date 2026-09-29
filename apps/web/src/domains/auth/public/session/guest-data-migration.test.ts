// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearGuestData,
  GUEST_DATA_PREFIX,
  guestDataKey,
  listGuestData,
  migrateGuestDataToAccount,
  USER_DATA_PREFIX,
  type StorageLike,
} from "./guest-data-migration";

function memoryStorage(): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

const GUEST_ID = "guest_abc123";
const USER_ID = "user-1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("guest-data-migration", () => {
  it("guestDataKey namespaces guest data and validates inputs", () => {
    expect(guestDataKey(GUEST_ID, "draft-1")).toBe(`${GUEST_DATA_PREFIX}${GUEST_ID}:draft-1`);
    expect(() => guestDataKey("user-1", "draft-1")).toThrow();
    expect(() => guestDataKey(GUEST_ID, "a:b")).toThrow();
    expect(() => guestDataKey(GUEST_ID, "")).toThrow();
  });

  it("listGuestData only returns this guest's entries", () => {
    const storage = memoryStorage();
    storage.setItem(guestDataKey(GUEST_ID, "draft-1"), "{}");
    storage.setItem(guestDataKey("guest_other", "draft-9"), "{}");
    storage.setItem(`${USER_DATA_PREFIX}${USER_ID}:draft-1`, "{}");
    storage.setItem("unrelated", "{}");

    const items = listGuestData(GUEST_ID, storage);
    expect(items.map((item) => item.name)).toEqual(["draft-1"]);
  });

  it("migrateGuestDataToAccount moves guest data into the user namespace", () => {
    const storage = memoryStorage();
    storage.setItem(guestDataKey(GUEST_ID, "draft-1"), "{\"title\":\"a\"}");
    storage.setItem(guestDataKey(GUEST_ID, "prefs"), "{\"theme\":\"dark\"}");

    const result = migrateGuestDataToAccount({ guestId: GUEST_ID, userId: USER_ID, storage });
    expect(result).toEqual({ moved: 2, skipped: [] });
    expect(storage.getItem(`${USER_DATA_PREFIX}${USER_ID}:draft-1`)).toBe("{\"title\":\"a\"}");
    expect(listGuestData(GUEST_ID, storage)).toEqual([]);
  });

  it("never overwrites existing account data", () => {
    const storage = memoryStorage();
    storage.setItem(guestDataKey(GUEST_ID, "draft-1"), "guest-version");
    storage.setItem(`${USER_DATA_PREFIX}${USER_ID}:draft-1`, "account-version");

    const result = migrateGuestDataToAccount({ guestId: GUEST_ID, userId: USER_ID, storage });
    expect(result.moved).toBe(0);
    expect(result.skipped).toEqual(["draft-1"]);
    expect(storage.getItem(`${USER_DATA_PREFIX}${USER_ID}:draft-1`)).toBe("account-version");
    // The guest copy is kept so the user can decide what to do with it.
    expect(storage.getItem(guestDataKey(GUEST_ID, "draft-1"))).toBe("guest-version");
  });

  it("rejects confused identities instead of applying them", () => {
    const storage = memoryStorage();
    expect(() =>
      migrateGuestDataToAccount({ guestId: USER_ID, userId: USER_ID, storage }),
    ).toThrow();
    expect(() =>
      migrateGuestDataToAccount({ guestId: GUEST_ID, userId: GUEST_ID, storage }),
    ).toThrow();
  });

  it("clearGuestData removes only the guest's entries", () => {
    const storage = memoryStorage();
    storage.setItem(guestDataKey(GUEST_ID, "draft-1"), "{}");
    storage.setItem("unrelated", "{}");
    expect(clearGuestData(GUEST_ID, storage)).toBe(1);
    expect(storage.getItem("unrelated")).toBe("{}");
  });
});
