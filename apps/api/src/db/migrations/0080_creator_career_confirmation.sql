-- Pending 0079 integration: promote/register only through the owning coordinator.
-- Independent optional capability. No changes to 0078 functions, ACLs or relations.
BEGIN;
CREATE TABLE creator_career_confirmation_request (
  id uuid PRIMARY KEY,
  requester_id text NOT NULL CHECK(length(requester_id) BETWEEN 1 AND 128),
  target_id text NOT NULL CHECK(length(target_id) BETWEEN 1 AND 128),
  career_id text NOT NULL, version_id text NOT NULL,
  version_revision integer NOT NULL CHECK(version_revision BETWEEN 1 AND 2147483646),
  team_id text NOT NULL,
  requester_membership_revision integer NOT NULL CHECK(requester_membership_revision>0),
  target_membership_revision integer NOT NULL CHECK(target_membership_revision>0),
  snapshot jsonb,
  source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  consent text NOT NULL CHECK(consent='exact-version-2026-09-20'),
  state text NOT NULL DEFAULT 'requested', revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 days',
  confirmed_at timestamptz, redacted_at timestamptz, redaction_reason text,
  CONSTRAINT career_confirmation_audience CHECK(requester_id<>target_id),
  CONSTRAINT career_confirmation_state CHECK(state IN ('requested','confirmed','declined','revoked','expired') AND revision BETWEEN 1 AND 100000),
  CONSTRAINT career_confirmation_time CHECK(isfinite(created_at) AND isfinite(expires_at) AND expires_at>created_at AND expires_at<=created_at+interval '31 days'
    AND (confirmed_at IS NULL OR (isfinite(confirmed_at) AND confirmed_at>=created_at AND confirmed_at<expires_at))),
  CONSTRAINT career_confirmation_snapshot CHECK((snapshot IS NOT NULL AND jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=12000 AND redacted_at IS NULL AND redaction_reason IS NULL)
    OR (snapshot IS NULL AND redacted_at IS NOT NULL AND isfinite(redacted_at) AND redaction_reason IN ('source-changed','source-deleted','account-unavailable','relationship-ended','blocked')))
);
CREATE UNIQUE INDEX career_confirmation_active ON creator_career_confirmation_request(version_id,target_id) WHERE state IN ('requested','confirmed');
CREATE INDEX career_confirmation_sent ON creator_career_confirmation_request(requester_id,created_at DESC,id);
CREATE INDEX career_confirmation_received ON creator_career_confirmation_request(target_id,created_at DESC,id);
CREATE INDEX career_confirmation_source ON creator_career_confirmation_request(career_id);
CREATE INDEX career_confirmation_team ON creator_career_confirmation_request(team_id);
CREATE TABLE creator_career_confirmation_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES creator_career_confirmation_request(id),
  actor_id text CHECK(length(actor_id) BETWEEN 1 AND 128),
  action text NOT NULL CHECK(action IN ('requested','confirmed','declined','revoked','expired','redacted')),
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100000),
  reason text CHECK(reason IN ('source-changed','source-deleted','account-unavailable','relationship-ended','blocked')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(occurred_at)),
  UNIQUE(request_id,revision)
);
CREATE TABLE creator_career_confirmation_receipt (
  actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128), mutation_id uuid NOT NULL,
  request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
  PRIMARY KEY(actor_id,mutation_id)
);
-- IDs/digests are retained for audit/idempotency after deletion. No names, links,
-- contact, contribution, or snapshot content is copied to events/receipts.
CREATE FUNCTION creator_career_confirmation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME<>'creator_career_confirmation_request' OR TG_OP='DELETE' THEN
    RAISE EXCEPTION 'career confirmation audit is append only';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['state','revision','confirmed_at','snapshot','redacted_at','redaction_reason'])
     IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','confirmed_at','snapshot','redacted_at','redaction_reason']) THEN
    RAISE EXCEPTION 'career confirmation audience and source are immutable';
  END IF;
  IF NEW.revision<>OLD.revision+1 OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
    OR (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at AND NOT (OLD.state='requested' AND NEW.state='confirmed')) THEN
    RAISE EXCEPTION 'career confirmation revision is invalid';
  END IF;
  IF (NEW.snapshot,NEW.redacted_at,NEW.redaction_reason) IS DISTINCT FROM (OLD.snapshot,OLD.redacted_at,OLD.redaction_reason)
    AND NOT (OLD.snapshot IS NOT NULL AND OLD.redacted_at IS NULL AND NEW.snapshot IS NULL AND NEW.redacted_at IS NOT NULL AND NEW.redaction_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'career confirmation permits one way redaction only';
  END IF;
  IF NOT ((OLD.state='requested' AND NEW.state IN ('confirmed','declined','revoked','expired'))
    OR (OLD.state='confirmed' AND NEW.state IN ('revoked','expired'))
    OR (OLD.state=NEW.state AND OLD.snapshot IS NOT NULL AND NEW.snapshot IS NULL)) THEN
    RAISE EXCEPTION 'career confirmation transition is invalid';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER career_confirmation_immutable BEFORE UPDATE OR DELETE ON creator_career_confirmation_request FOR EACH ROW EXECUTE FUNCTION creator_career_confirmation_immutable();
CREATE TRIGGER career_confirmation_event_immutable BEFORE UPDATE OR DELETE ON creator_career_confirmation_event FOR EACH ROW EXECUTE FUNCTION creator_career_confirmation_immutable();
CREATE TRIGGER career_confirmation_receipt_immutable BEFORE UPDATE OR DELETE ON creator_career_confirmation_receipt FOR EACH ROW EXECUTE FUNCTION creator_career_confirmation_immutable();

-- Parent mutations already own their source/account/member row locks. Confirmation
-- commands acquire accounts -> bilateral-block advisory lock -> career -> team ->
-- request, never request -> parent. These invoker triggers never lock another parent.
CREATE FUNCTION creator_career_confirmation_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reason text; source_id text; account_id text; team_id_value text; member_id text; first_id text; second_id text;
BEGIN
  IF TG_TABLE_NAME='creator_hiring_career' THEN
    IF TG_OP='DELETE' THEN reason:='source-deleted';
    ELSIF (NEW.revision,NEW.rights,NEW.visibility,NEW.content) IS NOT DISTINCT FROM (OLD.revision,OLD.rights,OLD.visibility,OLD.content) THEN RETURN NEW;
    ELSE reason:='source-changed'; END IF;
    source_id:=OLD.id;
  ELSIF TG_TABLE_NAME='user' THEN
    IF TG_OP='UPDATE' AND (NEW.status='active' OR NEW.status IS NOT DISTINCT FROM OLD.status) THEN RETURN NEW; END IF;
    reason:='account-unavailable'; account_id:=OLD.id;
  ELSIF TG_TABLE_NAME='creator_hiring_team_member' THEN
    IF TG_OP='UPDATE' AND NEW.status='active' AND NEW.invite_revision=OLD.invite_revision THEN RETURN NEW; END IF;
    reason:='relationship-ended'; team_id_value:=OLD.team_id; member_id:=OLD.user_id;
  ELSE
    reason:='blocked'; first_id:=NEW."blockerId"; second_id:=NEW."blockedUserId";
    PERFORM pg_advisory_xact_lock(hashtextextended('career-confirmation-pair:'||least(first_id,second_id)||':'||greatest(first_id,second_id),0));
  END IF;
  WITH changed AS (
    UPDATE creator_career_confirmation_request SET snapshot=NULL,redacted_at=clock_timestamp(),redaction_reason=reason,
      state=CASE WHEN state IN ('requested','confirmed') THEN 'revoked' ELSE state END,revision=revision+1
    WHERE snapshot IS NOT NULL AND (
      (source_id IS NOT NULL AND career_id=source_id) OR
      (account_id IS NOT NULL AND (requester_id=account_id OR target_id=account_id)) OR
      (team_id_value IS NOT NULL AND team_id=team_id_value AND (requester_id=member_id OR target_id=member_id)) OR
      (first_id IS NOT NULL AND ((requester_id=first_id AND target_id=second_id) OR (requester_id=second_id AND target_id=first_id))))
    RETURNING id,revision
  ) INSERT INTO creator_career_confirmation_event(request_id,action,revision,reason) SELECT id,'redacted',revision,reason FROM changed;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER career_confirmation_source BEFORE UPDATE OR DELETE ON creator_hiring_career FOR EACH ROW EXECUTE FUNCTION creator_career_confirmation_invalidate();
CREATE TRIGGER career_confirmation_account BEFORE UPDATE OF status OR DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION creator_career_confirmation_invalidate();
CREATE TRIGGER career_confirmation_member BEFORE UPDATE OR DELETE ON creator_hiring_team_member FOR EACH ROW EXECUTE FUNCTION creator_career_confirmation_invalidate();
CREATE TRIGGER career_confirmation_block BEFORE INSERT OR UPDATE ON member_message_block FOR EACH ROW EXECUTE FUNCTION creator_career_confirmation_invalidate();

CREATE FUNCTION creator_career_confirmation_require_ready() RETURNS void LANGUAGE plpgsql AS $$
DECLARE contract record; rel oid; attr record; privilege text; expected boolean; fn record;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    OR has_schema_privilege(current_user,current_schema(),'CREATE') THEN
    RAISE EXCEPTION 'career confirmation runtime must not own or provision schema';
  END IF;
  FOR contract IN SELECT * FROM (VALUES
    ('creator_career_confirmation_request',ARRAY['state','revision','confirmed_at','snapshot','redacted_at','redaction_reason']::text[]),
    ('creator_career_confirmation_event',ARRAY[]::text[]),('creator_career_confirmation_receipt',ARRAY[]::text[])) AS contracts(name,updates) LOOP
    rel:=to_regclass(contract.name);
    IF rel IS NULL OR EXISTS(SELECT 1 FROM pg_class WHERE oid=rel AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN RAISE EXCEPTION 'career confirmation table unavailable'; END IF;
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      expected:=privilege IN ('SELECT','INSERT');
      IF has_table_privilege(current_user,rel,privilege) IS DISTINCT FROM expected OR has_table_privilege(current_user,rel,privilege||' WITH GRANT OPTION') OR has_table_privilege(0::oid,rel,privilege) THEN RAISE EXCEPTION 'career confirmation table ACL drift'; END IF;
    END LOOP;
    FOR attr IN SELECT attname FROM pg_attribute WHERE attrelid=rel AND attnum>0 AND NOT attisdropped LOOP
      FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
        expected:=privilege IN ('SELECT','INSERT') OR (privilege='UPDATE' AND attr.attname::text=ANY(contract.updates));
        IF has_column_privilege(current_user,rel,attr.attname,privilege) IS DISTINCT FROM expected OR has_column_privilege(current_user,rel,attr.attname,privilege||' WITH GRANT OPTION') OR has_column_privilege(0::oid,rel,attr.attname,privilege) THEN RAISE EXCEPTION 'career confirmation column ACL drift'; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOR fn IN SELECT * FROM (VALUES ('creator_career_confirmation_immutable',false),('creator_career_confirmation_invalidate',false),('creator_career_confirmation_require_ready',true)) AS functions(name,executable) LOOP
    IF to_regprocedure(fn.name||'()') IS NULL THEN RAISE EXCEPTION 'career confirmation function missing'; END IF;
    IF has_function_privilege(0::oid,fn.name||'()','EXECUTE') OR has_function_privilege(current_user,fn.name||'()','EXECUTE') IS DISTINCT FROM fn.executable
      OR has_function_privilege(current_user,fn.name||'()','EXECUTE WITH GRANT OPTION') OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(fn.name||'()') AND prosecdef) THEN RAISE EXCEPTION 'career confirmation function ACL drift'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND (tgname,tgrelid,tgfoid) IN (
    ('career_confirmation_immutable','creator_career_confirmation_request'::regclass,'creator_career_confirmation_immutable()'::regprocedure),
    ('career_confirmation_event_immutable','creator_career_confirmation_event'::regclass,'creator_career_confirmation_immutable()'::regprocedure),
    ('career_confirmation_receipt_immutable','creator_career_confirmation_receipt'::regclass,'creator_career_confirmation_immutable()'::regprocedure),
    ('career_confirmation_source','creator_hiring_career'::regclass,'creator_career_confirmation_invalidate()'::regprocedure),
    ('career_confirmation_account','"user"'::regclass,'creator_career_confirmation_invalidate()'::regprocedure),
    ('career_confirmation_member','creator_hiring_team_member'::regclass,'creator_career_confirmation_invalidate()'::regprocedure),
    ('career_confirmation_block','member_message_block'::regclass,'creator_career_confirmation_invalidate()'::regprocedure)))<>7 THEN RAISE EXCEPTION 'career confirmation triggers missing'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='creator_career_confirmation_request'::regclass AND convalidated AND conname IN ('career_confirmation_audience','career_confirmation_state','career_confirmation_time','career_confirmation_snapshot'))<>4
    OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('career_confirmation_active') AND indisvalid AND indisunique AND indpred IS NOT NULL) THEN RAISE EXCEPTION 'career confirmation constraints missing'; END IF;
  PERFORM id,version_id,source_digest,snapshot,redacted_at FROM creator_career_confirmation_request LIMIT 0;
  PERFORM request_id,action,revision FROM creator_career_confirmation_event LIMIT 0;
  PERFORM actor_id,mutation_id,request_digest,result FROM creator_career_confirmation_receipt LIMIT 0;
END $$;
REVOKE ALL ON TABLE creator_career_confirmation_request,creator_career_confirmation_event,creator_career_confirmation_receipt FROM PUBLIC;
REVOKE ALL ON FUNCTION creator_career_confirmation_immutable(),creator_career_confirmation_invalidate(),creator_career_confirmation_require_ready() FROM PUBLIC;
COMMIT;
