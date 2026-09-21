-- Additive continuation of 0082; never rewrite a previously applied migration.
-- Existing events remain immutable. Unbound legacy votes require fresh confirmation.
-- Completed review decisions are not changed; no migration executes at API startup.
ALTER TABLE studio_review_policy_event ADD COLUMN IF NOT EXISTS "accessEpoch" text;

CREATE OR REPLACE FUNCTION studio_review_policy_actor_epoch(review_id text, actor_id text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id=actor_id AND u.status='active') THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM studio_review_reviewer rr WHERE rr."reviewId"=r.id AND rr."reviewerUserId"=actor_id) THEN NULL
    WHEN w."userId"=actor_id THEN 'owner:' || actor_id
    WHEN m.status='active' AND m.role IN ('admin','editor','commenter','viewer') THEN
      'member:' || jsonb_build_array(m."invitationId", m.role, extract(epoch FROM m."updatedAt"))::text
    ELSE NULL END
  FROM studio_review r JOIN studio_artifact a ON a.id=r."artifactId"
  JOIN studio_project_graph p ON p.id=a."projectId" JOIN creator_work w ON w.id=p."workId"
  LEFT JOIN creator_work_collaborator m ON m."workId"=w.id AND m."userId"=actor_id
  WHERE r.id=review_id
$$;

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
  IF NEW.kind='vote' AND (NEW."accessEpoch" IS NULL OR NEW."accessEpoch" IS DISTINCT FROM studio_review_policy_actor_epoch(NEW."reviewId", NEW."actorId")) THEN
    RAISE EXCEPTION 'vote membership epoch is not current' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION studio_review_group_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy record; group_spec jsonb; owner_id text; work_id text; approvals integer; changes integer; last_vote integer; barrier integer := 0;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;
  SELECT * INTO policy FROM studio_review_policy WHERE "reviewId" = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT w.id, w."userId" INTO work_id, owner_id FROM studio_artifact a
    JOIN studio_project_graph p ON p.id = a."projectId" JOIN creator_work w ON w.id = p."workId"
    WHERE a.id = NEW."artifactId" FOR SHARE OF w;
  PERFORM 1 FROM "user" u WHERE u.id IN (SELECT "reviewerUserId" FROM studio_review_reviewer WHERE "reviewId"=NEW.id) ORDER BY u.id FOR SHARE;
  PERFORM 1 FROM creator_work_collaborator m WHERE m."workId" = work_id ORDER BY m."userId" FOR SHARE;
  FOR group_spec IN SELECT value FROM jsonb_array_elements(policy.definition->'groups') LOOP
    WITH latest AS (
      SELECT DISTINCT ON (e."actorId") e."actorId", e."stateVersion", e."accessEpoch", e.payload->>'decision' AS decision
      FROM studio_review_policy_event e WHERE e."reviewId" = NEW.id AND e."policyVersion" = policy."policyVersion"
        AND e.kind = 'vote' AND e.payload->>'groupId' = group_spec->>'id'
        AND group_spec->'reviewerIds' ? e."actorId" ORDER BY e."actorId", e."stateVersion" DESC
    ), valid AS (
      SELECT l.*, EXISTS(SELECT 1 FROM studio_review_reviewer rr WHERE rr."reviewId" = NEW.id AND rr."reviewerUserId" = l."actorId")
        AND (l."actorId" = owner_id OR EXISTS(SELECT 1 FROM creator_work_collaborator m
          WHERE m."workId" = work_id AND m."userId" = l."actorId" AND m.status = 'active'
            AND m.role IN ('admin','editor','commenter','viewer')))
        AND l."accessEpoch" = studio_review_policy_actor_epoch(NEW.id, l."actorId")
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
