-- Durable, event-driven semantic-raster checkpoint coordination. There is exactly one row per
-- work/surface: a completed generation may be replaced, while pending or leased work is immutable.
-- This bounds retained scheduler state and lets an expired lease recover after an API restart
-- without a polling timer. The raw bearer lease token is never persisted.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_crdt_raster_checkpoint_job" (
  "workId" text NOT NULL,
  "surfaceId" text NOT NULL,
  "jobId" text NOT NULL,
  "proofId" text NOT NULL,
  "requestHash" text NOT NULL,
  "sourceSequence" bigint NOT NULL,
  "throughLogicalClock" text NOT NULL,
  "throughActorId" text NOT NULL,
  "throughEventId" text NOT NULL,
  "status" text NOT NULL,
  "attempt" integer NOT NULL DEFAULT 0,
  "notBefore" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" text,
  "leaseTokenHash" bytea,
  "leaseExpiresAt" timestamptz,
  "resultHash" text,
  "resultCheckpointId" text,
  "resultSequence" bigint,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_pkey"
    PRIMARY KEY ("workId", "surfaceId"),
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_id_unique" UNIQUE ("jobId"),
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_id_check" CHECK (
    "jobId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "proofId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_scope_check" CHECK (
    length("surfaceId") BETWEEN 1 AND 160
    AND length("throughActorId") BETWEEN 1 AND 160
    AND "surfaceId" ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]*$'
    AND "throughActorId" ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]*$'
  ),
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_hash_check" CHECK (
    "requestHash" ~ '^[0-9a-f]{64}$'
    AND ("resultHash" IS NULL OR "resultHash" ~ '^[0-9a-f]{64}$')
    AND ("leaseTokenHash" IS NULL OR octet_length("leaseTokenHash") = 32)
  ),
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_frontier_check" CHECK (
    "sourceSequence" > 0
    AND "throughLogicalClock" ~ '^(0|[1-9][0-9]{0,19})$'
    AND "throughEventId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_status_check" CHECK (
    "status" IN ('pending', 'leased', 'completed') AND "attempt" BETWEEN 0 AND 32
  ),
  CONSTRAINT "creator_work_crdt_raster_checkpoint_job_state_check" CHECK (
    ("status" = 'pending'
      AND "leaseOwner" IS NULL AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL
      AND "resultHash" IS NULL AND "resultCheckpointId" IS NULL
      AND "resultSequence" IS NULL AND "completedAt" IS NULL)
    OR ("status" = 'leased'
      AND "leaseOwner" IS NOT NULL AND length("leaseOwner") BETWEEN 1 AND 160
      AND "leaseTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL
      AND "resultHash" IS NULL AND "resultCheckpointId" IS NULL
      AND "resultSequence" IS NULL AND "completedAt" IS NULL)
    OR ("status" = 'completed'
      AND "leaseOwner" IS NOT NULL AND length("leaseOwner") BETWEEN 1 AND 160
      AND "leaseTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL
      AND "resultHash" IS NOT NULL AND "resultCheckpointId" = "jobId"
      AND "resultSequence" IS NOT NULL AND "resultSequence" > 0
      AND "completedAt" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_crdt_raster_checkpoint_job_ready"
  ON "creator_work_crdt_raster_checkpoint_job" ("status", "notBefore", "updatedAt");

COMMIT;
