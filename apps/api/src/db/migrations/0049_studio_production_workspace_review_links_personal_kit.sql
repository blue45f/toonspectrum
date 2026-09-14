BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_production_workspace" (
  "workId" text PRIMARY KEY REFERENCES "creator_work"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL DEFAULT 0,
  "document" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_production_revision_check"
    CHECK ("revision" BETWEEN 0 AND 2147483647),
  CONSTRAINT "creator_work_production_document_check" CHECK (
    jsonb_typeof("document") = 'object'
    AND "document"->>'schemaVersion' = '3'
    AND jsonb_typeof("document"->'tasks') = 'array'
    AND jsonb_typeof("document"->'reviews') = 'array'
    AND jsonb_typeof("document"->'hierarchy') = 'array'
    AND jsonb_typeof("document"->'roleAssignments') = 'array'
    AND jsonb_typeof("document"->'handoffs') = 'array'
  ),
  CONSTRAINT "creator_work_production_timestamp_check"
    CHECK ("updatedAt" >= "createdAt")
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_production_updated_by"
  ON "creator_work_production_workspace" ("updatedBy", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "creator_studio_personal_kit" (
  "userId" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL DEFAULT 0,
  "document" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_studio_personal_kit_revision_check"
    CHECK ("revision" BETWEEN 0 AND 2147483647),
  CONSTRAINT "creator_studio_personal_kit_document_check" CHECK (
    jsonb_typeof("document") = 'object'
    AND "document"->>'schemaVersion' = '1'
    AND jsonb_typeof("document"->'quickAccess') = 'object'
    AND jsonb_typeof("document"->'gestureMap') = 'object'
    AND jsonb_typeof("document"->'favoriteRefs') = 'array'
  ),
  CONSTRAINT "creator_studio_personal_kit_timestamp_check"
    CHECK ("updatedAt" >= "createdAt")
);

CREATE TABLE IF NOT EXISTS "creator_work_review_link" (
  "id" text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES "creator_work"("id") ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE,
  "role" text NOT NULL DEFAULT 'viewer',
  "pageIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "watermark" boolean NOT NULL DEFAULT true,
  "allowDownload" boolean NOT NULL DEFAULT false,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "createdBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_review_link_id_check"
    CHECK (length("id") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_review_link_hash_check"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "creator_work_review_link_role_check"
    CHECK ("role" IN ('viewer', 'commenter')),
  CONSTRAINT "creator_work_review_link_page_ids_check" CHECK (
    jsonb_typeof("pageIds") = 'array'
    AND jsonb_array_length("pageIds") <= 500
  ),
  CONSTRAINT "creator_work_review_link_time_check" CHECK (
    "expiresAt" > "createdAt"
    AND "updatedAt" >= "createdAt"
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
  )
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_review_link_work_created"
  ON "creator_work_review_link" ("workId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_creator_work_review_link_active_expiry"
  ON "creator_work_review_link" ("expiresAt", "id") WHERE "revokedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_creator_work_review_link_created_by"
  ON "creator_work_review_link" ("createdBy", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "creator_work_review_feedback" (
  "id" text PRIMARY KEY,
  "reviewLinkId" text NOT NULL
    REFERENCES "creator_work_review_link"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "reviewerName" text NOT NULL,
  "reviewerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "anchor" jsonb,
  "body" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_review_feedback_id_check"
    CHECK (length("id") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_review_feedback_kind_check"
    CHECK ("kind" IN ('comment', 'approve', 'reject')),
  CONSTRAINT "creator_work_review_feedback_name_check" CHECK (
    length("reviewerName") BETWEEN 1 AND 120
    AND "reviewerName" = btrim("reviewerName")
  ),
  CONSTRAINT "creator_work_review_feedback_body_check" CHECK (
    length("body") <= 4000
    AND ("kind" = 'approve' OR length(btrim("body")) >= 1)
  ),
  CONSTRAINT "creator_work_review_feedback_anchor_check" CHECK (
    "anchor" IS NULL OR (
      jsonb_typeof("anchor") = 'object'
      AND "anchor" ? 'pageId'
      AND jsonb_typeof("anchor"->'pageId') = 'string'
      AND length("anchor"->>'pageId') BETWEEN 1 AND 160
      AND NOT ("anchor" ? 'x') = NOT ("anchor" ? 'y')
      AND (NOT ("anchor" ? 'x') OR (
        jsonb_typeof("anchor"->'x') = 'number'
        AND jsonb_typeof("anchor"->'y') = 'number'
        AND ("anchor"->>'x')::numeric BETWEEN 0 AND 1
        AND ("anchor"->>'y')::numeric BETWEEN 0 AND 1
      ))
    )
  )
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_review_feedback_link_created"
  ON "creator_work_review_feedback" ("reviewLinkId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "idx_creator_work_review_feedback_user_created"
  ON "creator_work_review_feedback" ("reviewerUserId", "createdAt" DESC);

COMMIT;
