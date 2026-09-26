import { isDatabaseAvailabilityError } from "../platform/http/database-availability";
import { dbClient } from "../platform/database";

export interface SchemaReadinessOptions {
  readonly failureBackoffMs?: number;
  readonly now?: () => number;
  readonly execute?: (query: string) => Promise<unknown>;
}

/** Cache successful checks and briefly negative-cache database outages to prevent request storms. */
export function createSchemaReadinessCheck(
  queries: readonly string[],
  options: SchemaReadinessOptions = {},
) {
  let ready: Promise<void> | null = null;
  let unavailableUntil = 0;
  let availabilityError: unknown = null;
  const now = options.now ?? Date.now;
  const failureBackoffMs = Math.max(0, options.failureBackoffMs ?? 30_000);
  const execute = options.execute ?? ((query: string) => dbClient.execute(query));

  async function assertReady(): Promise<void> {
    for (const query of queries) await execute(query);
  }

  return async function ensureReady(): Promise<void> {
    if (availabilityError !== null && now() < unavailableUntil) {
      throw availabilityError;
    }
    const pending = ready ??= assertReady();
    try {
      await pending;
      availabilityError = null;
      unavailableUntil = 0;
    } catch (error) {
      if (ready === pending) ready = null;
      if (isDatabaseAvailabilityError(error)) {
        availabilityError = error;
        unavailableUntil = now() + failureBackoffMs;
      } else {
        availabilityError = null;
        unavailableUntil = 0;
      }
      throw error;
    }
  };
}
