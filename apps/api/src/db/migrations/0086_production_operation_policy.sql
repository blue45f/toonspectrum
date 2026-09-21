BEGIN;
-- Global production operating mode; no subscription or payment activation.
CREATE TABLE IF NOT EXISTS production_operation_policy (
  id integer PRIMARY KEY CHECK (id=1),
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND payload->>'schemaVersion'='1' AND payload->>'mode' IN ('free','paid')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS production_operation_policy_audit (
  revision integer PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  before_digest text NOT NULL CHECK (before_digest ~ '^[a-f0-9]{64}$'),
  after_digest text NOT NULL CHECK (after_digest ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS production_operation_policy_receipt (
  actor_user_id text NOT NULL REFERENCES "user"(id),
  mutation_id uuid NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  accepted_revision integer NOT NULL REFERENCES production_operation_policy_audit(revision),
  PRIMARY KEY(actor_user_id,mutation_id)
);
INSERT INTO production_operation_policy(id,payload) VALUES(1,'{"schemaVersion":1,"mode":"free","profiles":{"free":{"limits":{"ownedWorkspaces":2,"projectsPerWorkspace":5,"membersPerWorkspace":10},"features":{"team-workspace":true,"licensed-assets":false,"ai-shading":false},"notice":"현재 무료 운영 중입니다. 공통 이용 한도와 작품별 권한이 적용됩니다."},"paid":{"limits":{"ownedWorkspaces":2,"projectsPerWorkspace":5,"membersPerWorkspace":10},"features":{"team-workspace":true,"licensed-assets":false,"ai-shading":false},"notice":"유료 운영 정책이 적용됩니다. 별도 동의 없이 요금이 청구되지 않으며 결제는 아직 제공하지 않습니다."}},"releaseReview":{"state":"pending","approvedModes":[],"subjectDigest":"","evidenceRef":"","validUntil":null},"featureReviews":{"licensed-assets":{"state":"pending","approvedModes":[],"subjectDigest":"","evidenceRef":"","validUntil":null},"ai-shading":{"state":"pending","approvedModes":[],"subjectDigest":"","evidenceRef":"","validUntil":null}}}'::jsonb) ON CONFLICT(id) DO NOTHING;

REVOKE ALL ON TABLE public.production_operation_policy, public.production_operation_policy_audit, public.production_operation_policy_receipt FROM PUBLIC;

COMMIT;
