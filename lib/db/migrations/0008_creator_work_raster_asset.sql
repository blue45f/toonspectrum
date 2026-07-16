-- Immutable, content-addressed raster tile bodies for semantic CRDT operations.
-- Yjs stores only the exact manifest reference; fully decoded/validated PNG bytes stay private.
-- The only DELETE route is receipt-bound upload compensation: it shares the CRDT mutation lock,
-- requires the exact uploader/metadata, and refuses identities present in durable history.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_raster_asset" (
  "workId" text NOT NULL,
  "assetId" text NOT NULL,
  "mediaType" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "payload" bytea NOT NULL,
  "byteLength" integer NOT NULL,
  "sha256" text NOT NULL,
  "uploadedBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_raster_asset_pkey" PRIMARY KEY ("workId", "assetId"),
  CONSTRAINT "creator_work_raster_asset_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_raster_asset_uploaded_by_fkey"
    FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_raster_asset_content_address_check"
    CHECK ("assetId" = "sha256" AND "assetId" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "creator_work_raster_asset_media_type_check"
    CHECK ("mediaType" = 'image/png'),
  CONSTRAINT "creator_work_raster_asset_dimensions_check"
    CHECK ("width" BETWEEN 1 AND 1024 AND "height" BETWEEN 1 AND 1024),
  CONSTRAINT "creator_work_raster_asset_byte_length_check"
    CHECK ("byteLength" BETWEEN 1 AND 16777216),
  CONSTRAINT "creator_work_raster_asset_payload_size_check"
    CHECK (octet_length("payload") = "byteLength")
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_raster_asset_uploader_created"
  ON "creator_work_raster_asset" ("uploadedBy", "createdAt" DESC);

COMMIT;
