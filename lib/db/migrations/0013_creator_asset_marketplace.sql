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

-- Rows that predate the rights-aware catalog have no explicit grant from their owner. Keep them
-- visible to the owner for review, but never silently publish them under a newly assigned license.
UPDATE "creator_asset"
SET "moderationStatus" = 'under_review'
WHERE "rightsConfirmedAt" IS NULL
  AND "moderationStatus" = 'published';

ALTER TABLE "creator_asset"
  ALTER COLUMN "moderationStatus" SET DEFAULT 'under_review';

CREATE INDEX IF NOT EXISTS "idx_creator_asset_catalog"
  ON "creator_asset" ("moderationStatus", "hidden", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_creator_asset_downloads"
  ON "creator_asset" ("downloads" DESC, "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "creator_asset_owner_hash_unique"
  ON "creator_asset" ("userId", "contentHash") WHERE "contentHash" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_license_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_license_check"
      CHECK ("license" IN ('toonspectrum-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_moderation_status_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_moderation_status_check"
      CHECK ("moderationStatus" IN ('published', 'under_review', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_mime_type_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_mime_type_check"
      CHECK ("mimeType" IS NULL OR "mimeType" IN ('image/png', 'image/jpeg', 'image/webp'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_byte_size_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_byte_size_check"
      CHECK ("byteSize" IS NULL OR "byteSize" BETWEEN 1 AND 2250000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_content_hash_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_content_hash_check"
      CHECK ("contentHash" IS NULL OR "contentHash" ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_dimensions_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_dimensions_check"
      CHECK ("width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096 AND "width"::bigint * "height"::bigint <= 16777216);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_preview_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_preview_check"
      CHECK ((
        "previewDataUrl" IS NULL
        AND "previewWidth" IS NULL
        AND "previewHeight" IS NULL
        AND "previewMimeType" IS NULL
        AND "previewByteSize" IS NULL
        AND "previewContentHash" IS NULL
      ) OR (
        "previewDataUrl" IS NOT NULL
        AND "previewWidth" BETWEEN 1 AND 320
        AND "previewHeight" BETWEEN 1 AND 320
        AND "previewMimeType" IN ('image/png', 'image/jpeg', 'image/webp')
        AND "previewByteSize" BETWEEN 1 AND 131072
        AND "previewContentHash" ~ '^[0-9a-f]{64}$'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_tags_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_tags_check"
      CHECK (jsonb_typeof("tags") = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_report_count_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_report_count_check"
      CHECK ("reportCount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_asset_published_rights_check') THEN
    ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_published_rights_check"
      CHECK ("moderationStatus" <> 'published' OR "rightsConfirmedAt" IS NOT NULL);
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS "idx_creator_asset_report_queue"
  ON "creator_asset_report" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_creator_asset_report_reporter"
  ON "creator_asset_report" ("reporterId", "createdAt" DESC);

COMMIT;
