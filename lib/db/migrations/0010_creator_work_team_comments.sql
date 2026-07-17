-- Private Studio team review comments. This namespace is intentionally independent from the
-- public creator_comment board. IDs remain bounded text for legacy document interoperability;
-- actors, activity order, read frontiers, and timestamps are server-owned.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_team_comment_thread" (
  "id" text NOT NULL,
  "workId" text NOT NULL,
  "anchor" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "createdBy" text,
  "resolvedBy" text,
  "resolvedAt" timestamptz,
  "lastActivitySequence" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_team_comment_thread_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_work_team_comment_thread_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_thread_created_by_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_team_comment_thread_resolved_by_fkey"
    FOREIGN KEY ("resolvedBy") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_team_comment_thread_work_id_unique" UNIQUE ("workId", "id"),
  CONSTRAINT "creator_work_team_comment_thread_id_check"
    CHECK (length("id") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_team_comment_thread_anchor_check"
    CHECK ((
      jsonb_typeof("anchor") = 'object'
      AND "anchor" ?& ARRAY['type', 'pageId']
      AND jsonb_typeof("anchor"->'pageId') = 'string'
      AND length("anchor"->>'pageId') BETWEEN 1 AND 120
      AND "anchor"->>'pageId' = btrim("anchor"->>'pageId')
      AND CASE "anchor"->>'type'
        WHEN 'page' THEN
          "anchor" - ARRAY['type', 'pageId'] = '{}'::jsonb
        WHEN 'frame' THEN
          "anchor" - ARRAY['type', 'pageId', 'frameId'] = '{}'::jsonb
          AND jsonb_typeof("anchor"->'frameId') = 'string'
          AND length("anchor"->>'frameId') BETWEEN 1 AND 120
          AND "anchor"->>'frameId' = btrim("anchor"->>'frameId')
        WHEN 'element' THEN
          "anchor" - ARRAY['type', 'pageId', 'frameId', 'elementId'] = '{}'::jsonb
          AND jsonb_typeof("anchor"->'elementId') = 'string'
          AND length("anchor"->>'elementId') BETWEEN 1 AND 120
          AND "anchor"->>'elementId' = btrim("anchor"->>'elementId')
          AND (
            NOT ("anchor" ? 'frameId')
            OR (
              jsonb_typeof("anchor"->'frameId') = 'string'
              AND length("anchor"->>'frameId') BETWEEN 1 AND 120
              AND "anchor"->>'frameId' = btrim("anchor"->>'frameId')
            )
          )
        WHEN 'point' THEN
          "anchor" - ARRAY['type', 'pageId', 'x', 'y'] = '{}'::jsonb
          AND jsonb_typeof("anchor"->'x') = 'number'
          AND ("anchor"->>'x')::numeric BETWEEN 0 AND 1
          AND jsonb_typeof("anchor"->'y') = 'number'
          AND ("anchor"->>'y')::numeric BETWEEN 0 AND 1
        ELSE FALSE
      END
    ) IS TRUE),
  CONSTRAINT "creator_work_team_comment_thread_status_check"
    CHECK ("status" IN ('open', 'resolved')),
  CONSTRAINT "creator_work_team_comment_thread_resolution_state_check"
    CHECK (
      ("status" = 'open' AND "resolvedAt" IS NULL AND "resolvedBy" IS NULL)
      OR ("status" = 'resolved' AND "resolvedAt" IS NOT NULL)
    ),
  CONSTRAINT "creator_work_team_comment_thread_activity_sequence_check"
    CHECK ("lastActivitySequence" >= 0),
  CONSTRAINT "creator_work_team_comment_thread_timestamp_order_check"
    CHECK (
      "updatedAt" >= "createdAt"
      AND ("resolvedAt" IS NULL OR "resolvedAt" >= "createdAt")
    )
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_thread_work_updated"
  ON "creator_work_team_comment_thread" ("workId", "updatedAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_thread_work_status_updated"
  ON "creator_work_team_comment_thread" ("workId", "status", "updatedAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_thread_created_by"
  ON "creator_work_team_comment_thread" ("createdBy", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_thread_resolved_by"
  ON "creator_work_team_comment_thread" ("resolvedBy", "resolvedAt" DESC);

CREATE TABLE IF NOT EXISTS "creator_work_team_comment_message" (
  "id" text NOT NULL,
  "threadId" text NOT NULL,
  "authorUserId" text,
  "body" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_team_comment_message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_work_team_comment_message_thread_fkey"
    FOREIGN KEY ("threadId") REFERENCES "creator_work_team_comment_thread"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_message_author_user_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_team_comment_message_thread_id_unique" UNIQUE ("threadId", "id"),
  CONSTRAINT "creator_work_team_comment_message_id_check"
    CHECK (length("id") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_team_comment_message_body_check"
    CHECK (length("body") BETWEEN 1 AND 4000 AND "body" = btrim("body"))
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_message_thread_created"
  ON "creator_work_team_comment_message" ("threadId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_message_author_created"
  ON "creator_work_team_comment_message" ("authorUserId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "creator_work_team_comment_activity" (
  "id" text NOT NULL,
  "workId" text NOT NULL,
  "threadId" text NOT NULL,
  "actorUserId" text,
  "messageId" text,
  "action" text NOT NULL,
  "sequence" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_team_comment_activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_work_team_comment_activity_thread_fkey"
    FOREIGN KEY ("workId", "threadId")
    REFERENCES "creator_work_team_comment_thread"("workId", "id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_activity_actor_user_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_team_comment_activity_message_fkey"
    FOREIGN KEY ("threadId", "messageId")
    REFERENCES "creator_work_team_comment_message"("threadId", "id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_activity_message_unique" UNIQUE ("messageId"),
  CONSTRAINT "creator_work_team_comment_activity_id_check"
    CHECK (length("id") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_team_comment_activity_action_check"
    CHECK ("action" IN ('thread_created', 'reply_added', 'resolved', 'reopened')),
  CONSTRAINT "creator_work_team_comment_activity_message_state_check"
    CHECK (
      ("action" IN ('thread_created', 'reply_added') AND "messageId" IS NOT NULL)
      OR ("action" IN ('resolved', 'reopened') AND "messageId" IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_activity_thread_sequence"
  ON "creator_work_team_comment_activity" ("threadId", "sequence" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_activity_work_sequence"
  ON "creator_work_team_comment_activity" ("workId", "sequence" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_activity_actor_created"
  ON "creator_work_team_comment_activity" ("actorUserId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "creator_work_team_comment_read" (
  "threadId" text NOT NULL,
  "userId" text NOT NULL,
  "lastReadActivitySequence" bigint NOT NULL DEFAULT 0,
  "readAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_team_comment_read_pkey" PRIMARY KEY ("threadId", "userId"),
  CONSTRAINT "creator_work_team_comment_read_thread_fkey"
    FOREIGN KEY ("threadId") REFERENCES "creator_work_team_comment_thread"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_read_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_team_comment_read_sequence_check"
    CHECK ("lastReadActivitySequence" >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_team_comment_read_user_at"
  ON "creator_work_team_comment_read" ("userId", "readAt" DESC);

COMMIT;
