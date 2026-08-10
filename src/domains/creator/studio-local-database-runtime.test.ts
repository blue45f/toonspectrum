import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquireStudioLocalDatabase,
  closeStudioLocalDatabaseRuntime,
} from "./studio-local-database-runtime";

import type { StudioLocalDatabase } from "./studio-local-database";

afterEach(async () => {
  await closeStudioLocalDatabaseRuntime();
});

describe("studio local database runtime", () => {
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
});
