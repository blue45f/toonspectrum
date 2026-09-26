-- Explicit, short review explanations pinned to an exact immutable review snapshot.
-- This is not call recording and grants no review, publication, document, or media authority.
BEGIN;

CREATE TABLE IF NOT EXISTS studio_review_voice_note (
  id text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES creator_work(id) ON DELETE CASCADE,
  "reviewId" text NOT NULL,
  "revisionId" text NOT NULL,
  "rootGraphHash" text NOT NULL CHECK ("rootGraphHash" ~ '^[a-f0-9]{64}$'),
  subject jsonb NOT NULL,
  "authorUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  transcript text NOT NULL CHECK (char_length(transcript) BETWEEN 1 AND 4000),
  "durationMs" integer NOT NULL CHECK ("durationMs" BETWEEN 1 AND 120000),
  "contentType" text NOT NULL CHECK ("contentType" IN ('audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav')),
  "byteLength" integer NOT NULL CHECK ("byteLength" BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  "objectReference" jsonb NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  "operationId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "expiresAt" timestamptz NOT NULL,
  "deletedAt" timestamptz,
  "deleteOperationId" text,
  CONSTRAINT studio_review_voice_note_retention CHECK (
    "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '30 days'
  ),
  CONSTRAINT studio_review_voice_note_delete_state CHECK (
    ("deletedAt" IS NULL AND "deleteOperationId" IS NULL)
    OR ("deletedAt" IS NOT NULL AND "deleteOperationId" IS NOT NULL AND "deletedAt" >= "createdAt")
  ),
  CONSTRAINT studio_review_voice_note_subject CHECK (
    jsonb_typeof(subject) = 'object'
    AND subject->>'schemaVersion' = '1'
    AND subject->>'workId' = "workId"
    AND subject->>'reviewId' = "reviewId"
    AND subject->>'revisionId' = "revisionId"
    AND subject->>'rootGraphHash' = "rootGraphHash"
    AND nullif(subject->>'projectId','') IS NOT NULL
    AND nullif(subject->>'artifactId','') IS NOT NULL
  ),
  CONSTRAINT studio_review_voice_note_object CHECK (
    jsonb_typeof("objectReference") = 'object'
    AND "objectReference"->>'contractVersion' = 'toonspectrum.private-object-storage.v2'
    AND "objectReference"->>'purpose' = 'derived'
    AND "objectReference"->>'contentType' = "contentType"
    AND ("objectReference"->>'byteLength')::integer = "byteLength"
    AND "objectReference"->>'digest' = 'sha256:' || sha256
    AND nullif("objectReference"->>'providerId','') IS NOT NULL
    AND nullif("objectReference"->>'objectPath','') IS NOT NULL
  ),
  CONSTRAINT studio_review_voice_note_operation_unique UNIQUE ("authorUserId", "operationId")
);

CREATE INDEX IF NOT EXISTS studio_review_voice_note_subject_idx
  ON studio_review_voice_note ("workId", "reviewId", "revisionId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS studio_review_voice_note_expiry_idx
  ON studio_review_voice_note ("expiresAt")
  WHERE "deletedAt" IS NULL;

CREATE OR REPLACE FUNCTION studio_review_voice_note_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NOT NULL OR NEW."deleteOperationId" IS NOT NULL THEN
      RAISE EXCEPTION 'new review voice note cannot start deleted';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM creator_work WHERE id = OLD."workId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'review voice note is retained until parent deletion';
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'deletedAt'-'deleteOperationId') IS DISTINCT FROM
     (to_jsonb(OLD)-'deletedAt'-'deleteOperationId') THEN
    RAISE EXCEPTION 'review voice note immutable fields changed';
  END IF;
  IF OLD."deletedAt" IS NOT NULL OR NEW."deletedAt" IS NULL OR NEW."deleteOperationId" IS NULL
     OR NEW."deletedAt" < OLD."createdAt" THEN
    RAISE EXCEPTION 'invalid review voice note deletion transition';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_review_voice_note_guard_update ON studio_review_voice_note;
CREATE TRIGGER studio_review_voice_note_guard_update BEFORE INSERT OR UPDATE OR DELETE ON studio_review_voice_note
  FOR EACH ROW EXECUTE FUNCTION studio_review_voice_note_guard();

REVOKE ALL ON TABLE studio_review_voice_note FROM PUBLIC;
REVOKE ALL ON FUNCTION studio_review_voice_note_guard() FROM PUBLIC;
COMMIT;
