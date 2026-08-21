-- Durable Yjs collaboration state. The current creator_work document remains the publish/edit
-- snapshot; these tables are an independently compacted realtime operation stream.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_crdt_snapshot" (
  "workId" text NOT NULL,
  "snapshot" bytea NOT NULL,
  "compactedSequence" bigint NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_crdt_snapshot_pkey" PRIMARY KEY ("workId"),
  CONSTRAINT "creator_work_crdt_snapshot_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_crdt_snapshot_sequence_check"
    CHECK ("compactedSequence" >= 0),
  CONSTRAINT "creator_work_crdt_snapshot_size_check"
    CHECK (octet_length("snapshot") BETWEEN 1 AND 16777216)
);

CREATE TABLE IF NOT EXISTS "creator_work_crdt_update" (
  "workId" text NOT NULL,
  "sequence" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "updateId" text NOT NULL,
  "actorUserId" text,
  "payload" bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_crdt_update_pkey" PRIMARY KEY ("workId", "sequence"),
  CONSTRAINT "creator_work_crdt_update_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_crdt_update_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_crdt_update_work_update_id_unique" UNIQUE ("workId", "updateId"),
  CONSTRAINT "creator_work_crdt_update_id_check"
    CHECK (length("updateId") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_crdt_update_payload_size_check"
    CHECK (octet_length("payload") BETWEEN 1 AND 49152)
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_crdt_update_actor_created"
  ON "creator_work_crdt_update" ("actorUserId", "createdAt" DESC);

-- Compaction removes old update payloads, but exactly-once retry semantics must survive it.
-- This compact receipt stores only the immutable actor/sequence and SHA-256 payload digest.
CREATE TABLE IF NOT EXISTS "creator_work_crdt_update_receipt" (
  "workId" text NOT NULL,
  "updateId" text NOT NULL,
  "sequence" bigint,
  "actorUserId" text,
  "payloadHash" bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_crdt_update_receipt_pkey" PRIMARY KEY ("workId", "updateId"),
  CONSTRAINT "creator_work_crdt_update_receipt_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_crdt_update_receipt_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_crdt_update_receipt_work_sequence_unique"
    UNIQUE ("workId", "sequence"),
  CONSTRAINT "creator_work_crdt_update_receipt_id_check"
    CHECK (length("updateId") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_crdt_update_receipt_sequence_check"
    CHECK ("sequence" IS NULL OR "sequence" > 0),
  CONSTRAINT "creator_work_crdt_update_receipt_hash_check"
    CHECK (octet_length("payloadHash") = 32)
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_crdt_update_receipt_actor_created"
  ON "creator_work_crdt_update_receipt" ("actorUserId", "createdAt" DESC);

COMMIT;
