-- Private, work-scoped binary bodies for topology-only CRDT asset references.
-- The realtime Yjs stream keeps only assetId/elementType; raster/model bytes never enter a 48 KiB
-- update. Rows share the work lifecycle and disappear through ON DELETE CASCADE.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_asset" (
  "workId" text NOT NULL,
  "assetId" text NOT NULL,
  "elementType" text NOT NULL,
  "mimeType" text NOT NULL,
  "descriptor" jsonb NOT NULL,
  "payload" bytea NOT NULL,
  "byteSize" integer NOT NULL,
  "sha256" text NOT NULL,
  "intrinsicWidth" integer,
  "intrinsicHeight" integer,
  "decodedRgbaBytes" integer,
  "uploadedBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_asset_pkey" PRIMARY KEY ("workId", "assetId"),
  CONSTRAINT "creator_work_asset_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_asset_uploaded_by_fkey"
    FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_asset_id_check"
    CHECK (length("assetId") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_asset_element_type_check"
    CHECK ("elementType" IN ('image', 'vrm', 'background3d')),
  CONSTRAINT "creator_work_asset_media_contract_check"
    CHECK (
      (
        "elementType" = 'image'
        AND "mimeType" IN ('image/png', 'image/jpeg', 'image/webp')
        AND "byteSize" <= 8388608
      )
      OR (
        "elementType" IN ('vrm', 'background3d')
        AND "mimeType" = 'model/gltf-binary'
        AND "byteSize" <= 12582912
      )
    ),
  CONSTRAINT "creator_work_asset_byte_size_check"
    CHECK ("byteSize" BETWEEN 1 AND 12582912),
  CONSTRAINT "creator_work_asset_payload_size_check"
    CHECK (octet_length("payload") = "byteSize"),
  CONSTRAINT "creator_work_asset_intrinsic_image_check"
    CHECK ((
      (
        "elementType" = 'image'
        AND "intrinsicWidth" BETWEEN 1 AND 16384
        AND "intrinsicHeight" BETWEEN 1 AND 16384
        AND "decodedRgbaBytes" BETWEEN 4 AND 67108864
        AND "decodedRgbaBytes"::bigint =
          "intrinsicWidth"::bigint * "intrinsicHeight"::bigint * 4
      )
      OR (
        "elementType" IN ('vrm', 'background3d')
        AND "intrinsicWidth" IS NULL
        AND "intrinsicHeight" IS NULL
        AND "decodedRgbaBytes" IS NULL
      )
    ) IS TRUE),
  CONSTRAINT "creator_work_asset_sha256_check"
    CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "creator_work_asset_descriptor_check"
    CHECK ((
      jsonb_typeof("descriptor") = 'object'
      AND "descriptor"->>'version' = '1'
      AND jsonb_typeof("descriptor"->'element') = 'object'
      AND "descriptor"->'element'->>'id' = "assetId"
      AND "descriptor"->'element'->>'type' = "elementType"
    ) IS TRUE)
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_asset_uploader_updated"
  ON "creator_work_asset" ("uploadedBy", "updatedAt" DESC);

-- CRDT asset IDs are immutable identities. Deleting a payload permanently reserves its ID so an
-- offline peer can never reconnect and resolve an old reference to unrelated replacement bytes.
CREATE TABLE IF NOT EXISTS "creator_work_asset_tombstone" (
  "workId" text NOT NULL,
  "assetId" text NOT NULL,
  "elementType" text NOT NULL,
  "deletedBy" text,
  "deletedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_asset_tombstone_pkey" PRIMARY KEY ("workId", "assetId"),
  CONSTRAINT "creator_work_asset_tombstone_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_asset_tombstone_deleted_by_fkey"
    FOREIGN KEY ("deletedBy") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_asset_tombstone_id_check"
    CHECK (length("assetId") BETWEEN 1 AND 160),
  CONSTRAINT "creator_work_asset_tombstone_element_type_check"
    CHECK ("elementType" IN ('image', 'vrm', 'background3d'))
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_asset_tombstone_deleted_by"
  ON "creator_work_asset_tombstone" ("deletedBy", "deletedAt" DESC);

COMMIT;
