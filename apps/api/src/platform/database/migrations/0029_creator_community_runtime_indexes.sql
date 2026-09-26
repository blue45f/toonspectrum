-- Align the canonical creator-community lookup indexes with the runtime readiness contract.
-- Fully migrated databases can then use the read-only fast path; DDL remains owned by the
-- migration role rather than the API runtime role.

BEGIN;

DROP INDEX IF EXISTS public."idx_creator_work_series_episode";
DROP INDEX IF EXISTS public."idx_creator_work_challenge_created";

DO $creator_community_indexes$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = 'creator_work_series_idx'
      AND index_record.relkind = 'i'
      AND index_state.indrelid = 'public.creator_work'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
      AND NOT index_state.indisunique
      AND NOT index_state.indisprimary
      AND NOT index_state.indisexclusion
      AND index_state.indpred IS NULL
      AND index_state.indexprs IS NULL
      AND index_state.indnatts = index_state.indnkeyatts
      AND (
        SELECT array_agg(attribute_record.attname ORDER BY key_record.ordinality)
        FROM unnest(index_state.indkey) WITH ORDINALITY
          AS key_record(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute_record
          ON attribute_record.attrelid = index_state.indrelid
          AND attribute_record.attnum = key_record.attnum
        WHERE key_record.ordinality <= index_state.indnkeyatts
      ) = ARRAY['seriesId', 'episodeNo']::name[]
  ) THEN
    DROP INDEX IF EXISTS public."creator_work_series_idx";
    CREATE INDEX "creator_work_series_idx"
      ON public."creator_work" ("seriesId", "episodeNo");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = 'creator_work_challenge_idx'
      AND index_record.relkind = 'i'
      AND index_state.indrelid = 'public.creator_work'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
      AND NOT index_state.indisunique
      AND NOT index_state.indisprimary
      AND NOT index_state.indisexclusion
      AND index_state.indpred IS NULL
      AND index_state.indexprs IS NULL
      AND index_state.indnatts = index_state.indnkeyatts
      AND (
        SELECT array_agg(attribute_record.attname ORDER BY key_record.ordinality)
        FROM unnest(index_state.indkey) WITH ORDINALITY
          AS key_record(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute_record
          ON attribute_record.attrelid = index_state.indrelid
          AND attribute_record.attnum = key_record.attnum
        WHERE key_record.ordinality <= index_state.indnkeyatts
      ) = ARRAY['challengeId']::name[]
  ) THEN
    DROP INDEX IF EXISTS public."creator_work_challenge_idx";
    CREATE INDEX "creator_work_challenge_idx"
      ON public."creator_work" ("challengeId");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = 'creator_series_user_idx'
      AND index_record.relkind = 'i'
      AND index_state.indrelid = 'public.creator_series'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
      AND NOT index_state.indisunique
      AND NOT index_state.indisprimary
      AND NOT index_state.indisexclusion
      AND index_state.indpred IS NULL
      AND index_state.indexprs IS NULL
      AND index_state.indnatts = index_state.indnkeyatts
      AND (
        SELECT array_agg(attribute_record.attname ORDER BY key_record.ordinality)
        FROM unnest(index_state.indkey) WITH ORDINALITY
          AS key_record(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute_record
          ON attribute_record.attrelid = index_state.indrelid
          AND attribute_record.attnum = key_record.attnum
        WHERE key_record.ordinality <= index_state.indnkeyatts
      ) = ARRAY['userId']::name[]
  ) THEN
    DROP INDEX IF EXISTS public."creator_series_user_idx";
    CREATE INDEX "creator_series_user_idx"
      ON public."creator_series" ("userId");
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      (
        'creator_work_series_idx',
        'public.creator_work'::regclass,
        ARRAY['seriesId', 'episodeNo']::name[]
      ),
      (
        'creator_work_challenge_idx',
        'public.creator_work'::regclass,
        ARRAY['challengeId']::name[]
      ),
      (
        'creator_series_user_idx',
        'public.creator_series'::regclass,
        ARRAY['userId']::name[]
      )
    ) AS expected_index("indexName", "relationId", "columns")
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS index_record
      JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = index_record.relnamespace
      JOIN pg_catalog.pg_index AS index_state
        ON index_state.indexrelid = index_record.oid
      WHERE index_namespace.nspname = 'public'
        AND index_record.relname = expected_index."indexName"
        AND index_record.relkind = 'i'
        AND index_state.indrelid = expected_index."relationId"
        AND index_state.indisvalid
        AND index_state.indisready
        AND index_state.indislive
        AND NOT index_state.indisunique
        AND NOT index_state.indisprimary
        AND NOT index_state.indisexclusion
        AND index_state.indpred IS NULL
        AND index_state.indexprs IS NULL
        AND index_state.indnatts = index_state.indnkeyatts
        AND (
          SELECT array_agg(attribute_record.attname ORDER BY key_record.ordinality)
          FROM unnest(index_state.indkey) WITH ORDINALITY
            AS key_record(attnum, ordinality)
          JOIN pg_catalog.pg_attribute AS attribute_record
            ON attribute_record.attrelid = index_state.indrelid
            AND attribute_record.attnum = key_record.attnum
          WHERE key_record.ordinality <= index_state.indnkeyatts
        ) = expected_index."columns"
    )
  ) THEN
    RAISE EXCEPTION 'creator community runtime indexes are incomplete';
  END IF;
END
$creator_community_indexes$;

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0029_creator_community_runtime_indexes', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
