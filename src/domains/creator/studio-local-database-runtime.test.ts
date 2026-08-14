import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./studio-brush-library";
import { openProductBrushLibraryRepository } from
  "./studio-brush-library-sqlite-repository";
import {
  SqliteUnavailableError,
  type StudioLocalDatabase,
} from "./studio-local-database";
import {
  acquireStudioLocalDatabase,
  closeStudioLocalDatabaseRuntime,
  probeStudioLocalDatabaseRuntime,
} from "./studio-local-database-runtime";

const productWorker = vi.hoisted(() => ({
  acquire: vi.fn<() => Promise<StudioLocalDatabase>>(),
  close: vi.fn<() => Promise<void>>(),
}));

vi.mock("./studio-local-database-worker-client", () => ({
  acquireStudioLocalDatabaseWorker: productWorker.acquire,
  closeStudioLocalDatabaseWorker: productWorker.close,
}));

afterEach(async () => {
  await closeStudioLocalDatabaseRuntime();
  productWorker.acquire.mockReset();
  productWorker.close.mockReset();
});

describe("studio local database runtime", () => {
  it("routes the Window product authority through one lazy DedicatedWorker proxy", async () => {
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire.mockResolvedValue(database);
    productWorker.close.mockResolvedValue(undefined);

    const [first, second] = await Promise.all([
      acquireStudioLocalDatabase(),
      acquireStudioLocalDatabase(),
    ]);

    expect(first).toBe(database);
    expect(second).toBe(database);
    expect(productWorker.acquire).toHaveBeenCalledOnce();
    await closeStudioLocalDatabaseRuntime();
    expect(productWorker.close).toHaveBeenCalledOnce();
    expect(database.close).not.toHaveBeenCalled();
  });

  it("serializes a same-tick product acquire, close, and reopen into distinct generations", async () => {
    const firstDatabase = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    const secondDatabase = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire
      .mockResolvedValueOnce(firstDatabase)
      .mockResolvedValueOnce(secondDatabase);
    productWorker.close.mockResolvedValue(undefined);

    const firstOpening = acquireStudioLocalDatabase();
    const firstClosing = closeStudioLocalDatabaseRuntime();
    const secondOpening = acquireStudioLocalDatabase();

    await expect(firstOpening).resolves.toBe(firstDatabase);
    await expect(firstClosing).resolves.toBeUndefined();
    await expect(secondOpening).resolves.toBe(secondDatabase);

    expect(productWorker.acquire).toHaveBeenCalledTimes(2);
    expect(productWorker.close).toHaveBeenCalledOnce();
    expect(firstDatabase.close).not.toHaveBeenCalled();
    expect(secondDatabase.close).not.toHaveBeenCalled();
  });

  it("reports SQLite and OPFS ready only after the product DedicatedWorker opens", async () => {
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire.mockResolvedValue(database);
    productWorker.close.mockResolvedValue(undefined);

    await expect(probeStudioLocalDatabaseRuntime()).resolves.toEqual({
      wasm: true,
      opfs: true,
    });
    await expect(acquireStudioLocalDatabase()).resolves.toBe(database);

    expect(productWorker.acquire).toHaveBeenCalledOnce();
  });

  it("reports the retained product-runtime failure without retrying behind diagnostics", async () => {
    productWorker.acquire.mockRejectedValue(new Error("DedicatedWorker OPFS unavailable"));
    productWorker.close.mockResolvedValue(undefined);

    await expect(probeStudioLocalDatabaseRuntime()).resolves.toEqual({
      wasm: false,
      opfs: false,
      reason: "DedicatedWorker OPFS unavailable",
    });
    await expect(probeStudioLocalDatabaseRuntime()).resolves.toEqual({
      wasm: false,
      opfs: false,
      reason: "DedicatedWorker OPFS unavailable",
    });

    expect(productWorker.acquire).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent lazy consumers onto one database open", async () => {
    const close = vi.fn(async () => undefined);
    const database = { close } as unknown as StudioLocalDatabase;
    const open = vi.fn(async () => database);

    const [history, tournament, brushLibrary] = await Promise.all([
      acquireStudioLocalDatabase(open),
      acquireStudioLocalDatabase(open),
      acquireStudioLocalDatabase(open),
    ]);

    expect(open).toHaveBeenCalledOnce();
    expect(history).toBe(database);
    expect(tournament).toBe(database);
    expect(brushLibrary).toBe(database);
    await closeStudioLocalDatabaseRuntime();
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains a failed open for the session but permits retry after explicit reset", async () => {
    const failure = new Error("opfs unavailable");
    const firstOpen = vi.fn(async (): Promise<StudioLocalDatabase> => {
      throw failure;
    });
    await expect(acquireStudioLocalDatabase(firstOpen)).rejects.toBe(failure);
    await expect(acquireStudioLocalDatabase(firstOpen)).rejects.toBe(failure);
    expect(firstOpen).toHaveBeenCalledOnce();

    await closeStudioLocalDatabaseRuntime();
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    await expect(acquireStudioLocalDatabase(async () => database)).resolves.toBe(database);
  });

  it("invalidates the brush catalog generation when the shared database session closes", async () => {
    productWorker.acquire.mockRejectedValue(
      new SqliteUnavailableError("Studio OPFS is already owned by another page"),
    );
    productWorker.close.mockResolvedValue(undefined);

    const first = await openProductBrushLibraryRepository();
    await first.repository.put({
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      id: "session-brush",
      name: "첫 세션",
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      lastUsedAt: null,
    });

    await closeStudioLocalDatabaseRuntime();
    const reopened = await openProductBrushLibraryRepository();

    expect(reopened).not.toBe(first);
    expect(reopened.authority).toBe("memory-session");
    await expect(reopened.repository.getById("session-brush")).resolves.toBeNull();
    expect(productWorker.acquire).toHaveBeenCalledTimes(2);
  });
});
