-- Immutable, content-addressed media used by public creator-work cover/page routes.
-- Multiple digests can coexist for one slot so an already published revision remains readable while
-- a replacement upload is prepared. creator_work.cover/pages select the current digest by URL.
BEGIN;

CREATE TABLE IF NOT EXISTS public.creator_work_publication_media (
  "workId" text NOT NULL,
  slot text NOT NULL,
  "pageIndex" integer,
  purpose text NOT NULL DEFAULT 'export',
  "objectDigest" text NOT NULL,
  "mediaType" text NOT NULL,
  "byteLength" bigint NOT NULL,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT creator_work_publication_media_pkey
    PRIMARY KEY ("workId", slot, "objectDigest"),
  CONSTRAINT creator_work_publication_media_work_fkey
    FOREIGN KEY ("workId") REFERENCES public.creator_work(id) ON DELETE CASCADE,
  CONSTRAINT creator_work_publication_media_object_fkey
    FOREIGN KEY (purpose, "objectDigest")
    REFERENCES public.creator_asset_storage_object(purpose, digest) ON DELETE RESTRICT,
  CONSTRAINT creator_work_publication_media_created_by_fkey
    FOREIGN KEY ("createdBy") REFERENCES public."user"(id) ON DELETE SET NULL,
  CONSTRAINT creator_work_publication_media_purpose_check
    CHECK (purpose = 'export'),
  CONSTRAINT creator_work_publication_media_slot_check
    CHECK (
      (slot = 'cover' AND "pageIndex" IS NULL)
      OR (
        slot ~ '^page:[0-9]+$'
        AND "pageIndex" BETWEEN 0 AND 9999
        AND slot = 'page:' || "pageIndex"::text
      )
    ),
  CONSTRAINT creator_work_publication_media_digest_check
    CHECK ("objectDigest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT creator_work_publication_media_type_check
    CHECK ("mediaType" IN (
      'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'
    )),
  CONSTRAINT creator_work_publication_media_byte_length_check
    CHECK ("byteLength" BETWEEN 1 AND 33554432)
);

CREATE INDEX IF NOT EXISTS idx_creator_work_publication_media_object
  ON public.creator_work_publication_media (purpose, "objectDigest");
CREATE INDEX IF NOT EXISTS idx_creator_work_publication_media_work_created
  ON public.creator_work_publication_media ("workId", "createdAt" DESC);

REVOKE ALL ON TABLE public.creator_work_publication_media FROM PUBLIC;

DO $creator_work_publication_media_contract$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.creator_work_publication_media'::regclass
      AND conname = ANY(ARRAY[
        'creator_work_publication_media_pkey',
        'creator_work_publication_media_work_fkey',
        'creator_work_publication_media_object_fkey',
        'creator_work_publication_media_created_by_fkey',
        'creator_work_publication_media_purpose_check',
        'creator_work_publication_media_slot_check',
        'creator_work_publication_media_digest_check',
        'creator_work_publication_media_type_check',
        'creator_work_publication_media_byte_length_check'
      ]::text[])
  ) <> 9 THEN
    RAISE EXCEPTION 'creator work publication media constraints are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('idx_creator_work_publication_media_object'),
      ('idx_creator_work_publication_media_work_created')
    ) AS required_index(name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS index_record
      JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = index_record.relnamespace
      JOIN pg_catalog.pg_index AS index_state
        ON index_state.indexrelid = index_record.oid
      WHERE index_record.relname = required_index.name
        AND index_namespace.nspname = 'public'
        AND index_record.relkind = 'i'
        AND index_state.indisvalid
        AND index_state.indisready
        AND index_state.indislive
    )
  ) THEN
    RAISE EXCEPTION 'creator work publication media indexes are incomplete';
  END IF;
END
$creator_work_publication_media_contract$;

COMMIT;
