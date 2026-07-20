import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { creatorWorks } from "./schema";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/**
 * One bounded coordinator row per raster surface. A new generation replaces a completed row,
 * while pending/leased work is immutable and therefore survives API restarts without an
 * unbounded job history. The bearer lease is stored only as SHA-256 bytes.
 */
export const creatorWorkCrdtRasterCheckpointJobs = pgTable(
  "creator_work_crdt_raster_checkpoint_job",
  {
    workId: text("workId").notNull(),
    surfaceId: text("surfaceId").notNull(),
    jobId: text("jobId").notNull(),
    proofId: text("proofId").notNull(),
    requestHash: text("requestHash").notNull(),
    sourceSequence: bigint("sourceSequence", { mode: "bigint" }).notNull(),
    throughLogicalClock: text("throughLogicalClock").notNull(),
    throughActorId: text("throughActorId").notNull(),
    throughEventId: text("throughEventId").notNull(),
    status: text("status").notNull(),
    attempt: integer("attempt").notNull().default(0),
    notBefore: timestamp("notBefore", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: text("leaseOwner"),
    leaseTokenHash: bytea("leaseTokenHash"),
    leaseExpiresAt: timestamp("leaseExpiresAt", { mode: "date", withTimezone: true }),
    resultHash: text("resultHash"),
    resultCheckpointId: text("resultCheckpointId"),
    resultSequence: bigint("resultSequence", { mode: "bigint" }),
    completedAt: timestamp("completedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "creator_work_crdt_raster_checkpoint_job_work_fkey",
      columns: [table.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    primaryKey({
      name: "creator_work_crdt_raster_checkpoint_job_pkey",
      columns: [table.workId, table.surfaceId],
    }),
    unique("creator_work_crdt_raster_checkpoint_job_id_unique").on(table.jobId),
    index("idx_creator_work_crdt_raster_checkpoint_job_ready").on(
      table.status,
      table.notBefore,
      table.updatedAt
    ),
    check(
      "creator_work_crdt_raster_checkpoint_job_id_check",
      sql`${table.jobId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and ${table.proofId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`
    ),
    check(
      "creator_work_crdt_raster_checkpoint_job_scope_check",
      sql`length(${table.surfaceId}) between 1 and 160
        and length(${table.throughActorId}) between 1 and 160
        and ${table.surfaceId} ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]*$'
        and ${table.throughActorId} ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]*$'`
    ),
    check(
      "creator_work_crdt_raster_checkpoint_job_hash_check",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'
        and (${table.resultHash} is null or ${table.resultHash} ~ '^[0-9a-f]{64}$')
        and (${table.leaseTokenHash} is null or octet_length(${table.leaseTokenHash}) = 32)`
    ),
    check(
      "creator_work_crdt_raster_checkpoint_job_frontier_check",
      sql`${table.sourceSequence} > 0
        and ${table.throughLogicalClock} ~ '^(0|[1-9][0-9]{0,19})$'
        and ${table.throughEventId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`
    ),
    check(
      "creator_work_crdt_raster_checkpoint_job_status_check",
      sql`${table.status} in ('pending', 'leased', 'completed') and ${table.attempt} between 0 and 32`
    ),
    check(
      "creator_work_crdt_raster_checkpoint_job_state_check",
      sql`(
          ${table.status} = 'pending'
          and ${table.leaseOwner} is null
          and ${table.leaseTokenHash} is null
          and ${table.leaseExpiresAt} is null
          and ${table.resultHash} is null
          and ${table.resultCheckpointId} is null
          and ${table.resultSequence} is null
          and ${table.completedAt} is null
        ) or (
          ${table.status} = 'leased'
          and ${table.leaseOwner} is not null
          and length(${table.leaseOwner}) between 1 and 160
          and ${table.leaseTokenHash} is not null
          and ${table.leaseExpiresAt} is not null
          and ${table.resultHash} is null
          and ${table.resultCheckpointId} is null
          and ${table.resultSequence} is null
          and ${table.completedAt} is null
        ) or (
          ${table.status} = 'completed'
          and ${table.leaseOwner} is not null
          and length(${table.leaseOwner}) between 1 and 160
          and ${table.leaseTokenHash} is not null
          and ${table.leaseExpiresAt} is not null
          and ${table.resultHash} is not null
          and ${table.resultCheckpointId} = ${table.jobId}
          and ${table.resultSequence} is not null
          and ${table.resultSequence} > 0
          and ${table.completedAt} is not null
        )`
    ),
  ]
);
