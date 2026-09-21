import {
  acquireStudioLocalDatabaseWorkerLock,
  StudioLocalDatabaseWorkerLockError,
  type StudioLocalDatabaseWorkerLockLease,
  type StudioLocalDatabaseWorkerLockManagerLike,
} from "./studio-local-database-worker-lock";

/** Previous page Workers can release their lock just after the replacement page starts. */
export const STUDIO_DATABASE_HANDOFF_DELAYS_MS = [50, 100, 200, 400] as const;

/** Bounded 750ms handoff only. Never steal, clear data, open a sibling pool, or loop on other errors. */
export async function acquireStudioDatabaseWorkerHandoff(
  manager: StudioLocalDatabaseWorkerLockManagerLike | null,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<StudioLocalDatabaseWorkerLockLease> {
  for (let attempt = 0; ; attempt++) {
    try { return await acquireStudioLocalDatabaseWorkerLock(manager); }
    catch (error) {
      if (!(error instanceof StudioLocalDatabaseWorkerLockError) || error.code !== "lock-unavailable"
        || attempt >= STUDIO_DATABASE_HANDOFF_DELAYS_MS.length) throw error;
      await delay(STUDIO_DATABASE_HANDOFF_DELAYS_MS[attempt]!);
    }
  }
}
