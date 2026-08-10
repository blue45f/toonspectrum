import { openStudioLocalDatabaseWorker } from "./studio-local-database-worker-client";

import type { StudioLocalDatabase } from "./studio-local-database";

/**
 * One app-lifetime SQLite handle shared by history, renderer tournament, and subsequent local
 * metadata repositories. Installing the same OPFS SAH-pool VFS independently from lazy feature
 * chunks can race and defeats SQLite's role as the single local authority.
 */
let sharedDatabase: Promise<StudioLocalDatabase> | null = null;

export function acquireStudioLocalDatabase(
  openDatabase: () => Promise<StudioLocalDatabase> = openStudioLocalDatabaseWorker,
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
