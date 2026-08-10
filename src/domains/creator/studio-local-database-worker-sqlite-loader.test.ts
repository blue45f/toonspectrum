import { describe, expect, it, vi } from "vitest";

import { loadStudioLocalDatabaseWorkerSqlite } from "./studio-local-database-worker-sqlite-loader";

import type { StudioSqliteApiHandle } from "./studio-local-database";

describe("Studio local database Worker sqlite-wasm loader", () => {
  it("disables only unused proxy VFS installers while preserving SAH-pool authority", async () => {
    const globalObject: { sqlite3ApiConfig?: unknown } = {};
    const api = {} as StudioSqliteApiHandle;
    const initializer = vi.fn(async () => {
      expect(globalObject.sqlite3ApiConfig).toEqual({
        disable: {
          vfs: {
            opfs: true,
            "opfs-vfs": true,
          },
        },
        wasmfsOpfsDir: false,
      });
      expect(globalObject.sqlite3ApiConfig).not.toMatchObject({
        disable: { vfs: { "opfs-sahpool": true } },
      });
      return api;
    });

    await expect(loadStudioLocalDatabaseWorkerSqlite({
      globalObject,
      loadModule: async () => ({ default: initializer }),
    })).resolves.toBe(api);

    expect(initializer).toHaveBeenCalledOnce();
    expect(globalObject).not.toHaveProperty("sqlite3ApiConfig");
  });

  it("clears bootstrap ownership after initialization failure", async () => {
    const globalObject: { sqlite3ApiConfig?: unknown } = {};
    await expect(loadStudioLocalDatabaseWorkerSqlite({
      globalObject,
      loadModule: async () => ({
        default: async () => {
          throw new Error("wasm initialization failed");
        },
      }),
    })).rejects.toThrow("wasm initialization failed");
    expect(globalObject).not.toHaveProperty("sqlite3ApiConfig");
  });

  it("fails closed instead of overwriting another initializer's bootstrap config", async () => {
    const existing = { owner: "other-sqlite-initializer" };
    const globalObject: { sqlite3ApiConfig?: unknown } = { sqlite3ApiConfig: existing };
    const loadModule = vi.fn();

    await expect(loadStudioLocalDatabaseWorkerSqlite({ globalObject, loadModule }))
      .rejects.toThrow("already owned");
    expect(globalObject.sqlite3ApiConfig).toBe(existing);
    expect(loadModule).not.toHaveBeenCalled();
  });
});
