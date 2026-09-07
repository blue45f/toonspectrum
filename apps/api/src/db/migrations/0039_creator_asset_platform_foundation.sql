-- Durable foundation for high-fidelity 2D/3D marketplace assets.
-- Existing immutable marketplace releases remain the catalog authority; this migration adds
-- mutable authoring drafts, content-addressed artifact lineage, QA, rights and work bindings.

BEGIN;
SELECT pg_advisory_xact_lock(82361743);

CREATE TABLE public."creator_marketplace_draft" (
  "id" text PRIMARY KEY,
  "publisherId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "packageId" text NOT NULL,
  "baseReleaseId" text REFERENCES public."creator_marketplace_resource"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "state" text NOT NULL DEFAULT 'editing',
  "currentRevision" integer NOT NULL DEFAULT 1,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "accessModel" text NOT NULL DEFAULT 'free',
  "artifactSetId" text,
  "licenseSnapshotId" text,
  "publishedReleaseId" text REFERENCES public."creator_marketplace_resource"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "updatedAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "submittedAt" timestamptz,
  CONSTRAINT "creator_marketplace_draft_id_check"
    CHECK (length("id") BETWEEN 1 AND 160 AND "id" !~ '[[:cntrl:]]'),
  CONSTRAINT "creator_marketplace_draft_package_id_check"
    CHECK ("packageId" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
  CONSTRAINT "creator_marketplace_draft_kind_check"
    CHECK ("kind" IN ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset', '3d-asset')),
  CONSTRAINT "creator_marketplace_draft_state_check"
    CHECK ("state" IN (
      'editing', 'uploading', 'processing', 'needs-fix', 'ready-to-submit',
      'in-review', 'changes-requested', 'approved', 'publishing', 'published',
      'rejected', 'abandoned'
    )),
  CONSTRAINT "creator_marketplace_draft_revision_check"
    CHECK ("currentRevision" BETWEEN 1 AND 2147483647),
  CONSTRAINT "creator_marketplace_draft_access_check"
    CHECK ("accessModel" IN ('free', 'paid', 'subscription')),
  CONSTRAINT "creator_marketplace_draft_tags_check"
    CHECK (jsonb_typeof("tags") = 'array' AND jsonb_array_length("tags") <= 32),
  CONSTRAINT "creator_marketplace_draft_publication_check"
    CHECK (("state" = 'published' AND "publishedReleaseId" IS NOT NULL)
      OR ("state" <> 'published' AND "publishedReleaseId" IS NULL)),
  CONSTRAINT "creator_marketplace_draft_timestamp_check"
    CHECK ("updatedAt" >= "createdAt"
      AND ("submittedAt" IS NULL OR "submittedAt" >= "createdAt"))
);
CREATE UNIQUE INDEX "creator_marketplace_draft_active_package_unique"
  ON public."creator_marketplace_draft" ("publisherId", "packageId")
  WHERE "state" NOT IN ('published', 'abandoned');
CREATE INDEX "idx_creator_marketplace_draft_owner_updated"
  ON public."creator_marketplace_draft" ("publisherId", "updatedAt", "id");
CREATE INDEX "idx_creator_marketplace_draft_review_queue"
  ON public."creator_marketplace_draft" ("state", "submittedAt", "id");

CREATE TABLE public."creator_marketplace_draft_revision" (
  "draftId" text NOT NULL REFERENCES public."creator_marketplace_draft"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "canonicalPayload" jsonb NOT NULL,
  "payloadHash" text NOT NULL,
  "changedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "changeReason" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_marketplace_draft_revision_pkey" PRIMARY KEY ("draftId", "revision"),
  CONSTRAINT "creator_marketplace_draft_revision_number_check"
    CHECK ("revision" BETWEEN 1 AND 2147483647),
  CONSTRAINT "creator_marketplace_draft_revision_payload_check"
    CHECK (jsonb_typeof("canonicalPayload") = 'object'),
  CONSTRAINT "creator_marketplace_draft_revision_hash_check"
    CHECK ("payloadHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_marketplace_draft_revision_reason_check"
    CHECK (length("changeReason") BETWEEN 1 AND 120 AND "changeReason" !~ '[[:cntrl:]]')
);

CREATE TABLE public."creator_asset_upload_session" (
  "id" text PRIMARY KEY,
  "draftId" text NOT NULL REFERENCES public."creator_marketplace_draft"("id") ON DELETE CASCADE,
  "entryId" text NOT NULL,
  "logicalRole" text NOT NULL,
  "protocol" text NOT NULL DEFAULT 'tus',
  "state" text NOT NULL DEFAULT 'reserved',
  "quarantinePath" text NOT NULL UNIQUE,
  "expectedByteLength" bigint NOT NULL,
  "actualByteLength" bigint,
  "declaredContentType" text NOT NULL,
  "detectedContentType" text,
  "clientDigest" text,
  "verifiedDigest" text,
  "uploadTokenHash" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "completedAt" timestamptz,
  "finalizedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "updatedAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_asset_upload_session_protocol_check"
    CHECK ("protocol" IN ('tus', 'server-multipart')),
  CONSTRAINT "creator_asset_upload_session_state_check"
    CHECK ("state" IN (
      'reserved', 'uploading', 'uploaded', 'verifying', 'verified',
      'rejected', 'expired', 'aborted', 'promoted'
    )),
  CONSTRAINT "creator_asset_upload_session_bytes_check"
    CHECK ("expectedByteLength" BETWEEN 1 AND 5368709120
      AND ("actualByteLength" IS NULL OR "actualByteLength" BETWEEN 1 AND 5368709120)),
  CONSTRAINT "creator_asset_upload_session_digest_check"
    CHECK (("clientDigest" IS NULL OR "clientDigest" ~ '^sha256:[a-f0-9]{64}$')
      AND ("verifiedDigest" IS NULL OR "verifiedDigest" ~ '^sha256:[a-f0-9]{64}$')
      AND "uploadTokenHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_asset_upload_session_verified_check"
    CHECK ("state" NOT IN ('verified', 'promoted') OR (
      "verifiedDigest" IS NOT NULL AND "actualByteLength" IS NOT NULL
      AND "detectedContentType" IS NOT NULL AND "finalizedAt" IS NOT NULL
    )),
  CONSTRAINT "creator_asset_upload_session_timestamp_check"
    CHECK ("updatedAt" >= "createdAt" AND "expiresAt" > "createdAt")
);
CREATE INDEX "idx_creator_asset_upload_session_draft"
  ON public."creator_asset_upload_session" ("draftId", "createdAt", "id");
CREATE INDEX "idx_creator_asset_upload_session_expiry"
  ON public."creator_asset_upload_session" ("state", "expiresAt");

CREATE TABLE public."creator_asset_processing_run" (
  "id" text PRIMARY KEY,
  "draftId" text NOT NULL REFERENCES public."creator_marketplace_draft"("id") ON DELETE CASCADE,
  "entryId" text NOT NULL,
  "sourceDigest" text NOT NULL,
  "pipelineProfile" text NOT NULL,
  "pipelineVersion" integer NOT NULL,
  "toolchainDigest" text NOT NULL,
  "idempotencyKey" text NOT NULL UNIQUE,
  "state" text NOT NULL DEFAULT 'queued',
  "currentStep" text,
  "requestedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "failureCode" text,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  CONSTRAINT "creator_asset_processing_run_digest_check"
    CHECK ("sourceDigest" ~ '^sha256:[a-f0-9]{64}$'
      AND "toolchainDigest" ~ '^sha256:[a-f0-9]{64}$'
      AND "idempotencyKey" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_asset_processing_run_state_check"
    CHECK ("state" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT "creator_asset_processing_run_version_check"
    CHECK ("pipelineVersion" BETWEEN 1 AND 2147483647),
  CONSTRAINT "creator_asset_processing_run_terminal_check"
    CHECK ("state" NOT IN ('succeeded', 'failed', 'cancelled') OR "finishedAt" IS NOT NULL)
);
CREATE INDEX "idx_creator_asset_processing_run_queue"
  ON public."creator_asset_processing_run" ("state", "createdAt", "id");
CREATE INDEX "idx_creator_asset_processing_run_draft"
  ON public."creator_asset_processing_run" ("draftId", "createdAt", "id");

CREATE TABLE public."creator_asset_processing_step" (
  "runId" text NOT NULL REFERENCES public."creator_asset_processing_run"("id") ON DELETE CASCADE,
  "stepName" text NOT NULL,
  "attempt" integer NOT NULL,
  "state" text NOT NULL DEFAULT 'queued',
  "inputDigest" text NOT NULL,
  "outputDescriptorHash" text,
  "workerType" text NOT NULL,
  "workerVersion" text NOT NULL,
  "leaseFence" integer NOT NULL DEFAULT 1,
  "leaseExpiresAt" timestamptz,
  "errorCode" text,
  "errorDetails" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  CONSTRAINT "creator_asset_processing_step_pkey" PRIMARY KEY ("runId", "stepName", "attempt"),
  CONSTRAINT "creator_asset_processing_step_name_check"
    CHECK ("stepName" IN (
      'security-scan', 'inventory', 'format-inspect', 'import', 'normalize',
      'master-build', 'spec-validate', 'optimize', 'derive', 'preview',
      'webtoon-render', 'metadata', 'auto-qa', 'review-bundle', 'seal'
    )),
  CONSTRAINT "creator_asset_processing_step_attempt_check"
    CHECK ("attempt" BETWEEN 1 AND 100),
  CONSTRAINT "creator_asset_processing_step_state_check"
    CHECK ("state" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT "creator_asset_processing_step_hash_check"
    CHECK ("inputDigest" ~ '^sha256:[a-f0-9]{64}$'
      AND ("outputDescriptorHash" IS NULL
        OR "outputDescriptorHash" ~ '^sha256:[a-f0-9]{64}$')),
  CONSTRAINT "creator_asset_processing_step_worker_check"
    CHECK (length("workerType") BETWEEN 1 AND 80
      AND length("workerVersion") BETWEEN 1 AND 120
      AND "workerType" !~ '[[:cntrl:]]' AND "workerVersion" !~ '[[:cntrl:]]'),
  CONSTRAINT "creator_asset_processing_step_lease_check"
    CHECK ("leaseFence" BETWEEN 1 AND 2147483647
      AND ("state" <> 'running' OR "leaseExpiresAt" IS NOT NULL)),
  CONSTRAINT "creator_asset_processing_step_terminal_check"
    CHECK ("state" NOT IN ('succeeded', 'failed', 'cancelled') OR "finishedAt" IS NOT NULL),
  CONSTRAINT "creator_asset_processing_step_error_check"
    CHECK (("state" = 'failed' AND "errorCode" IS NOT NULL) OR "state" <> 'failed')
);
CREATE INDEX "idx_creator_asset_processing_step_lease"
  ON public."creator_asset_processing_step" ("state", "leaseExpiresAt", "runId");

CREATE TABLE public."creator_asset_artifact_set" (
  "id" text PRIMARY KEY,
  "processingRunId" text NOT NULL UNIQUE
    REFERENCES public."creator_asset_processing_run"("id") ON DELETE RESTRICT,
  "entryKind" text NOT NULL,
  "sourceDigest" text NOT NULL,
  "profileSchemaVersion" integer NOT NULL,
  "descriptor" jsonb NOT NULL,
  "descriptorHash" text NOT NULL UNIQUE,
  "state" text NOT NULL DEFAULT 'building',
  "toolchainDigest" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "sealedAt" timestamptz,
  CONSTRAINT "creator_asset_artifact_set_kind_check"
    CHECK ("entryKind" IN ('raster-asset', 'vector-asset', '3d-asset', '3d-scene', 'material', 'hdri')),
  CONSTRAINT "creator_asset_artifact_set_digest_check"
    CHECK ("sourceDigest" ~ '^sha256:[a-f0-9]{64}$'
      AND "descriptorHash" ~ '^sha256:[a-f0-9]{64}$'
      AND "toolchainDigest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_asset_artifact_set_state_check"
    CHECK ("state" IN ('building', 'sealed', 'rejected')),
  CONSTRAINT "creator_asset_artifact_set_descriptor_check"
    CHECK (jsonb_typeof("descriptor") = 'object'
      AND "descriptor"->>'schema' = 'toonspectrum.creator-asset-artifact-set'
      AND "descriptor"->>'version' = '1'
      AND "descriptor"->>'id' = "id"),
  CONSTRAINT "creator_asset_artifact_set_sealed_check"
    CHECK (("state" = 'sealed' AND "sealedAt" IS NOT NULL)
      OR ("state" <> 'sealed' AND "sealedAt" IS NULL))
);
CREATE INDEX "idx_creator_asset_artifact_set_source"
  ON public."creator_asset_artifact_set" ("sourceDigest", "state");

CREATE TABLE public."creator_asset_artifact" (
  "artifactSetId" text NOT NULL
    REFERENCES public."creator_asset_artifact_set"("id") ON DELETE RESTRICT,
  "artifactId" text NOT NULL,
  "role" text NOT NULL,
  "purpose" text NOT NULL,
  "objectDigest" text NOT NULL,
  "contentType" text NOT NULL,
  "byteLength" bigint NOT NULL,
  "qualityProfile" text NOT NULL,
  "deviceProfile" text NOT NULL,
  "width" integer,
  "height" integer,
  "metrics" jsonb,
  "required" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_asset_artifact_pkey" PRIMARY KEY ("artifactSetId", "artifactId"),
  CONSTRAINT "creator_asset_artifact_storage_object_fkey"
    FOREIGN KEY ("purpose", "objectDigest")
    REFERENCES public.creator_asset_storage_object("purpose", "digest") ON DELETE RESTRICT,
  CONSTRAINT "creator_asset_artifact_id_check"
    CHECK (length("artifactId") BETWEEN 1 AND 160 AND "artifactId" !~ '[[:cntrl:]]'),
  CONSTRAINT "creator_asset_artifact_role_check"
    CHECK ("role" IN (
      'source-original', 'source-dependency-archive', 'master', 'runtime-proxy',
      'runtime-default', 'runtime-high', 'runtime-mobile', 'runtime-fallback',
      'collision-proxy', 'thumbnail', 'preview-turntable', 'preview-color',
      'preview-line', 'preview-tone', 'preview-shadow', 'preview-size-reference',
      'layer-manifest', 'runtime-tile-manifest', 'runtime-tile', 'qa-report',
      'toolchain-report'
    )),
  CONSTRAINT "creator_asset_artifact_purpose_check"
    CHECK ("purpose" IN ('source', 'derived', 'export')),
  CONSTRAINT "creator_asset_artifact_quality_check"
    CHECK ("qualityProfile" IN ('source', 'proxy', 'default', 'high', 'mobile', 'preview')),
  CONSTRAINT "creator_asset_artifact_device_check"
    CHECK ("deviceProfile" IN ('universal', 'desktop', 'tablet', 'mobile')),
  CONSTRAINT "creator_asset_artifact_bytes_check"
    CHECK ("byteLength" BETWEEN 1 AND 5368709120),
  CONSTRAINT "creator_asset_artifact_dimensions_check"
    CHECK (("width" IS NULL AND "height" IS NULL)
      OR ("width" BETWEEN 1 AND 65536 AND "height" BETWEEN 1 AND 65536)),
  CONSTRAINT "creator_asset_artifact_metrics_check"
    CHECK ("metrics" IS NULL OR jsonb_typeof("metrics") = 'object'),
  CONSTRAINT "creator_asset_artifact_source_role_check"
    CHECK ("role" <> 'source-original' OR "purpose" = 'source')
);
CREATE INDEX "idx_creator_asset_artifact_object"
  ON public."creator_asset_artifact" ("purpose", "objectDigest");
CREATE INDEX "idx_creator_asset_artifact_role"
  ON public."creator_asset_artifact" ("artifactSetId", "role", "qualityProfile");

CREATE TABLE public."creator_asset_qa_report" (
  "id" text PRIMARY KEY,
  "artifactSetId" text NOT NULL
    REFERENCES public."creator_asset_artifact_set"("id") ON DELETE RESTRICT,
  "profileId" text NOT NULL,
  "profileVersion" integer NOT NULL,
  "state" text NOT NULL,
  "blockerCount" integer NOT NULL,
  "warningCount" integer NOT NULL,
  "report" jsonb NOT NULL,
  "reportHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_asset_qa_report_profile_unique"
    UNIQUE ("artifactSetId", "profileId", "profileVersion"),
  CONSTRAINT "creator_asset_qa_report_profile_check"
    CHECK (length("profileId") BETWEEN 1 AND 160 AND "profileId" !~ '[[:cntrl:]]'
      AND "profileVersion" BETWEEN 1 AND 2147483647),
  CONSTRAINT "creator_asset_qa_report_state_check"
    CHECK ("state" IN ('passed', 'warning', 'failed')),
  CONSTRAINT "creator_asset_qa_report_counts_check"
    CHECK ("blockerCount" BETWEEN 0 AND 100000
      AND "warningCount" BETWEEN 0 AND 100000
      AND ("state" <> 'passed' OR "blockerCount" = 0)),
  CONSTRAINT "creator_asset_qa_report_shape_check"
    CHECK (jsonb_typeof("report") = 'object'),
  CONSTRAINT "creator_asset_qa_report_hash_check"
    CHECK ("reportHash" ~ '^sha256:[a-f0-9]{64}$')
);
CREATE INDEX "idx_creator_asset_qa_report_state"
  ON public."creator_asset_qa_report" ("state", "blockerCount", "createdAt");

CREATE TABLE public."creator_asset_license_snapshot" (
  "id" text PRIMARY KEY,
  "licenseCode" text NOT NULL,
  "policyVersion" integer NOT NULL,
  "capabilities" jsonb NOT NULL,
  "legalTextDigest" text NOT NULL,
  "sourceReference" text,
  "capturedAt" timestamptz NOT NULL,
  "reviewState" text NOT NULL DEFAULT 'pending',
  "reviewedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_asset_license_snapshot_identity_unique"
    UNIQUE ("licenseCode", "policyVersion", "legalTextDigest"),
  CONSTRAINT "creator_asset_license_snapshot_code_check"
    CHECK (length("licenseCode") BETWEEN 1 AND 80 AND "licenseCode" !~ '[[:cntrl:]]'),
  CONSTRAINT "creator_asset_license_snapshot_version_check"
    CHECK ("policyVersion" BETWEEN 1 AND 2147483647),
  CONSTRAINT "creator_asset_license_snapshot_digest_check"
    CHECK ("legalTextDigest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_asset_license_snapshot_capabilities_check"
    CHECK (jsonb_typeof("capabilities") = 'object'),
  CONSTRAINT "creator_asset_license_snapshot_review_check"
    CHECK ("reviewState" IN ('pending', 'approved', 'rejected')
      AND ("reviewState" <> 'approved' OR "reviewedBy" IS NOT NULL))
);
CREATE INDEX "idx_creator_asset_license_snapshot_review"
  ON public."creator_asset_license_snapshot" ("reviewState", "createdAt");

CREATE TABLE public."creator_asset_rights_evidence" (
  "id" text PRIMARY KEY,
  "licenseSnapshotId" text NOT NULL
    REFERENCES public."creator_asset_license_snapshot"("id") ON DELETE RESTRICT,
  "evidenceType" text NOT NULL,
  "objectPurpose" text NOT NULL DEFAULT 'source',
  "objectDigest" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'rights-reviewer-only',
  "submittedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "verifiedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_asset_rights_evidence_object_unique"
    UNIQUE ("licenseSnapshotId", "evidenceType", "objectDigest"),
  CONSTRAINT "creator_asset_rights_evidence_storage_object_fkey"
    FOREIGN KEY ("objectPurpose", "objectDigest")
    REFERENCES public.creator_asset_storage_object("purpose", "digest") ON DELETE RESTRICT,
  CONSTRAINT "creator_asset_rights_evidence_type_check"
    CHECK ("evidenceType" IN (
      'creator-attestation', 'contract', 'source-page', 'license-text',
      'permission-email', 'public-domain-record', 'purchase-record'
    )),
  CONSTRAINT "creator_asset_rights_evidence_purpose_check"
    CHECK ("objectPurpose" = 'source'),
  CONSTRAINT "creator_asset_rights_evidence_digest_check"
    CHECK ("objectDigest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_asset_rights_evidence_visibility_check"
    CHECK ("visibility" IN ('rights-reviewer-only', 'publisher-and-reviewer'))
);
CREATE INDEX "idx_creator_asset_rights_evidence_snapshot"
  ON public."creator_asset_rights_evidence" ("licenseSnapshotId", "createdAt");

CREATE TABLE public."creator_marketplace_release_artifact_binding" (
  "releaseId" text NOT NULL
    REFERENCES public."creator_marketplace_resource"("id") ON DELETE RESTRICT,
  "entryId" text NOT NULL,
  "artifactSetId" text NOT NULL
    REFERENCES public."creator_asset_artifact_set"("id") ON DELETE RESTRICT,
  "licenseSnapshotId" text NOT NULL
    REFERENCES public."creator_asset_license_snapshot"("id") ON DELETE RESTRICT,
  "publicPreviewArtifactId" text NOT NULL,
  "bindingHash" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_marketplace_release_artifact_binding_pkey"
    PRIMARY KEY ("releaseId", "entryId"),
  CONSTRAINT "creator_marketplace_release_preview_artifact_fkey"
    FOREIGN KEY ("artifactSetId", "publicPreviewArtifactId")
    REFERENCES public."creator_asset_artifact"("artifactSetId", "artifactId") ON DELETE RESTRICT,
  CONSTRAINT "creator_marketplace_release_artifact_binding_hash_check"
    CHECK ("bindingHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_marketplace_release_artifact_binding_entry_check"
    CHECK (length("entryId") BETWEEN 1 AND 160 AND "entryId" !~ '[[:cntrl:]]')
);

CREATE TABLE public."creator_marketplace_release_availability" (
  "releaseId" text PRIMARY KEY
    REFERENCES public."creator_marketplace_resource"("id") ON DELETE CASCADE,
  "state" text NOT NULL DEFAULT 'active',
  "reasonCode" text,
  "revision" integer NOT NULL DEFAULT 1,
  "updatedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_marketplace_release_availability_state_check"
    CHECK ("state" IN (
      'active', 'owner-delisted', 'moderation-hold', 'rights-suspended',
      'security-blocked', 'revoked'
    )),
  CONSTRAINT "creator_marketplace_release_availability_revision_check"
    CHECK ("revision" BETWEEN 1 AND 2147483647),
  CONSTRAINT "creator_marketplace_release_availability_reason_check"
    CHECK (("state" = 'active' AND "reasonCode" IS NULL)
      OR ("state" <> 'active' AND length("reasonCode") BETWEEN 1 AND 120))
);
CREATE INDEX "idx_creator_marketplace_release_availability_state"
  ON public."creator_marketplace_release_availability" ("state", "updatedAt");

CREATE TABLE public."creator_marketplace_entitlement_grant" (
  "id" text PRIMARY KEY,
  "subjectType" text NOT NULL,
  "subjectId" text NOT NULL,
  "publisherId" text NOT NULL REFERENCES public."user"("id") ON DELETE RESTRICT,
  "packageId" text NOT NULL,
  "releasePolicy" text NOT NULL,
  "releaseId" text REFERENCES public."creator_marketplace_resource"("id") ON DELETE RESTRICT,
  "minimumOrdinal" integer,
  "maximumOrdinal" integer,
  "grantType" text NOT NULL,
  "scope" text NOT NULL,
  "seatCount" integer NOT NULL DEFAULT 1,
  "validFrom" timestamptz NOT NULL,
  "validUntil" timestamptz,
  "existingWorkSurvives" boolean NOT NULL DEFAULT false,
  "sourceEventId" text NOT NULL UNIQUE,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_marketplace_entitlement_subject_check"
    CHECK ("subjectType" IN ('user', 'organization')
      AND length("subjectId") BETWEEN 1 AND 160 AND "subjectId" !~ '[[:cntrl:]]'),
  CONSTRAINT "creator_marketplace_entitlement_package_check"
    CHECK ("packageId" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
  CONSTRAINT "creator_marketplace_entitlement_policy_check"
    CHECK ("releasePolicy" IN ('exact', 'range', 'package-head') AND (
      ("releasePolicy" = 'exact' AND "releaseId" IS NOT NULL
        AND "minimumOrdinal" IS NULL AND "maximumOrdinal" IS NULL)
      OR ("releasePolicy" = 'range' AND "releaseId" IS NULL
        AND "minimumOrdinal" BETWEEN 1 AND 2147483647
        AND "maximumOrdinal" BETWEEN "minimumOrdinal" AND 2147483647)
      OR ("releasePolicy" = 'package-head' AND "releaseId" IS NULL
        AND "minimumOrdinal" IS NULL AND "maximumOrdinal" IS NULL)
    )),
  CONSTRAINT "creator_marketplace_entitlement_grant_type_check"
    CHECK ("grantType" IN ('free', 'purchase', 'subscription', 'creator', 'administrator')),
  CONSTRAINT "creator_marketplace_entitlement_scope_check"
    CHECK ("scope" IN ('personal', 'team', 'enterprise')),
  CONSTRAINT "creator_marketplace_entitlement_seat_check"
    CHECK ("seatCount" BETWEEN 1 AND 100000),
  CONSTRAINT "creator_marketplace_entitlement_time_check"
    CHECK ("validUntil" IS NULL OR "validUntil" >= "validFrom")
);
CREATE INDEX "idx_creator_marketplace_entitlement_subject"
  ON public."creator_marketplace_entitlement_grant"
    ("subjectType", "subjectId", "packageId", "validUntil");

CREATE TABLE public."creator_work_catalog_asset_binding" (
  "workId" text NOT NULL REFERENCES public."creator_work"("id") ON DELETE CASCADE,
  "attachmentId" text NOT NULL,
  "assetType" text NOT NULL,
  "releaseId" text NOT NULL
    REFERENCES public."creator_marketplace_resource"("id") ON DELETE RESTRICT,
  "entryId" text NOT NULL,
  "artifactSetId" text NOT NULL
    REFERENCES public."creator_asset_artifact_set"("id") ON DELETE RESTRICT,
  "selectedArtifactId" text NOT NULL,
  "expectedContentDigest" text NOT NULL,
  "licenseSnapshotId" text NOT NULL
    REFERENCES public."creator_asset_license_snapshot"("id") ON DELETE RESTRICT,
  "entitlementGrantId" text
    REFERENCES public."creator_marketplace_entitlement_grant"("id") ON DELETE SET NULL,
  "useReceiptId" text NOT NULL UNIQUE,
  "qualityProfile" text NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "insertedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "insertedAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "lastResolvedAt" timestamptz,
  CONSTRAINT "creator_work_catalog_asset_binding_pkey" PRIMARY KEY ("workId", "attachmentId"),
  CONSTRAINT "creator_work_catalog_asset_binding_artifact_fkey"
    FOREIGN KEY ("artifactSetId", "selectedArtifactId")
    REFERENCES public."creator_asset_artifact"("artifactSetId", "artifactId") ON DELETE RESTRICT,
  CONSTRAINT "creator_work_catalog_asset_binding_attachment_check"
    CHECK (length("attachmentId") BETWEEN 1 AND 160 AND "attachmentId" !~ '[[:cntrl:]]'),
  CONSTRAINT "creator_work_catalog_asset_binding_asset_type_check"
    CHECK ("assetType" IN ('raster', 'vector', 'background3d', 'scene3d')),
  CONSTRAINT "creator_work_catalog_asset_binding_digest_check"
    CHECK ("expectedContentDigest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_work_catalog_asset_binding_quality_check"
    CHECK ("qualityProfile" IN ('source', 'proxy', 'default', 'high', 'mobile', 'preview')),
  CONSTRAINT "creator_work_catalog_asset_binding_state_check"
    CHECK ("state" IN ('active', 'missing', 'revoked-warning', 'blocked'))
);
CREATE INDEX "idx_creator_work_catalog_asset_binding_release"
  ON public."creator_work_catalog_asset_binding" ("releaseId", "workId");

-- Every mutation of an editable draft advances an optimistic revision and follows the explicit
-- product state machine. Identity and creation time never change.
CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_draft_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $draft_update$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."publisherId" IS DISTINCT FROM OLD."publisherId"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'creator marketplace draft identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_identity_immutable';
  END IF;
  IF NEW."currentRevision" <> OLD."currentRevision" + 1 THEN
    RAISE EXCEPTION 'creator marketplace draft update requires the next revision'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_revision_monotonic';
  END IF;
  IF NEW."updatedAt" <= OLD."updatedAt" THEN
    RAISE EXCEPTION 'creator marketplace draft update requires a fresh timestamp'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_timestamp_monotonic';
  END IF;
  IF NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
    (OLD."state" = 'editing' AND NEW."state" IN ('uploading', 'processing', 'abandoned'))
    OR (OLD."state" = 'uploading' AND NEW."state" IN ('editing', 'processing', 'needs-fix', 'abandoned'))
    OR (OLD."state" = 'processing' AND NEW."state" IN ('needs-fix', 'ready-to-submit', 'abandoned'))
    OR (OLD."state" = 'needs-fix' AND NEW."state" IN ('editing', 'uploading', 'processing', 'abandoned'))
    OR (OLD."state" = 'ready-to-submit' AND NEW."state" IN ('editing', 'in-review', 'abandoned'))
    OR (OLD."state" = 'in-review' AND NEW."state" IN ('changes-requested', 'approved', 'rejected'))
    OR (OLD."state" = 'changes-requested' AND NEW."state" IN ('editing', 'processing', 'in-review', 'abandoned'))
    OR (OLD."state" = 'approved' AND NEW."state" IN ('publishing', 'changes-requested'))
    OR (OLD."state" = 'publishing' AND NEW."state" IN ('published', 'approved'))
    OR (OLD."state" = 'rejected' AND NEW."state" IN ('editing', 'abandoned'))
  ) THEN
    RAISE EXCEPTION 'invalid creator marketplace draft state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_state_transition';
  END IF;
  IF OLD."state" IN ('published', 'abandoned') THEN
    RAISE EXCEPTION 'terminal creator marketplace draft is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_terminal_immutable';
  END IF;
  RETURN NEW;
END
$draft_update$;
CREATE TRIGGER creator_marketplace_draft_update
BEFORE UPDATE ON public."creator_marketplace_draft"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_draft_update();

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $artifact_mutation$
DECLARE
  parent_state text;
  target_set text;
BEGIN
  target_set := CASE WHEN TG_OP = 'DELETE' THEN OLD."artifactSetId" ELSE NEW."artifactSetId" END;
  SELECT "state" INTO parent_state
  FROM public."creator_asset_artifact_set"
  WHERE "id" = target_set
  FOR UPDATE;
  IF parent_state IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'sealed or rejected artifact set content is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_sealed_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$artifact_mutation$;
CREATE TRIGGER creator_asset_artifact_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public."creator_asset_artifact"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_artifact_mutation();

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_artifact_set_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $artifact_set_update$
DECLARE
  source_count integer;
  runtime_count integer;
  thumbnail_count integer;
BEGIN
  IF OLD."state" IN ('sealed', 'rejected') THEN
    RAISE EXCEPTION 'terminal artifact set is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_terminal_immutable';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."processingRunId" IS DISTINCT FROM OLD."processingRunId"
    OR NEW."entryKind" IS DISTINCT FROM OLD."entryKind"
    OR NEW."sourceDigest" IS DISTINCT FROM OLD."sourceDigest"
    OR NEW."profileSchemaVersion" IS DISTINCT FROM OLD."profileSchemaVersion"
    OR NEW."toolchainDigest" IS DISTINCT FROM OLD."toolchainDigest"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'artifact set identity and lineage are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_lineage_immutable';
  END IF;
  IF NEW."state" NOT IN ('building', 'sealed', 'rejected') THEN
    RAISE EXCEPTION 'invalid artifact set state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_state_transition';
  END IF;
  IF NEW."state" = 'sealed' THEN
    SELECT
      count(*) FILTER (WHERE "role" = 'source-original' AND "objectDigest" = NEW."sourceDigest"),
      count(*) FILTER (WHERE "role" IN ('master', 'runtime-proxy', 'runtime-default', 'runtime-high', 'runtime-mobile')),
      count(*) FILTER (WHERE "role" = 'thumbnail')
    INTO source_count, runtime_count, thumbnail_count
    FROM public."creator_asset_artifact"
    WHERE "artifactSetId" = NEW."id";
    IF source_count <> 1 OR runtime_count < 1 OR thumbnail_count < 1 THEN
      RAISE EXCEPTION 'artifact set cannot be sealed without source, runtime and thumbnail artifacts'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_contents';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."creator_asset_qa_report"
      WHERE "artifactSetId" = NEW."id" AND "blockerCount" = 0
        AND "state" IN ('passed', 'warning')
    ) THEN
      RAISE EXCEPTION 'artifact set cannot be sealed without blocker-free QA evidence'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_qa';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."creator_asset_processing_run"
      WHERE "id" = NEW."processingRunId" AND "state" = 'succeeded'
    ) THEN
      RAISE EXCEPTION 'artifact set cannot be sealed before processing succeeds'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_processing';
    END IF;
  END IF;
  RETURN NEW;
END
$artifact_set_update$;
CREATE TRIGGER creator_asset_artifact_set_update
BEFORE UPDATE ON public."creator_asset_artifact_set"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_artifact_set_update();

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_license_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $license_snapshot_update$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."licenseCode" IS DISTINCT FROM OLD."licenseCode"
    OR NEW."policyVersion" IS DISTINCT FROM OLD."policyVersion"
    OR NEW."capabilities" IS DISTINCT FROM OLD."capabilities"
    OR NEW."legalTextDigest" IS DISTINCT FROM OLD."legalTextDigest"
    OR NEW."sourceReference" IS DISTINCT FROM OLD."sourceReference"
    OR NEW."capturedAt" IS DISTINCT FROM OLD."capturedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'license snapshot evidence is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_license_snapshot_content_immutable';
  END IF;
  IF OLD."reviewState" <> 'pending'
    OR NEW."reviewState" NOT IN ('approved', 'rejected')
    OR NEW."reviewedBy" IS NULL
  THEN
    RAISE EXCEPTION 'license snapshot accepts exactly one terminal review decision'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_license_snapshot_review_transition';
  END IF;
  RETURN NEW;
END
$license_snapshot_update$;
CREATE TRIGGER creator_asset_license_snapshot_update
BEFORE UPDATE ON public."creator_asset_license_snapshot"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_license_snapshot_update();

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_release_binding_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $release_binding_insert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."creator_asset_artifact_set"
    WHERE "id" = NEW."artifactSetId" AND "state" = 'sealed'
  ) THEN
    RAISE EXCEPTION 'marketplace release requires a sealed artifact set'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_artifact_set_sealed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."creator_asset_license_snapshot"
    WHERE "id" = NEW."licenseSnapshotId" AND "reviewState" = 'approved'
  ) THEN
    RAISE EXCEPTION 'marketplace release requires an approved license snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_license_approved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."creator_asset_artifact"
    WHERE "artifactSetId" = NEW."artifactSetId"
      AND "artifactId" = NEW."publicPreviewArtifactId"
      AND "role" IN ('thumbnail', 'preview-color', 'preview-line', 'preview-tone')
  ) THEN
    RAISE EXCEPTION 'marketplace release preview must reference a preview artifact'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_preview_role';
  END IF;
  RETURN NEW;
END
$release_binding_insert$;
CREATE TRIGGER creator_marketplace_release_binding_insert
BEFORE INSERT ON public."creator_marketplace_release_artifact_binding"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_release_binding_insert();

CREATE OR REPLACE FUNCTION public.reject_creator_marketplace_release_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $release_binding_mutation$
BEGIN
  RAISE EXCEPTION 'marketplace release artifact binding is immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_artifact_binding_immutable';
END
$release_binding_mutation$;
CREATE TRIGGER creator_marketplace_release_binding_mutation
BEFORE UPDATE OR DELETE ON public."creator_marketplace_release_artifact_binding"
FOR EACH ROW EXECUTE FUNCTION public.reject_creator_marketplace_release_binding_mutation();

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_release_availability_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $availability_update$
BEGIN
  IF NEW."releaseId" IS DISTINCT FROM OLD."releaseId" THEN
    RAISE EXCEPTION 'release availability identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_availability_identity';
  END IF;
  IF OLD."state" = 'revoked' THEN
    RAISE EXCEPTION 'revoked release availability is terminal'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_availability_terminal';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 OR NEW."updatedAt" <= OLD."updatedAt" THEN
    RAISE EXCEPTION 'release availability update requires a monotonic revision and timestamp'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_availability_monotonic';
  END IF;
  RETURN NEW;
END
$availability_update$;
CREATE TRIGGER creator_marketplace_release_availability_update
BEFORE UPDATE ON public."creator_marketplace_release_availability"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_release_availability_update();

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_entitlement_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $entitlement_update$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."subjectType" IS DISTINCT FROM OLD."subjectType"
    OR NEW."subjectId" IS DISTINCT FROM OLD."subjectId"
    OR NEW."publisherId" IS DISTINCT FROM OLD."publisherId"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."releasePolicy" IS DISTINCT FROM OLD."releasePolicy"
    OR NEW."releaseId" IS DISTINCT FROM OLD."releaseId"
    OR NEW."minimumOrdinal" IS DISTINCT FROM OLD."minimumOrdinal"
    OR NEW."maximumOrdinal" IS DISTINCT FROM OLD."maximumOrdinal"
    OR NEW."grantType" IS DISTINCT FROM OLD."grantType"
    OR NEW."scope" IS DISTINCT FROM OLD."scope"
    OR NEW."seatCount" IS DISTINCT FROM OLD."seatCount"
    OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom"
    OR NEW."validUntil" IS DISTINCT FROM OLD."validUntil"
    OR NEW."existingWorkSurvives" IS DISTINCT FROM OLD."existingWorkSurvives"
    OR NEW."sourceEventId" IS DISTINCT FROM OLD."sourceEventId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'entitlement grant facts are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_entitlement_content_immutable';
  END IF;
  IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL
    OR NEW."revokedAt" < NEW."createdAt"
  THEN
    RAISE EXCEPTION 'entitlement grant accepts a single valid revocation event'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_entitlement_revocation';
  END IF;
  RETURN NEW;
END
$entitlement_update$;
CREATE TRIGGER creator_marketplace_entitlement_update
BEFORE UPDATE ON public."creator_marketplace_entitlement_grant"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_entitlement_update();

REVOKE ALL ON TABLE
  public."creator_marketplace_draft",
  public."creator_marketplace_draft_revision",
  public."creator_asset_upload_session",
  public."creator_asset_processing_run",
  public."creator_asset_processing_step",
  public."creator_asset_artifact_set",
  public."creator_asset_artifact",
  public."creator_asset_qa_report",
  public."creator_asset_license_snapshot",
  public."creator_asset_rights_evidence",
  public."creator_marketplace_release_artifact_binding",
  public."creator_marketplace_release_availability",
  public."creator_marketplace_entitlement_grant",
  public."creator_work_catalog_asset_binding"
FROM PUBLIC;

COMMIT;
