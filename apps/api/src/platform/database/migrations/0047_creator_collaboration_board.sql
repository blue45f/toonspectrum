-- Additive only: no existing tables, accounts or documents are modified.
CREATE TABLE IF NOT EXISTS "creator_collab_post" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text NOT NULL CHECK ("type" IN ('team','commission','available')),
  "role" text NOT NULL CHECK ("role" IN ('story','sketch','ink','flat','color','background','model3d','lettering','animation','other')),
  "title" text NOT NULL,
  "payType" text NOT NULL CHECK ("payType" IN ('paid','negotiable','revenue_share','volunteer')),
  "workMode" text NOT NULL CHECK ("workMode" IN ('remote','onsite','hybrid')),
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','in_progress','closed')),
  "details" jsonb NOT NULL CHECK (jsonb_typeof("details") = 'object'),
  "deadlineAt" timestamptz,
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "hidden" boolean NOT NULL DEFAULT false,
  "deletedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_collab_post_recent" ON "creator_collab_post" ("createdAt", "id");
CREATE INDEX IF NOT EXISTS "idx_collab_post_filter" ON "creator_collab_post" ("type", "role", "status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "idx_collab_post_owner" ON "creator_collab_post" ("userId", "createdAt", "id");
CREATE TABLE IF NOT EXISTS "creator_collab_application" (
  "id" text PRIMARY KEY,
  "postId" text NOT NULL REFERENCES "creator_collab_post"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "contact" text NOT NULL,
  "portfolioUrl" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'submitted' CHECK ("status" IN ('submitted','shortlisted','declined','withdrawn')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_collab_application_unique" ON "creator_collab_application" ("postId", "userId");
CREATE INDEX IF NOT EXISTS "idx_collab_application_user" ON "creator_collab_application" ("userId", "createdAt");
CREATE TABLE IF NOT EXISTS "creator_collab_bookmark" (
  "postId" text NOT NULL REFERENCES "creator_collab_post"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("postId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_collab_bookmark_user" ON "creator_collab_bookmark" ("userId");
CREATE TABLE IF NOT EXISTS "creator_collab_report" (
  "postId" text NOT NULL REFERENCES "creator_collab_post"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("postId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_collab_report_created" ON "creator_collab_report" ("createdAt");
