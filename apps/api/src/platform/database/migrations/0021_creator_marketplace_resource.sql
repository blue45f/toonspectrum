-- Metadata-first marketplace for original or explicitly permissive Studio resources.
-- The table never stores raster/model binaries, data URLs, blob URLs, or remote content bodies.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_marketplace_resource" (
  "id" text PRIMARY KEY NOT NULL,
  "publisherId" text NOT NULL,
  "packageId" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "kind" text NOT NULL,
  "resourceVersion" text NOT NULL,
  "minimumStudioVersion" text NOT NULL,
  "license" text NOT NULL,
  "provenanceOrigin" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "manifestHash" text NOT NULL,
  "manifestByteSize" integer NOT NULL,
  "hidden" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_marketplace_resource_publisher_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_marketplace_resource_publisher_package_version_unique"
    UNIQUE ("publisherId", "packageId", "resourceVersion"),
  CONSTRAINT "creator_marketplace_resource_kind_check"
    CHECK ("kind" IN ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset')),
  CONSTRAINT "creator_marketplace_resource_license_check"
    CHECK ("license" IN ('toonspectrum-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0')),
  CONSTRAINT "creator_marketplace_resource_origin_check"
    CHECK ("provenanceOrigin" IN ('original', 'permissive')),
  CONSTRAINT "creator_marketplace_resource_package_id_check"
    CHECK ("packageId" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
  CONSTRAINT "creator_marketplace_resource_version_check"
    CHECK (
      "resourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
      AND "minimumStudioVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
    ),
  CONSTRAINT "creator_marketplace_resource_manifest_hash_check"
    CHECK ("manifestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "creator_marketplace_resource_manifest_size_check"
    CHECK ("manifestByteSize" BETWEEN 1 AND 65536),
  CONSTRAINT "creator_marketplace_resource_manifest_shape_check"
    CHECK ((
      jsonb_typeof("manifest") = 'object'
      AND "manifest"->>'schemaVersion' = '1'
      AND "manifest"->>'packageId' = "packageId"
      AND "manifest"->>'kind' = "kind"
      AND "manifest"->>'resourceVersion' = "resourceVersion"
      AND "manifest"->>'minimumStudioVersion' = "minimumStudioVersion"
      AND "manifest"->>'license' = "license"
      AND "manifest"->'provenance'->>'origin' = "provenanceOrigin"
      AND jsonb_typeof("manifest"->'entries') = 'array'
      AND jsonb_array_length("manifest"->'entries') BETWEEN 1 AND 32
    ) IS TRUE)
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_marketplace_resource_publisher_manifest_hash_unique"
  ON "creator_marketplace_resource" ("publisherId", "manifestHash");

CREATE INDEX IF NOT EXISTS "idx_creator_marketplace_resource_catalog"
  ON "creator_marketplace_resource" ("hidden", "kind", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_creator_marketplace_resource_publisher"
  ON "creator_marketplace_resource" ("publisherId", "createdAt" DESC, "id" DESC);

COMMIT;
