import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  creatorWorkCrdtSnapshots,
  creatorWorkCrdtUpdateReceipts,
  creatorWorkCrdtUpdates,
} from "../../../../../lib/db/schema";

import {
  DrizzleStudioCrdtRepository,
  STUDIO_CRDT_ADVISORY_LOCK_NAMESPACE,
  STUDIO_CRDT_REPOSITORY,
  STUDIO_CRDT_SNAPSHOT_MAX_BYTES,
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  studioCrdtPayloadHash,
  studioCrdtRepositoryProvider,
  studioCrdtWorkAdvisoryLockQuery,
  withStudioCrdtWorkMutationLock,
} from "./studio-crdt.repository";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value?: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value as T);
    },
  };
}

class TestTransactionAdvisoryLock {
  private held = false;
  private readonly waiters: Array<() => void> = [];
  readonly blocked = deferred<void>();

  async acquire(): Promise<() => void> {
    if (this.held) {
      this.blocked.resolve();
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.held = true;
    }
    return () => {
      const next = this.waiters.shift();
      if (next) {
        next();
      } else {
        this.held = false;
      }
    };
  }
}

function names(
  values: readonly { name?: string; config?: { name?: string } }[]
): string[] {
  return values
    .flatMap((value) => {
      const name = value.name ?? value.config?.name;
      return name ? [name] : [];
    })
    .sort();
}

describe("studio CRDT persistence contract", () => {
  it("defines bounded snapshot and append-log tables with cascade ownership", () => {
    const snapshot = getTableConfig(creatorWorkCrdtSnapshots);
    const updates = getTableConfig(creatorWorkCrdtUpdates);

    expect(snapshot.name).toBe("creator_work_crdt_snapshot");
    expect(snapshot.columns.find((column) => column.name === "workId")?.primary).toBe(true);
    expect(names(snapshot.checks)).toEqual([
      "creator_work_crdt_snapshot_sequence_check",
      "creator_work_crdt_snapshot_size_check",
    ]);
    expect(snapshot.foreignKeys.map((key) => key.getName())).toEqual([
      "creator_work_crdt_snapshot_work_fkey",
    ]);

    expect(updates.name).toBe("creator_work_crdt_update");
    expect(updates.primaryKeys.map((key) => key.getName())).toEqual([
      "creator_work_crdt_update_pkey",
    ]);
    expect(names(updates.uniqueConstraints)).toContain(
      "creator_work_crdt_update_work_update_id_unique"
    );
    expect(updates.foreignKeys.map((key) => key.getName()).sort()).toEqual([
      "creator_work_crdt_update_actor_fkey",
      "creator_work_crdt_update_work_fkey",
    ]);
    expect(names(updates.indexes)).toEqual(["idx_creator_work_crdt_update_actor_created"]);
    expect(names(updates.checks)).toEqual([
      "creator_work_crdt_update_id_check",
      "creator_work_crdt_update_payload_size_check",
    ]);
    expect(STUDIO_CRDT_UPDATE_MAX_BYTES).toBe(48 * 1_024);
    expect(STUDIO_CRDT_SNAPSHOT_MAX_BYTES).toBe(16 * 1_024 * 1_024);
  });

  it("retains a compact digest receipt so dedupe survives update-log compaction", () => {
    const receipts = getTableConfig(creatorWorkCrdtUpdateReceipts);
    expect(receipts.name).toBe("creator_work_crdt_update_receipt");
    expect(receipts.primaryKeys.map((key) => key.getName())).toEqual([
      "creator_work_crdt_update_receipt_pkey",
    ]);
    expect(names(receipts.uniqueConstraints)).toContain(
      "creator_work_crdt_update_receipt_work_sequence_unique"
    );
    expect(receipts.foreignKeys.map((key) => key.getName()).sort()).toEqual([
      "creator_work_crdt_update_receipt_actor_fkey",
      "creator_work_crdt_update_receipt_work_fkey",
    ]);
    expect(names(receipts.checks)).toEqual([
      "creator_work_crdt_update_receipt_hash_check",
      "creator_work_crdt_update_receipt_id_check",
      "creator_work_crdt_update_receipt_sequence_check",
    ]);
    expect(receipts.columns.find((column) => column.name === "payloadHash")?.notNull).toBe(
      true
    );
  });

  it("uses a stable SHA-256 payload digest and exposes the repository by DI token", () => {
    expect(
      Buffer.from(studioCrdtPayloadHash(Uint8Array.of(1, 2, 3))).toString("hex")
    ).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
    expect(studioCrdtPayloadHash(Uint8Array.of(1, 2, 3))).toHaveLength(32);
    expect(studioCrdtRepositoryProvider.provide).toBe(STUDIO_CRDT_REPOSITORY);
    expect(studioCrdtRepositoryProvider.useFactory()).toBeInstanceOf(
      DrizzleStudioCrdtRepository
    );
  });

  it("uses one transaction-scoped PostgreSQL advisory-lock namespace per work", () => {
    const rendered = new PgDialect().sqlToQuery(
      studioCrdtWorkAdvisoryLockQuery("work-1")
    );

    expect(rendered.sql).toBe(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))"
    );
    expect(rendered.params).toEqual([
      `${STUDIO_CRDT_ADVISORY_LOCK_NAMESPACE}work-1`,
    ]);
  });

  it("serializes identity allocation through commit for one work", async () => {
    const lock = new TestTransactionAdvisoryLock();
    const firstAllocated = deferred<void>();
    const permitFirstCommit = deferred<void>();
    const allocated: number[] = [];
    const committed: number[] = [];
    let nextIdentity = 1;

    const runTransaction = async (operation: () => Promise<void>) => {
      let release: (() => void) | undefined;
      const transaction = {
        async execute() {
          release = await lock.acquire();
        },
      };
      try {
        await withStudioCrdtWorkMutationLock(
          transaction as never,
          "work-1",
          operation
        );
      } finally {
        // PostgreSQL releases pg_advisory_xact_lock only when the surrounding transaction commits
        // or rolls back. This test release models that transaction boundary.
        release?.();
      }
    };

    const first = runTransaction(async () => {
      const identity = nextIdentity;
      nextIdentity += 1;
      allocated.push(identity);
      firstAllocated.resolve();
      await permitFirstCommit.promise;
      committed.push(identity);
    });
    await firstAllocated.promise;

    const second = runTransaction(async () => {
      const identity = nextIdentity;
      nextIdentity += 1;
      allocated.push(identity);
      committed.push(identity);
    });
    await lock.blocked.promise;

    // The second identity cannot even be allocated while the first transaction is uncommitted.
    expect(allocated).toEqual([1]);
    permitFirstCommit.resolve();
    await Promise.all([first, second]);
    expect(allocated).toEqual([1, 2]);
    expect(committed).toEqual([1, 2]);
  });

  it("holds compaction behind an uncommitted append for the same work", async () => {
    const lock = new TestTransactionAdvisoryLock();
    const appendEntered = deferred<void>();
    const permitAppendCommit = deferred<void>();
    let compacted = false;

    const runTransaction = async (operation: () => Promise<void>) => {
      let release: (() => void) | undefined;
      const transaction = {
        async execute() {
          release = await lock.acquire();
        },
      };
      try {
        await withStudioCrdtWorkMutationLock(
          transaction as never,
          "work-1",
          operation
        );
      } finally {
        release?.();
      }
    };

    const append = runTransaction(async () => {
      appendEntered.resolve();
      await permitAppendCommit.promise;
    });
    await appendEntered.promise;
    const compaction = runTransaction(async () => {
      compacted = true;
    });
    await lock.blocked.promise;

    expect(compacted).toBe(false);
    permitAppendCommit.resolve();
    await Promise.all([append, compaction]);
    expect(compacted).toBe(true);
  });
});
