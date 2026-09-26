-- Durable delivery receipts for exact approved review snapshots. No publication, billing or external-share authority.
BEGIN;
CREATE TABLE IF NOT EXISTS studio_review_delivery (
  id text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES creator_work(id) ON DELETE CASCADE,
  "reviewId" text NOT NULL REFERENCES studio_review(id) ON DELETE CASCADE,
  "createdBy" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "recipientUserId" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  "operationId" text NOT NULL,
  "requestHash" text NOT NULL,
  source jsonb NOT NULL, "sourceHash" text NOT NULL,
  profile jsonb NOT NULL, "profileHash" text NOT NULL,
  rights jsonb NOT NULL,
  manifest jsonb NOT NULL, "manifestHash" text NOT NULL,
  "recipientBindingHash" text NOT NULL,
  state text NOT NULL DEFAULT 'prepared', version integer NOT NULL DEFAULT 0,
  "archiveSha256" text, "archiveByteLength" integer,
  "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
  "issuedAt" timestamptz, "deliveredAt" timestamptz, "acceptedAt" timestamptz, "cancelledAt" timestamptz,
  CONSTRAINT studio_review_delivery_operation_unique UNIQUE ("createdBy", "operationId"),
  CONSTRAINT studio_review_delivery_identity CHECK (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT studio_review_delivery_hashes CHECK (
    "requestHash" ~ '^[0-9a-f]{64}$' AND "sourceHash" ~ '^[0-9a-f]{64}$'
    AND "profileHash" ~ '^[0-9a-f]{64}$' AND "manifestHash" ~ '^[0-9a-f]{64}$'
    AND "recipientBindingHash" ~ '^[0-9a-f]{64}$'
    AND ("archiveSha256" IS NULL OR "archiveSha256" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT studio_review_delivery_payloads CHECK (
    jsonb_typeof(source)='object' AND octet_length(source::text)<=128000
    AND jsonb_typeof(profile)='object' AND octet_length(profile::text)<=8000
    AND jsonb_typeof(rights)='object' AND octet_length(rights::text)<=12000
    AND jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=160000
  ),
  CONSTRAINT studio_review_delivery_state CHECK (state IN ('prepared','issued','delivered','accepted','cancelled')),
  CONSTRAINT studio_review_delivery_version CHECK (version>=0),
  CONSTRAINT studio_review_delivery_archive CHECK (
    ("archiveSha256" IS NULL AND "archiveByteLength" IS NULL)
    OR ("archiveSha256" IS NOT NULL AND "archiveByteLength">0 AND "archiveByteLength"<=167772160)
  ),
  CONSTRAINT studio_review_delivery_times CHECK (
    "updatedAt">="createdAt"
    AND ("issuedAt" IS NULL OR "issuedAt">="createdAt")
    AND ("deliveredAt" IS NULL OR ("issuedAt" IS NOT NULL AND "deliveredAt">="issuedAt"))
    AND ("acceptedAt" IS NULL OR ("deliveredAt" IS NOT NULL AND "acceptedAt">="deliveredAt"))
    AND ("cancelledAt" IS NULL OR "cancelledAt">="createdAt")
    AND (state<>'prepared' OR ("issuedAt" IS NULL AND "deliveredAt" IS NULL AND "acceptedAt" IS NULL AND "cancelledAt" IS NULL))
    AND (state<>'issued' OR ("issuedAt" IS NOT NULL AND "deliveredAt" IS NULL AND "acceptedAt" IS NULL AND "cancelledAt" IS NULL))
    AND (state<>'delivered' OR ("issuedAt" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "acceptedAt" IS NULL AND "cancelledAt" IS NULL))
    AND (state<>'accepted' OR ("issuedAt" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "cancelledAt" IS NULL))
    AND (state<>'cancelled' OR ("cancelledAt" IS NOT NULL AND "acceptedAt" IS NULL))
  )
);
CREATE INDEX IF NOT EXISTS idx_studio_review_delivery_work ON studio_review_delivery ("workId", "createdAt" DESC, id);
CREATE INDEX IF NOT EXISTS idx_studio_review_delivery_recipient ON studio_review_delivery ("recipientUserId", "createdAt" DESC, id);
CREATE INDEX IF NOT EXISTS idx_studio_review_delivery_review ON studio_review_delivery ("reviewId", id);

CREATE TABLE IF NOT EXISTS studio_review_delivery_event (
  "deliveryId" text NOT NULL REFERENCES studio_review_delivery(id) ON DELETE CASCADE,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  "actorUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "operationId" text NOT NULL, "requestHash" text NOT NULL,
  action text NOT NULL, response jsonb NOT NULL, "createdAt" timestamptz NOT NULL,
  CONSTRAINT studio_review_delivery_event_pkey PRIMARY KEY ("deliveryId", sequence),
  CONSTRAINT studio_review_delivery_event_operation_unique UNIQUE ("actorUserId", "operationId"),
  CONSTRAINT studio_review_delivery_event_hash CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_review_delivery_event_action CHECK (action IN ('prepare','issue','download','accept','cancel')),
  CONSTRAINT studio_review_delivery_event_payload CHECK (jsonb_typeof(response)='object' AND octet_length(response::text)<=196000)
);
CREATE INDEX IF NOT EXISTS idx_studio_review_delivery_event_job ON studio_review_delivery_event ("deliveryId", sequence);

CREATE OR REPLACE FUNCTION studio_review_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transition_allowed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM studio_review WHERE id = OLD."reviewId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'review delivery is retained';
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'state'-'version'-'archiveSha256'-'archiveByteLength'-'updatedAt'-'issuedAt'-'deliveredAt'-'acceptedAt'-'cancelledAt')
    IS DISTINCT FROM
    (to_jsonb(OLD)-'state'-'version'-'archiveSha256'-'archiveByteLength'-'updatedAt'-'issuedAt'-'deliveredAt'-'acceptedAt'-'cancelledAt') THEN
    RAISE EXCEPTION 'review delivery immutable inputs changed';
  END IF;
  IF OLD."archiveSha256" IS NOT NULL AND (NEW."archiveSha256" IS DISTINCT FROM OLD."archiveSha256" OR NEW."archiveByteLength" IS DISTINCT FROM OLD."archiveByteLength") THEN
    RAISE EXCEPTION 'review delivery archive evidence is immutable';
  END IF;
  IF OLD.state=NEW.state THEN
    IF NEW.version<>OLD.version OR NEW."updatedAt"<OLD."updatedAt"
      OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt" OR NEW."deliveredAt" IS DISTINCT FROM OLD."deliveredAt"
      OR NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" OR NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt"
      OR (OLD."archiveSha256" IS NOT NULL OR NEW."archiveSha256" IS NULL) THEN
      RAISE EXCEPTION 'invalid review delivery evidence update';
    END IF;
    RETURN NEW;
  END IF;
  transition_allowed := (OLD.state='prepared' AND NEW.state IN ('issued','cancelled'))
    OR (OLD.state='issued' AND NEW.state IN ('delivered','cancelled'))
    OR (OLD.state='delivered' AND NEW.state IN ('accepted','cancelled'));
  IF NOT transition_allowed OR NEW.version<>OLD.version+1 OR NEW."updatedAt"<OLD."updatedAt"
    OR NEW."archiveSha256" IS DISTINCT FROM OLD."archiveSha256" OR NEW."archiveByteLength" IS DISTINCT FROM OLD."archiveByteLength" THEN
    RAISE EXCEPTION 'invalid review delivery state transition';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_review_delivery_guard_update ON studio_review_delivery;
CREATE TRIGGER studio_review_delivery_guard_update BEFORE UPDATE OR DELETE ON studio_review_delivery
  FOR EACH ROW EXECUTE FUNCTION studio_review_delivery_guard();
CREATE OR REPLACE FUNCTION studio_review_delivery_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM studio_review_delivery WHERE id = OLD."deliveryId") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'review delivery event is immutable';
END $$;
DROP TRIGGER IF EXISTS studio_review_delivery_event_immutable_update ON studio_review_delivery_event;
CREATE TRIGGER studio_review_delivery_event_immutable_update BEFORE UPDATE OR DELETE ON studio_review_delivery_event
  FOR EACH ROW EXECUTE FUNCTION studio_review_delivery_event_immutable();
REVOKE ALL ON studio_review_delivery, studio_review_delivery_event FROM PUBLIC;
REVOKE ALL ON SEQUENCE studio_review_delivery_event_sequence_seq FROM PUBLIC;
COMMIT;
