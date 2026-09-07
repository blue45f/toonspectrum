import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHUNK_RELOAD_FLAG,
  hasAttemptedChunkReload,
  loadChunkWithReloadRecovery,
  markChunkReloadAttempted,
} from "./chunk-load-recovery";
import { consumeStudioProgrammaticReloadAllowance } from "./programmatic-reload";

const ownerKey = `${CHUNK_RELOAD_FLAG}:owner`;

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

afterEach(() => {
  consumeStudioProgrammaticReloadAllowance();
  vi.unstubAllGlobals();
});

describe("loadChunkWithReloadRecovery", () => {
  it("returns a loaded module and clears a stale guard", async () => {
    const storage = createStorage({ "chunk-reload:market-network": "1" });
    vi.stubGlobal("sessionStorage", storage);

    await expect(
      loadChunkWithReloadRecovery(
        async () => ({ ready: true }),
        "market-network"
      )
    ).resolves.toEqual({ ready: true });
    expect(storage.removeItem).toHaveBeenCalledWith(
      "chunk-reload:market-network"
    );
  });

  it("arms one guard and reloads when the first chunk load fails", async () => {
    const storage = createStorage();
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("location", { reload });

    void loadChunkWithReloadRecovery(
      async () => {
        throw new TypeError("Failed to fetch dynamically imported module");
      },
      "market-network"
    );
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(storage.setItem).toHaveBeenCalledWith(
      "chunk-reload:market-network",
      "1"
    );
    expect(storage.setItem).toHaveBeenCalledWith(CHUNK_RELOAD_FLAG, "1");
    expect(consumeStudioProgrammaticReloadAllowance()).toBe(false);
  });

  it("preserves the import error instead of reloading twice", async () => {
    const storage = createStorage({ "chunk-reload:market-network": "1" });
    const reload = vi.fn();
    const error = new TypeError("stale deployment chunk");
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("location", { reload });

    await expect(
      loadChunkWithReloadRecovery(
        async () => {
          throw error;
        },
        "market-network"
      )
    ).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });

  it("coordinates with the route ErrorBoundary global reload guard", async () => {
    const storage = createStorage({ [CHUNK_RELOAD_FLAG]: "1" });
    const reload = vi.fn();
    const error = new TypeError("stale deployment chunk");
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("location", { reload });

    await expect(
      loadChunkWithReloadRecovery(
        async () => {
          throw error;
        },
        "another-chunk"
      )
    ).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("fails closed without reload when the guard store is unavailable", async () => {
    const reload = vi.fn();
    const error = new TypeError("chunk unavailable");
    vi.stubGlobal("sessionStorage", {
      getItem() {
        throw new Error("storage blocked");
      },
    });
    vi.stubGlobal("location", { reload });

    await expect(
      loadChunkWithReloadRecovery(
        async () => {
          throw error;
        },
        "market-network"
      )
    ).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });

  it("recovers a later independent failure after the original owner loads across a navigation", async () => {
    const storage = createStorage();
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("location", { reload });
    void loadChunkWithReloadRecovery(async () => { throw new TypeError("animation unavailable"); }, "animation");
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(storage.getItem(ownerKey)).toBe("chunk-reload:animation");

    // Navigation recreates JavaScript modules but keeps this tab's sessionStorage.
    vi.resetModules();
    const afterNavigation = await import("./chunk-load-recovery");
    await expect(afterNavigation.loadChunkWithReloadRecovery(async () => "animation ready", "animation"))
      .resolves.toBe("animation ready");
    expect(afterNavigation.hasAttemptedChunkReload()).toBe(false);
    expect(storage.getItem(ownerKey)).toBeNull();
    expect(storage.getItem("chunk-reload:animation")).toBeNull();

    void afterNavigation.loadChunkWithReloadRecovery(async () => { throw new TypeError("brushes unavailable"); }, "brushes");
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(storage.getItem(ownerKey)).toBe("chunk-reload:brushes");
    expect(afterNavigation.hasAttemptedChunkReload()).toBe(true);
  });

  it("does not rearm reloads for the same failure or a cascade of other failed chunks", async () => {
    const storage = createStorage();
    const reload = vi.fn();
    const error = new TypeError("animation dependency unavailable");
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("location", { reload });
    void loadChunkWithReloadRecovery(async () => { throw error; }, "animation");
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

    for (const chunk of ["animation", "brushes", "animation", "settings"]) {
      await loadChunkWithReloadRecovery(async () => ({ ready: true }), "unrelated-panel");
      await expect(loadChunkWithReloadRecovery(async () => { throw error; }, chunk)).rejects.toBe(error);
      expect(hasAttemptedChunkReload()).toBe(true);
    }
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.getItem(ownerKey)).toBe("chunk-reload:animation");
    expect(storage.getItem("chunk-reload:animation")).toBe("1");
  });

  it("keeps legacy global-only guards armed when lazy imports succeed", async () => {
    const storage = createStorage({ [CHUNK_RELOAD_FLAG]: "1", "chunk-reload:animation": "1" });
    vi.stubGlobal("sessionStorage", storage);
    await loadChunkWithReloadRecovery(async () => "ready", "animation");
    expect(storage.getItem("chunk-reload:animation")).toBeNull();
    expect(hasAttemptedChunkReload()).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_FLAG)).toBe("1");
  });

  it("keeps an explicit ErrorBoundary guard sticky even after an earlier owner succeeds", async () => {
    const storage = createStorage({
      [CHUNK_RELOAD_FLAG]: "1", [ownerKey]: "chunk-reload:animation", "chunk-reload:animation": "1",
    });
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("location", { reload });
    expect(markChunkReloadAttempted()).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_FLAG)).toBe("1");
    await loadChunkWithReloadRecovery(async () => "ready", "animation");
    expect(hasAttemptedChunkReload()).toBe(true);
    const error = new TypeError("another failure");
    await expect(loadChunkWithReloadRecovery(async () => { throw error; }, "brushes")).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(["chunk-reload:animation", ownerKey, CHUNK_RELOAD_FLAG])(
    "never reloads when guard storage rejects writing %s",
    async (blockedKey) => {
      const storage = createStorage();
      const setItem = storage.setItem.getMockImplementation()!;
      storage.setItem.mockImplementation((key, value) => {
        if (key === blockedKey) throw new Error("storage write blocked");
        setItem(key, value);
      });
      const reload = vi.fn();
      const error = new TypeError("failed import");
      vi.stubGlobal("sessionStorage", storage);
      vi.stubGlobal("location", { reload });
      await expect(loadChunkWithReloadRecovery(async () => { throw error; }, "animation")).rejects.toBe(error);
      expect(reload).not.toHaveBeenCalled();
      expect(storage.getItem(ownerKey)).toBeNull();
      expect(storage.getItem("chunk-reload:animation")).toBeNull();
    },
  );

  it.each([ownerKey, CHUNK_RELOAD_FLAG])(
    "keeps the global guard fail-closed when recovery cannot remove %s",
    async (blockedKey) => {
      const storage = createStorage({
        [CHUNK_RELOAD_FLAG]: "1", [ownerKey]: "chunk-reload:animation", "chunk-reload:animation": "1",
      });
      const removeItem = storage.removeItem.getMockImplementation()!;
      storage.removeItem.mockImplementation((key) => {
        if (key === blockedKey) throw new Error("storage removal blocked");
        removeItem(key);
      });
      const reload = vi.fn();
      vi.stubGlobal("sessionStorage", storage);
      vi.stubGlobal("location", { reload });
      await expect(loadChunkWithReloadRecovery(async () => "ready", "animation")).resolves.toBe("ready");
      expect(hasAttemptedChunkReload()).toBe(true);
      const error = new TypeError("another failure");
      await expect(loadChunkWithReloadRecovery(async () => { throw error; }, "brushes")).rejects.toBe(error);
      expect(reload).not.toHaveBeenCalled();
    },
  );

  it("does not let an earlier successful import clear a later recovery owner's guard", async () => {
    const storage = createStorage({ [CHUNK_RELOAD_FLAG]: "1", [ownerKey]: "chunk-reload:brushes" });
    vi.stubGlobal("sessionStorage", storage);
    await loadChunkWithReloadRecovery(async () => "animation ready", "animation");
    expect(storage.getItem(ownerKey)).toBe("chunk-reload:brushes");
    expect(hasAttemptedChunkReload()).toBe(true);
  });

  it("preserves a successful module when owner storage becomes unreadable", async () => {
    const storage = createStorage({ [CHUNK_RELOAD_FLAG]: "1" });
    const getItem = storage.getItem.getMockImplementation()!;
    storage.getItem.mockImplementation((key) => {
      if (key === ownerKey) throw new Error("storage read blocked");
      return getItem(key);
    });
    vi.stubGlobal("sessionStorage", storage);
    await expect(loadChunkWithReloadRecovery(async () => "ready", "animation")).resolves.toBe("ready");
    expect(hasAttemptedChunkReload()).toBe(true);
  });

  it("invalidates an earlier owner if an explicit marker cannot be stored", async () => {
    const storage = createStorage({ [CHUNK_RELOAD_FLAG]: "1", [ownerKey]: "chunk-reload:animation" });
    const setItem = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementation((key, value) => {
      if (key === ownerKey) throw new Error("owner write blocked");
      setItem(key, value);
    });
    vi.stubGlobal("sessionStorage", storage);
    expect(markChunkReloadAttempted()).toBe(true);
    expect(storage.getItem(ownerKey)).toBeNull();
    await loadChunkWithReloadRecovery(async () => "ready", "animation");
    expect(hasAttemptedChunkReload()).toBe(true);
  });

  it("preserves the original failure in a non-browser environment without reload", async () => {
    vi.stubGlobal("sessionStorage", createStorage());
    vi.stubGlobal("location", undefined);
    const error = new TypeError("failed import");
    await expect(loadChunkWithReloadRecovery(async () => { throw error; }, "animation")).rejects.toBe(error);
    expect(hasAttemptedChunkReload()).toBe(true);
  });

  it("reports a failed explicit guard when storage is readable but full", () => {
    const storage = createStorage();
    storage.setItem.mockImplementation(() => { throw new DOMException("Storage is full", "QuotaExceededError"); });
    vi.stubGlobal("sessionStorage", storage);

    expect(hasAttemptedChunkReload()).toBe(false);
    expect(markChunkReloadAttempted()).toBe(false);
    expect(hasAttemptedChunkReload()).toBe(false);
    expect(storage.getItem(ownerKey)).toBeNull();
  });

  it("reports a failed explicit guard when only the global marker cannot be written", () => {
    const storage = createStorage();
    const setItem = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementation((key, value) => {
      if (key === CHUNK_RELOAD_FLAG) throw new DOMException("Storage is full", "QuotaExceededError");
      setItem(key, value);
    });
    vi.stubGlobal("sessionStorage", storage);

    expect(markChunkReloadAttempted()).toBe(false);
    expect(hasAttemptedChunkReload()).toBe(false);
  });

  it("refuses an explicit reload if an earlier owner cannot be invalidated", async () => {
    const storage = createStorage({ [ownerKey]: "chunk-reload:animation" });
    storage.setItem.mockImplementation(() => { throw new Error("write blocked"); });
    storage.removeItem.mockImplementation(() => { throw new Error("removal blocked"); });
    vi.stubGlobal("sessionStorage", storage);

    expect(markChunkReloadAttempted()).toBe(false);
    await loadChunkWithReloadRecovery(async () => "ready", "animation");
    expect(hasAttemptedChunkReload()).toBe(false);
  });
});
