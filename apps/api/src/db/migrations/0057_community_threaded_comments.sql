-- Threaded replies, durable edit/delete state, and reactions for public comments.
BEGIN;
SET LOCAL search_path = public, pg_catalog;

ALTER TABLE public."creator_work_comment"
  ADD COLUMN IF NOT EXISTS "parentId" text,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamp;
UPDATE public."creator_work_comment"
SET "createdAt" = COALESCE("createdAt", clock_timestamp()::timestamp),
    "updatedAt" = COALESCE("updatedAt", "createdAt", clock_timestamp()::timestamp)
WHERE "createdAt" IS NULL OR "updatedAt" IS NULL;
ALTER TABLE public."creator_work_comment"
  ALTER COLUMN "createdAt" SET DEFAULT clock_timestamp(),
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT clock_timestamp(),
  ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_creator_work_comment_parent"
  ON public."creator_work_comment" ("parentId", "createdAt");
DO $creator_work_comment_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_work_comment_work_id_unique'
      AND conrelid = 'public.creator_work_comment'::regclass) THEN
    ALTER TABLE public."creator_work_comment"
      ADD CONSTRAINT "creator_work_comment_work_id_unique"
      UNIQUE ("workId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_work_comment_parent_fkey'
      AND conrelid = 'public.creator_work_comment'::regclass) THEN
    ALTER TABLE public."creator_work_comment"
      ADD CONSTRAINT "creator_work_comment_parent_fkey"
      FOREIGN KEY ("workId", "parentId")
      REFERENCES public."creator_work_comment" ("workId", "id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_work_comment_parent_not_self_check'
      AND conrelid = 'public.creator_work_comment'::regclass) THEN
    ALTER TABLE public."creator_work_comment"
      ADD CONSTRAINT "creator_work_comment_parent_not_self_check"
      CHECK ("parentId" IS NULL OR "parentId" <> "id");
  END IF;
END
$creator_work_comment_constraints$;

CREATE TABLE IF NOT EXISTS public."creator_work_comment_like" (
  "commentId" text NOT NULL REFERENCES public."creator_work_comment"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY ("commentId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_creator_work_comment_like_user"
  ON public."creator_work_comment_like" ("userId", "createdAt");

ALTER TABLE public."creator_promotion_comment"
  ADD COLUMN IF NOT EXISTS "parentId" text,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz;
UPDATE public."creator_promotion_comment"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", clock_timestamp())
WHERE "updatedAt" IS NULL;
ALTER TABLE public."creator_promotion_comment"
  ALTER COLUMN "updatedAt" SET DEFAULT clock_timestamp(),
  ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_promotion_comment_parent"
  ON public."creator_promotion_comment" ("parentId", "createdAt");

DO $creator_promotion_comment_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_promotion_comment_post_id_unique'
      AND conrelid = 'public.creator_promotion_comment'::regclass) THEN
    ALTER TABLE public."creator_promotion_comment"
      ADD CONSTRAINT "creator_promotion_comment_post_id_unique"
      UNIQUE ("postId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_promotion_comment_parent_fkey'
      AND conrelid = 'public.creator_promotion_comment'::regclass) THEN
    ALTER TABLE public."creator_promotion_comment"
      ADD CONSTRAINT "creator_promotion_comment_parent_fkey"
      FOREIGN KEY ("postId", "parentId")
      REFERENCES public."creator_promotion_comment" ("postId", "id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_promotion_comment_parent_not_self_check'
      AND conrelid = 'public.creator_promotion_comment'::regclass) THEN
    ALTER TABLE public."creator_promotion_comment"
      ADD CONSTRAINT "creator_promotion_comment_parent_not_self_check"
      CHECK ("parentId" IS NULL OR "parentId" <> "id");
  END IF;
END
$creator_promotion_comment_constraints$;

CREATE TABLE IF NOT EXISTS public."creator_promotion_comment_like" (
  "commentId" text NOT NULL REFERENCES public."creator_promotion_comment"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY ("commentId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_promotion_comment_like_user"
  ON public."creator_promotion_comment_like" ("userId", "createdAt");

REVOKE ALL ON TABLE
  public."creator_work_comment_like",
  public."creator_promotion_comment_like"
FROM PUBLIC;

COMMIT;
