-- Additive review policy history. Production application requires a separately approved migration.
-- This file is never executed on application startup; no existing approval is reinterpreted.
CREATE TABLE IF NOT EXISTS studio_review_policy (
  "reviewId" text PRIMARY KEY REFERENCES studio_review(id) ON DELETE CASCADE,
  "revisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE RESTRICT,
  "rootGraphHash" text NOT NULL,
  "policyVersion" integer NOT NULL,
  "stateVersion" integer NOT NULL,
  definition jsonb NOT NULL,
  "configuredBy" text NOT NULL,
  "configuredAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_review_policy_version_check CHECK ("policyVersion" > 0 AND "stateVersion" >= "policyVersion"),
  CONSTRAINT studio_review_policy_hash_check CHECK ("rootGraphHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT studio_review_policy_definition_check CHECK (jsonb_typeof(definition) = 'object' AND octet_length(definition::text) <= 262144)
);
CREATE TABLE IF NOT EXISTS studio_review_policy_event (
  id text PRIMARY KEY,
  "reviewId" text NOT NULL REFERENCES studio_review_policy("reviewId") ON DELETE CASCADE,
  "policyVersion" integer NOT NULL, "stateVersion" integer NOT NULL,
  kind text NOT NULL, "actorId" text NOT NULL, "commandHash" text NOT NULL, payload jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_review_policy_event_order_unique UNIQUE ("reviewId", "stateVersion"),
  CONSTRAINT studio_review_policy_event_kind_check CHECK (kind IN ('configure', 'vote')),
  CONSTRAINT studio_review_policy_event_version_check CHECK ("policyVersion" > 0 AND "stateVersion" >= "policyVersion"),
  CONSTRAINT studio_review_policy_event_hash_check CHECK ("commandHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT studio_review_policy_event_payload_check CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 262144)
);
CREATE INDEX IF NOT EXISTS studio_review_policy_event_epoch_idx ON studio_review_policy_event ("reviewId", "policyVersion", "stateVersion");
CREATE OR REPLACE FUNCTION studio_review_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reviewed record; item jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only parent-review removal from the existing whole-work deletion can cascade.
    IF NOT EXISTS (SELECT 1 FROM studio_review WHERE id = OLD."reviewId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'review policy history is retained' USING ERRCODE = '55000';
  END IF;
  SELECT r.status, r."revisionId", v."rootGraphHash" INTO reviewed FROM studio_review r
    JOIN studio_revision v ON v.id = r."revisionId" WHERE r.id = NEW."reviewId" FOR UPDATE OF r;
  IF NOT FOUND OR reviewed.status NOT IN ('open', 'changes-requested')
    OR NEW."revisionId" <> reviewed."revisionId" OR NEW."rootGraphHash" <> reviewed."rootGraphHash" THEN
    RAISE EXCEPTION 'policy must reference an active exact review revision' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."reviewId" <> OLD."reviewId" OR NEW."revisionId" <> OLD."revisionId"
    OR NEW."rootGraphHash" <> OLD."rootGraphHash" OR NEW."stateVersion" <> OLD."stateVersion" + 1
    OR NEW."policyVersion" NOT IN (OLD."policyVersion", OLD."policyVersion" + 1)) THEN
    RAISE EXCEPTION 'invalid review policy transition' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NEW.definition->>'mode','') NOT IN ('parallel', 'sequential') OR jsonb_typeof(NEW.definition->'groups') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.definition->'groups') NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'invalid review policy definition' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."policyVersion" = OLD."policyVersion" AND
    (NEW.definition IS DISTINCT FROM OLD.definition OR NEW."configuredBy" <> OLD."configuredBy" OR NEW."configuredAt" <> OLD."configuredAt") THEN
    RAISE EXCEPTION 'policy content requires a new policy version' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.definition->'groups')) THEN
    RAISE EXCEPTION 'duplicate review group' USING ERRCODE = '23514';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.definition->'groups') LOOP
    IF jsonb_typeof(item->'requiredApprovals') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'reviewerIds') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'reviewerIds') NOT BETWEEN 1 AND 64
      OR (item->>'requiredApprovals')::integer NOT BETWEEN 1 AND jsonb_array_length(item->'reviewerIds') THEN
      RAISE EXCEPTION 'invalid group quorum' USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements_text(item->'reviewerIds')) THEN
      RAISE EXCEPTION 'duplicate reviewers in group' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_review_policy_guard_trigger ON studio_review_policy;
CREATE TRIGGER studio_review_policy_guard_trigger BEFORE INSERT OR UPDATE OR DELETE ON studio_review_policy FOR EACH ROW EXECUTE FUNCTION studio_review_policy_guard();
CREATE OR REPLACE FUNCTION studio_review_policy_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy record;
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM studio_review_policy WHERE "reviewId" = OLD."reviewId") THEN
    RETURN OLD;
  END IF;
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'review policy events are append only' USING ERRCODE = '55000'; END IF;
  SELECT p."policyVersion", p."stateVersion", r.status INTO policy FROM studio_review_policy p
    JOIN studio_review r ON r.id = p."reviewId" WHERE p."reviewId" = NEW."reviewId" FOR UPDATE OF r;
  IF NOT FOUND OR policy.status NOT IN ('open', 'changes-requested') OR NEW."policyVersion" <> policy."policyVersion"
    OR NEW."stateVersion" <> policy."stateVersion" THEN
    RAISE EXCEPTION 'policy event epoch is not current' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_review_policy_event_guard_trigger ON studio_review_policy_event;
CREATE TRIGGER studio_review_policy_event_guard_trigger BEFORE INSERT OR UPDATE OR DELETE ON studio_review_policy_event FOR EACH ROW EXECUTE FUNCTION studio_review_policy_event_guard();
CREATE OR REPLACE FUNCTION studio_review_group_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy record; group_spec jsonb; owner_id text; work_id text; approvals integer; changes integer; last_vote integer; barrier integer := 0;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;
  SELECT * INTO policy FROM studio_review_policy WHERE "reviewId" = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT w.id, w."userId" INTO work_id, owner_id FROM studio_artifact a
    JOIN studio_project_graph p ON p.id = a."projectId" JOIN creator_work w ON w.id = p."workId"
    WHERE a.id = NEW."artifactId" FOR SHARE OF w;
  PERFORM 1 FROM creator_work_collaborator m WHERE m."workId" = work_id ORDER BY m."userId" FOR SHARE;
  FOR group_spec IN SELECT value FROM jsonb_array_elements(policy.definition->'groups') LOOP
    WITH latest AS (
      SELECT DISTINCT ON (e."actorId") e."actorId", e."stateVersion", e.payload->>'decision' AS decision
      FROM studio_review_policy_event e WHERE e."reviewId" = NEW.id AND e."policyVersion" = policy."policyVersion"
        AND e.kind = 'vote' AND e.payload->>'groupId' = group_spec->>'id'
        AND group_spec->'reviewerIds' ? e."actorId" ORDER BY e."actorId", e."stateVersion" DESC
    ), valid AS (
      SELECT l.*, EXISTS(SELECT 1 FROM studio_review_reviewer rr WHERE rr."reviewId" = NEW.id AND rr."reviewerUserId" = l."actorId")
        AND (l."actorId" = owner_id OR EXISTS(SELECT 1 FROM creator_work_collaborator m
          WHERE m."workId" = work_id AND m."userId" = l."actorId" AND m.status = 'active'
            AND m.role IN ('admin','editor','commenter','viewer')))
        AND (policy.definition->>'mode' = 'parallel' OR l."stateVersion" > barrier) AS usable FROM latest l
    ) SELECT COUNT(*) FILTER (WHERE usable AND decision = 'approve'), COUNT(*) FILTER (WHERE usable AND decision = 'request-changes'),
        COALESCE(MAX("stateVersion"),0) INTO approvals, changes, last_vote FROM valid;
    IF approvals < (group_spec->>'requiredApprovals')::integer OR changes > 0 THEN
      RAISE EXCEPTION 'review group approval requirements are not satisfied' USING ERRCODE = '23514';
    END IF;
    barrier := GREATEST(barrier, last_vote);
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_review_group_approval_check ON studio_review;
CREATE TRIGGER studio_review_group_approval_check BEFORE UPDATE OF status ON studio_review FOR EACH ROW EXECUTE FUNCTION studio_review_group_approval_guard();
COMMENT ON TABLE studio_review_policy IS 'Versioned policy of one immutable review; existing approvals without a policy are unchanged';
COMMENT ON TABLE studio_review_policy_event IS 'Append-only configuration and group vote receipts; runtime never changes actor or server time';
