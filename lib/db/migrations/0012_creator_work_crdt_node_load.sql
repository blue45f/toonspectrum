-- Cluster-wide CRDT pending-operation load, approximated as one row per API node. Deliberately
-- has no foreign key to a work or user: it tracks per-process load, not per-resource state, and
-- its row count is bounded by process count rather than traffic, so no separate TTL sweep job is
-- required (stale rows are simply ignored by any reader whose staleness window has already lapsed).

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_crdt_node_load" (
  "nodeId" text NOT NULL,
  "pendingOperations" integer NOT NULL,
  "reportedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_crdt_node_load_pkey" PRIMARY KEY ("nodeId"),
  CONSTRAINT "creator_work_crdt_node_load_pending_check" CHECK ("pendingOperations" >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_crdt_node_load_reported"
  ON "creator_work_crdt_node_load" ("reportedAt");

COMMIT;
