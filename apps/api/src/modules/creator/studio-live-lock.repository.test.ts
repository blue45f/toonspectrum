import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { creatorWorkLiveLocks } from "../../../../../lib/db/schema";

import {
  DrizzleStudioLiveLockRepository,
  STUDIO_LIVE_LOCK_ADVISORY_NAMESPACE,
  STUDIO_LIVE_LOCK_LIMIT_PER_WORK,
  STUDIO_LIVE_LOCK_REPOSITORY,
  studioLiveLockRepositoryProvider,
  studioLiveLockWorkAdvisoryQuery,
  withStudioLiveLockWorkMutation,
} from "./studio-live-lock.repository";

function names(values: readonly { name?: string; config?: { name?: string } }[]): string[] {
  return values
    .flatMap((value) => {
      const name = value.name ?? value.config?.name;
      return name ? [name] : [];
    })
    .sort();
}

describe("studio live distributed lock persistence contract", () => {
  it("defines one bounded lease row per work/resource with cascade cleanup", () => {
    const table = getTableConfig(creatorWorkLiveLocks);

    expect(table.name).toBe("creator_work_live_lock");
    expect(table.primaryKeys.map((key) => key.getName())).toEqual([
      "creator_work_live_lock_pkey",
    ]);
    expect(table.foreignKeys.map((key) => key.getName())).toEqual([
      "creator_work_live_lock_work_fkey",
    ]);
    expect(names(table.indexes)).toEqual(["idx_creator_work_live_lock_expiry"]);
    expect(names(table.checks)).toEqual([
      "creator_work_live_lock_acquisition_id_check",
      "creator_work_live_lock_connection_id_check",
      "creator_work_live_lock_expiry_order_check",
      "creator_work_live_lock_lease_id_check",
      "creator_work_live_lock_owner_name_check",
      "creator_work_live_lock_resource_id_check",
    ]);
    expect(table.columns.find((column) => column.name === "acquisitionId")?.notNull).toBe(true);
    expect(STUDIO_LIVE_LOCK_LIMIT_PER_WORK).toBe(200);
  });

  it("uses an isolated, stable per-work PostgreSQL advisory-lock namespace", () => {
    const rendered = new PgDialect().sqlToQuery(
      studioLiveLockWorkAdvisoryQuery("work-1")
    );

    expect(rendered.sql).toBe(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))"
    );
    expect(rendered.params).toEqual([
      `${STUDIO_LIVE_LOCK_ADVISORY_NAMESPACE}work-1`,
    ]);
  });

  it("exposes a swappable repository provider", () => {
    expect(studioLiveLockRepositoryProvider.provide).toBe(
      STUDIO_LIVE_LOCK_REPOSITORY
    );
    expect(studioLiveLockRepositoryProvider.useFactory()).toBeInstanceOf(
      DrizzleStudioLiveLockRepository
    );
  });

  it("does not enter two same-work mutation sections concurrently", async () => {
    let releaseFirst: (() => void) | null = null;
    let secondEntered = false;
    const firstLock = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let held = false;
    const waiters: Array<() => void> = [];
    const transaction = {
      async execute() {
        if (!held) {
          held = true;
          return;
        }
        await new Promise<void>((resolve) => waiters.push(resolve));
      },
    };
    const release = () => {
      const next = waiters.shift();
      if (next) next();
      else held = false;
    };

    const first = (async () => {
      try {
        await withStudioLiveLockWorkMutation(transaction as never, "work-1", async () => {
          await firstLock;
        });
      } finally {
        release();
      }
    })();
    await Promise.resolve();
    const second = (async () => {
      try {
        await withStudioLiveLockWorkMutation(transaction as never, "work-1", async () => {
          secondEntered = true;
        });
      } finally {
        release();
      }
    })();
    await Promise.resolve();

    expect(secondEntered).toBe(false);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(secondEntered).toBe(true);
  });
});
