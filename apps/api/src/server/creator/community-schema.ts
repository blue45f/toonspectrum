// 커뮤니티 확장 스키마: 마이그레이션 상태를 먼저 검증하고 레거시 DB만 멱등 보정한다.
import { dbPool } from "../../db";

const VERIFY_COMMUNITY_SCHEMA_SQL = `
  WITH
    creator_work_access AS (
      SELECT
        "id", "userId", "titleId", "title", "description", "cover", "tags", "format",
        "pages", "doc", "status", "hidden", "views", "revision", "seriesId", "episodeNo",
        "challengeId", "remixFromId", "createdAt", "updatedAt"
      FROM "creator_work"
      LIMIT 0
    ),
    creator_work_revision_access AS (
      SELECT "workId", "revision", "snapshot", "restoredFromRevision", "createdAt"
      FROM "creator_work_revision"
      LIMIT 0
    ),
    creator_series_access AS (
      SELECT
        "id", "userId", "author", "avatar", "title", "description", "cover", "tags",
        "status", "hidden", "createdAt", "updatedAt"
      FROM "creator_series"
      LIMIT 0
    ),
    creator_challenge_access AS (
      SELECT "id", "slug", "title", "theme", "startsAt", "endsAt", "createdAt"
      FROM "creator_challenge"
      LIMIT 0
    ),
    creator_follow_access AS (
      SELECT "followerId", "creatorId", "createdAt"
      FROM "creator_follow"
      LIMIT 0
    ),
    normalized_check_constraints AS (
      SELECT
        constraint_row.conrelid AS "relationId",
        constraint_row.conname AS "constraintName",
        constraint_row.convalidated AS "validated",
        regexp_replace(
          replace(
            lower(pg_get_expr(constraint_row.conbin, constraint_row.conrelid)),
            '::text',
            ''
          ),
          '[[:space:]"()]',
          '',
          'g'
        ) AS "expression"
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.contype = 'c'
        AND constraint_row.conrelid IN (
          'creator_work'::regclass,
          'creator_work_revision'::regclass
        )
    )
  SELECT (
    (SELECT count(*) FROM creator_work_access) = 0
    AND (SELECT count(*) FROM creator_work_revision_access) = 0
    AND (SELECT count(*) FROM creator_series_access) = 0
    AND (SELECT count(*) FROM creator_challenge_access) = 0
    AND (SELECT count(*) FROM creator_follow_access) = 0
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute_row
      LEFT JOIN pg_attrdef AS default_row
        ON default_row.adrelid = attribute_row.attrelid
       AND default_row.adnum = attribute_row.attnum
      WHERE attribute_row.attrelid = 'creator_work'::regclass
        AND attribute_row.attname = 'revision'
        AND NOT attribute_row.attisdropped
        AND attribute_row.attnotnull
        AND format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'integer'
        AND pg_get_expr(default_row.adbin, default_row.adrelid) IN ('1', '1::integer')
    )
    AND EXISTS (
      SELECT 1 FROM normalized_check_constraints
      WHERE "relationId" = 'creator_work'::regclass
        AND "constraintName" = 'creator_work_revision_value_positive_check'
        AND "validated"
        AND "expression" = 'revision>=1'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = 'creator_work_revision'::regclass
        AND attribute_row.attname = 'workId'
        AND NOT attribute_row.attisdropped
        AND attribute_row.attnotnull
        AND format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'text'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = 'creator_work_revision'::regclass
        AND attribute_row.attname = 'revision'
        AND NOT attribute_row.attisdropped
        AND attribute_row.attnotnull
        AND format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'integer'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = 'creator_work_revision'::regclass
        AND attribute_row.attname = 'snapshot'
        AND NOT attribute_row.attisdropped
        AND attribute_row.attnotnull
        AND format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'jsonb'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = 'creator_work_revision'::regclass
        AND attribute_row.attname = 'restoredFromRevision'
        AND NOT attribute_row.attisdropped
        AND NOT attribute_row.attnotnull
        AND format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'integer'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute_row
      LEFT JOIN pg_attrdef AS default_row
        ON default_row.adrelid = attribute_row.attrelid
       AND default_row.adnum = attribute_row.attnum
      WHERE attribute_row.attrelid = 'creator_work_revision'::regclass
        AND attribute_row.attname = 'createdAt'
        AND NOT attribute_row.attisdropped
        AND attribute_row.attnotnull
        AND format_type(attribute_row.atttypid, attribute_row.atttypmod)
          = 'timestamp with time zone'
        AND lower(pg_get_expr(default_row.adbin, default_row.adrelid))
          IN ('current_timestamp', 'now()')
    )
    AND EXISTS (
      SELECT 1 FROM normalized_check_constraints
      WHERE "relationId" = 'creator_work_revision'::regclass
        AND "constraintName" = 'creator_work_revision_positive_check'
        AND "validated"
        AND "expression" = 'revision>=1'
    )
    AND EXISTS (
      SELECT 1 FROM normalized_check_constraints
      WHERE "relationId" = 'creator_work_revision'::regclass
        AND "constraintName" = 'creator_work_revision_restored_from_positive_check'
        AND "validated"
        AND "expression" = 'restoredfromrevisionisnullorrestoredfromrevision>=1'
    )
    AND EXISTS (
      SELECT 1 FROM normalized_check_constraints
      WHERE "relationId" = 'creator_work_revision'::regclass
        AND "constraintName" = 'creator_work_revision_snapshot_object_check'
        AND "validated"
        AND "expression" = 'jsonb_typeofsnapshot=''object'''
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'creator_work_revision'::regclass
        AND constraint_row.contype = 'p'
        AND constraint_row.convalidated
        AND (
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.conrelid
           AND attribute_row.attnum = key_row.attnum
        ) = ARRAY['workId', 'revision']::name[]
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'creator_work_revision'::regclass
        AND constraint_row.confrelid = 'creator_work'::regclass
        AND constraint_row.contype = 'f'
        AND constraint_row.convalidated
        AND constraint_row.confdeltype = 'c'
        AND (
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.conrelid
           AND attribute_row.attnum = key_row.attnum
        ) = ARRAY['workId']::name[]
        AND (
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.confrelid
           AND attribute_row.attnum = key_row.attnum
        ) = ARRAY['id']::name[]
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "creator_work" AS work
      WHERE NOT EXISTS (
        SELECT 1
        FROM "creator_work_revision" AS work_revision
        WHERE work_revision."workId" = work."id"
          AND work_revision."revision" = work."revision"
      )
    )
  ) AS "ready";
`;

const CREATE_COMMUNITY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS "creator_work" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "titleId" text,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "cover" text NOT NULL DEFAULT '',
    "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "format" text NOT NULL DEFAULT 'cuttoon',
    "pages" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "doc" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "status" text NOT NULL DEFAULT 'published',
    "hidden" boolean NOT NULL DEFAULT false,
    "views" integer NOT NULL DEFAULT 0,
    "revision" integer NOT NULL DEFAULT 1,
    "createdAt" timestamp,
    "updatedAt" timestamp
  );
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "revision" integer;
  UPDATE "creator_work" SET "revision" = 1 WHERE "revision" IS NULL;
  ALTER TABLE "creator_work"
    ALTER COLUMN "revision" SET DEFAULT 1,
    ALTER COLUMN "revision" SET NOT NULL;
  ALTER TABLE "creator_work"
    DROP CONSTRAINT IF EXISTS "creator_work_revision_value_positive_check";
  ALTER TABLE "creator_work"
    ADD CONSTRAINT "creator_work_revision_value_positive_check" CHECK ("revision" >= 1);
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "seriesId" text;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "episodeNo" integer;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "challengeId" text;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "remixFromId" text;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index AS index_state
      JOIN pg_class AS index_row ON index_row.oid = index_state.indexrelid
      WHERE index_state.indrelid = 'creator_work'::regclass
        AND index_row.relname = 'creator_work_series_idx'
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
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(index_state.indkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = index_state.indrelid
           AND attribute_row.attnum = key_row.attnum
          WHERE key_row.ordinality <= index_state.indnkeyatts
        ) = ARRAY['seriesId', 'episodeNo']::name[]
    ) THEN
      DROP INDEX IF EXISTS "creator_work_series_idx";
      CREATE INDEX "creator_work_series_idx" ON "creator_work" ("seriesId", "episodeNo");
    END IF;
  END $$;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index AS index_state
      JOIN pg_class AS index_row ON index_row.oid = index_state.indexrelid
      WHERE index_state.indrelid = 'creator_work'::regclass
        AND index_row.relname = 'creator_work_challenge_idx'
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
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(index_state.indkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = index_state.indrelid
           AND attribute_row.attnum = key_row.attnum
          WHERE key_row.ordinality <= index_state.indnkeyatts
        ) = ARRAY['challengeId']::name[]
    ) THEN
      DROP INDEX IF EXISTS "creator_work_challenge_idx";
      CREATE INDEX "creator_work_challenge_idx" ON "creator_work" ("challengeId");
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS "creator_work_revision" (
    "workId" text NOT NULL,
    "revision" integer NOT NULL,
    "snapshot" jsonb NOT NULL,
    "restoredFromRevision" integer,
    "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creator_work_revision_pkey" PRIMARY KEY ("workId", "revision"),
    CONSTRAINT "creator_work_revision_work_id_fkey"
      FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
    CONSTRAINT "creator_work_revision_positive_check" CHECK ("revision" >= 1),
    CONSTRAINT "creator_work_revision_restored_from_positive_check"
      CHECK ("restoredFromRevision" IS NULL OR "restoredFromRevision" >= 1),
    CONSTRAINT "creator_work_revision_snapshot_object_check"
      CHECK (jsonb_typeof("snapshot") = 'object')
  );
  ALTER TABLE "creator_work_revision" ADD COLUMN IF NOT EXISTS "workId" text;
  ALTER TABLE "creator_work_revision" ADD COLUMN IF NOT EXISTS "revision" integer;
  ALTER TABLE "creator_work_revision" ADD COLUMN IF NOT EXISTS "snapshot" jsonb;
  ALTER TABLE "creator_work_revision" ADD COLUMN IF NOT EXISTS "restoredFromRevision" integer;
  ALTER TABLE "creator_work_revision"
    ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP;
  UPDATE "creator_work_revision" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
  ALTER TABLE "creator_work_revision"
    ALTER COLUMN "workId" SET NOT NULL,
    ALTER COLUMN "revision" SET NOT NULL,
    ALTER COLUMN "snapshot" SET NOT NULL,
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "createdAt" SET NOT NULL;
  ALTER TABLE "creator_work_revision"
    DROP CONSTRAINT IF EXISTS "creator_work_revision_positive_check";
  ALTER TABLE "creator_work_revision"
    ADD CONSTRAINT "creator_work_revision_positive_check" CHECK ("revision" >= 1);
  ALTER TABLE "creator_work_revision"
    DROP CONSTRAINT IF EXISTS "creator_work_revision_restored_from_positive_check";
  ALTER TABLE "creator_work_revision"
    ADD CONSTRAINT "creator_work_revision_restored_from_positive_check"
      CHECK ("restoredFromRevision" IS NULL OR "restoredFromRevision" >= 1);
  ALTER TABLE "creator_work_revision"
    DROP CONSTRAINT IF EXISTS "creator_work_revision_snapshot_object_check";
  ALTER TABLE "creator_work_revision"
    ADD CONSTRAINT "creator_work_revision_snapshot_object_check"
      CHECK (jsonb_typeof("snapshot") = 'object');

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'creator_work_revision'::regclass
        AND constraint_row.contype = 'p'
        AND (
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.conrelid
           AND attribute_row.attnum = key_row.attnum
        ) = ARRAY['workId', 'revision']::name[]
    ) THEN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'creator_work_revision'::regclass
          AND conname = 'creator_work_revision_pkey'
      ) THEN
        ALTER TABLE "creator_work_revision"
          DROP CONSTRAINT "creator_work_revision_pkey";
      END IF;
      ALTER TABLE "creator_work_revision"
        ADD CONSTRAINT "creator_work_revision_pkey" PRIMARY KEY ("workId", "revision");
    END IF;
  END $$;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'creator_work_revision'::regclass
        AND constraint_row.confrelid = 'creator_work'::regclass
        AND constraint_row.contype = 'f'
        AND constraint_row.convalidated
        AND constraint_row.confdeltype = 'c'
        AND (
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.conrelid
           AND attribute_row.attnum = key_row.attnum
        ) = ARRAY['workId']::name[]
        AND (
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.confrelid
           AND attribute_row.attnum = key_row.attnum
        ) = ARRAY['id']::name[]
    ) THEN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'creator_work_revision'::regclass
          AND conname = 'creator_work_revision_work_id_fkey'
      ) THEN
        ALTER TABLE "creator_work_revision"
          DROP CONSTRAINT "creator_work_revision_work_id_fkey";
      END IF;
      ALTER TABLE "creator_work_revision"
        ADD CONSTRAINT "creator_work_revision_work_id_fkey"
          FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE;
    END IF;
  END $$;

  INSERT INTO "creator_work_revision" ("workId", "revision", "snapshot", "createdAt")
  SELECT
    work."id",
    work."revision",
    jsonb_build_object(
      'titleId', work."titleId",
      'title', work."title",
      'description', COALESCE(work."description", ''),
      'cover', COALESCE(work."cover", ''),
      'tags', COALESCE(work."tags", '[]'::jsonb),
      'format', COALESCE(work."format", 'cuttoon'),
      'pages', COALESCE(work."pages", '[]'::jsonb),
      'doc', COALESCE(work."doc", '{}'::jsonb),
      'status', COALESCE(work."status", 'draft'),
      'seriesId', work."seriesId",
      'episodeNo', work."episodeNo",
      'challengeId', work."challengeId",
      'remixFromId', work."remixFromId"
    ),
    COALESCE(work."updatedAt", work."createdAt", CURRENT_TIMESTAMP)
  FROM "creator_work" AS work
  ON CONFLICT ("workId", "revision") DO NOTHING;

  CREATE TABLE IF NOT EXISTS "creator_series" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "author" text NOT NULL DEFAULT '',
    "avatar" text NOT NULL DEFAULT '',
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "cover" text NOT NULL DEFAULT '',
    "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "status" text NOT NULL DEFAULT 'ongoing',
    "hidden" boolean NOT NULL DEFAULT false,
    "createdAt" timestamp,
    "updatedAt" timestamp
  );
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index AS index_state
      JOIN pg_class AS index_row ON index_row.oid = index_state.indexrelid
      WHERE index_state.indrelid = 'creator_series'::regclass
        AND index_row.relname = 'creator_series_user_idx'
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
          SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
          FROM unnest(index_state.indkey) WITH ORDINALITY AS key_row(attnum, ordinality)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = index_state.indrelid
           AND attribute_row.attnum = key_row.attnum
          WHERE key_row.ordinality <= index_state.indnkeyatts
        ) = ARRAY['userId']::name[]
    ) THEN
      DROP INDEX IF EXISTS "creator_series_user_idx";
      CREATE INDEX "creator_series_user_idx" ON "creator_series" ("userId");
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS "creator_challenge" (
    "id" text PRIMARY KEY NOT NULL,
    "slug" text NOT NULL UNIQUE,
    "title" text NOT NULL,
    "theme" text NOT NULL DEFAULT '',
    "startsAt" timestamp,
    "endsAt" timestamp,
    "createdAt" timestamp
  );
  CREATE TABLE IF NOT EXISTS "creator_follow" (
    "followerId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "creatorId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "createdAt" timestamp,
    CONSTRAINT "creator_follow_pk" PRIMARY KEY ("followerId", "creatorId")
  );
`;

let communitySchemaReady = false;
let communitySchemaEnsurePromise: Promise<boolean> | null = null;

function isRepairableCommunitySchemaShapeError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = Reflect.get(error, "code");
  // The repair batch knows how to add missing community tables and revision columns. Transport,
  // TLS, timeout, and permission failures must retain their original operational classification.
  return code === "42P01" || code === "42703";
}

async function verifyCreatorCommunitySchema(): Promise<boolean> {
  const result = await dbPool.query<{ ready: boolean }>(VERIFY_COMMUNITY_SCHEMA_SQL);
  return result.rows[0]?.ready === true;
}

function incompleteCommunitySchemaError(): Error & { code: string } {
  return Object.assign(
    new Error("Creator community schema remained incomplete after idempotent repair."),
    { code: "CREATOR_COMMUNITY_SCHEMA_INCOMPLETE" }
  );
}

async function ensureCreatorCommunitySchemaUncached(): Promise<boolean> {
  try {
    let ready = false;
    try {
      ready = await verifyCreatorCommunitySchema();
    } catch (error) {
      if (!isRepairableCommunitySchemaShapeError(error)) throw error;
    }

    if (!ready) {
      // This path covers both missing shape and shape-complete but invariant-incomplete databases.
      // A fully migrated database returns above without requiring runtime DDL privileges.
      await dbPool.query(CREATE_COMMUNITY_SCHEMA_SQL); // simple protocol; 다중 statement 허용
      if (!(await verifyCreatorCommunitySchema())) {
        throw incompleteCommunitySchemaError();
      }
    }

    communitySchemaReady = true;
    return true;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(
      `[creator_community] ensure schema failed (code=${e?.code ?? "?"}): ${e?.message ?? error}`
    );
    return false;
  }
}

export async function ensureCreatorCommunitySchema(): Promise<boolean> {
  if (communitySchemaReady) return true;
  if (communitySchemaEnsurePromise) return communitySchemaEnsurePromise;

  communitySchemaEnsurePromise = ensureCreatorCommunitySchemaUncached().finally(() => {
    communitySchemaEnsurePromise = null;
  });
  return communitySchemaEnsurePromise;
}
