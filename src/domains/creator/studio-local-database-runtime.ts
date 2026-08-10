import { openStudioLocalDatabase } from "./studio-local-database";

import type {
  StudioLocalDatabase,
  StudioSqliteApiHandle,
} from "./studio-local-database";

/**
 * One app-lifetime SQLite handle shared by history, renderer tournament, and subsequent local
 * metadata repositories. Installing the same OPFS SAH-pool VFS independently from lazy feature
 * chunks can race and defeats SQLite's role as the single local authority.
 */
let sharedDatabase: Promise<StudioLocalDatabase> | null = null;
let sharedSqliteApi: Promise<StudioSqliteApiHandle> | null = null;

/**
 * OPFS SAH-pool VFS owns SyncAccessHandles beyond one DB handle's close(). Reinitializing
 * sqlite-wasm before a same-session reopen creates a second VFS over those files and Chromium
 * rejects it with NoModificationAllowedError. Keep the initialized API/VFS registry for the app
 * lifetime; only the logical DB handle is cycled by closeStudioLocalDatabaseRuntime().
 */
function acquireStudioSqliteApi(): Promise<StudioSqliteApiHandle> {
  if (sharedSqliteApi) return sharedSqliteApi;
  const opening = import("@sqlite.org/sqlite-wasm").then(async (module) =>
    await module.default() as unknown as StudioSqliteApiHandle);
  sharedSqliteApi = opening;
  void opening.catch(() => {
    if (sharedSqliteApi === opening) sharedSqliteApi = null;
  });
  return opening;
}

export function acquireStudioLocalDatabase(
  openDatabase: () => Promise<StudioLocalDatabase> = () =>
    openStudioLocalDatabase({
      vfs: "opfs",
      loadSqlite: acquireStudioSqliteApi,
    }),
): Promise<StudioLocalDatabase> {
  sharedDatabase ??= Promise.resolve().then(openDatabase);
  return sharedDatabase;
}

/** Test/session shutdown seam. Product code normally keeps the handle for the app lifetime. */
export async function closeStudioLocalDatabaseRuntime(): Promise<void> {
  const database = sharedDatabase;
  sharedDatabase = null;
  if (!database) return;
  try {
    await (await database).close();
  } catch {
    // A failed open has no handle to close. The reset still permits an explicit retry.
  }
}
