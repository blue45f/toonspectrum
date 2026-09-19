-- Additive creator hiring workspace. Apply only through the reviewed migration runner.
BEGIN;
CREATE TABLE IF NOT EXISTS creator_hiring_resume (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100),
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_hiring_resume_owner ON creator_hiring_resume(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS creator_hiring_resume_version (
  id text PRIMARY KEY, resume_id text NOT NULL REFERENCES creator_hiring_resume(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0), content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (resume_id, revision)
);
CREATE TABLE IF NOT EXISTS creator_hiring_application_snapshot (
  id text PRIMARY KEY, application_id text NOT NULL REFERENCES creator_collab_application(id) ON DELETE CASCADE,
  resume_version_id text REFERENCES creator_hiring_resume_version(id) ON DELETE SET NULL,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  resume_revision integer NOT NULL CHECK (resume_revision > 0), resume_payload jsonb,
  consent_revision text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
  redacted_at timestamptz, redaction_reason text,
  CHECK ((resume_payload IS NOT NULL AND redacted_at IS NULL) OR (resume_payload IS NULL AND redacted_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS creator_hiring_snapshot_application ON creator_hiring_application_snapshot(application_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS creator_hiring_snapshot_version ON creator_hiring_application_snapshot(resume_version_id);
CREATE TABLE IF NOT EXISTS creator_hiring_receipt (
  actor_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, action text NOT NULL,
  mutation_id text NOT NULL, request_digest text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (actor_id, action, mutation_id)
);
CREATE TABLE IF NOT EXISTS creator_hiring_capacity (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 24)
);
CREATE TABLE IF NOT EXISTS creator_hiring_availability (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  confirmed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  roles jsonb NOT NULL, tools jsonb NOT NULL, formats jsonb NOT NULL,
  min_rate bigint NOT NULL CHECK (min_rate >= 0), rate_unit text NOT NULL CHECK (rate_unit IN ('hour','cut','episode','task')),
  discoverable boolean NOT NULL DEFAULT false, notification_opt_in boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (starts_at < ends_at AND confirmed_at < expires_at AND expires_at <= ends_at),
  CHECK (jsonb_typeof(roles)='array' AND jsonb_typeof(tools)='array' AND jsonb_typeof(formats)='array')
);
CREATE INDEX IF NOT EXISTS creator_hiring_available_until ON creator_hiring_availability(expires_at) WHERE discoverable;
CREATE TABLE IF NOT EXISTS creator_hiring_slot (
  id text PRIMARY KEY, post_id text NOT NULL REFERENCES creator_collab_post(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','matching','reserved','filled','paused','cancelled')),
  terms jsonb NOT NULL CHECK (jsonb_typeof(terms)='object'),
  starts_at timestamptz NOT NULL, due_at timestamptz NOT NULL CHECK (due_at > starts_at),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_hiring_slot_post ON creator_hiring_slot(post_id, created_at);
CREATE TABLE IF NOT EXISTS creator_hiring_offer (
  id text PRIMARY KEY, slot_id text NOT NULL REFERENCES creator_hiring_slot(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  recruiter_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  terms_revision integer NOT NULL CHECK (terms_revision > 0), terms jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','declined','cancelled','expired')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (candidate_id <> recruiter_id)
);
CREATE INDEX IF NOT EXISTS creator_hiring_offer_candidate ON creator_hiring_offer(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_hiring_offer_slot ON creator_hiring_offer(slot_id, created_at DESC);
CREATE TABLE IF NOT EXISTS creator_hiring_commitment (
  id text PRIMARY KEY, slot_id text NOT NULL REFERENCES creator_hiring_slot(id) ON DELETE CASCADE,
  offer_id text NOT NULL UNIQUE REFERENCES creator_hiring_offer(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('reserved','active','cancelled','expired','completed')),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  hold_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_hiring_slot_one_commitment
  ON creator_hiring_commitment(slot_id) WHERE state IN ('reserved','active');
CREATE INDEX IF NOT EXISTS creator_hiring_commitment_capacity ON creator_hiring_commitment(candidate_id, starts_at, ends_at);
CREATE TABLE IF NOT EXISTS creator_hiring_outbox (
  id text PRIMARY KEY, event_type text NOT NULL, aggregate_id text NOT NULL,
  payload jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_type, aggregate_id)
);
CREATE INDEX IF NOT EXISTS creator_hiring_outbox_pending ON creator_hiring_outbox(state, available_at);
CREATE TABLE IF NOT EXISTS creator_hiring_campaign (
  slot_id text PRIMARY KEY REFERENCES creator_hiring_slot(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 0 CHECK (round BETWEEN 0 AND 2),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','completed','stopped','exhausted')),
  next_dispatch_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_hiring_invitation (
  id text PRIMARY KEY, slot_id text NOT NULL REFERENCES creator_hiring_slot(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  recruiter_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'unread' CHECK (state IN ('unread','read','interested','declined','expired','cancelled')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(slot_id,candidate_id)
);
CREATE INDEX IF NOT EXISTS creator_hiring_invitation_candidate ON creator_hiring_invitation(candidate_id,created_at DESC);
CREATE INDEX IF NOT EXISTS creator_hiring_invitation_recruiter ON creator_hiring_invitation(recruiter_id,created_at DESC);
-- Legacy withdrawal/deletion paths also erase the newly attached resume payloads.
CREATE OR REPLACE FUNCTION creator_hiring_redact_withdrawn_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'withdrawn' THEN
    UPDATE creator_hiring_application_snapshot SET resume_payload=NULL, redacted_at=COALESCE(redacted_at,now()),
      redaction_reason=COALESCE(redaction_reason,'application-withdrawn') WHERE application_id=NEW.id;
    UPDATE creator_hiring_commitment c SET state='cancelled' FROM creator_hiring_slot s
      WHERE c.slot_id=s.id AND s.post_id=NEW."postId" AND c.candidate_id=NEW."userId" AND c.state='reserved';
    UPDATE creator_hiring_offer o SET state='cancelled' FROM creator_hiring_slot s
      WHERE o.slot_id=s.id AND s.post_id=NEW."postId" AND o.candidate_id=NEW."userId" AND o.state IN ('pending','accepted');
    UPDATE creator_hiring_slot s SET state='open',revision=revision+1,updated_at=now()
      WHERE s.post_id=NEW."postId" AND s.state='reserved'
      AND NOT EXISTS (SELECT 1 FROM creator_hiring_commitment c WHERE c.slot_id=s.id AND c.state IN ('reserved','active'));
    UPDATE creator_hiring_outbox o SET state='failed' WHERE event_type='role-assignment-requested' AND state IN ('pending','processing')
      AND EXISTS(SELECT 1 FROM creator_hiring_commitment c JOIN creator_hiring_slot s ON s.id=c.slot_id WHERE c.id=o.aggregate_id AND s.post_id=NEW."postId" AND c.candidate_id=NEW."userId" AND c.state='cancelled');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS creator_hiring_application_withdrawn ON creator_collab_application;
CREATE TRIGGER creator_hiring_application_withdrawn AFTER UPDATE OF status ON creator_collab_application
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_redact_withdrawn_application();

-- Versions cannot be edited in place. Deletion is allowed for owner erasure/cascades.
CREATE OR REPLACE FUNCTION creator_hiring_immutable_resume_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'resume versions are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS creator_hiring_resume_version_immutable ON creator_hiring_resume_version;
CREATE TRIGGER creator_hiring_resume_version_immutable BEFORE UPDATE ON creator_hiring_resume_version
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_immutable_resume_version();
CREATE OR REPLACE FUNCTION creator_hiring_redact_deleted_resume() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE creator_hiring_application_snapshot SET resume_payload=NULL,redacted_at=COALESCE(redacted_at,now()),
    redaction_reason=COALESCE(redaction_reason,'resume-deleted')
    WHERE resume_version_id IN (SELECT id FROM creator_hiring_resume_version WHERE resume_id=OLD.id);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS creator_hiring_resume_deleted ON creator_hiring_resume;
CREATE TRIGGER creator_hiring_resume_deleted BEFORE DELETE ON creator_hiring_resume
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_redact_deleted_resume();
-- A snapshot can only lose private content. Neither resubmission nor source edits revive it.
CREATE OR REPLACE FUNCTION creator_hiring_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.application_id IS DISTINCT FROM OLD.application_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.resume_revision IS DISTINCT FROM OLD.resume_revision OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.consent_revision IS DISTINCT FROM OLD.consent_revision
    OR (NEW.resume_version_id IS DISTINCT FROM OLD.resume_version_id AND NEW.resume_version_id IS NOT NULL)
    OR (NEW.resume_payload IS DISTINCT FROM OLD.resume_payload AND NEW.resume_payload IS NOT NULL)
    OR (OLD.redacted_at IS NOT NULL AND (NEW.redacted_at IS DISTINCT FROM OLD.redacted_at OR NEW.redaction_reason IS DISTINCT FROM OLD.redaction_reason)) THEN
    RAISE EXCEPTION 'submitted snapshots are immutable except redaction' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS creator_hiring_snapshot_immutable ON creator_hiring_application_snapshot;
CREATE TRIGGER creator_hiring_snapshot_immutable BEFORE UPDATE ON creator_hiring_application_snapshot
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_snapshot_immutable();

ALTER TABLE creator_hiring_availability ADD CONSTRAINT creator_hiring_availability_two_hours
  CHECK (expires_at <= confirmed_at + interval '2 hours');
CREATE OR REPLACE FUNCTION creator_hiring_post_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'open' OR NEW.hidden OR NEW."deletedAt" IS NOT NULL THEN
    UPDATE creator_hiring_commitment c SET state='cancelled' FROM creator_hiring_slot s
      WHERE c.slot_id=s.id AND s.post_id=NEW.id AND c.state='reserved';
    UPDATE creator_hiring_offer o SET state='cancelled' FROM creator_hiring_slot s
      WHERE o.slot_id=s.id AND s.post_id=NEW.id AND o.state IN ('pending','accepted');
    UPDATE creator_hiring_slot SET state='paused',revision=revision+1,updated_at=now()
      WHERE post_id=NEW.id AND state IN ('open','matching','reserved');
    UPDATE creator_hiring_campaign c SET state='stopped' FROM creator_hiring_slot s WHERE c.slot_id=s.id AND s.post_id=NEW.id;
    UPDATE creator_hiring_invitation i SET state='cancelled' FROM creator_hiring_slot s
      WHERE i.slot_id=s.id AND s.post_id=NEW.id AND i.state IN ('unread','read','interested');
    UPDATE creator_hiring_outbox o SET state='failed' WHERE event_type='role-assignment-requested' AND state IN ('pending','processing')
      AND EXISTS(SELECT 1 FROM creator_hiring_commitment c JOIN creator_hiring_slot s ON s.id=c.slot_id WHERE c.id=o.aggregate_id AND s.post_id=NEW.id AND c.state='cancelled');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS creator_hiring_post_unavailable ON creator_collab_post;
CREATE TRIGGER creator_hiring_post_unavailable AFTER UPDATE OF status,hidden,"deletedAt" ON creator_collab_post
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_post_unavailable();
CREATE OR REPLACE FUNCTION creator_hiring_offer_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slot_id IS DISTINCT FROM OLD.slot_id OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.recruiter_id IS DISTINCT FROM OLD.recruiter_id OR NEW.terms_revision IS DISTINCT FROM OLD.terms_revision
    OR NEW.terms IS DISTINCT FROM OLD.terms OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'offer terms are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS creator_hiring_offer_immutable ON creator_hiring_offer;
CREATE TRIGGER creator_hiring_offer_immutable BEFORE UPDATE ON creator_hiring_offer FOR EACH ROW EXECUTE FUNCTION creator_hiring_offer_immutable();

-- Organization/notification membership only. No document/work/RoleAssignment foreign keys.
CREATE TABLE creator_hiring_team (
  id text PRIMARY KEY, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creator_hiring_team_member (
  team_id text NOT NULL REFERENCES creator_hiring_team(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('invited','active','left')),
  invite_expires_at timestamptz, invite_revision integer NOT NULL DEFAULT 1 CHECK(invite_revision>0),
  PRIMARY KEY(team_id,user_id)
);
CREATE INDEX creator_hiring_team_member_user ON creator_hiring_team_member(user_id,status);
CREATE TABLE creator_hiring_group (
  id text PRIMARY KEY, team_id text NOT NULL REFERENCES creator_hiring_team(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80), UNIQUE(id,team_id), UNIQUE(team_id,name)
);
CREATE TABLE creator_hiring_group_member (
  group_id text NOT NULL, team_id text NOT NULL, user_id text NOT NULL,
  PRIMARY KEY(group_id,user_id),
  FOREIGN KEY(group_id,team_id) REFERENCES creator_hiring_group(id,team_id) ON DELETE CASCADE,
  FOREIGN KEY(team_id,user_id) REFERENCES creator_hiring_team_member(team_id,user_id) ON DELETE CASCADE
);

CREATE TABLE creator_hiring_room (
  id text PRIMARY KEY, title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 100),
  kind text NOT NULL CHECK(kind IN ('interview','meeting')), host_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  team_id text REFERENCES creator_hiring_team(id) ON DELETE CASCADE,
  application_id text REFERENCES creator_collab_application(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','ended')), epoch integer NOT NULL DEFAULT 1 CHECK(epoch>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at>starts_at AND ends_at<=starts_at+interval '4 hours'),
  CHECK ((kind='interview' AND application_id IS NOT NULL AND team_id IS NULL) OR (kind='meeting' AND team_id IS NOT NULL AND application_id IS NULL))
);
CREATE TABLE creator_hiring_admission (
  room_id text NOT NULL REFERENCES creator_hiring_room(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','waiting','admitted','removed','left')),
  epoch integer NOT NULL DEFAULT 1, PRIMARY KEY(room_id,user_id)
);
CREATE INDEX creator_hiring_admission_user ON creator_hiring_admission(user_id,room_id);
CREATE TABLE creator_hiring_room_message (
  id text PRIMARY KEY, room_id text NOT NULL REFERENCES creator_hiring_room(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, epoch integer NOT NULL,
  audience text NOT NULL CHECK(audience IN ('lobby','admitted')), text text NOT NULL CHECK(length(btrim(text)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creator_hiring_room_message_poll ON creator_hiring_room_message(room_id,epoch,created_at);

CREATE TABLE creator_hiring_career (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1, rights text NOT NULL CHECK(rights IN ('pending','owned','authorized')),
  visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
  content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (visibility='private' OR rights IN ('owned','authorized'))
);
CREATE INDEX creator_hiring_career_owner ON creator_hiring_career(user_id,updated_at DESC);
CREATE TABLE creator_hiring_career_version (
  id text PRIMARY KEY, career_id text NOT NULL REFERENCES creator_hiring_career(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK(revision>0), content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(career_id,revision)
);
CREATE TRIGGER creator_hiring_career_version_immutable BEFORE UPDATE ON creator_hiring_career_version
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_immutable_resume_version();
CREATE TABLE creator_hiring_activity_ledger (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK(source_type='verified-production-completion'), source_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('award','reversal')), points integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_type,source_id,kind),
  CHECK((kind='award' AND points=10) OR (kind='reversal' AND points=-10))
);
CREATE INDEX creator_hiring_activity_user ON creator_hiring_activity_ledger(user_id,occurred_at DESC);
-- Award ingestion is deliberately unconnected until the existing production authority's
-- completion/reversal contract is available. No hiring/application/client event awards points.

-- Revocation survives legacy application resubmission and team re-invitation.
CREATE OR REPLACE FUNCTION creator_hiring_revoke_application_rooms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('withdrawn','declined') THEN
    UPDATE creator_hiring_room SET status='ended',epoch=epoch+1 WHERE application_id=NEW.id AND status<>'ended';
    UPDATE creator_hiring_admission a SET status='removed',epoch=r.epoch FROM creator_hiring_room r WHERE a.room_id=r.id AND r.application_id=NEW.id AND a.user_id<>r.host_id;
    DELETE FROM creator_hiring_room_message m USING creator_hiring_room r WHERE m.room_id=r.id AND r.application_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creator_hiring_application_room_revoked AFTER UPDATE OF status ON creator_collab_application
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_revoke_application_rooms();
CREATE OR REPLACE FUNCTION creator_hiring_revoke_member_rooms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='active' AND NEW.status<>'active' THEN
    UPDATE creator_hiring_room SET epoch=epoch+1,status=CASE WHEN host_id=NEW.user_id THEN 'ended' ELSE status END
      WHERE team_id=NEW.team_id AND status<>'ended' AND EXISTS(SELECT 1 FROM creator_hiring_admission a WHERE a.room_id=creator_hiring_room.id AND a.user_id=NEW.user_id AND a.status<>'removed');
    UPDATE creator_hiring_admission a SET status='removed',epoch=r.epoch FROM creator_hiring_room r
      WHERE a.room_id=r.id AND r.team_id=NEW.team_id AND a.user_id=NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creator_hiring_team_room_revoked AFTER UPDATE OF status ON creator_hiring_team_member
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_revoke_member_rooms();

ALTER TABLE creator_hiring_resume ADD COLUMN source_invalidated_at timestamptz;
CREATE TABLE creator_hiring_resume_career_source (
  resume_id text PRIMARY KEY REFERENCES creator_hiring_resume(id) ON DELETE CASCADE,
  career_id text NOT NULL REFERENCES creator_hiring_career(id) ON DELETE CASCADE,
  career_version_id text NOT NULL REFERENCES creator_hiring_career_version(id) ON DELETE CASCADE
);
CREATE INDEX creator_hiring_resume_career_source_career ON creator_hiring_resume_career_source(career_id);
CREATE OR REPLACE FUNCTION creator_hiring_revoke_career_copies() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text;
BEGIN
  IF TG_OP='DELETE' THEN source_id=OLD.id;
  ELSIF NEW.rights='pending' THEN source_id=NEW.id;
  ELSE RETURN NEW;
  END IF;
  UPDATE creator_hiring_resume SET source_invalidated_at=COALESCE(source_invalidated_at,now()) WHERE id IN
    (SELECT resume_id FROM creator_hiring_resume_career_source WHERE career_id=source_id);
  UPDATE creator_hiring_application_snapshot SET resume_payload=NULL,redacted_at=COALESCE(redacted_at,now()),redaction_reason=COALESCE(redaction_reason,'career-rights-revoked')
    WHERE resume_version_id IN (SELECT v.id FROM creator_hiring_resume_version v JOIN creator_hiring_resume_career_source s ON s.resume_id=v.resume_id WHERE s.career_id=source_id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creator_hiring_career_copies_revoked BEFORE UPDATE OF rights OR DELETE ON creator_hiring_career
  FOR EACH ROW EXECUTE FUNCTION creator_hiring_revoke_career_copies();

-- Existing account deletion is a status update, not a physical DELETE. New private
-- payloads must be erased in that same transaction without altering legacy hosts.
CREATE OR REPLACE FUNCTION creator_hiring_account_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'active' THEN
    UPDATE creator_hiring_availability SET discoverable=false,notification_opt_in=false,revision=revision+1 WHERE user_id=NEW.id;
    UPDATE creator_hiring_commitment c SET state='cancelled' FROM creator_hiring_offer o
      WHERE c.offer_id=o.id AND c.state='reserved' AND (o.candidate_id=NEW.id OR o.recruiter_id=NEW.id);
    UPDATE creator_hiring_offer SET state='cancelled' WHERE (candidate_id=NEW.id OR recruiter_id=NEW.id) AND state IN ('pending','accepted');
    UPDATE creator_hiring_invitation SET state='cancelled' WHERE (candidate_id=NEW.id OR recruiter_id=NEW.id) AND state IN ('unread','read','interested');
    UPDATE creator_hiring_campaign c SET state='stopped' FROM creator_hiring_slot s,creator_collab_post p
      WHERE c.slot_id=s.id AND s.post_id=p.id AND p."userId"=NEW.id;
    UPDATE creator_hiring_slot s SET state=CASE WHEN p."userId"=NEW.id OR p.status<>'open' OR p.hidden OR p."deletedAt" IS NOT NULL OR p."deadlineAt"<=clock_timestamp() THEN 'paused' ELSE 'open' END,revision=s.revision+1,updated_at=now()
      FROM creator_collab_post p WHERE s.post_id=p.id AND s.state='reserved'
      AND (p."userId"=NEW.id OR EXISTS(SELECT 1 FROM creator_hiring_commitment c WHERE c.slot_id=s.id AND c.candidate_id=NEW.id AND c.state='cancelled'))
      AND NOT EXISTS(SELECT 1 FROM creator_hiring_commitment c WHERE c.slot_id=s.id AND c.state IN ('reserved','active'));
    UPDATE creator_hiring_outbox o SET state='failed' WHERE event_type='role-assignment-requested' AND state IN ('pending','processing')
      AND EXISTS(SELECT 1 FROM creator_hiring_commitment c JOIN creator_hiring_offer f ON f.id=c.offer_id WHERE c.id=o.aggregate_id AND c.state='cancelled' AND (f.candidate_id=NEW.id OR f.recruiter_id=NEW.id));
    UPDATE creator_hiring_room r SET epoch=epoch+1,status=CASE WHEN host_id=NEW.id THEN 'ended' ELSE status END
      WHERE status<>'ended' AND EXISTS(SELECT 1 FROM creator_hiring_admission a WHERE a.room_id=r.id AND a.user_id=NEW.id AND a.status<>'removed');
    UPDATE creator_hiring_admission a SET status='removed',epoch=r.epoch FROM creator_hiring_room r WHERE a.room_id=r.id AND a.user_id=NEW.id;
  END IF;
  IF NEW.status IN ('deleted','merged') THEN
    UPDATE creator_collab_application a SET status='withdrawn',message='',contact='',"portfolioUrl"='',"updatedAt"=now()
      WHERE a."userId"=NEW.id AND EXISTS(SELECT 1 FROM creator_hiring_application_snapshot s WHERE s.application_id=a.id);
    UPDATE creator_hiring_application_snapshot SET resume_payload=NULL,redacted_at=COALESCE(redacted_at,now()),redaction_reason=COALESCE(redaction_reason,'account-deleted') WHERE owner_id=NEW.id;
    DELETE FROM creator_hiring_resume WHERE user_id=NEW.id;
    DELETE FROM creator_hiring_career WHERE user_id=NEW.id;
    DELETE FROM creator_hiring_room_message WHERE user_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creator_hiring_account_unavailable AFTER UPDATE OF status ON "user"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION creator_hiring_account_unavailable();

-- Installed only after the complete atomic schema. All hiring HTTP transactions
-- call this invoker function; missing schema/ACL never falls back to memory.
CREATE FUNCTION creator_hiring_require_ready() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM source_invalidated_at FROM creator_hiring_resume LIMIT 0;
  PERFORM resume_payload,redacted_at FROM creator_hiring_application_snapshot LIMIT 0;
  PERFORM career_version_id FROM creator_hiring_resume_career_source LIMIT 0;
  PERFORM state FROM creator_hiring_outbox LIMIT 0;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid='creator_hiring_slot_one_commitment'::regclass
    AND indisunique AND indisvalid AND indpred IS NOT NULL) THEN
    RAISE EXCEPTION 'creator hiring capacity constraint missing';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
    AND tgrelid IN ('creator_hiring_resume_version'::regclass,'creator_hiring_career_version'::regclass,
      'creator_hiring_application_snapshot'::regclass,'creator_hiring_resume'::regclass,
      'creator_hiring_offer'::regclass,'creator_collab_application'::regclass,'creator_collab_post'::regclass,
      'creator_hiring_team_member'::regclass,'creator_hiring_career'::regclass,'"user"'::regclass)
    AND tgname IN ('creator_hiring_resume_version_immutable','creator_hiring_career_version_immutable',
      'creator_hiring_snapshot_immutable','creator_hiring_resume_deleted','creator_hiring_offer_immutable',
      'creator_hiring_application_withdrawn','creator_hiring_post_unavailable','creator_hiring_application_room_revoked',
      'creator_hiring_team_room_revoked','creator_hiring_career_copies_revoked','creator_hiring_account_unavailable')) <> 11 THEN
    RAISE EXCEPTION 'creator hiring privacy/immutability triggers missing';
  END IF;
END $$;
-- Functions are invoker-only; trigger execution uses the caller's bounded DML.
REVOKE ALL ON FUNCTION creator_hiring_redact_withdrawn_application(), creator_hiring_immutable_resume_version(),
  creator_hiring_redact_deleted_resume(), creator_hiring_snapshot_immutable(), creator_hiring_post_unavailable(),
  creator_hiring_offer_immutable(), creator_hiring_revoke_application_rooms(), creator_hiring_revoke_member_rooms(),
  creator_hiring_revoke_career_copies(), creator_hiring_account_unavailable() FROM PUBLIC;
REVOKE ALL ON FUNCTION creator_hiring_require_ready() FROM PUBLIC;
COMMIT;
