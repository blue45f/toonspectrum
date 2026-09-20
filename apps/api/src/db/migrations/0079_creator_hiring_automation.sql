BEGIN;
CREATE TABLE creator_hiring_campaign_job (
  id text PRIMARY KEY, slot_id text NOT NULL UNIQUE REFERENCES creator_hiring_slot(id) ON DELETE CASCADE,
  post_id text NOT NULL REFERENCES creator_collab_post(id) ON DELETE CASCADE,
  recruiter_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  requested_mode text NOT NULL DEFAULT 'automatic' CHECK(requested_mode='automatic'),
  generation integer NOT NULL DEFAULT 1 CHECK(generation>0), terms_revision integer NOT NULL CHECK(terms_revision>0), post_version integer NOT NULL CHECK(post_version>0),
  next_round integer NOT NULL CHECK(next_round BETWEEN 0 AND 2),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed','stopped','expired')),
  next_execution_at timestamptz NOT NULL DEFAULT clock_timestamp(), attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  lease_until timestamptz, claim_token text, terminal_reason text, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='processing')=(lease_until IS NOT NULL AND claim_token IS NOT NULL))
);
CREATE INDEX creator_hiring_campaign_job_due ON creator_hiring_campaign_job(next_execution_at,post_id) WHERE status IN ('queued','processing');
CREATE UNIQUE INDEX creator_hiring_campaign_job_token ON creator_hiring_campaign_job(claim_token) WHERE claim_token IS NOT NULL;
CREATE TABLE creator_hiring_campaign_round (
  job_id text NOT NULL REFERENCES creator_hiring_campaign_job(id) ON DELETE CASCADE, generation integer NOT NULL, round integer NOT NULL CHECK(round BETWEEN 0 AND 1),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(job_id,generation,round)
);
-- Invalidations are synchronous and permanent. A future re-open/revision needs new opt-in.
CREATE FUNCTION creator_hiring_automation_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='creator_hiring_slot' THEN
    IF NEW.revision<>OLD.revision OR NEW.state NOT IN ('open','matching') THEN
      UPDATE creator_hiring_campaign_job SET status='stopped',terminal_reason='terms-or-slot-changed',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
        WHERE slot_id=NEW.id AND status IN ('queued','processing');
      UPDATE creator_hiring_invitation SET state='cancelled' WHERE slot_id=NEW.id AND state IN ('unread','read','interested');
    END IF;
  ELSIF TG_TABLE_NAME='creator_collab_post' THEN
    IF NEW.version<>OLD.version OR NEW.status<>'open' OR NEW.hidden OR NEW."deletedAt" IS NOT NULL THEN
      UPDATE creator_hiring_campaign_job SET status='stopped',terminal_reason='post-changed',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE post_id=NEW.id AND status IN ('queued','processing');
    END IF;
  ELSIF TG_TABLE_NAME='user' THEN
    IF NEW.status<>'active' THEN
      UPDATE creator_hiring_campaign_job SET status='stopped',terminal_reason='recruiter-unavailable',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
        WHERE recruiter_id=NEW.id AND status IN ('queued','processing');
    END IF;
  ELSIF NEW.state='stopped' THEN
    UPDATE creator_hiring_campaign_job SET status='stopped',terminal_reason='campaign-stopped',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE slot_id=NEW.slot_id AND status IN ('queued','processing');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creator_hiring_automation_slot AFTER UPDATE ON creator_hiring_slot FOR EACH ROW EXECUTE FUNCTION creator_hiring_automation_invalidate();
CREATE TRIGGER creator_hiring_automation_post AFTER UPDATE ON creator_collab_post FOR EACH ROW EXECUTE FUNCTION creator_hiring_automation_invalidate();
CREATE TRIGGER creator_hiring_automation_campaign AFTER UPDATE ON creator_hiring_campaign FOR EACH ROW EXECUTE FUNCTION creator_hiring_automation_invalidate();
-- Focused invoker readiness appended below; immutable 0078 gate is unchanged.
CREATE TRIGGER creator_hiring_automation_account AFTER UPDATE OF status ON "user" FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION creator_hiring_automation_invalidate();
CREATE FUNCTION creator_hiring_automation_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'creator hiring automation receipts are immutable';
END $$;
CREATE TRIGGER creator_hiring_automation_round_immutable BEFORE UPDATE ON creator_hiring_campaign_round FOR EACH ROW EXECUTE FUNCTION creator_hiring_automation_receipt_immutable();
CREATE FUNCTION creator_hiring_automation_require_ready() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM creator_hiring_require_ready();
  PERFORM generation,terms_revision,post_version,next_round,status,next_execution_at,attempts,lease_until,claim_token,terminal_reason FROM creator_hiring_campaign_job LIMIT 0;
  PERFORM job_id,generation,round,result FROM creator_hiring_campaign_round LIMIT 0;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN
    ('creator_hiring_automation_slot','creator_hiring_automation_post','creator_hiring_automation_campaign','creator_hiring_automation_account','creator_hiring_automation_round_immutable')
    AND tgrelid IN ('creator_hiring_slot'::regclass,'creator_collab_post'::regclass,'creator_hiring_campaign'::regclass,'"user"'::regclass,'creator_hiring_campaign_round'::regclass)) <> 5 THEN
    RAISE EXCEPTION 'creator hiring automation invalidation triggers missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='creator_hiring_campaign_job_token'::regclass AND indisunique AND indisvalid)
    OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='creator_hiring_campaign_round_pkey'::regclass AND indisunique AND indisvalid) THEN
    RAISE EXCEPTION 'creator hiring automation identity constraints missing';
  END IF;
END $$;
REVOKE ALL ON TABLE creator_hiring_campaign_job,creator_hiring_campaign_round FROM PUBLIC;
REVOKE ALL ON FUNCTION creator_hiring_automation_invalidate(),creator_hiring_automation_receipt_immutable(),creator_hiring_automation_require_ready() FROM PUBLIC;
COMMIT;
