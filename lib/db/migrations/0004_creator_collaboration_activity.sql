-- Append-only creator collaboration activity audit trail.
-- No names or invitation consent tokens are persisted. Names are resolved from the
-- current user rows at read time; user FKs become NULL after hard deletion.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_collaboration_event" (
  "id" text NOT NULL,
  "workId" text NOT NULL,
  "actorUserId" text,
  "targetUserId" text,
  "action" text NOT NULL,
  "beforeState" jsonb,
  "afterState" jsonb,
  "sequence" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_collaboration_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_work_collaboration_event_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_collaboration_event_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_collaboration_event_target_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE SET NULL
);

-- Also sanitizes an intermediate local/schema-push version of this still-unreleased table.
ALTER TABLE "creator_work_collaboration_event"
  DROP COLUMN IF EXISTS "actorName",
  DROP COLUMN IF EXISTS "targetName",
  DROP COLUMN IF EXISTS "invitationId",
  ADD COLUMN IF NOT EXISTS "sequence" bigint GENERATED ALWAYS AS IDENTITY;

ALTER TABLE "creator_work_collaboration_event"
  ALTER COLUMN "sequence" SET NOT NULL,
  DROP CONSTRAINT IF EXISTS "creator_work_collaboration_event_action_check",
  DROP CONSTRAINT IF EXISTS "creator_work_collaboration_event_before_state_object_check",
  DROP CONSTRAINT IF EXISTS "creator_work_collaboration_event_after_state_object_check",
  DROP CONSTRAINT IF EXISTS "creator_work_collaboration_event_before_state_check",
  DROP CONSTRAINT IF EXISTS "creator_work_collaboration_event_after_state_check",
  DROP CONSTRAINT IF EXISTS "creator_work_collaboration_event_transition_check";

ALTER TABLE "creator_work_collaboration_event"
  ADD CONSTRAINT "creator_work_collaboration_event_action_check"
    CHECK ("action" IN ('invite', 'reinvite', 'accept', 'decline', 'role_change', 'remove')),
  ADD CONSTRAINT "creator_work_collaboration_event_before_state_check"
    CHECK ((
      "beforeState" IS NULL OR (
        jsonb_typeof("beforeState") = 'object'
        AND "beforeState" ?& ARRAY['role', 'status']
        AND "beforeState" - ARRAY['role', 'status'] = '{}'::jsonb
        AND "beforeState"->>'role' IN ('admin', 'editor', 'commenter', 'viewer')
        AND "beforeState"->>'status' IN ('pending', 'active', 'declined')
      )
    ) IS TRUE),
  ADD CONSTRAINT "creator_work_collaboration_event_after_state_check"
    CHECK ((
      "afterState" IS NULL OR (
        jsonb_typeof("afterState") = 'object'
        AND "afterState" ?& ARRAY['role', 'status']
        AND "afterState" - ARRAY['role', 'status'] = '{}'::jsonb
        AND "afterState"->>'role' IN ('admin', 'editor', 'commenter', 'viewer')
        AND "afterState"->>'status' IN ('pending', 'active', 'declined')
      )
    ) IS TRUE),
  ADD CONSTRAINT "creator_work_collaboration_event_transition_check"
    CHECK ((
      ("action" = 'invite' AND "beforeState" IS NULL AND "afterState"->>'status' = 'pending')
      OR ("action" = 'reinvite' AND "beforeState"->>'status' = 'declined' AND "afterState"->>'status' = 'pending')
      OR (
        "action" IN ('accept', 'decline')
        AND "beforeState"->>'status' = 'pending'
        AND "afterState"->>'status' = CASE WHEN "action" = 'accept' THEN 'active' ELSE 'declined' END
        AND "beforeState"->>'role' = "afterState"->>'role'
      )
      OR (
        "action" = 'role_change'
        AND "beforeState"->>'status' IN ('pending', 'active')
        AND "beforeState"->>'status' = "afterState"->>'status'
        AND "beforeState"->>'role' <> "afterState"->>'role'
      )
      OR (
        "action" = 'remove'
        AND "beforeState"->>'status' IN ('pending', 'active')
        AND "afterState" IS NULL
      )
    ) IS TRUE);

DROP INDEX IF EXISTS "idx_creator_work_collaboration_event_work_created_id";

CREATE INDEX IF NOT EXISTS "idx_creator_work_collaboration_event_work_sequence"
  ON "creator_work_collaboration_event" ("workId", "sequence" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_collaboration_event_target_created"
  ON "creator_work_collaboration_event" ("targetUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_collaboration_event_actor_created"
  ON "creator_work_collaboration_event" ("actorUserId", "createdAt" DESC);

COMMIT;
