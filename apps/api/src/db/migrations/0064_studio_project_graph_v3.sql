BEGIN;

CREATE TABLE IF NOT EXISTS studio_project_graph (
  id text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES creator_work(id) ON DELETE CASCADE,
  "schemaVersion" integer NOT NULL DEFAULT 3,
  "authorityVersion" text NOT NULL DEFAULT 'legacy-v2',
  "ownerUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_project_graph_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_project_graph_schema_check CHECK ("schemaVersion" = 3),
  CONSTRAINT studio_project_graph_authority_check CHECK (
    "authorityVersion" IN ('legacy-v2', 'project-graph-v3')
  ),
  CONSTRAINT studio_project_graph_time_check CHECK ("updatedAt" >= "createdAt")
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_project_graph_work_unique
  ON studio_project_graph("workId");
CREATE INDEX IF NOT EXISTS idx_studio_project_graph_owner_updated
  ON studio_project_graph("ownerUserId", "updatedAt" DESC, id);

CREATE TABLE IF NOT EXISTS studio_artifact (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES studio_project_graph(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  scope jsonb NOT NULL,
  "headRevisionId" text NOT NULL,
  "approvedRevisionId" text,
  "ownerWorkspaceId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_artifact_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_artifact_kind_check CHECK (kind IN (
    'story', 'storyboard', 'canvas-2d', 'scene-3d', 'asset', 'audio',
    'localization', 'review-snapshot', 'deliverable', 'release'
  )),
  CONSTRAINT studio_artifact_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  CONSTRAINT studio_artifact_scope_check CHECK (
    jsonb_typeof(scope) = 'object' AND scope->>'projectId' = "projectId"
  ),
  CONSTRAINT studio_artifact_time_check CHECK ("updatedAt" >= "createdAt")
);

CREATE INDEX IF NOT EXISTS idx_studio_artifact_project_kind_updated
  ON studio_artifact("projectId", kind, "updatedAt" DESC, id);
CREATE INDEX IF NOT EXISTS idx_studio_artifact_scope_gin
  ON studio_artifact USING gin(scope jsonb_path_ops);

CREATE TABLE IF NOT EXISTS studio_revision (
  id text PRIMARY KEY,
  "artifactId" text NOT NULL REFERENCES studio_artifact(id) ON DELETE CASCADE,
  kind text NOT NULL,
  "rootGraphHash" text NOT NULL,
  "operationFirst" bigint,
  "operationLast" bigint,
  "createdBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "deviceId" text NOT NULL,
  "createdAt" timestamptz NOT NULL,
  message text,
  "compatibilityReportId" text,
  "provenanceManifestId" text,
  CONSTRAINT studio_revision_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_revision_kind_check CHECK (kind IN (
    'autosave', 'checkpoint', 'submission', 'review-snapshot', 'approved', 'release'
  )),
  CONSTRAINT studio_revision_hash_check CHECK ("rootGraphHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_revision_operation_range_check CHECK (
    ("operationFirst" IS NULL AND "operationLast" IS NULL)
    OR ("operationFirst" > 0 AND "operationLast" >= "operationFirst")
  ),
  CONSTRAINT studio_revision_device_check CHECK (length("deviceId") BETWEEN 1 AND 160),
  CONSTRAINT studio_revision_message_check CHECK (message IS NULL OR length(btrim(message)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_studio_revision_artifact_created
  ON studio_revision("artifactId", "createdAt" DESC, id);
CREATE INDEX IF NOT EXISTS idx_studio_revision_kind_created
  ON studio_revision(kind, "createdAt" DESC, id);

DO $$
BEGIN
  ALTER TABLE studio_artifact
    ADD CONSTRAINT studio_artifact_head_revision_fk
    FOREIGN KEY ("headRevisionId") REFERENCES studio_revision(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE studio_artifact
    ADD CONSTRAINT studio_artifact_approved_revision_fk
    FOREIGN KEY ("approvedRevisionId") REFERENCES studio_revision(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS studio_revision_parent (
  "revisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE CASCADE,
  "parentRevisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL,
  PRIMARY KEY ("revisionId", "parentRevisionId"),
  CONSTRAINT studio_revision_parent_ordinal_unique UNIQUE ("revisionId", ordinal),
  CONSTRAINT studio_revision_parent_self_check CHECK ("revisionId" <> "parentRevisionId"),
  CONSTRAINT studio_revision_parent_ordinal_check CHECK (ordinal BETWEEN 0 AND 15)
);

CREATE INDEX IF NOT EXISTS idx_studio_revision_parent_parent
  ON studio_revision_parent("parentRevisionId", "revisionId");

CREATE TABLE IF NOT EXISTS studio_blob (
  hash text PRIMARY KEY,
  size bigint NOT NULL,
  "mediaType" text NOT NULL,
  "objectKey" text NOT NULL,
  "encryptionMetadata" jsonb,
  "malwareStatus" text NOT NULL DEFAULT 'pending',
  "formatStatus" text NOT NULL DEFAULT 'pending',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_blob_hash_check CHECK (hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_blob_size_check CHECK (size >= 0),
  CONSTRAINT studio_blob_media_type_check CHECK (length(btrim("mediaType")) BETWEEN 1 AND 160),
  CONSTRAINT studio_blob_object_key_check CHECK (length(btrim("objectKey")) BETWEEN 1 AND 2048),
  CONSTRAINT studio_blob_encryption_check CHECK (
    "encryptionMetadata" IS NULL OR jsonb_typeof("encryptionMetadata") = 'object'
  ),
  CONSTRAINT studio_blob_malware_check CHECK ("malwareStatus" IN ('pending', 'clean', 'blocked', 'failed')),
  CONSTRAINT studio_blob_format_check CHECK ("formatStatus" IN ('pending', 'valid', 'invalid', 'unsupported'))
);

CREATE TABLE IF NOT EXISTS studio_revision_blob (
  "revisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE CASCADE,
  "blobHash" text NOT NULL REFERENCES studio_blob(hash) ON DELETE RESTRICT,
  role text NOT NULL,
  ordinal integer NOT NULL,
  PRIMARY KEY ("revisionId", "blobHash", role),
  CONSTRAINT studio_revision_blob_ordinal_unique UNIQUE ("revisionId", role, ordinal),
  CONSTRAINT studio_revision_blob_role_check CHECK (role IN (
    'graph', 'tile', 'vector', 'source', 'thumbnail', 'preview',
    'export', 'license', 'provenance'
  )),
  CONSTRAINT studio_revision_blob_ordinal_check CHECK (ordinal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_studio_revision_blob_hash
  ON studio_revision_blob("blobHash", "revisionId");

CREATE TABLE IF NOT EXISTS studio_operation (
  "artifactId" text NOT NULL REFERENCES studio_artifact(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  "commandId" text NOT NULL,
  "baseRevisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE RESTRICT,
  "resultRevisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE RESTRICT,
  "actorUserId" text REFERENCES "user"(id) ON DELETE SET NULL,
  "deviceId" text NOT NULL,
  "commandType" text NOT NULL,
  scope jsonb NOT NULL,
  "payloadHash" text NOT NULL,
  operation jsonb NOT NULL,
  "issuedAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("artifactId", sequence),
  CONSTRAINT studio_operation_command_unique UNIQUE ("artifactId", "commandId"),
  CONSTRAINT studio_operation_sequence_check CHECK (sequence > 0),
  CONSTRAINT studio_operation_command_check CHECK (length("commandId") BETWEEN 1 AND 160),
  CONSTRAINT studio_operation_device_check CHECK (length("deviceId") BETWEEN 1 AND 160),
  CONSTRAINT studio_operation_type_check CHECK (
    "commandType" ~ '^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$'
  ),
  CONSTRAINT studio_operation_scope_check CHECK (jsonb_typeof(scope) = 'object'),
  CONSTRAINT studio_operation_payload_hash_check CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_operation_json_check CHECK (jsonb_typeof(operation) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_studio_operation_result_revision
  ON studio_operation("resultRevisionId");
CREATE INDEX IF NOT EXISTS idx_studio_operation_actor_created
  ON studio_operation("actorUserId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS studio_mutation_receipt (
  "artifactId" text NOT NULL REFERENCES studio_artifact(id) ON DELETE CASCADE,
  "actorUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "idempotencyKeyHash" text NOT NULL,
  "requestHash" text NOT NULL,
  "resultRevisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE RESTRICT,
  response jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("artifactId", "actorUserId", "idempotencyKeyHash"),
  CONSTRAINT studio_mutation_receipt_key_hash_check CHECK ("idempotencyKeyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_mutation_receipt_request_hash_check CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_mutation_receipt_response_check CHECK (jsonb_typeof(response) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_studio_mutation_receipt_created
  ON studio_mutation_receipt("createdAt");

CREATE TABLE IF NOT EXISTS studio_compatibility_report (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES studio_project_graph(id) ON DELETE CASCADE,
  "artifactId" text REFERENCES studio_artifact(id) ON DELETE SET NULL,
  "sourceFormat" text NOT NULL,
  "sourceFileName" text NOT NULL,
  "sourceHash" text NOT NULL,
  "sourceSize" bigint NOT NULL,
  grade text NOT NULL,
  summary jsonb NOT NULL,
  items jsonb NOT NULL,
  "requiresApproval" boolean NOT NULL,
  "approvedBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "approvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_compatibility_report_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_compatibility_report_format_check CHECK ("sourceFormat" IN (
    'psd', 'psb', 'png', 'jpeg', 'webp', 'tiff', 'clip', 'cmc', 'ora', 'svg',
    'gltf', 'glb', 'vrm', 'obj', 'fbx', 'usd', 'usdz', 'dae', 'stl', 'hdr', 'exr', 'unknown'
  )),
  CONSTRAINT studio_compatibility_report_file_check CHECK (length(btrim("sourceFileName")) BETWEEN 1 AND 1024),
  CONSTRAINT studio_compatibility_report_hash_check CHECK ("sourceHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_compatibility_report_size_check CHECK ("sourceSize" >= 0),
  CONSTRAINT studio_compatibility_report_grade_check CHECK (grade IN ('A', 'B', 'C', 'D')),
  CONSTRAINT studio_compatibility_report_summary_check CHECK (jsonb_typeof(summary) = 'object'),
  CONSTRAINT studio_compatibility_report_items_check CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT studio_compatibility_report_approval_check CHECK (
    ("approvedBy" IS NULL AND "approvedAt" IS NULL)
    OR ("requiresApproval" AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_studio_compatibility_report_project_created
  ON studio_compatibility_report("projectId", "createdAt" DESC, id);
CREATE INDEX IF NOT EXISTS idx_studio_compatibility_report_artifact_created
  ON studio_compatibility_report("artifactId", "createdAt" DESC, id);

DO $$
BEGIN
  ALTER TABLE studio_revision
    ADD CONSTRAINT studio_revision_compatibility_report_fk
    FOREIGN KEY ("compatibilityReportId") REFERENCES studio_compatibility_report(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS studio_external_file_binding (
  id text PRIMARY KEY,
  "artifactId" text NOT NULL REFERENCES studio_artifact(id) ON DELETE CASCADE,
  "ownerUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider text NOT NULL,
  "providerAccountId" text,
  "remoteFileId" text NOT NULL,
  "displayPath" text NOT NULL,
  "syncMode" text NOT NULL,
  "remoteVersion" text,
  "remoteEtag" text,
  "contentHash" text,
  "lastSyncedRevisionId" text REFERENCES studio_revision(id) ON DELETE SET NULL,
  "lastSyncedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_external_file_binding_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_external_file_binding_provider_check CHECK (provider IN (
    'local-file', 'filesystem-handle', 'google-drive', 'dropbox', 'onedrive'
  )),
  CONSTRAINT studio_external_file_binding_account_check CHECK (
    provider IN ('local-file', 'filesystem-handle') OR "providerAccountId" IS NOT NULL
  ),
  CONSTRAINT studio_external_file_binding_remote_check CHECK (length(btrim("remoteFileId")) BETWEEN 1 AND 2048),
  CONSTRAINT studio_external_file_binding_path_check CHECK (length(btrim("displayPath")) BETWEEN 1 AND 4096),
  CONSTRAINT studio_external_file_binding_mode_check CHECK ("syncMode" IN (
    'import-only', 'export-only', 'bidirectional', 'backup-mirror'
  )),
  CONSTRAINT studio_external_file_binding_hash_check CHECK (
    "contentHash" IS NULL OR "contentHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT studio_external_file_binding_sync_point_check CHECK (
    ("lastSyncedRevisionId" IS NULL AND "lastSyncedAt" IS NULL)
    OR ("lastSyncedRevisionId" IS NOT NULL AND "lastSyncedAt" IS NOT NULL)
  ),
  CONSTRAINT studio_external_file_binding_time_check CHECK ("updatedAt" >= "createdAt")
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_external_file_binding_remote_unique
  ON studio_external_file_binding("ownerUserId", provider, COALESCE("providerAccountId", ''), "remoteFileId");
CREATE INDEX IF NOT EXISTS idx_studio_external_file_binding_artifact
  ON studio_external_file_binding("artifactId", "updatedAt" DESC, id);

CREATE TABLE IF NOT EXISTS studio_review (
  id text PRIMARY KEY,
  "artifactId" text NOT NULL REFERENCES studio_artifact(id) ON DELETE CASCADE,
  "revisionId" text NOT NULL REFERENCES studio_revision(id) ON DELETE RESTRICT,
  "requestedBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  "decidedAt" timestamptz,
  "decidedBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_review_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_review_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  CONSTRAINT studio_review_status_check CHECK (status IN (
    'open', 'changes-requested', 'approved', 'rejected', 'cancelled'
  )),
  CONSTRAINT studio_review_decision_check CHECK (
    (status IN ('open', 'changes-requested') AND "decidedAt" IS NULL AND "decidedBy" IS NULL)
    OR (status IN ('approved', 'rejected', 'cancelled') AND "decidedAt" IS NOT NULL AND "decidedBy" IS NOT NULL)
  ),
  CONSTRAINT studio_review_time_check CHECK ("updatedAt" >= "createdAt")
);

CREATE INDEX IF NOT EXISTS idx_studio_review_artifact_status_created
  ON studio_review("artifactId", status, "createdAt" DESC, id);
CREATE INDEX IF NOT EXISTS idx_studio_review_revision
  ON studio_review("revisionId", id);

CREATE TABLE IF NOT EXISTS studio_review_reviewer (
  "reviewId" text NOT NULL REFERENCES studio_review(id) ON DELETE CASCADE,
  "reviewerUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("reviewId", "reviewerUserId")
);

CREATE INDEX IF NOT EXISTS idx_studio_review_reviewer_user
  ON studio_review_reviewer("reviewerUserId", "createdAt" DESC, "reviewId");

CREATE TABLE IF NOT EXISTS studio_review_comment (
  id text PRIMARY KEY,
  "reviewId" text NOT NULL REFERENCES studio_review(id) ON DELETE CASCADE,
  "authorUserId" text REFERENCES "user"(id) ON DELETE SET NULL,
  anchor jsonb NOT NULL,
  body text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  "dueAt" timestamptz,
  "resolutionRevisionId" text REFERENCES studio_revision(id) ON DELETE SET NULL,
  "resolvedBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_review_comment_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_review_comment_anchor_check CHECK (
    jsonb_typeof(anchor) = 'object'
    AND anchor ? 'artifactId'
    AND anchor ? 'revisionId'
    AND anchor ? 'scope'
    AND anchor ? 'kind'
  ),
  CONSTRAINT studio_review_comment_body_check CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
  CONSTRAINT studio_review_comment_severity_check CHECK (severity IN ('required', 'recommended', 'note')),
  CONSTRAINT studio_review_comment_status_check CHECK (status IN ('open', 'resolved', 'reopened', 'dismissed')),
  CONSTRAINT studio_review_comment_resolution_check CHECK (
    (status IN ('open', 'reopened') AND "resolutionRevisionId" IS NULL AND "resolvedBy" IS NULL)
    OR (status IN ('resolved', 'dismissed') AND "resolutionRevisionId" IS NOT NULL AND "resolvedBy" IS NOT NULL)
  ),
  CONSTRAINT studio_review_comment_time_check CHECK ("updatedAt" >= "createdAt")
);

CREATE INDEX IF NOT EXISTS idx_studio_review_comment_review_status_created
  ON studio_review_comment("reviewId", status, "createdAt", id);
CREATE INDEX IF NOT EXISTS idx_studio_review_comment_anchor_gin
  ON studio_review_comment USING gin(anchor jsonb_path_ops);

CREATE TABLE IF NOT EXISTS studio_review_comment_assignee (
  "commentId" text NOT NULL REFERENCES studio_review_comment(id) ON DELETE CASCADE,
  "assigneeUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("commentId", "assigneeUserId")
);

CREATE INDEX IF NOT EXISTS idx_studio_review_comment_assignee_user
  ON studio_review_comment_assignee("assigneeUserId", "createdAt" DESC, "commentId");

CREATE TABLE IF NOT EXISTS studio_capability_ledger (
  id text PRIMARY KEY,
  status text NOT NULL,
  "domainOwner" text NOT NULL,
  entry jsonb NOT NULL,
  "evidenceDigest" text,
  "updatedBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_capability_ledger_id_check CHECK (length(id) BETWEEN 1 AND 160),
  CONSTRAINT studio_capability_ledger_status_check CHECK (status IN (
    'unplanned', 'contracted', 'core-implemented', 'product-wired', 'durable',
    'collaboration-ready', 'roundtrip-ready', 'device-validated',
    'expert-validated', 'equivalent', 'differentiated'
  )),
  CONSTRAINT studio_capability_ledger_owner_check CHECK (length(btrim("domainOwner")) BETWEEN 1 AND 160),
  CONSTRAINT studio_capability_ledger_entry_check CHECK (
    jsonb_typeof(entry) = 'object'
    AND entry->>'id' = id
    AND entry->>'status' = status
    AND entry->>'domainOwner' = "domainOwner"
    AND jsonb_typeof(entry->'requiredChecks') = 'array'
    AND jsonb_typeof(entry->'passedChecks') = 'array'
    AND jsonb_typeof(entry->'evidence') = 'array'
    AND jsonb_typeof(entry->'remainingGaps') = 'array'
  ),
  CONSTRAINT studio_capability_ledger_digest_check CHECK (
    "evidenceDigest" IS NULL OR "evidenceDigest" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT studio_capability_ledger_time_check CHECK ("updatedAt" >= "createdAt")
);

CREATE INDEX IF NOT EXISTS idx_studio_capability_ledger_status_updated
  ON studio_capability_ledger(status, "updatedAt" DESC, id);

CREATE OR REPLACE FUNCTION studio_reject_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%s rows are immutable after insertion', TG_TABLE_NAME);
END;
$$;

DROP TRIGGER IF EXISTS studio_revision_immutable_update ON studio_revision;
CREATE TRIGGER studio_revision_immutable_update
  BEFORE UPDATE ON studio_revision
  FOR EACH ROW EXECUTE FUNCTION studio_reject_immutable_update();

DROP TRIGGER IF EXISTS studio_revision_parent_immutable_update ON studio_revision_parent;
CREATE TRIGGER studio_revision_parent_immutable_update
  BEFORE UPDATE ON studio_revision_parent
  FOR EACH ROW EXECUTE FUNCTION studio_reject_immutable_update();

DROP TRIGGER IF EXISTS studio_revision_blob_immutable_update ON studio_revision_blob;
CREATE TRIGGER studio_revision_blob_immutable_update
  BEFORE UPDATE ON studio_revision_blob
  FOR EACH ROW EXECUTE FUNCTION studio_reject_immutable_update();

DROP TRIGGER IF EXISTS studio_operation_immutable_update ON studio_operation;
CREATE TRIGGER studio_operation_immutable_update
  BEFORE UPDATE ON studio_operation
  FOR EACH ROW EXECUTE FUNCTION studio_reject_immutable_update();

DROP TRIGGER IF EXISTS studio_mutation_receipt_immutable_update ON studio_mutation_receipt;
CREATE TRIGGER studio_mutation_receipt_immutable_update
  BEFORE UPDATE ON studio_mutation_receipt
  FOR EACH ROW EXECUTE FUNCTION studio_reject_immutable_update();

CREATE OR REPLACE FUNCTION studio_validate_revision_topology(target_revision_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  child studio_revision%ROWTYPE;
  parent_count integer;
  invalid_parent_count integer;
  has_cycle boolean;
BEGIN
  SELECT * INTO child FROM studio_revision WHERE id = target_revision_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO parent_count
  FROM studio_revision_parent
  WHERE "revisionId" = target_revision_id;

  IF child.kind IN ('submission', 'review-snapshot', 'approved', 'release') AND parent_count = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('%s revision %s requires a parent', child.kind, child.id);
  END IF;

  IF child.kind IN ('review-snapshot', 'approved', 'release') AND parent_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('%s revision %s requires exactly one parent', child.kind, child.id);
  END IF;

  SELECT count(*)::integer
  INTO invalid_parent_count
  FROM studio_revision_parent relation
  JOIN studio_revision parent ON parent.id = relation."parentRevisionId"
  WHERE relation."revisionId" = target_revision_id
    AND (
      parent."artifactId" <> child."artifactId"
      OR CASE child.kind
        WHEN 'autosave' THEN parent.kind NOT IN ('autosave', 'checkpoint', 'submission', 'review-snapshot', 'approved')
        WHEN 'checkpoint' THEN parent.kind NOT IN ('autosave', 'checkpoint', 'submission', 'review-snapshot', 'approved')
        WHEN 'submission' THEN parent.kind NOT IN ('autosave', 'checkpoint')
        WHEN 'review-snapshot' THEN parent.kind <> 'submission'
        WHEN 'approved' THEN parent.kind <> 'review-snapshot'
        WHEN 'release' THEN parent.kind <> 'approved'
        ELSE true
      END
    );

  IF invalid_parent_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('revision %s has an invalid parent transition or cross-artifact parent', child.id);
  END IF;

  WITH RECURSIVE ancestors(id) AS (
    SELECT "parentRevisionId"
    FROM studio_revision_parent
    WHERE "revisionId" = target_revision_id
    UNION
    SELECT relation."parentRevisionId"
    FROM studio_revision_parent relation
    JOIN ancestors ON relation."revisionId" = ancestors.id
  )
  SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = target_revision_id)
  INTO has_cycle;

  IF has_cycle THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('revision graph contains a cycle at %s', child.id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION studio_validate_revision_row_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM studio_validate_revision_topology(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION studio_validate_revision_parent_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM studio_validate_revision_topology(COALESCE(NEW."revisionId", OLD."revisionId"));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS studio_revision_topology_revision ON studio_revision;
CREATE CONSTRAINT TRIGGER studio_revision_topology_revision
  AFTER INSERT OR UPDATE ON studio_revision
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION studio_validate_revision_row_trigger();

DROP TRIGGER IF EXISTS studio_revision_topology_parent ON studio_revision_parent;
CREATE CONSTRAINT TRIGGER studio_revision_topology_parent
  AFTER INSERT OR UPDATE OR DELETE ON studio_revision_parent
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION studio_validate_revision_parent_trigger();

CREATE OR REPLACE FUNCTION studio_validate_artifact_revision_pointers()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  head_revision studio_revision%ROWTYPE;
  approved_revision studio_revision%ROWTYPE;
BEGIN
  SELECT * INTO head_revision FROM studio_revision WHERE id = NEW."headRevisionId";
  IF NOT FOUND OR head_revision."artifactId" <> NEW.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('artifact %s head revision must belong to the same artifact', NEW.id);
  END IF;

  IF NEW."approvedRevisionId" IS NOT NULL THEN
    SELECT * INTO approved_revision FROM studio_revision WHERE id = NEW."approvedRevisionId";
    IF NOT FOUND
      OR approved_revision."artifactId" <> NEW.id
      OR approved_revision.kind <> 'approved'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('artifact %s approved revision must be an approved revision of the same artifact', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_artifact_revision_pointer_check ON studio_artifact;
CREATE CONSTRAINT TRIGGER studio_artifact_revision_pointer_check
  AFTER INSERT OR UPDATE ON studio_artifact
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION studio_validate_artifact_revision_pointers();

CREATE OR REPLACE FUNCTION studio_validate_review_snapshot(target_review_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  review_row studio_review%ROWTYPE;
  revision_row studio_revision%ROWTYPE;
  reviewer_count integer;
BEGIN
  SELECT * INTO review_row FROM studio_review WHERE id = target_review_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO revision_row FROM studio_revision WHERE id = review_row."revisionId";
  IF NOT FOUND
    OR revision_row."artifactId" <> review_row."artifactId"
    OR revision_row.kind <> 'review-snapshot'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('review %s must reference a review-snapshot revision of the same artifact', review_row.id);
  END IF;

  SELECT count(*)::integer
  INTO reviewer_count
  FROM studio_review_reviewer
  WHERE "reviewId" = review_row.id;

  IF reviewer_count = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('review %s requires at least one reviewer', review_row.id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION studio_validate_review_row_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM studio_validate_review_snapshot(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION studio_validate_reviewer_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM studio_validate_review_snapshot(COALESCE(NEW."reviewId", OLD."reviewId"));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS studio_review_snapshot_check ON studio_review;
CREATE CONSTRAINT TRIGGER studio_review_snapshot_check
  AFTER INSERT OR UPDATE ON studio_review
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION studio_validate_review_row_trigger();

DROP TRIGGER IF EXISTS studio_review_reviewer_check ON studio_review_reviewer;
CREATE CONSTRAINT TRIGGER studio_review_reviewer_check
  AFTER INSERT OR UPDATE OR DELETE ON studio_review_reviewer
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION studio_validate_reviewer_trigger();

CREATE OR REPLACE FUNCTION studio_validate_review_comment_anchor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  review_row studio_review%ROWTYPE;
  resolution_row studio_revision%ROWTYPE;
BEGIN
  SELECT * INTO review_row FROM studio_review WHERE id = NEW."reviewId";
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'review does not exist';
  END IF;

  IF NEW.anchor->>'artifactId' <> review_row."artifactId"
    OR NEW.anchor->>'revisionId' <> review_row."revisionId"
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('comment %s anchor must target the frozen review artifact and revision', NEW.id);
  END IF;

  IF NEW."resolutionRevisionId" IS NOT NULL THEN
    SELECT * INTO resolution_row FROM studio_revision WHERE id = NEW."resolutionRevisionId";
    IF NOT FOUND OR resolution_row."artifactId" <> review_row."artifactId" THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('comment %s resolution revision must belong to the reviewed artifact', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_review_comment_anchor_check ON studio_review_comment;
CREATE TRIGGER studio_review_comment_anchor_check
  BEFORE INSERT OR UPDATE ON studio_review_comment
  FOR EACH ROW EXECUTE FUNCTION studio_validate_review_comment_anchor();

CREATE OR REPLACE FUNCTION studio_validate_compatibility_report_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."approvedBy" IS NOT NULL OR OLD."approvedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format('compatibility report %s approval is immutable', OLD.id);
  END IF;

  IF NOT OLD."requiresApproval"
    OR NEW."approvedBy" IS NULL
    OR NEW."approvedAt" IS NULL
    OR NEW.id <> OLD.id
    OR NEW."projectId" <> OLD."projectId"
    OR NEW."artifactId" IS DISTINCT FROM OLD."artifactId"
    OR NEW."sourceFormat" <> OLD."sourceFormat"
    OR NEW."sourceFileName" <> OLD."sourceFileName"
    OR NEW."sourceHash" <> OLD."sourceHash"
    OR NEW."sourceSize" <> OLD."sourceSize"
    OR NEW.grade <> OLD.grade
    OR NEW.summary <> OLD.summary
    OR NEW.items <> OLD.items
    OR NEW."requiresApproval" <> OLD."requiresApproval"
    OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format('compatibility report %s is immutable except for one-time approval', OLD.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_compatibility_report_approval_only ON studio_compatibility_report;
CREATE TRIGGER studio_compatibility_report_approval_only
  BEFORE UPDATE ON studio_compatibility_report
  FOR EACH ROW EXECUTE FUNCTION studio_validate_compatibility_report_approval();

REVOKE ALL ON TABLE
  studio_project_graph,
  studio_artifact,
  studio_revision,
  studio_revision_parent,
  studio_blob,
  studio_revision_blob,
  studio_operation,
  studio_mutation_receipt,
  studio_compatibility_report,
  studio_external_file_binding,
  studio_review,
  studio_review_reviewer,
  studio_review_comment,
  studio_review_comment_assignee,
  studio_capability_ledger
FROM PUBLIC;

COMMIT;
