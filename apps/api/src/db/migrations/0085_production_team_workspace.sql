BEGIN;
-- Team organizations do not replace per-work production documents or work ACLs.
CREATE TABLE IF NOT EXISTS production_team_workspace (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 20),
  owner_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_team_workspace_owner ON production_team_workspace(owner_user_id, id);
CREATE TABLE IF NOT EXISTS production_team_member (
  workspace_id text NOT NULL REFERENCES production_team_workspace(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','member','guest')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS production_team_one_owner ON production_team_member(workspace_id) WHERE role='owner';
CREATE INDEX IF NOT EXISTS production_team_member_user ON production_team_member(user_id, workspace_id);
CREATE TABLE IF NOT EXISTS production_team_invite (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES production_team_workspace(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 320),
  role text NOT NULL CHECK (role IN ('admin','member','guest')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL REFERENCES "user"(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS production_team_pending_invite ON production_team_invite(workspace_id,email)
  WHERE revoked_at IS NULL AND accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS production_team_invite_workspace ON production_team_invite(workspace_id,expires_at);
CREATE TABLE IF NOT EXISTS production_team_project (
  project_id text PRIMARY KEY REFERENCES production_project(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES production_team_workspace(id) ON DELETE RESTRICT,
  linked_by text NOT NULL REFERENCES "user"(id),
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_team_project_workspace ON production_team_project(workspace_id,project_id);
CREATE TABLE IF NOT EXISTS production_team_receipt (
  actor_user_id text NOT NULL REFERENCES "user"(id),
  mutation_id uuid NOT NULL,
  workspace_id text NOT NULL REFERENCES production_team_workspace(id) ON DELETE CASCADE,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id,mutation_id)
);
CREATE TABLE IF NOT EXISTS production_team_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES production_team_workspace(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL REFERENCES "user"(id),
  action text NOT NULL,
  target_id text NOT NULL,
  revision integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_team_audit_workspace ON production_team_audit(workspace_id,id DESC);
-- Deferred canonical-owner invariant permits an atomic transfer, never an ownerless workspace.
CREATE OR REPLACE FUNCTION check_production_team_owner() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE workspace_key text;
BEGIN
  IF TG_TABLE_NAME='production_team_workspace' THEN
    workspace_key := COALESCE(NEW.id, OLD.id);
  ELSE
    workspace_key := COALESCE(NEW.workspace_id, OLD.workspace_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_team_workspace w WHERE w.id=workspace_key AND NOT EXISTS (
      SELECT 1 FROM public.production_team_member m WHERE m.workspace_id=w.id
        AND m.user_id=w.owner_user_id AND m.role='owner')) THEN
    RAISE EXCEPTION 'workspace must retain its canonical owner membership' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS production_team_owner_identity ON production_team_workspace;
CREATE CONSTRAINT TRIGGER production_team_owner_identity
  AFTER INSERT OR UPDATE ON production_team_workspace DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_production_team_owner();
DROP TRIGGER IF EXISTS production_team_member_owner_identity ON production_team_member;
CREATE CONSTRAINT TRIGGER production_team_member_owner_identity
  AFTER INSERT OR UPDATE OR DELETE ON production_team_member DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_production_team_owner();

REVOKE ALL ON TABLE public.production_team_workspace, public.production_team_member, public.production_team_invite, public.production_team_project, public.production_team_receipt, public.production_team_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.production_team_audit_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_production_team_owner() FROM PUBLIC;

COMMIT;
