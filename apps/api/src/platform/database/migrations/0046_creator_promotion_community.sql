-- Additive only. No runtime DDL, existing data removal, video blobs, or paid infrastructure.
CREATE TABLE IF NOT EXISTS "creator_promotion_post" (
 "id" text PRIMARY KEY, "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
 "title" text NOT NULL, "kind" text NOT NULL, "stage" text NOT NULL, "genre" text NOT NULL,
 "payload" jsonb NOT NULL, "version" integer NOT NULL DEFAULT 1,
 "hidden" boolean NOT NULL DEFAULT false, "archived" boolean NOT NULL DEFAULT false,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_promotion_recent" ON "creator_promotion_post" ("createdAt", "id");
CREATE INDEX IF NOT EXISTS "idx_promotion_discover" ON "creator_promotion_post" ("kind", "stage", "genre", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "idx_promotion_author" ON "creator_promotion_post" ("userId", "createdAt", "id");
CREATE TABLE IF NOT EXISTS "creator_promotion_comment" (
 "id" text PRIMARY KEY, "postId" text NOT NULL REFERENCES "creator_promotion_post"("id") ON DELETE CASCADE,
 "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE, "text" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_promotion_comment_post" ON "creator_promotion_comment" ("postId", "createdAt");
CREATE TABLE IF NOT EXISTS "creator_promotion_bookmark" (
 "postId" text NOT NULL REFERENCES "creator_promotion_post"("id") ON DELETE CASCADE,
 "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE, PRIMARY KEY ("postId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_promotion_bookmark_user" ON "creator_promotion_bookmark" ("userId");
CREATE TABLE IF NOT EXISTS "creator_promotion_report" (
 "postId" text NOT NULL REFERENCES "creator_promotion_post"("id") ON DELETE CASCADE,
 "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE, "reason" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("postId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_promotion_report_recent" ON "creator_promotion_report" ("createdAt");
