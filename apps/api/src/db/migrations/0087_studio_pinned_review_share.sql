-- New isolated, immutable review-share metadata. No legacy live-document bearer is reused.
BEGIN;
CREATE TABLE IF NOT EXISTS studio_pinned_review_share (
  id text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES creator_work(id) ON DELETE CASCADE,
  "reviewId" text NOT NULL REFERENCES studio_review(id) ON DELETE CASCADE,
  "createdBy" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "operationId" text NOT NULL, "requestHash" text NOT NULL, "tokenHash" text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL, "snapshotHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL, "expiresAt" timestamptz NOT NULL, "revokedAt" timestamptz,
  CONSTRAINT studio_pinned_review_share_operation_unique UNIQUE ("createdBy", "operationId"),
  CONSTRAINT studio_pinned_review_share_hashes CHECK ("tokenHash" ~ '^[0-9a-f]{64}$' AND "requestHash" ~ '^[0-9a-f]{64}$' AND "snapshotHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_pinned_review_share_payload CHECK (jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=128000),
  CONSTRAINT studio_pinned_review_share_time CHECK ("expiresAt">"createdAt" AND ("revokedAt" IS NULL OR "revokedAt">="createdAt"))
);
CREATE INDEX IF NOT EXISTS idx_studio_pinned_review_share_work ON studio_pinned_review_share ("workId", id);
CREATE INDEX IF NOT EXISTS idx_studio_pinned_review_share_expiry ON studio_pinned_review_share ("expiresAt", id);
CREATE TABLE IF NOT EXISTS studio_pinned_review_feedback (
  "shareId" text NOT NULL REFERENCES studio_pinned_review_share(id) ON DELETE CASCADE,
  id text NOT NULL, "requestHash" text NOT NULL, content jsonb NOT NULL, "createdAt" timestamptz NOT NULL,
  CONSTRAINT studio_pinned_review_feedback_pkey PRIMARY KEY ("shareId", id),
  CONSTRAINT studio_pinned_review_feedback_hash CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_pinned_review_feedback_payload CHECK (jsonb_typeof(content)='object' AND octet_length(content::text)<=24000)
);
CREATE INDEX IF NOT EXISTS idx_studio_pinned_review_feedback_time ON studio_pinned_review_feedback ("shareId", "createdAt");
CREATE OR REPLACE FUNCTION studio_pinned_review_share_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'revokedAt') IS DISTINCT FROM (to_jsonb(OLD)-'revokedAt')
    OR OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'pinned review share is immutable except for one-way revocation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_pinned_review_share_immutable_update ON studio_pinned_review_share;
CREATE TRIGGER studio_pinned_review_share_immutable_update BEFORE UPDATE ON studio_pinned_review_share
  FOR EACH ROW EXECUTE FUNCTION studio_pinned_review_share_immutable();
CREATE OR REPLACE FUNCTION studio_pinned_review_feedback_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'pinned review feedback is immutable'; END $$;
DROP TRIGGER IF EXISTS studio_pinned_review_feedback_immutable_update ON studio_pinned_review_feedback;
CREATE TRIGGER studio_pinned_review_feedback_immutable_update BEFORE UPDATE ON studio_pinned_review_feedback
  FOR EACH ROW EXECUTE FUNCTION studio_pinned_review_feedback_immutable();

COMMIT;
