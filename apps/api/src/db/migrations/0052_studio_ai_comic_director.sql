-- Promote the AI Comic Director runtime schema from optional boot-time provisioning
-- to an approved, checksum-led production migration. All relations are additive.
BEGIN;

SET LOCAL search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_session" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "workId" text REFERENCES "creator_work"("id") ON DELETE CASCADE,
  "remixSourceWorkId" text,
  "title" text NOT NULL DEFAULT 'AI 코믹 디렉터 세션',
  "stage" text NOT NULL DEFAULT 'brief',
  "status" text NOT NULL DEFAULT 'draft',
  "revision" integer NOT NULL DEFAULT 1,
  "baseDocumentRevision" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "studio_ai_comic_session_stage_check"
    CHECK ("stage" IN ('brief', 'direction', 'production', 'finish')),
  CONSTRAINT "studio_ai_comic_session_status_check"
    CHECK ("status" IN ('draft', 'planning', 'ready', 'generating', 'review', 'applying', 'applied', 'cancelled', 'failed')),
  CONSTRAINT "studio_ai_comic_session_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "studio_ai_comic_session_scope_check"
    CHECK (NOT ("workId" IS NOT NULL AND "remixSourceWorkId" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "idx_studio_ai_comic_session_user_updated"
  ON "studio_ai_comic_director_session" ("userId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_studio_ai_comic_session_work_updated"
  ON "studio_ai_comic_director_session" ("workId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "studio_ai_visual_bible_revision" (
  "id" text PRIMARY KEY,
  "sessionId" text NOT NULL REFERENCES "studio_ai_comic_director_session"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "sourceDigest" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "studio_ai_visual_bible_status_check"
    CHECK ("status" IN ('draft', 'recommended', 'approved', 'deprecated')),
  CONSTRAINT "studio_ai_visual_bible_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "uq_studio_ai_visual_bible_session_revision" UNIQUE ("sessionId", "revision")
);
CREATE INDEX IF NOT EXISTS "idx_studio_ai_visual_bible_session_created"
  ON "studio_ai_visual_bible_revision" ("sessionId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_job" (
  "id" text PRIMARY KEY,
  "sessionId" text NOT NULL REFERENCES "studio_ai_comic_director_session"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "operationId" text NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "progressDone" integer NOT NULL DEFAULT 0,
  "progressTotal" integer NOT NULL DEFAULT 0,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "result" jsonb,
  "error" text,
  "leaseExpiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "studio_ai_comic_job_kind_check"
    CHECK ("kind" IN ('generation', 'repair', 'quality', 'decomposition', 'apply')),
  CONSTRAINT "studio_ai_comic_job_status_check"
    CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'unknown')),
  CONSTRAINT "studio_ai_comic_job_progress_check"
    CHECK ("progressDone" >= 0 AND "progressTotal" >= 0 AND "progressDone" <= "progressTotal"),
  CONSTRAINT "uq_studio_ai_comic_job_operation" UNIQUE ("sessionId", "operationId")
);
CREATE INDEX IF NOT EXISTS "idx_studio_ai_comic_job_session_updated"
  ON "studio_ai_comic_director_job" ("sessionId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_job_event" (
  "id" text PRIMARY KEY,
  "jobId" text NOT NULL REFERENCES "studio_ai_comic_director_job"("id") ON DELETE CASCADE,
  "sessionId" text NOT NULL REFERENCES "studio_ai_comic_director_session"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "studio_ai_comic_job_event_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "uq_studio_ai_comic_job_event_sequence" UNIQUE ("jobId", "sequence")
);
CREATE INDEX IF NOT EXISTS "idx_studio_ai_comic_job_event_session_created"
  ON "studio_ai_comic_director_job_event" ("sessionId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_artifact" (
  "id" text PRIMARY KEY,
  "sessionId" text NOT NULL REFERENCES "studio_ai_comic_director_session"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "panelId" text,
  "parentArtifactId" text,
  "kind" text NOT NULL,
  "assetId" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "studio_ai_comic_artifact_kind_check"
    CHECK ("kind" IN ('candidate', 'repair', 'mask', 'quality-report', 'layer-manifest', 'apply-receipt'))
);
CREATE INDEX IF NOT EXISTS "idx_studio_ai_comic_artifact_session_panel"
  ON "studio_ai_comic_director_artifact" ("sessionId", "panelId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_approval" (
  "id" text PRIMARY KEY,
  "sessionId" text NOT NULL REFERENCES "studio_ai_comic_director_session"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "sessionRevision" integer NOT NULL,
  "candidateDigest" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "supersededAt" timestamptz,
  CONSTRAINT "studio_ai_comic_approval_status_check"
    CHECK ("status" IN ('active', 'superseded')),
  CONSTRAINT "studio_ai_comic_approval_revision_check" CHECK ("sessionRevision" >= 1),
  CONSTRAINT "uq_studio_ai_comic_approval_revision_digest"
    UNIQUE ("sessionId", "sessionRevision", "candidateDigest")
);
CREATE INDEX IF NOT EXISTS "idx_studio_ai_comic_approval_session_status"
  ON "studio_ai_comic_director_approval" ("sessionId", "status", "createdAt" DESC);

REVOKE ALL ON TABLE
  public."studio_ai_comic_director_session",
  public."studio_ai_visual_bible_revision",
  public."studio_ai_comic_director_job",
  public."studio_ai_comic_director_job_event",
  public."studio_ai_comic_director_artifact",
  public."studio_ai_comic_director_approval"
FROM PUBLIC;

DO $studio_ai_comic_director_contract$
DECLARE
  missing_relations text[];
BEGIN
  SELECT array_agg(relation_name ORDER BY relation_name)
  INTO missing_relations
  FROM unnest(ARRAY[
    'studio_ai_comic_director_session',
    'studio_ai_visual_bible_revision',
    'studio_ai_comic_director_job',
    'studio_ai_comic_director_job_event',
    'studio_ai_comic_director_artifact',
    'studio_ai_comic_director_approval'
  ]::text[]) AS relation_name
  WHERE to_regclass(format('public.%I', relation_name)) IS NULL;

  IF missing_relations IS NOT NULL THEN
    RAISE EXCEPTION
      'studio AI Comic Director relations are incomplete: %',
      missing_relations;
  END IF;
END
$studio_ai_comic_director_contract$;

COMMIT;
