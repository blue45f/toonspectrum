import { describe, expect, it } from "vitest";

import {
  createStudioShellFloatingVisibilityRepository,
} from "./studio-shell-floating-visibility-sqlite";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async set(key: string, value: string) {
      values.set(key, value);
    },
    async delete(key: string) {
      values.delete(key);
    },
  };
}

describe("studio shell floating visibility SQLite preferences", () => {
  it("round-trips only the normalized visibility allowlist", async () => {
    const store = memoryStore();
    const repository = createStudioShellFloatingVisibilityRepository(store);

    await expect(repository.save({
      version: 1,
      hidden: ["collaboration", "document-tools", "collaboration"] as never,
    })).resolves.toEqual({
      state: {
        version: 1,
        hidden: ["document-tools", "collaboration"],
      },
      status: "persisted",
      failure: null,
    });
    await expect(repository.load()).resolves.toEqual({
      state: {
        version: 1,
        hidden: ["document-tools", "collaboration"],
      },
      persisted: true,
      failure: null,
    });
    expect(JSON.parse(store.values.get("snapshot")!)).toEqual({
      version: 1,
      hidden: ["document-tools", "collaboration"],
    });
  });

  it("serializes accepted writes so stale state cannot overtake newer state", async () => {
    const store = memoryStore();
    const writes: string[] = [];
    const repository = createStudioShellFloatingVisibilityRepository({
      ...store,
      async set(key, value) {
        await Promise.resolve();
        writes.push(value);
        store.values.set(key, value);
      },
    });

    const first = repository.save({ version: 1, hidden: ["collaboration"] });
    const second = repository.save({ version: 1, hidden: ["offline-readiness"] });
    await Promise.all([first, second]);

    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes.at(-1)!)).toEqual({
      version: 1,
      hidden: ["offline-readiness"],
    });
    await expect(repository.load()).resolves.toMatchObject({
      state: { hidden: ["offline-readiness"] },
      persisted: true,
    });
  });

  it("waits for a queued write before a remount-style load", async () => {
    const store = memoryStore();
    const repository = createStudioShellFloatingVisibilityRepository({
      ...store,
      async set(key, value) {
        await Promise.resolve();
        store.values.set(key, value);
      },
    });

    const pendingSave = repository.save({
      version: 1,
      hidden: ["workspace-switcher"],
    });
    const pendingLoad = repository.load();

    await expect(pendingLoad).resolves.toMatchObject({
      state: { hidden: ["workspace-switcher"] },
      persisted: true,
      failure: null,
    });
    await expect(pendingSave).resolves.toMatchObject({
      status: "persisted",
      failure: null,
    });
  });

  it("fails closed for malformed reads, failed writes, and ignored writes", async () => {
    const malformed = createStudioShellFloatingVisibilityRepository(memoryStore({
      snapshot: "{bad-json",
    }));
    await expect(malformed.load()).resolves.toMatchObject({
      state: { hidden: [] },
      persisted: false,
      failure: "read-failed",
    });

    const failed = createStudioShellFloatingVisibilityRepository({
      async get() { return null; },
      async set() { throw new Error("denied"); },
      async delete() {},
    });
    await expect(failed.save({ version: 1, hidden: ["collaboration"] }))
      .resolves.toMatchObject({
        status: "memory-only",
        failure: "write-failed",
      });

    const ignored = createStudioShellFloatingVisibilityRepository({
      async get() { return null; },
      async set() {},
      async delete() {},
    });
    await expect(ignored.save({ version: 1, hidden: ["collaboration"] }))
      .resolves.toMatchObject({
        status: "memory-only",
        failure: "verification-failed",
      });
  });
});
