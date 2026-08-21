-- Idempotency receipts for Studio team-comment create/reply mutations. The existing 0010 schema
-- remains immutable; this forward migration makes a committed response replayable after a client
-- loses the HTTP response and retries with the same actor/work/mutationId.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_team_comment_mutation" (
  "workId" text NOT NULL,
  "actorUserId" text NOT NULL,
  "mutationId" text NOT NULL,
  "operation" text NOT NULL,
  "requestHash" text NOT NULL,
  "threadId" text NOT NULL,
  "messageId" text NOT NULL,
  "response" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_team_comment_mutation_pkey"
    PRIMARY KEY ("workId", "actorUserId", "mutationId"),
  CONSTRAINT "creator_work_team_comment_mutation_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_mutation_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_mutation_thread_fkey"
    FOREIGN KEY ("workId", "threadId")
    REFERENCES "creator_work_team_comment_thread"("workId", "id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_mutation_message_fkey"
    FOREIGN KEY ("threadId", "messageId")
    REFERENCES "creator_work_team_comment_message"("threadId", "id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_mutation_message_unique" UNIQUE ("messageId"),
  CONSTRAINT "creator_work_team_comment_mutation_id_check"
    CHECK (
      length("mutationId") BETWEEN 1 AND 160
      AND "mutationId" = btrim("mutationId")
      AND "mutationId" !~ '[[:cntrl:]]'
    ),
  CONSTRAINT "creator_work_team_comment_mutation_operation_check"
    CHECK ("operation" IN ('thread_create', 'reply_add')),
  CONSTRAINT "creator_work_team_comment_mutation_request_hash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "creator_work_team_comment_mutation_response_check"
    CHECK (jsonb_typeof("response") = 'object')
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_mutation_actor_created"
  ON "creator_work_team_comment_mutation" ("actorUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_mutation_thread_created"
  ON "creator_work_team_comment_mutation" ("threadId", "createdAt" DESC);

COMMIT;
