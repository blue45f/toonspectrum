-- Project-specific creator role workspace preferences, privacy-safe public discovery,
-- and searchable creator role indexes. Personal job identity remains separate from
-- Studio Team authorization roles.

BEGIN;

-- New accounts and role-less existing accounts must explicitly opt in before their
-- creator job identity is exposed publicly.
UPDATE public."user"
SET "creatorRoleProfile" = jsonb_set(
  "creatorRoleProfile",
  '{roleVisibility}',
  'false'::jsonb,
  true
)
WHERE "creatorRoleProfile"->>'primaryRole' IS NULL
  AND COALESCE(("creatorRoleProfile"->>'roleVisibility')::boolean, true) = true;

ALTER TABLE public."user"
  ALTER COLUMN "creatorRoleProfile" SET DEFAULT
    '{"version":1,"primaryRole":null,"secondaryRoles":[],"specialties":[],"experienceLevel":null,"collaborationStatus":null,"roleVisibility":false,"activeRole":null}'::jsonb;

CREATE TABLE IF NOT EXISTS public."creator_role_workspace_preference" (
  "userId" text NOT NULL
    REFERENCES public."user"("id") ON DELETE CASCADE,
  "projectKey" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 0,
  "document" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "creator_role_workspace_preference_pkey"
    PRIMARY KEY ("userId", "projectKey"),
  CONSTRAINT "creator_role_workspace_preference_project_key_check"
    CHECK (
      char_length("projectKey") BETWEEN 1 AND 170
      AND (
        "projectKey" IN ('global', 'draft')
        OR "projectKey" ~ '^(work|remix|project):[^[:cntrl:]\\]+$'
      )
    ),
  CONSTRAINT "creator_role_workspace_preference_revision_check"
    CHECK ("revision" BETWEEN 0 AND 2147483647),
  CONSTRAINT "creator_role_workspace_preference_document_check"
    CHECK (
      jsonb_typeof("document") = 'object'
      AND ("document"->>'version') = '1'
      AND jsonb_typeof("document"->'notificationOverrides') = 'object'
      AND jsonb_typeof("document"->'usageGoals') = 'array'
      AND jsonb_typeof("document"->'capacity') = 'object'
      AND jsonb_typeof("document"->'visibility') = 'object'
      AND jsonb_typeof("document"->'onboardingComplete') = 'boolean'
      AND jsonb_typeof("document"->'checklistStates') = 'object'
    )
);

CREATE INDEX IF NOT EXISTS "idx_creator_role_workspace_preference_updated"
  ON public."creator_role_workspace_preference" ("userId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_creator_role_primary_public"
  ON public."user" (("creatorRoleProfile"->>'primaryRole'))
  WHERE "status" = 'active'
    AND "creatorRoleProfile"->>'primaryRole' IS NOT NULL
    AND COALESCE(("creatorRoleProfile"->>'roleVisibility')::boolean, false) = true;

CREATE INDEX IF NOT EXISTS "idx_user_creator_role_specialties_gin"
  ON public."user"
  USING gin (("creatorRoleProfile"->'specialties'))
  WHERE "status" = 'active'
    AND "creatorRoleProfile"->>'primaryRole' IS NOT NULL;

COMMIT;
