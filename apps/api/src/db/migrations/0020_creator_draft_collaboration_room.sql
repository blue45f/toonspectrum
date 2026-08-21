-- Lazy, save-before-collaboration room marker.
-- A provisional hidden creator_work is created in the same transaction as this row. Existing
-- collaboration/comment/CRDT tables reference that work from the beginning, so promotion never
-- copies or re-keys their foreign-key graph.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_draft_collaboration_room" (
  "roomId" text PRIMARY KEY,
  "draftDocumentId" text NOT NULL,
  "ownerUserId" text NOT NULL,
  "workId" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "graphRevision" integer NOT NULL DEFAULT 0,
  "initialSnapshotByteLength" integer NOT NULL,
  "provisionIntent" text NOT NULL,
  "provisionMutationId" text NOT NULL,
  "promotionMutationId" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" timestamptz NOT NULL,
  "promotedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_draft_collaboration_room_owner_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_draft_collaboration_room_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_draft_collaboration_room_owner_draft_unique"
    UNIQUE ("ownerUserId", "draftDocumentId"),
  CONSTRAINT "creator_draft_collaboration_room_work_unique"
    UNIQUE ("workId"),
  CONSTRAINT "creator_draft_room_owner_provision_mutation_unique"
    UNIQUE ("ownerUserId", "provisionMutationId"),
  CONSTRAINT "creator_draft_collaboration_room_room_id_check"
    CHECK ("roomId" ~ '^draft-room_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "creator_draft_collaboration_room_draft_document_id_check"
    CHECK ("draftDocumentId" ~ '^draft_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "creator_draft_collaboration_room_provision_intent_check"
    CHECK ("provisionIntent" IN ('share-link', 'invite-member')),
  CONSTRAINT "creator_draft_collaboration_room_status_check"
    CHECK ("status" IN ('active', 'promoted')),
  CONSTRAINT "creator_draft_collaboration_room_graph_revision_check"
    CHECK ("graphRevision" BETWEEN 0 AND 2147483647),
  CONSTRAINT "creator_draft_collaboration_room_snapshot_bytes_check"
    CHECK ("initialSnapshotByteLength" BETWEEN 0 AND 16777216),
  CONSTRAINT "creator_draft_collaboration_room_provision_mutation_check"
    CHECK ("provisionMutationId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "creator_draft_collaboration_room_promotion_mutation_check"
    CHECK (
      "promotionMutationId" IS NULL
      OR "promotionMutationId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT "creator_draft_collaboration_room_time_order_check"
    CHECK (
      "lastActivityAt" >= "createdAt"
      AND "expiresAt" > "lastActivityAt"
      AND "updatedAt" >= "createdAt"
    ),
  CONSTRAINT "creator_draft_collaboration_room_state_check"
    CHECK (
      (
        "status" = 'active'
        AND "promotedAt" IS NULL
        AND "promotionMutationId" IS NULL
      )
      OR (
        "status" = 'promoted'
        AND "promotedAt" IS NOT NULL
        AND "promotionMutationId" IS NOT NULL
        AND "graphRevision" >= 1
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_draft_room_owner_promotion_mutation_unique"
  ON "creator_draft_collaboration_room" ("ownerUserId", "promotionMutationId")
  WHERE "promotionMutationId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_creator_draft_collaboration_room_owner_created"
  ON "creator_draft_collaboration_room" ("ownerUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_draft_collaboration_room_owner_active_lease"
  ON "creator_draft_collaboration_room" ("ownerUserId", "expiresAt")
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "idx_creator_draft_collaboration_room_active_expiry"
  ON "creator_draft_collaboration_room" ("expiresAt", "roomId")
  WHERE "status" = 'active';

COMMIT;
