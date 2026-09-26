-- Creator community publishing: save-first bookmarks, immutable releases,
-- collaborator approvals, explicit publications, portfolios, external history and reports.
BEGIN;

CREATE TABLE IF NOT EXISTS public."creator_work_bookmark" (
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "workId" text NOT NULL REFERENCES public."creator_work"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "creator_work_bookmark_pkey" PRIMARY KEY ("userId", "workId")
);
CREATE INDEX IF NOT EXISTS "idx_creator_work_bookmark_work"
  ON public."creator_work_bookmark" ("workId");
CREATE INDEX IF NOT EXISTS "idx_creator_work_bookmark_user_created"
  ON public."creator_work_bookmark" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."creator_work_release" (
  "id" text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES public."creator_work"("id") ON DELETE CASCADE,
  "ownerUserId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "releaseNo" integer NOT NULL,
  "workRevision" integer NOT NULL,
  "fingerprint" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "state" text NOT NULL DEFAULT 'review',
  "publishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "creator_work_release_no_positive_check" CHECK ("releaseNo" >= 1),
  CONSTRAINT "creator_work_release_revision_positive_check" CHECK ("workRevision" >= 1),
  CONSTRAINT "creator_work_release_manifest_object_check"
    CHECK (jsonb_typeof("manifest") = 'object'),
  CONSTRAINT "creator_work_release_fingerprint_check"
    CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "creator_work_release_state_check"
    CHECK ("state" IN ('review', 'approved', 'published', 'superseded', 'withdrawn')),
  CONSTRAINT "creator_work_release_work_no_unique" UNIQUE ("workId", "releaseNo"),
  CONSTRAINT "creator_work_release_work_id_unique" UNIQUE ("workId", "id"),
  CONSTRAINT "creator_work_release_work_revision_unique" UNIQUE ("workId", "workRevision"),
  CONSTRAINT "creator_work_release_fingerprint_unique" UNIQUE ("workId", "fingerprint")
);
CREATE INDEX IF NOT EXISTS "idx_creator_work_release_published"
  ON public."creator_work_release" ("workId", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_creator_work_release_owner_created"
  ON public."creator_work_release" ("ownerUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_creator_work_release_state_created"
  ON public."creator_work_release" ("state", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."creator_work_release_approval" (
  "releaseId" text NOT NULL REFERENCES public."creator_work_release"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "state" text NOT NULL DEFAULT 'pending',
  "note" text NOT NULL DEFAULT '',
  "decidedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "creator_work_release_approval_pkey" PRIMARY KEY ("releaseId", "userId"),
  CONSTRAINT "creator_work_release_approval_state_check"
    CHECK ("state" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "creator_work_release_approval_decision_check" CHECK (
    ("state" = 'pending' AND "decidedAt" IS NULL)
    OR ("state" IN ('approved', 'rejected') AND "decidedAt" IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS "idx_creator_work_release_approval_user_state"
  ON public."creator_work_release_approval" ("userId", "state", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public."creator_work_publication" (
  "id" text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES public."creator_work"("id") ON DELETE CASCADE,
  "releaseId" text NOT NULL,
  "state" text NOT NULL DEFAULT 'unpublished',
  "visibility" text NOT NULL DEFAULT 'private',
  "canonicalSlug" text NOT NULL DEFAULT '',
  "scheduledAt" timestamptz,
  "publishedAt" timestamptz,
  "unpublishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "creator_work_publication_work_unique" UNIQUE ("workId"),
  CONSTRAINT "creator_work_publication_release_fkey"
    FOREIGN KEY ("workId", "releaseId")
    REFERENCES public."creator_work_release"("workId", "id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_publication_state_check"
    CHECK ("state" IN ('scheduled', 'published', 'unpublished')),
  CONSTRAINT "creator_work_publication_visibility_check"
    CHECK ("visibility" IN ('public', 'unlisted', 'private')),
  CONSTRAINT "creator_work_publication_lifecycle_check" CHECK (
    ("state" = 'scheduled' AND "scheduledAt" IS NOT NULL AND "publishedAt" IS NULL)
    OR ("state" = 'published' AND "publishedAt" IS NOT NULL)
    OR ("state" = 'unpublished')
  )
);
CREATE INDEX IF NOT EXISTS "idx_creator_work_publication_release"
  ON public."creator_work_publication" ("releaseId");
CREATE INDEX IF NOT EXISTS "idx_creator_work_publication_discovery"
  ON public."creator_work_publication" ("state", "visibility", "publishedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "creator_work_publication_slug_unique"
  ON public."creator_work_publication" ("canonicalSlug")
  WHERE "canonicalSlug" <> '' AND "state" = 'published' AND "visibility" = 'public';

CREATE TABLE IF NOT EXISTS public."creator_portfolio_entry" (
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "workId" text NOT NULL REFERENCES public."creator_work"("id") ON DELETE CASCADE,
  "releaseId" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "featured" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "creator_portfolio_entry_pkey" PRIMARY KEY ("userId", "workId"),
  CONSTRAINT "creator_portfolio_entry_release_fkey"
    FOREIGN KEY ("workId", "releaseId")
    REFERENCES public."creator_work_release"("workId", "id") ON DELETE CASCADE,
  CONSTRAINT "creator_portfolio_position_check" CHECK ("position" BETWEEN 0 AND 10000)
);
CREATE INDEX IF NOT EXISTS "idx_creator_portfolio_user_order"
  ON public."creator_portfolio_entry"
  ("userId", "featured" DESC, "position", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public."creator_external_publication" (
  "id" text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES public."creator_work"("id") ON DELETE CASCADE,
  "releaseId" text NOT NULL,
  "platform" text NOT NULL,
  "externalUrl" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "publishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "creator_external_publication_release_fkey"
    FOREIGN KEY ("workId", "releaseId")
    REFERENCES public."creator_work_release"("workId", "id") ON DELETE CASCADE,
  CONSTRAINT "creator_external_publication_platform_check"
    CHECK ("platform" IN ('naver', 'webtoon_canvas', 'tapas', 'postype', 'pixiv', 'globalcomix', 'other')),
  CONSTRAINT "creator_external_publication_status_check"
    CHECK ("status" IN ('draft', 'published', 'updated', 'removed')),
  CONSTRAINT "creator_external_publication_work_platform_url_unique"
    UNIQUE ("workId", "platform", "externalUrl")
);
CREATE INDEX IF NOT EXISTS "idx_creator_external_publication_release"
  ON public."creator_external_publication" ("releaseId");
CREATE INDEX IF NOT EXISTS "idx_creator_external_publication_work_updated"
  ON public."creator_external_publication" ("workId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public."creator_work_report" (
  "workId" text NOT NULL REFERENCES public."creator_work"("id") ON DELETE CASCADE,
  "reporterId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "details" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz,
  CONSTRAINT "creator_work_report_pkey" PRIMARY KEY ("workId", "reporterId"),
  CONSTRAINT "creator_work_report_reason_check"
    CHECK ("reason" IN ('copyright', 'unsafe', 'spam', 'misleading', 'ai_disclosure', 'other')),
  CONSTRAINT "creator_work_report_status_check"
    CHECK ("status" IN ('open', 'resolved', 'dismissed'))
);
CREATE INDEX IF NOT EXISTS "idx_creator_work_report_status_created"
  ON public."creator_work_report" ("status", "createdAt");

CREATE OR REPLACE FUNCTION public.creator_work_release_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $creator_work_release_immutable$
BEGIN
  IF NEW."workId" IS DISTINCT FROM OLD."workId"
    OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
    OR NEW."releaseNo" IS DISTINCT FROM OLD."releaseNo"
    OR NEW."workRevision" IS DISTINCT FROM OLD."workRevision"
    OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
    OR NEW."manifest" IS DISTINCT FROM OLD."manifest"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'creator work release payload is immutable';
  END IF;
  RETURN NEW;
END
$creator_work_release_immutable$;
DROP TRIGGER IF EXISTS creator_work_release_immutable_trigger
  ON public."creator_work_release";
CREATE TRIGGER creator_work_release_immutable_trigger
BEFORE UPDATE ON public."creator_work_release"
FOR EACH ROW
EXECUTE FUNCTION public.creator_work_release_immutable();

REVOKE ALL ON TABLE public."creator_work_bookmark" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_work_release" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_work_release_approval" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_work_publication" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_portfolio_entry" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_external_publication" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_work_report" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.creator_work_release_immutable() FROM PUBLIC;

COMMIT;
