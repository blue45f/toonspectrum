-- Migration 0036: authenticated Creator Marketplace comments, replies, ratings and reactions.
--
-- Social rows are scoped to an immutable marketplace release. The API projects Studio/account
-- verification from creator_marketplace_library_item instead of accepting client-supplied badges.

BEGIN;

CREATE TABLE public."creator_marketplace_comment" (
  "id" text PRIMARY KEY NOT NULL,
  "resourceId" text NOT NULL
    REFERENCES public."creator_marketplace_resource"("id") ON DELETE CASCADE,
  "parentId" text,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "deletedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_marketplace_comment_parent_fk"
    FOREIGN KEY ("parentId")
    REFERENCES public."creator_marketplace_comment"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_marketplace_comment_content_check"
    CHECK (
      char_length("content") BETWEEN 1 AND 2000
      AND "content" = btrim("content")
    ),
  CONSTRAINT "creator_marketplace_comment_parent_check"
    CHECK ("parentId" IS NULL OR "parentId" <> "id"),
  CONSTRAINT "creator_marketplace_comment_timestamp_check"
    CHECK (
      "updatedAt" >= "createdAt"
      AND ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
    )
);

CREATE INDEX "idx_creator_marketplace_comment_resource_created"
  ON public."creator_marketplace_comment" ("resourceId", "createdAt" DESC, "id" DESC);
CREATE INDEX "idx_creator_marketplace_comment_parent_created"
  ON public."creator_marketplace_comment" ("parentId", "createdAt" ASC, "id" ASC);
CREATE INDEX "idx_creator_marketplace_comment_user_created"
  ON public."creator_marketplace_comment" ("userId", "createdAt" DESC);

CREATE TABLE public."creator_marketplace_comment_like" (
  "commentId" text NOT NULL
    REFERENCES public."creator_marketplace_comment"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY ("commentId", "userId")
);

CREATE INDEX "idx_creator_marketplace_comment_like_user"
  ON public."creator_marketplace_comment_like" ("userId", "createdAt" DESC);

CREATE TABLE public."creator_marketplace_review" (
  "id" text PRIMARY KEY NOT NULL,
  "resourceId" text NOT NULL
    REFERENCES public."creator_marketplace_resource"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "roleTag" text,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "deletedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_marketplace_review_resource_user_unique"
    UNIQUE ("resourceId", "userId"),
  CONSTRAINT "creator_marketplace_review_rating_check"
    CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "creator_marketplace_review_title_check"
    CHECK (
      char_length("title") BETWEEN 1 AND 100
      AND "title" = btrim("title")
    ),
  CONSTRAINT "creator_marketplace_review_content_check"
    CHECK (
      char_length("content") BETWEEN 1 AND 4000
      AND "content" = btrim("content")
    ),
  CONSTRAINT "creator_marketplace_review_role_check"
    CHECK (
      "roleTag" IS NULL
      OR (
        char_length("roleTag") BETWEEN 1 AND 40
        AND "roleTag" = btrim("roleTag")
      )
    ),
  CONSTRAINT "creator_marketplace_review_tags_check"
    CHECK (
      jsonb_typeof("tags") = 'array'
      AND jsonb_array_length("tags") <= 5
    ),
  CONSTRAINT "creator_marketplace_review_timestamp_check"
    CHECK (
      "updatedAt" >= "createdAt"
      AND ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
    )
);

CREATE INDEX "idx_creator_marketplace_review_resource_created"
  ON public."creator_marketplace_review" ("resourceId", "createdAt" DESC, "id" DESC);
CREATE INDEX "idx_creator_marketplace_review_user_created"
  ON public."creator_marketplace_review" ("userId", "createdAt" DESC);

CREATE TABLE public."creator_marketplace_review_helpful" (
  "reviewId" text NOT NULL
    REFERENCES public."creator_marketplace_review"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY ("reviewId", "userId")
);

CREATE INDEX "idx_creator_marketplace_review_helpful_user"
  ON public."creator_marketplace_review_helpful" ("userId", "createdAt" DESC);

-- Keep discussion a predictable two-level tree. A reply must target a live root comment from the
-- same immutable release; this cannot be expressed by a PostgreSQL CHECK constraint.
CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_comment_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $market_comment_parent$
DECLARE
  parent_resource_id text;
  parent_parent_id text;
  parent_deleted_at timestamptz;
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT parent."resourceId", parent."parentId", parent."deletedAt"
  INTO parent_resource_id, parent_parent_id, parent_deleted_at
  FROM public."creator_marketplace_comment" AS parent
  WHERE parent."id" = NEW."parentId"
  FOR KEY SHARE;

  IF parent_resource_id IS NULL THEN
    RAISE EXCEPTION 'creator marketplace reply parent not found'
      USING ERRCODE = '23503',
        CONSTRAINT = 'creator_marketplace_comment_parent_fk';
  END IF;
  IF parent_resource_id IS DISTINCT FROM NEW."resourceId" THEN
    RAISE EXCEPTION 'creator marketplace reply must stay in one resource'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_comment_parent_resource';
  END IF;
  IF parent_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'creator marketplace replies support one nested level'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_comment_depth';
  END IF;
  IF parent_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'creator marketplace reply parent is deleted'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_comment_parent_live';
  END IF;
  RETURN NEW;
END
$market_comment_parent$;

CREATE TRIGGER creator_marketplace_comment_parent_guard
BEFORE INSERT OR UPDATE OF "parentId", "resourceId"
ON public."creator_marketplace_comment"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_comment_parent();

REVOKE ALL ON TABLE public."creator_marketplace_comment" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_marketplace_comment_like" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_marketplace_review" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_marketplace_review_helpful" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_comment_parent() FROM PUBLIC;

COMMIT;
