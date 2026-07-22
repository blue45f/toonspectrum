-- Rights-aware shared asset catalog: validated file metadata, searchable licensing fields,
-- provenance, duplicate protection, and a durable moderation/report queue.

BEGIN;

ALTER TABLE "creator_asset"
  ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "mimeType" text,
  ADD COLUMN IF NOT EXISTS "byteSize" integer,
  ADD COLUMN IF NOT EXISTS "contentHash" text,
  ADD COLUMN IF NOT EXISTS "previewDataUrl" text,
  ADD COLUMN IF NOT EXISTS "previewWidth" integer,
  ADD COLUMN IF NOT EXISTS "previewHeight" integer,
  ADD COLUMN IF NOT EXISTS "previewMimeType" text,
  ADD COLUMN IF NOT EXISTS "previewByteSize" integer,
  ADD COLUMN IF NOT EXISTS "previewContentHash" text,
  ADD COLUMN IF NOT EXISTS "license" text NOT NULL DEFAULT 'toonspectrum-standard',
  ADD COLUMN IF NOT EXISTS "attributionText" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "containsAi" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rightsConfirmedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "moderationStatus" text NOT NULL DEFAULT 'under_review',
  ADD COLUMN IF NOT EXISTS "moderationNote" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "reportCount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewedBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz;

-- Reapplying this migration repairs supported Drizzle/partial-bootstrap default and nullability
-- drift. SET NOT NULL deliberately fails closed when an older bootstrap left ambiguous NULL data.
ALTER TABLE "creator_asset"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "description" SET DEFAULT '',
  ALTER COLUMN "description" SET NOT NULL,
  ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "tags" SET NOT NULL,
  ALTER COLUMN "dataUrl" SET NOT NULL,
  ALTER COLUMN "width" SET NOT NULL,
  ALTER COLUMN "height" SET NOT NULL,
  ALTER COLUMN "kind" SET DEFAULT 'image',
  ALTER COLUMN "kind" SET NOT NULL,
  ALTER COLUMN "mimeType" DROP NOT NULL,
  ALTER COLUMN "byteSize" DROP NOT NULL,
  ALTER COLUMN "contentHash" DROP NOT NULL,
  ALTER COLUMN "previewDataUrl" DROP NOT NULL,
  ALTER COLUMN "previewWidth" DROP NOT NULL,
  ALTER COLUMN "previewHeight" DROP NOT NULL,
  ALTER COLUMN "previewMimeType" DROP NOT NULL,
  ALTER COLUMN "previewByteSize" DROP NOT NULL,
  ALTER COLUMN "previewContentHash" DROP NOT NULL,
  ALTER COLUMN "license" SET DEFAULT 'toonspectrum-standard',
  ALTER COLUMN "license" SET NOT NULL,
  ALTER COLUMN "attributionText" SET DEFAULT '',
  ALTER COLUMN "attributionText" SET NOT NULL,
  ALTER COLUMN "containsAi" SET DEFAULT false,
  ALTER COLUMN "containsAi" SET NOT NULL,
  ALTER COLUMN "rightsConfirmedAt" DROP NOT NULL,
  ALTER COLUMN "moderationStatus" SET DEFAULT 'under_review',
  ALTER COLUMN "moderationStatus" SET NOT NULL,
  ALTER COLUMN "moderationNote" SET DEFAULT '',
  ALTER COLUMN "moderationNote" SET NOT NULL,
  ALTER COLUMN "reportCount" SET DEFAULT 0,
  ALTER COLUMN "reportCount" SET NOT NULL,
  ALTER COLUMN "reviewedBy" DROP NOT NULL,
  ALTER COLUMN "reviewedAt" DROP NOT NULL,
  ALTER COLUMN "hidden" SET DEFAULT false,
  ALTER COLUMN "hidden" SET NOT NULL,
  ALTER COLUMN "downloads" SET DEFAULT 0,
  ALTER COLUMN "downloads" SET NOT NULL,
  ALTER COLUMN "createdAt" DROP NOT NULL;

-- Rows that predate the rights-aware catalog have no explicit grant from their owner. Keep them
-- visible to the owner for review, but never silently publish them under a newly assigned license.
UPDATE "creator_asset"
SET "moderationStatus" = 'under_review'
WHERE "rightsConfirmedAt" IS NULL
  AND "moderationStatus" = 'published';

-- These names are owned by this migration. Always replace them rather than trusting a matching
-- name: a partial bootstrap may have installed CHECK (... OR true), a wider enum, or another
-- constraint type. Re-adding validates all existing rows and aborts the transaction on drift.
ALTER TABLE "creator_asset"
  DROP CONSTRAINT IF EXISTS "creator_asset_license_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_moderation_status_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_mime_type_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_byte_size_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_content_hash_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_dimensions_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_preview_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_tags_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_report_count_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_published_rights_check";

ALTER TABLE "creator_asset"
  ADD CONSTRAINT "creator_asset_license_check"
    CHECK ("license" IN ('toonspectrum-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0')),
  ADD CONSTRAINT "creator_asset_moderation_status_check"
    CHECK ("moderationStatus" IN ('published', 'under_review', 'rejected')),
  ADD CONSTRAINT "creator_asset_mime_type_check"
    CHECK ("mimeType" IS NULL OR "mimeType" IN ('image/png', 'image/jpeg', 'image/webp')),
  ADD CONSTRAINT "creator_asset_byte_size_check"
    CHECK ("byteSize" IS NULL OR "byteSize" BETWEEN 1 AND 2250000),
  ADD CONSTRAINT "creator_asset_content_hash_check"
    CHECK ("contentHash" IS NULL OR "contentHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "creator_asset_dimensions_check"
    CHECK (
      "width" BETWEEN 1 AND 4096
      AND "height" BETWEEN 1 AND 4096
      AND "width"::bigint * "height"::bigint <= 16777216
    ),
  ADD CONSTRAINT "creator_asset_preview_check"
    CHECK ((
      "previewDataUrl" IS NULL
      AND "previewWidth" IS NULL
      AND "previewHeight" IS NULL
      AND "previewMimeType" IS NULL
      AND "previewByteSize" IS NULL
      AND "previewContentHash" IS NULL
    ) OR (
      "previewDataUrl" IS NOT NULL
      AND "previewWidth" IS NOT NULL
      AND "previewHeight" IS NOT NULL
      AND "previewMimeType" IS NOT NULL
      AND "previewByteSize" IS NOT NULL
      AND "previewContentHash" IS NOT NULL
      AND "previewWidth" BETWEEN 1 AND 320
      AND "previewHeight" BETWEEN 1 AND 320
      AND "previewMimeType" IN ('image/png', 'image/jpeg', 'image/webp')
      AND "previewByteSize" BETWEEN 1 AND 131072
      AND "previewContentHash" ~ '^[0-9a-f]{64}$'
    )),
  ADD CONSTRAINT "creator_asset_tags_check" CHECK (jsonb_typeof("tags") = 'array'),
  ADD CONSTRAINT "creator_asset_report_count_check" CHECK ("reportCount" >= 0),
  ADD CONSTRAINT "creator_asset_published_rights_check"
    CHECK ("moderationStatus" <> 'published' OR "rightsConfirmedAt" IS NOT NULL);

CREATE TABLE IF NOT EXISTS "creator_asset_report" (
  "id" text PRIMARY KEY NOT NULL,
  "assetId" text NOT NULL REFERENCES "creator_asset"("id") ON DELETE CASCADE,
  "reporterId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "details" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "resolutionNote" text NOT NULL DEFAULT '',
  "reviewedBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_asset_report_asset_reporter_unique" UNIQUE ("assetId", "reporterId"),
  CONSTRAINT "creator_asset_report_reason_check"
    CHECK ("reason" IN ('copyright', 'unsafe', 'spam', 'misleading', 'other')),
  CONSTRAINT "creator_asset_report_status_check"
    CHECK ("status" IN ('open', 'resolved', 'dismissed'))
);

ALTER TABLE "creator_asset_report"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "assetId" SET NOT NULL,
  ALTER COLUMN "reporterId" SET NOT NULL,
  ALTER COLUMN "reason" SET NOT NULL,
  ALTER COLUMN "details" SET DEFAULT '',
  ALTER COLUMN "details" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'open',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "resolutionNote" SET DEFAULT '',
  ALTER COLUMN "resolutionNote" SET NOT NULL,
  ALTER COLUMN "reviewedBy" DROP NOT NULL,
  ALTER COLUMN "reviewedAt" DROP NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET NOT NULL;

-- Repair report constraints just as strictly. Duplicate reporter/asset pairs or unknown enum rows
-- make the migration fail closed instead of leaving the API on a weaker contract.
ALTER TABLE "creator_asset_report"
  DROP CONSTRAINT IF EXISTS "creator_asset_report_asset_reporter_unique",
  DROP CONSTRAINT IF EXISTS "creator_asset_report_reason_check",
  DROP CONSTRAINT IF EXISTS "creator_asset_report_status_check";

ALTER TABLE "creator_asset_report"
  ADD CONSTRAINT "creator_asset_report_asset_reporter_unique" UNIQUE ("assetId", "reporterId"),
  ADD CONSTRAINT "creator_asset_report_reason_check"
    CHECK ("reason" IN ('copyright', 'unsafe', 'spam', 'misleading', 'other')),
  ADD CONSTRAINT "creator_asset_report_status_check"
    CHECK ("status" IN ('open', 'resolved', 'dismissed'));

-- CREATE INDEX IF NOT EXISTS is insufficient here: it accepts an index with the right name but
-- wrong table, key order, sort direction, uniqueness, predicate, expression, or INCLUDE columns.
-- Remove an accidental same-name constraint first, then rebuild the exact canonical btree shape.
ALTER TABLE "creator_asset"
  DROP CONSTRAINT IF EXISTS "creator_asset_created_idx",
  DROP CONSTRAINT IF EXISTS "idx_creator_asset_user",
  DROP CONSTRAINT IF EXISTS "idx_creator_asset_catalog",
  DROP CONSTRAINT IF EXISTS "idx_creator_asset_downloads",
  DROP CONSTRAINT IF EXISTS "creator_asset_owner_hash_unique";
ALTER TABLE "creator_asset_report"
  DROP CONSTRAINT IF EXISTS "idx_creator_asset_report_queue",
  DROP CONSTRAINT IF EXISTS "idx_creator_asset_report_reporter";

DROP INDEX IF EXISTS "creator_asset_created_idx";
DROP INDEX IF EXISTS "idx_creator_asset_user";
DROP INDEX IF EXISTS "idx_creator_asset_catalog";
DROP INDEX IF EXISTS "idx_creator_asset_downloads";
DROP INDEX IF EXISTS "creator_asset_owner_hash_unique";
DROP INDEX IF EXISTS "idx_creator_asset_report_queue";
DROP INDEX IF EXISTS "idx_creator_asset_report_reporter";

CREATE INDEX "creator_asset_created_idx"
  ON "creator_asset" USING btree ("createdAt" ASC NULLS LAST);
CREATE INDEX "idx_creator_asset_user"
  ON "creator_asset" USING btree ("userId" ASC NULLS LAST);
CREATE INDEX "idx_creator_asset_catalog"
  ON "creator_asset" USING btree (
    "moderationStatus" ASC NULLS LAST,
    "hidden" ASC NULLS LAST,
    "createdAt" DESC NULLS FIRST
  );
CREATE INDEX "idx_creator_asset_downloads"
  ON "creator_asset" USING btree (
    "downloads" DESC NULLS FIRST,
    "createdAt" DESC NULLS FIRST
  );
CREATE UNIQUE INDEX "creator_asset_owner_hash_unique"
  ON "creator_asset" USING btree ("userId" ASC NULLS LAST, "contentHash" ASC NULLS LAST)
  WHERE "contentHash" IS NOT NULL;
CREATE INDEX "idx_creator_asset_report_queue"
  ON "creator_asset_report" USING btree ("status" ASC NULLS LAST, "createdAt" ASC NULLS LAST);
CREATE INDEX "idx_creator_asset_report_reporter"
  ON "creator_asset_report" USING btree (
    "reporterId" ASC NULLS LAST,
    "createdAt" DESC NULLS FIRST
  );

COMMIT;
