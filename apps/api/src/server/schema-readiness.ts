import { dbClient } from "../db";

/** Cache successful read-only schema checks; share and retry failed initialization. */
export function createSchemaReadinessCheck(queries: readonly string[]) {
  let ready: Promise<void> | null = null;

  async function assertReady(): Promise<void> {
    for (const query of queries) await dbClient.execute(query);
  }

  return async function ensureReady(): Promise<void> {
    const pending = ready ??= assertReady();
    try {
      await pending;
    } catch (error) {
      if (ready === pending) ready = null;
      throw error;
    }
  };
}
