import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { creatorWorkCrdtRasterCheckpointJobs } from "../../../../../lib/db/studio-crdt-raster-checkpoint.schema";

import {
  DrizzleStudioCrdtRasterCheckpointRepository,
  STUDIO_CRDT_RASTER_CHECKPOINT_REPOSITORY,
  studioCrdtRasterCheckpointLeaseTokenHash,
  studioCrdtRasterCheckpointRepositoryProvider,
} from "./studio-crdt-raster-checkpoint.repository";

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

describe("Studio raster checkpoint durable repository contract", () => {
  it("keeps one bounded lifecycle row per work/surface with strict state constraints", () => {
    const table = getTableConfig(creatorWorkCrdtRasterCheckpointJobs);
    expect(table.name).toBe("creator_work_crdt_raster_checkpoint_job");
    expect(table.primaryKeys.map((key) => key.getName())).toEqual([
      "creator_work_crdt_raster_checkpoint_job_pkey",
    ]);
    expect(names(table.uniqueConstraints)).toContain(
      "creator_work_crdt_raster_checkpoint_job_id_unique"
    );
    expect(names(table.indexes)).toEqual([
      "idx_creator_work_crdt_raster_checkpoint_job_ready",
    ]);
    expect(names(table.checks)).toEqual([
      "creator_work_crdt_raster_checkpoint_job_frontier_check",
      "creator_work_crdt_raster_checkpoint_job_hash_check",
      "creator_work_crdt_raster_checkpoint_job_id_check",
      "creator_work_crdt_raster_checkpoint_job_scope_check",
      "creator_work_crdt_raster_checkpoint_job_state_check",
      "creator_work_crdt_raster_checkpoint_job_status_check",
    ]);
    expect(table.foreignKeys.map((key) => key.getName())).toEqual([
      "creator_work_crdt_raster_checkpoint_job_work_fkey",
    ]);
  });

  it("stores only a SHA-256 lease digest and exposes the repository through DI", () => {
    const first = studioCrdtRasterCheckpointLeaseTokenHash("secret-token");
    const second = studioCrdtRasterCheckpointLeaseTokenHash("secret-token");
    expect(first).toHaveLength(32);
    expect(first).toEqual(second);
    expect(Buffer.from(first).toString("utf8")).not.toContain("secret-token");
    expect(studioCrdtRasterCheckpointRepositoryProvider.provide).toBe(
      STUDIO_CRDT_RASTER_CHECKPOINT_REPOSITORY
    );
    expect(studioCrdtRasterCheckpointRepositoryProvider.useFactory()).toBeInstanceOf(
      DrizzleStudioCrdtRasterCheckpointRepository
    );
  });

  it("shares the CRDT work fence and receipt log instead of creating a side-channel commit", () => {
    const source = readFileSync(
      new URL("./studio-crdt-raster-checkpoint.repository.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("withStudioCrdtWorkMutationLock(transaction, input.workId");
    expect(source).toContain("loadStudioCrdtDocumentInTransaction(transaction, input.workId)");
    expect(source).toContain(".insert(creatorWorkCrdtUpdateReceipts)");
    expect(source).toContain("studioCrdtPayloadHash(built.payload)");
    expect(source).toContain("assertCheckpointAssetsStored(transaction, input.workId, built.assets)");
    expect(source).not.toContain("setInterval(");
  });

  it("ships an additive restart-safe migration without mutating earlier migrations", () => {
    const migration = readFileSync(
      new URL("../../../../../lib/db/migrations/0015_creator_work_crdt_raster_checkpoint_job.sql", import.meta.url),
      "utf8"
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "creator_work_crdt_raster_checkpoint_job"');
    expect(migration).toContain('PRIMARY KEY ("workId", "surfaceId")');
    expect(migration).toContain('"leaseTokenHash" bytea');
    expect(migration).toContain('"status" IN (\'pending\', \'leased\', \'completed\')');
    expect(migration).not.toContain("ALTER TABLE");
  });
});
