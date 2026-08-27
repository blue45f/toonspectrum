// 커뮤니티 확장 스키마 자가생성(멱등) — creator_asset의 ensure 패턴과 동일.
import { dbPool } from "../../db";

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
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'creator_work_revision_value_positive_check'
        AND conrelid = 'creator_work'::regclass
    ) THEN
      ALTER TABLE "creator_work"
        ADD CONSTRAINT "creator_work_revision_value_positive_check" CHECK ("revision" >= 1);
    END IF;
  END $$;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "seriesId" text;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "episodeNo" integer;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "challengeId" text;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "remixFromId" text;
  CREATE INDEX IF NOT EXISTS "creator_work_series_idx" ON "creator_work" ("seriesId", "episodeNo");
  CREATE INDEX IF NOT EXISTS "creator_work_challenge_idx" ON "creator_work" ("challengeId");
  CREATE TABLE IF NOT EXISTS "creator_work_revision" (
    "workId" text NOT NULL REFERENCES "creator_work"("id") ON DELETE CASCADE,
    "revision" integer NOT NULL CHECK ("revision" >= 1),
    "snapshot" jsonb NOT NULL CHECK (jsonb_typeof("snapshot") = 'object'),
    "restoredFromRevision" integer CHECK ("restoredFromRevision" IS NULL OR "restoredFromRevision" >= 1),
    "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creator_work_revision_pkey" PRIMARY KEY ("workId", "revision")
  );
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
  CREATE INDEX IF NOT EXISTS "creator_series_user_idx" ON "creator_series" ("userId");
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
export async function ensureCreatorCommunitySchema(): Promise<boolean> {
  if (communitySchemaReady) return true;
  try {
    await dbPool.query(CREATE_COMMUNITY_SCHEMA_SQL); // simple protocol; 다중 statement 허용
    communitySchemaReady = true;
    return true;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(`[creator_community] ensure schema failed (code=${e?.code ?? "?"}): ${e?.message ?? error}`);
    return false;
  }
}
