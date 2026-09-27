-- 부분 부트스트랩에서 누락된 음성 리뷰 제약을 전진 마이그레이션으로 복구한다.
-- 기존 객체 식별자·본문·해시·원장은 변경하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_retention;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_retention CHECK ((
    "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '30 days'
  ) IS TRUE) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_retention;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_delete_state;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_delete_state CHECK ((
    ("deletedAt" IS NULL AND "deleteOperationId" IS NULL)
    OR ("deletedAt" IS NOT NULL AND "deleteOperationId" IS NOT NULL AND "deletedAt" >= "createdAt")
  ) IS TRUE) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_delete_state;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_subject;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_subject CHECK ((
    jsonb_typeof(subject) = 'object'
    AND subject->>'schemaVersion' = '1'
    AND subject->>'workId' = "workId"
    AND subject->>'reviewId' = "reviewId"
    AND subject->>'revisionId' = "revisionId"
    AND subject->>'rootGraphHash' = "rootGraphHash"
    AND nullif(subject->>'projectId','') IS NOT NULL
    AND nullif(subject->>'artifactId','') IS NOT NULL
  ) IS TRUE) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_subject;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_object;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_object CHECK ((
    jsonb_typeof("objectReference") = 'object'
    AND "objectReference"->>'contractVersion' = 'toonspectrum.private-object-storage.v2'
    AND "objectReference"->>'purpose' = 'derived'
    AND "objectReference"->>'contentType' = "contentType"
    AND ("objectReference"->>'byteLength')::integer = "byteLength"
    AND "objectReference"->>'digest' = 'sha256:' || sha256
    AND nullif("objectReference"->>'providerId','') IS NOT NULL
    AND nullif("objectReference"->>'objectPath','') IS NOT NULL
  ) IS TRUE) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_object;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_release_bounds;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_release_bounds CHECK ((
  char_length(title) BETWEEN 1 AND 160 AND char_length(transcript) BETWEEN 1 AND 4000
  AND "durationMs" BETWEEN 1 AND 120000 AND "byteLength" BETWEEN 1 AND 5242880
  AND "contentType" IN ('audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav')
  AND "rootGraphHash" ~ '^[a-f0-9]{64}$' AND sha256 ~ '^[a-f0-9]{64}$'
  AND "requestHash" ~ '^[a-f0-9]{64}$') IS TRUE) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_release_bounds;

CREATE OR REPLACE FUNCTION studio_review_voice_note_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
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


-- 기존 SQL 권한을 유지하면서 공개 Data API 역할은 방어적으로 차단한다.
-- 런타임의 작품별 인가는 기존 API가 수행하며, 이 정책은 새 SQL 권한을 부여하지 않는다.
ALTER TABLE public.studio_review_voice_note ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS studio_review_voice_note_server_only ON public.studio_review_voice_note;
CREATE POLICY studio_review_voice_note_server_only ON public.studio_review_voice_note
  FOR ALL TO PUBLIC
  USING (current_user NOT IN ('anon', 'authenticated'))
  WITH CHECK (current_user NOT IN ('anon', 'authenticated'));

COMMIT;
