-- Forward-only creator work collaboration membership migration.
-- The work owner remains implicit in creator_work.userId and is never duplicated here.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_collaborator" (
  "workId" text NOT NULL,
  "userId" text NOT NULL,
  "role" text NOT NULL DEFAULT 'viewer',
  "status" text NOT NULL DEFAULT 'pending',
  "invitationId" text NOT NULL,
  "invitedBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" timestamptz,
  CONSTRAINT "creator_work_collaborator_pkey" PRIMARY KEY ("workId", "userId"),
  CONSTRAINT "creator_work_collaborator_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_collaborator_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_collaborator_invited_by_fkey"
    FOREIGN KEY ("invitedBy") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_collaborator_role_check"
    CHECK ("role" IN ('admin', 'editor', 'commenter', 'viewer')),
  CONSTRAINT "creator_work_collaborator_status_check"
    CHECK ("status" IN ('pending', 'active', 'declined')),
  CONSTRAINT "creator_work_collaborator_response_state_check"
    CHECK (
      ("status" = 'pending' AND "respondedAt" IS NULL)
      OR ("status" IN ('active', 'declined') AND "respondedAt" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_collaborator_user_status_updated"
  ON "creator_work_collaborator" ("userId", "status", "updatedAt");

CREATE INDEX IF NOT EXISTS "idx_creator_work_collaborator_work_status_role"
  ON "creator_work_collaborator" ("workId", "status", "role");

CREATE INDEX IF NOT EXISTS "idx_creator_work_collaborator_invited_by"
  ON "creator_work_collaborator" ("invitedBy");

COMMIT;
